import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveState, createPoller } from "../site/lib/live.js";
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
