import { slotForPick, pickOwnerRosterId, myPickNumbers, nextMyPick, orderKnown } from "./draftOrder.js";
import { recommend } from "./recommend.js";
import { MY_ROSTER_ID } from "./config.js";

const TOP_AVAILABLE = 50;

function unknownPlayer(pick) {
  const m = pick.metadata ?? {};
  const name = `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || `Joueur ${pick.player_id}`;
  return {
    id: String(pick.player_id), name, team: m.team ?? "", positions: m.position ? [m.position] : [],
    fpg: 0, fpgSource: "default", expectedGames: 0, value: 0, adp: 999,
    injury: { status: null, text: null }, gpHistory: [], injuryBadge: null, statsLine: null,
  };
}

export function secondsLeft(draft, now) {
  if (draft.status !== "drafting" || draft.last_picked == null) return null;
  const timer = draft.settings?.pick_timer;
  if (timer == null) return null;
  return Math.max(0, Math.round(timer - (now - draft.last_picked) / 1000));
}

export const URGENT_SECONDS = 15;
export const STALE_AFTER_S = 15;

export function timerUrgent(secs) {
  return secs != null && secs > 0 && secs <= URGENT_SECONDS;
}

export function dataAge(updatedAt, now) {
  if (updatedAt == null) return null;
  const secs = Math.max(0, Math.floor((now - updatedAt) / 1000));
  return { text: `il y a ${secs} s`, stale: secs > STALE_AFTER_S };
}

function columnLabels(draft, users, teams) {
  const nameByUser = new Map((users ?? []).map((u) => [String(u.user_id), u.display_name]));
  const bySlot = new Map();
  for (const [userId, slot] of Object.entries(draft.draft_order ?? {})) {
    const name = nameByUser.get(String(userId));
    if (name) bySlot.set(Number(slot), name);
  }
  return Array.from({ length: teams }, (_, i) => ({ slot: i + 1, label: bySlot.get(i + 1) ?? `Équipe ${i + 1}` }));
}

/**
 * Pure derivation of everything the UI shows. The user's roster id comes from
 * snapshot.myRosterId (written by the build script), falling back to config.MY_ROSTER_ID.
 */
export function deriveState({ snapshot, draft, picks, tradedPicks, users, now }) {
  const myRosterId = snapshot.myRosterId ?? MY_ROSTER_ID;
  const { teams, rounds, reversal_round: reversalRound } = draft.settings;
  const totalPicks = teams * rounds;
  const known = orderKnown(draft);
  const status = draft.status;

  const byId = new Map();
  const toPlayer = (pick) => snapshot.players[pick.player_id] ?? unknownPlayer(pick);
  const pickedIds = new Set(picks.map((p) => String(p.player_id)));
  const rosters = new Map();
  for (const pick of picks) {
    const list = rosters.get(pick.roster_id) ?? [];
    list.push(toPlayer(pick));
    rosters.set(pick.roster_id, list);
    byId.set(pick.pick_no, pick);
  }
  const myRoster = rosters.get(myRosterId) ?? [];
  const available = Object.values(snapshot.players)
    .filter((p) => !pickedIds.has(String(p.id)))
    .sort((a, b) => b.value - a.value);

  const live = status === "drafting" || status === "paused";
  const rawCurrent = picks.length + 1;
  const currentPickNo = live && rawCurrent <= totalPicks ? rawCurrent : null;
  const cur = currentPickNo ? slotForPick(currentPickNo, teams, reversalRound) : null;

  const ctx = {
    teams, reversalRound, slotToRosterId: draft.slot_to_roster_id ?? {},
    tradedPicks, season: draft.season ?? "2026",
  };
  const myPicks = known ? myPickNumbers(myRosterId, ctx, totalPicks) : [];
  let isMyTurn = false;
  let picksUntilMe = null;
  let myNextPickNo = null;
  if (known && currentPickNo) {
    const nextIncl = nextMyPick(myPicks, currentPickNo, true);
    isMyTurn = nextIncl === currentPickNo;
    picksUntilMe = nextIncl == null ? null : nextIncl - currentPickNo;
    myNextPickNo = nextMyPick(myPicks, currentPickNo, !isMyTurn);
  }

  let recommendations = [];
  if (status !== "complete" && (currentPickNo || status === "pre_draft")) {
    const remainingMine = known && currentPickNo ? myPicks.filter((p) => p >= currentPickNo).length : Infinity;
    const picksLeft = Math.min(rounds - myRoster.length, remainingMine);
    recommendations = recommend({
      available, roster: myRoster, picksLeft, currentPickNo: currentPickNo ?? 1, myNextPickNo,
    });
  }

  const board = Array.from({ length: rounds }, () => Array(teams).fill(null));
  for (let pickNo = 1; pickNo <= totalPicks; pickNo++) {
    const { round, slot } = slotForPick(pickNo, teams, reversalRound);
    const pick = byId.get(pickNo);
    let rosterId = null;
    if (pick) rosterId = pick.roster_id;
    else if (known) rosterId = pickOwnerRosterId(pickNo, ctx);
    let player = null;
    if (pick) {
      const p = toPlayer(pick);
      player = { name: p.name, positions: p.positions };
    }
    board[round - 1][slot - 1] = { pickNo, rosterId, player, isMine: rosterId != null && rosterId === myRosterId };
  }

  return {
    status,
    orderKnown: known,
    currentPickNo,
    currentRound: cur?.round ?? null,
    currentSlot: cur?.slot ?? null,
    isMyTurn,
    picksUntilMe,
    myNextPickNo,
    secondsLeft: secondsLeft(draft, now),
    myRoster,
    available,
    recommendations,
    topAvailable: available.slice(0, TOP_AVAILABLE),
    board,
    columns: columnLabels(draft, users, teams),
    mySlot: !known ? null : Number(Object.entries(draft.slot_to_roster_id ?? {}).find(([, r]) => r === myRosterId)?.[0]) || null,
    totalPicks,
  };
}

export const REQUEST_TIMEOUT_MS = 6000;

export function timeoutSignal(ms) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export async function fetchJson(url, { fetchFn = fetch, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const res = await fetchFn(url, { signal: timeoutSignal(timeoutMs) });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

export function pickSignature(picks) {
  return JSON.stringify(picks.map((p) => [p.pick_no, p.player_id, p.roster_id]));
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Pas de réponse après ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function createPoller({
  fetchOnce, onData, onError, onComputeError, delayMs, timeoutMs = REQUEST_TIMEOUT_MS + 2000,
  setTimer = setTimeout, clearTimer = clearTimeout,
}) {
  let timer = null;
  let stopped = false;
  async function tick() {
    let data;
    let failed = false;
    try {
      data = await withTimeout(fetchOnce(), timeoutMs);
    } catch (err) {
      failed = true;
      onError(err);
    }
    if (!failed && !stopped) {
      try {
        onData(data);
      } catch (err) {
        onComputeError(err);
      }
    }
    if (!stopped) timer = setTimer(tick, delayMs);
  }
  return {
    start: () => {
      stopped = false;
      return tick();
    },
    stop: () => {
      stopped = true;
      if (timer != null) clearTimer(timer);
    },
  };
}
