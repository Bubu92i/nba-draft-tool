import { test } from "node:test";
import assert from "node:assert/strict";
import { bestLineup, canDraft, availabilityTier, recommend, explain } from "../site/lib/recommend.js";

const P = (id, positions, value, extra = {}) => ({
  id, name: id, team: "XXX", positions, value, fpg: 0, expectedGames: 70, adp: 999,
  injury: { status: null, text: null }, injuryBadge: null, statsLine: "", ...extra,
});

test("recommend : exclut les joueurs à 0 match attendu", () => {
  const available = [P("zero", ["PG"], 9999, { expectedGames: 0 }), P("ok", ["PG"], 10)];
  const recs = recommend({ available, roster: [], picksLeft: 10, currentPickNo: 1, myNextPickNo: null });
  assert.deepEqual(recs.map((r) => r.player.id), ["ok"]);
});
test("meilleur cinq avec multi-éligibilité", () => {
  const r = [P("a", ["PG", "SG"], 100), P("b", ["PG"], 90), P("c", ["C"], 50)];
  const L = bestLineup(r);
  assert.equal(L.total, 240);
  assert.equal(L.assignment.PG, "b");
  assert.equal(L.assignment.SG, "a");
});
test("ne propose pas un 3e meneur quand le poste C est vide", () => {
  const roster = [P("pg1", ["PG"], 900), P("pg2", ["PG"], 800), P("sg", ["SG"], 700), P("sf", ["SF"], 700), P("pf", ["PF"], 700)];
  const avail = [P("pg3", ["PG"], 600), P("c1", ["C"], 400)];
  assert.equal(recommend({ available: avail, roster, picksLeft: 5, currentPickNo: 60, myNextPickNo: 67 })[0].player.id, "c1");
});
test("fin de draft : seuls les joueurs qui comblent un poste vide", () => {
  const roster = [P("pg", ["PG"], 900), P("sg", ["SG"], 800), P("sf", ["SF"], 700), P("x1", ["PG"], 1), P("x2", ["PG"], 1), P("x3", ["SG"], 1), P("x4", ["SG"], 1), P("x5", ["SF"], 1)];
  const avail = [P("star", ["SG"], 2000), P("pf", ["PF"], 10), P("c", ["C"], 10)];
  const ids = recommend({ available: avail, roster, picksLeft: 2, currentPickNo: 100, myNextPickNo: 115 }).map((r) => r.player.id);
  assert.deepEqual(ids.sort(), ["c", "pf"]);
});
test("picks consécutifs : le second tient compte du premier", () => {
  const avail = [P("c1", ["C"], 1000), P("c2", ["C"], 990), P("g", ["PG"], 700)];
  const first = recommend({ available: avail, roster: [], picksLeft: 10, currentPickNo: 12, myNextPickNo: 13 })[0].player;
  const second = recommend({ available: avail.filter((p) => p !== first), roster: [first], picksLeft: 9, currentPickNo: 13, myNextPickNo: 36 })[0].player;
  assert.equal(first.id, "c1");
  assert.equal(second.id, "g");
});
test("limite de poste", () => {
  const roster = Array.from({ length: 6 }, (_, i) => P("c" + i, ["C"], 10));
  assert.equal(canDraft(P("cx", ["C"], 10), roster), false);
  assert.equal(canDraft(P("cf", ["C", "PF"], 10), roster), true);
});
test("disponibilité", () => {
  assert.equal(availabilityTier(10, 7, 18), "gone");
  assert.equal(availabilityTier(40, 7, 18), "wait");
  assert.equal(availabilityTier(18, 7, 18), "coinflip");
  assert.equal(availabilityTier(999, 7, 18), "wait");
  assert.equal(availabilityTier(10, 7, null), null);
});
test("explication", () => {
  const p = P("c1", ["C"], 1000, { fpg: 48.04, statsLine: "20 pts · 12 reb · 2,5 ctr" });
  assert.equal(explain({ fillsSlot: "C", lineupGain: 1000 }, p), "48 pts/match · 20 pts · 12 reb · 2,5 ctr, comble ton poste C");
});
test("remaniement : un meneur pur comble le poste SG via un polyvalent", () => {
  const recs = recommend({
    available: [P("pg", ["PG"], 300), P("sg", ["SG"], 10)],
    roster: [P("a", ["PG", "SG"], 500)],
    picksLeft: 1, currentPickNo: 100, myNextPickNo: null,
  });
  assert.equal(recs[0].player.id, "pg");
  assert.equal(recs[0].fillsSlot, "SG");
});
test("explication : un PF/SF qui pousse un titulaire vers C", () => {
  const roster = [P("s", ["SF"], 600), P("a", ["PF", "C"], 500)];
  const [rec] = recommend({
    available: [P("p", ["PF", "SF"], 400)], roster, picksLeft: 5, currentPickNo: 50, myNextPickNo: null,
  });
  assert.equal(rec.fillsSlot, "C");
  assert.equal(rec.ownSlot, "PF");
  assert.equal(rec.shiftedPlayer.id, "a");
  assert.ok(rec.reason.endsWith("complète ton cinq : il joue PF, a passe C"), rec.reason);
});
test("explication : un vrai pivot comble le poste C", () => {
  const roster = [P("s", ["SF"], 600), P("a", ["PF", "C"], 500)];
  const [rec] = recommend({
    available: [P("c", ["C"], 400)], roster, picksLeft: 5, currentPickNo: 50, myNextPickNo: null,
  });
  assert.equal(rec.fillsSlot, "C");
  assert.equal(rec.ownSlot, "C");
  assert.equal(rec.shiftedPlayer, null);
  assert.ok(rec.reason.endsWith(", comble ton poste C"), rec.reason);
});
test("explication : le nom court ignore le suffixe Jr.", () => {
  const p = P("p", ["PF"], 10);
  const shifted = P("m", ["PF", "C"], 10, { name: "Michael Porter Jr." });
  const reason = explain({ fillsSlot: "C", ownSlot: "PF", shiftedPlayer: shifted, lineupGain: 5 }, p);
  assert.ok(reason.includes("Porter passe"), reason);
});
test("explication : ownSlot absent et joueur non éligible au poste", () => {
  const p = P("p", ["PF"], 10, { name: "Cooper Flagg" });
  const shifted = P("a", ["PF", "C"], 10, { name: "Cooper Flagg" });
  assert.equal(
    explain({ fillsSlot: "C", ownSlot: null, shiftedPlayer: shifted, lineupGain: 5 }, p),
    "0 pts/match, complète ton cinq (Flagg passe C)",
  );
});
