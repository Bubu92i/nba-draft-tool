import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveState, createPoller, fetchJson, pickSignature, timeoutSignal, timerUrgent, dataAge } from "../site/lib/live.js";
import { slotForPick } from "../site/lib/draftOrder.js";
import { MY_USER_ID } from "../site/lib/config.js";

const POS = [["PG"], ["SG"], ["SF"], ["PF"], ["C"], ["PG", "SG"], ["SF", "PF"], ["C", "PF"]];
const snapshot = {
  myRosterId: 7,
  players: Object.fromEntries(
    Array.from({ length: 30 }, (_, i) => {
      const id = "p" + (i + 1);
      return [id, {
        id, name: "Joueur " + (i + 1), team: "XXX", positions: POS[i % POS.length],
        fpg: 50 - i, fpgSource: "proj", expectedGames: 70, value: 3000 - i * 80, adp: i + 1,
        injury: { status: null, text: null }, gpHistory: [], injuryBadge: null,
        statsLine: i % 3 === 0 ? null : "10 pts",
      }];
    }),
  ),
};
const settings = { teams: 12, rounds: 10, reversal_round: 3, pick_timer: 60 };
const identity = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 1), i + 1]));
const users = [{ user_id: MY_USER_ID, display_name: "BahBubu" }];
const now = 1_000_000;
function fakePicks(n) {
  return Array.from({ length: n }, (_, i) => {
    const pickNo = i + 1;
    const { round, slot } = slotForPick(pickNo, 12, 3);
    return { pick_no: pickNo, round, draft_slot: slot, roster_id: slot, player_id: "p" + pickNo, picked_by: "u" + slot, metadata: {} };
  });
}

test("pre_draft, ordre inconnu : recos sans timing", () => {
  const v = deriveState({ snapshot, draft: { status: "pre_draft", draft_order: null, settings, slot_to_roster_id: identity }, picks: [], tradedPicks: [], users, now });
  assert.equal(v.orderKnown, false); assert.equal(v.picksUntilMe, null);
  assert.ok(v.recommendations.length > 0); assert.ok(v.recommendations.every(r => r.tier === null));
  assert.equal(v.isMyTurn, false); assert.equal(v.currentPickNo, null); assert.equal(v.secondsLeft, null);
  assert.equal(v.board.length, 10); assert.equal(v.board[0].length, 12);
  assert.ok(v.board.flat().every(c => !c.isMine && c.player === null));
});
const drafting = { status: "drafting", draft_order: { [MY_USER_ID]: 7 }, settings, slot_to_roster_id: identity, last_picked: now - 18000 };
test("à toi : isMyTurn, picksUntilMe = 0, compte à rebours", () => {
  const v = deriveState({ snapshot, draft: drafting, picks: fakePicks(6), tradedPicks: [], users, now });
  assert.equal(v.currentPickNo, 7); assert.equal(v.isMyTurn, true); assert.equal(v.picksUntilMe, 0);
  assert.equal(v.myNextPickNo, 18); assert.equal(v.secondsLeft, 42);
  assert.equal(v.currentRound, 1); assert.equal(v.currentSlot, 7);
});
test("pas mon tour : picksUntilMe et tiers", () => {
  const v = deriveState({ snapshot, draft: drafting, picks: fakePicks(3), tradedPicks: [], users, now });
  assert.equal(v.isMyTurn, false); assert.equal(v.picksUntilMe, 3); assert.equal(v.myNextPickNo, 7);
  assert.ok(v.recommendations.every(r => r.tier !== null));
});
test("joueur pické inconnu du snapshot affiché depuis metadata", () => {
  const picks = [{ pick_no: 1, round: 1, draft_slot: 1, roster_id: 1, player_id: "999999", picked_by: "u1",
                   metadata: { first_name: "Jean", last_name: "Inconnu", position: "SF" } }];
  const v = deriveState({ snapshot, draft: drafting, picks, tradedPicks: [], users, now });
  assert.deepEqual(v.board[0][0].player, { name: "Jean Inconnu", positions: ["SF"] });
});
test("joueur pické retiré des disponibles et ajouté au roster de son propriétaire", () => {
  const picks = fakePicks(7);
  const v = deriveState({ snapshot, draft: drafting, picks, tradedPicks: [], users, now });
  assert.equal(v.myRoster.length, 1);
  assert.ok(!v.available.some(p => p.id === picks[6].player_id));
  assert.equal(v.board[0][6].isMine, true);
  assert.equal(v.available.length, 23);
});
test("joueur inconnu pické par moi : roster sans plantage", () => {
  const picks = fakePicks(6);
  picks.push({ pick_no: 7, round: 1, draft_slot: 7, roster_id: 7, player_id: "999999", picked_by: MY_USER_ID,
               metadata: { first_name: "Jean", last_name: "Inconnu", position: "SF" } });
  const v = deriveState({ snapshot, draft: drafting, picks, tradedPicks: [], users, now });
  assert.equal(v.myRoster.length, 1); assert.equal(v.myRoster[0].name, "Jean Inconnu");
  assert.ok(v.recommendations.length > 0);
});
test("colonnes : nom d'utilisateur ou 'Équipe N'", () => {
  const v = deriveState({ snapshot, draft: drafting, picks: [], tradedPicks: [], users, now });
  assert.equal(v.columns[6].label, "BahBubu"); assert.equal(v.columns[11].label, "Équipe 12");
});
test("pick échangé : la case appartient au nouveau propriétaire", () => {
  const traded = [{ season: "2026", round: 1, roster_id: 3, previous_owner_id: 3, owner_id: 7 }];
  const v = deriveState({ snapshot, draft: { ...drafting, season: "2026" }, picks: [], tradedPicks: traded, users, now });
  assert.equal(v.board[0][2].isMine, true); assert.equal(v.board[0][2].rosterId, 7);
  assert.equal(v.board[0][6].isMine, true);
  assert.equal(v.myNextPickNo, 3); assert.equal(v.picksUntilMe, 2);
});
test("draft terminée : pas de pick courant, pas de recos", () => {
  const v = deriveState({ snapshot, draft: { ...drafting, status: "complete" }, picks: fakePicks(30), tradedPicks: [], users, now });
  assert.equal(v.currentPickNo, null); assert.equal(v.isMyTurn, false);
  assert.deepEqual(v.recommendations, []); assert.equal(v.secondsLeft, null);
});
test("topAvailable limité à 50, trié par valeur", () => {
  const big = { players: Object.fromEntries(Array.from({ length: 80 }, (_, i) => ["q" + i, { id: "q" + i, name: "Q" + i, positions: ["PG"], value: i, fpg: 1, expectedGames: 70, adp: 999, injury: {}, statsLine: null }])) };
  const v = deriveState({ snapshot: big, draft: { status: "pre_draft", draft_order: null, settings, slot_to_roster_id: identity }, picks: [], tradedPicks: [], users, now });
  assert.equal(v.topAvailable.length, 50); assert.equal(v.topAvailable[0].id, "q79");
});

