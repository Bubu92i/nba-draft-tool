import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { MY_ROSTER_ID, MY_USER_ID, DRAFT_ID } from "../site/lib/config.js";
import { slotForPick } from "../site/lib/draftOrder.js";
import { canDraft } from "../site/lib/recommend.js";

const PREV_DRAFT_ID = "1280975159301251072";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = "true"] = a.replace(/^--/, "").split("=");
    return [k, v];
  }),
);
const mode = args.mode ?? "replay2025";
const port = Number(args.port ?? 8787);
const intervalMs = Number(args.interval ?? 2) * 1000;
const myDelayMs = Number(args["my-delay"] ?? 8) * 1000;
const startDelayMs = Number(args["start-delay"] ?? 5) * 1000;
const mySlot = Number(args["my-slot"] ?? 12);

if (!["replay2025", "scenario2026"].includes(mode)) throw new Error(`--mode inconnu: ${mode}`);
if (!Number.isInteger(mySlot) || mySlot < 1 || mySlot > 12) throw new Error(`--my-slot invalide: ${args["my-slot"]}`);

const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const snapshot = readJson("../site/data/snapshot.json");
const fixture = readJson("../tests/fixtures/draft2025.json");

const TEAMS = 12;
const ROUNDS = 10;
const REVERSAL_ROUND = 3;
const TOTAL = TEAMS * ROUNDS;
const fakeUserId = (slot) => `u${slot}`;

let baseDraft;
let draftOrder;
let slotToRosterId;
let users;

if (mode === "replay2025") {
  baseDraft = fixture.draft;
  slotToRosterId = baseDraft.slot_to_roster_id;
  draftOrder = {};
  for (const pick of [...fixture.picks].sort((a, b) => a.pick_no - b.pick_no)) {
    if (!(pick.picked_by in draftOrder)) draftOrder[pick.picked_by] = pick.draft_slot;
  }
  users = Object.entries(draftOrder).map(([userId, slot]) => ({
    user_id: userId,
    display_name: slotToRosterId[String(slot)] === MY_ROSTER_ID ? "BahBubu" : `Équipe test ${slot}`,
  }));
} else {
  const others = Array.from({ length: TEAMS }, (_, i) => i + 1).filter((r) => r !== MY_ROSTER_ID);
  slotToRosterId = {};
  draftOrder = {};
  users = [];
  for (let slot = 1; slot <= TEAMS; slot++) {
    if (slot === mySlot) {
      slotToRosterId[slot] = MY_ROSTER_ID;
      draftOrder[MY_USER_ID] = slot;
      users.push({ user_id: MY_USER_ID, display_name: "BahBubu" });
    } else {
      slotToRosterId[slot] = others.shift();
      draftOrder[fakeUserId(slot)] = slot;
      users.push({ user_id: fakeUserId(slot), display_name: `Équipe test ${slot}` });
    }
  }
  baseDraft = {
    draft_id: DRAFT_ID,
    type: "snake",
    season: "2026",
    settings: { teams: TEAMS, rounds: ROUNDS, reversal_round: REVERSAL_ROUND, pick_timer: 60 },
    slot_to_roster_id: slotToRosterId,
  };
}

const startTimeMs = Date.now() + startDelayMs;
const state = { status: "pre_draft", picks: [], lastPicked: null };

function nextScenarioPick() {
  const pickNo = state.picks.length + 1;
  const { round, slot } = slotForPick(pickNo, TEAMS, REVERSAL_ROUND);
  const rosterId = slotToRosterId[String(slot)];
  const taken = new Set(state.picks.map((p) => String(p.player_id)));
  const roster = state.picks.filter((p) => p.roster_id === rosterId).map((p) => snapshot.players[p.player_id]);
  const player = Object.values(snapshot.players)
    .filter((p) => !taken.has(String(p.id)) && canDraft(p, roster))
    .sort((a, b) => a.adp - b.adp || b.value - a.value)[0];
  if (!player) throw new Error(`Aucun joueur draftable pour le pick ${pickNo}`);
  const [first, ...rest] = player.name.split(" ");
  const userId = Object.entries(draftOrder).find(([, s]) => s === slot)[0];
  return {
    pick_no: pickNo,
    round,
    draft_slot: slot,
    roster_id: rosterId,
    player_id: String(player.id),
    picked_by: userId,
    metadata: {
      first_name: first,
      last_name: rest.join(" "),
      position: player.positions[0],
      team: player.team,
    },
  };
}

function stepDelay(pickNo) {
  if (mode === "replay2025") return intervalMs;
  const { slot } = slotForPick(pickNo, TEAMS, REVERSAL_ROUND);
  return slotToRosterId[String(slot)] === MY_ROSTER_ID ? myDelayMs : intervalMs;
}

function scheduleNext() {
  const pickNo = state.picks.length + 1;
  if (pickNo > TOTAL) {
    state.status = "complete";
    console.log("draft complete");
    return;
  }
  setTimeout(() => {
    const pick = mode === "replay2025" ? fixture.picks[pickNo - 1] : nextScenarioPick();
    state.picks.push(pick);
    state.lastPicked = Date.now();
    console.log(`pick ${pickNo}: ${pick.metadata.first_name} ${pick.metadata.last_name} → roster ${pick.roster_id}`);
    scheduleNext();
  }, stepDelay(pickNo));
}

setTimeout(() => {
  state.status = "drafting";
  state.lastPicked = Date.now();
  console.log("status → drafting");
  scheduleNext();
}, startDelayMs);

function currentDraft() {
  const preDraft = state.status === "pre_draft";
  return {
    ...baseDraft,
    status: state.status,
    start_time: startTimeMs,
    draft_order: preDraft ? null : draftOrder,
    last_picked: preDraft ? null : state.lastPicked,
  };
}

function send(res, code, body) {
  res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "*",
    });
    res.end();
    return;
  }
  const path = new URL(req.url, "http://localhost").pathname.replace(/\/+$/, "");
  if (/^\/v1\/draft\/[^/]+$/.test(path)) return send(res, 200, currentDraft());
  if (/^\/v1\/draft\/[^/]+\/picks$/.test(path)) return send(res, 200, state.picks);
  if (/^\/v1\/draft\/[^/]+\/traded_picks$/.test(path)) return send(res, 200, []);
  if (/^\/v1\/league\/[^/]+\/users$/.test(path)) return send(res, 200, users);
  return send(res, 404, { error: "not found", path });
});

server.listen(port, () => {
  const id = mode === "replay2025" ? PREV_DRAFT_ID : DRAFT_ID;
  console.log(`mock Sleeper (${mode}) on http://localhost:${port} — draft id ${id}, pre_draft for ${startDelayMs / 1000}s`);
});
