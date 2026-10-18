import { test } from "node:test";
import assert from "node:assert/strict";
import { slotForPick, pickOwnerRosterId, myPickNumbers, orderKnown, nextMyPick, pickLabel } from "../site/lib/draftOrder.js";
import { loadFixture } from "./helpers.js";

const ctx = (s2r = Object.fromEntries([...Array(12)].map((_, i) => [String(i + 1), i + 1])), traded = []) =>
  ({ teams: 12, reversalRound: 3, slotToRosterId: s2r, tradedPicks: traded, season: "2026" });
test("inversion au tour 3", () => {
  assert.deepEqual(slotForPick(13, 12, 3), { round: 2, slot: 12 });
  assert.deepEqual(slotForPick(25, 12, 3), { round: 3, slot: 12 });
  assert.deepEqual(slotForPick(37, 12, 3), { round: 4, slot: 1 });
  assert.deepEqual(slotForPick(49, 12, 3), { round: 5, slot: 12 });
});
test("picks du slot 7 (spec §7 ter)", () =>
  assert.deepEqual(myPickNumbers(7, ctx(), 120), [7, 18, 30, 43, 54, 67, 78, 91, 102, 115]));
test("bouts de snake consécutifs", () => {
  assert.deepEqual(myPickNumbers(12, ctx(), 120).slice(0, 3), [12, 13, 25]);
  assert.deepEqual(myPickNumbers(1, ctx(), 120).slice(2, 4), [36, 37]);
});
test("pick échangé", () => {
  const c = ctx(undefined, [{ round: 2, roster_id: 7, owner_id: 3, season: "2026" }]);
  assert.equal(pickOwnerRosterId(18, c), 3);
  assert.ok(!myPickNumbers(7, c, 120).includes(18));
});
test("conforme à la draft 2025 réelle", () => {
  const { draft, picks, tradedPicks } = loadFixture("draft2025.json");
  const c = { teams: 12, reversalRound: 3, slotToRosterId: draft.slot_to_roster_id, tradedPicks, season: "2025" };
  for (const p of picks) assert.equal(pickOwnerRosterId(p.pick_no, c), p.roster_id, `pick ${p.pick_no}`);
});
test("ordre inconnu", () => assert.equal(orderKnown({ draft_order: null }), false));
test("ordre connu en cours de draft via slot_to_roster_id seul", () => {
  const s2r = { 1: 1 };
  assert.equal(orderKnown({ status: "drafting", draft_order: null, slot_to_roster_id: s2r }), true);
  assert.equal(orderKnown({ status: "paused", draft_order: null, slot_to_roster_id: s2r }), true);
  assert.equal(orderKnown({ status: "pre_draft", draft_order: null, slot_to_roster_id: s2r }), false);
  assert.equal(orderKnown({ status: "drafting", draft_order: null, slot_to_roster_id: null }), false);
});
test("ordre connu", () => assert.equal(orderKnown({ draft_order: { u1: 1 } }), true));
test("prochain pick à moi", () => {
  const mine = [7, 18, 30];
  assert.equal(nextMyPick(mine, 7, true), 7);
  assert.equal(nextMyPick(mine, 7, false), 18);
  assert.equal(nextMyPick(mine, 31, true), null);
});

test("B4 pickLabel : « Tour 8 · choix 7 », jamais « 8.07 »", () => {
  assert.equal(pickLabel(91, 12), "Tour 8 · choix 7");
  assert.equal(pickLabel(1, 12), "Tour 1 · choix 1");
  assert.equal(pickLabel(36, 12), "Tour 3 · choix 12");
  assert.equal(pickLabel(54, 12), "Tour 5 · choix 6");
  assert.equal(pickLabel(120, 12), "Tour 10 · choix 12");
});