test("poller : échec signalé, état gardé, reprise automatique, jamais de chevauchement", async () => {
  const events = [];
  const timers = [];
  let inFlight = 0, maxInFlight = 0, call = 0;
  const poller = createPoller({
    fetchOnce: async () => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight--;
      call++;
      if (call === 2) throw new Error("réseau");
      return { n: call };
    },
    onData: (d) => events.push("data" + d.n),
    onError: (e) => events.push("error:" + e.message),
    delayMs: 2500,
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimer: () => {},
  });
  await poller.start();
  assert.equal(timers.length, 1); assert.equal(timers[0].ms, 2500);
  await timers.shift().fn();
  await timers.shift().fn();
  assert.deepEqual(events, ["data1", "error:réseau", "data3"]);
  assert.equal(maxInFlight, 1);
});

test("fetchJson : un appel qui ne répond jamais est abandonné après le délai", async () => {
  const hang = (url, { signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason)));
  const t0 = Date.now();
  await assert.rejects(fetchJson("http://x/y", { fetchFn: hang, timeoutMs: 50 }));
  assert.ok(Date.now() - t0 < 1000);
});
test("fetchJson : HTTP 5xx → erreur", async () => {
  const bad = async () => ({ ok: false, status: 503, json: async () => ({}) });
  await assert.rejects(fetchJson("http://x/y", { fetchFn: bad, timeoutMs: 50 }), /HTTP 503/);
});
test("poller : un fetchOnce qui ne se résout jamais → onError après le délai, puis nouvel essai planifié", async () => {
  const events = [];
  const timers = [];
  const poller = createPoller({
    fetchOnce: () => new Promise(() => {}),
    onData: () => events.push("data"),
    onError: (e) => events.push("error:" + e.message),
    delayMs: 2500, timeoutMs: 30,
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimer: () => {},
  });
  await poller.start();
  assert.equal(events.length, 1); assert.match(events[0], /^error:/);
  assert.equal(timers.length, 1);
});
test("poller : une exception dans onData → onComputeError, la boucle continue", async () => {
  const events = [];
  const timers = [];
  const poller = createPoller({
    fetchOnce: async () => 1,
    onData: () => { throw new Error("boum"); },
    onError: () => events.push("net"),
    onComputeError: (e) => events.push("calc:" + e.message),
    delayMs: 2500,
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimer: () => {},
  });
  await poller.start();
  assert.deepEqual(events, ["calc:boum"]);
  assert.equal(timers.length, 1);
});
test("pickSignature change quand un pick est corrigé à nombre de picks égal", () => {
  const a = [{ pick_no: 1, player_id: "p1", roster_id: 1 }, { pick_no: 2, player_id: "p2", roster_id: 2 }];
  const b = [{ pick_no: 1, player_id: "p1", roster_id: 1 }, { pick_no: 2, player_id: "p9", roster_id: 2 }];
  assert.notEqual(pickSignature(a), pickSignature(b));
  assert.equal(pickSignature(a), pickSignature(a.map((p) => ({ ...p, metadata: {} }))));
});

test("timeoutSignal : repli sans AbortSignal.timeout (vieux navigateurs)", async () => {
  const original = AbortSignal.timeout;
  AbortSignal.timeout = undefined;
  try {
    const signal = timeoutSignal(30);
    assert.equal(signal.aborted, false);
    await new Promise((resolve) => signal.addEventListener("abort", resolve));
    assert.equal(signal.aborted, true);
    const hang = (url, { signal: s }) => new Promise((_, reject) => s.addEventListener("abort", () => reject(new Error("abort"))));
    await assert.rejects(fetchJson("http://x/y", { fetchFn: hang, timeoutMs: 30 }), /abort/);
  } finally {
    AbortSignal.timeout = original;
  }
});
test("ordre connu via slot_to_roster_id quand la draft tourne, même sans draft_order", () => {
  const draft = { status: "drafting", draft_order: null, settings, slot_to_roster_id: identity, last_picked: now - 18000 };
  const v = deriveState({ snapshot, draft, picks: fakePicks(3), tradedPicks: [], users, now });
  assert.equal(v.orderKnown, true); assert.equal(v.mySlot, 7);
  assert.equal(v.picksUntilMe, 3); assert.equal(v.myNextPickNo, 7);
  assert.ok(v.board.flat().some((c) => c.isMine));
});
test("0 match attendu : jamais recommandé mais listé dans les disponibles", () => {
  const zero = { ...snapshot.players.p1, id: "z1", name: "Zéro", expectedGames: 0, value: 99999, adp: 1 };
  const snap = { ...snapshot, players: { ...snapshot.players, z1: zero } };
  const v = deriveState({ snapshot: snap, draft: drafting, picks: fakePicks(3), tradedPicks: [], users, now });
  assert.ok(v.recommendations.length > 0);
  assert.ok(v.recommendations.every((r) => r.player.id !== "z1"));
  assert.ok(v.topAvailable.some((p) => p.id === "z1"));
});

test("chrono : urgent entre 1 et 15 s inclus, et seulement à mon tour", () => {
  assert.equal(timerUrgent(16, true), false);
  assert.equal(timerUrgent(15, true), true);
  assert.equal(timerUrgent(1, true), true);
  assert.equal(timerUrgent(0, true), false);
  assert.equal(timerUrgent(null, true), false);
  assert.equal(timerUrgent(10, false), false);
  assert.equal(timerUrgent(10), false);
});
test("deriveState expose picksLeft (picks qu'il me reste à faire)", () => {
  const pre = deriveState({ snapshot, draft: { status: "pre_draft", draft_order: null, settings, slot_to_roster_id: identity }, picks: [], tradedPicks: [], users, now });
  assert.equal(pre.picksLeft, 10);
  const mid = deriveState({ snapshot, draft: { status: "drafting", draft_order: { [MY_USER_ID]: 7 }, settings, slot_to_roster_id: identity, last_picked: now }, picks: fakePicks(6), tradedPicks: [], users, now });
  assert.equal(mid.picksLeft, 10);
  const later = deriveState({ snapshot, draft: { status: "drafting", draft_order: { [MY_USER_ID]: 7 }, settings, slot_to_roster_id: identity, last_picked: now }, picks: fakePicks(7), tradedPicks: [], users, now });
  assert.equal(later.picksLeft, 9);
});
test("âge des données : « il y a N s », orange au-delà de 15 s", () => {
  assert.deepEqual(dataAge(1000, 4400), { text: "il y a 3 s", stale: false });
  assert.deepEqual(dataAge(1000, 1000), { text: "il y a 0 s", stale: false });
  assert.deepEqual(dataAge(0, 15000), { text: "il y a 15 s", stale: false });
  assert.deepEqual(dataAge(0, 16000), { text: "il y a 16 s", stale: true });
  assert.deepEqual(dataAge(5000, 1000), { text: "il y a 0 s", stale: false });
  assert.equal(dataAge(null, 1000), null);
});
