import { test } from "node:test";
import assert from "node:assert/strict";
import { bestLineup, canDraft, availabilityTier, recommend, explain, lineupView, TIER_LABELS, missingSlotsNotice, rankingCaption, valueLine, gapLine, seasonPts, signedPts, cardMarker, compareFives, comparisonLine } from "../site/lib/recommend.js";

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
  assert.equal(explain({ fillsSlot: "C", lineupGain: 1000 }, p), "48,0 pts fantasy/match — 20 pts · 12 reb · 2,5 ctr, comble ton poste C");
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
    "0,0 pts fantasy/match, complète ton cinq (Flagg passe C)",
  );
});

test("explication : sans statsLine, pas de séparateur orphelin", () => {
  const p = P("c1", ["C"], 1000, { fpg: 52.2, statsLine: null });
  assert.equal(explain({ fillsSlot: "C", lineupGain: 1000 }, p), "52,2 pts fantasy/match, comble ton poste C");
});
test("lineupView : poste titulaire vide, tous les autres joueurs au banc (bug 6/5)", () => {
  const roster = [
    P("pg", ["PG"], 900), P("sg", ["SG"], 800), P("sf", ["SF"], 700), P("pf", ["PF"], 600),
    P("b1", ["PG"], 5), P("b2", ["SG"], 4), P("b3", ["SF"], 3), P("b4", ["PF"], 2), P("b5", ["PF"], 1), P("b6", ["SF"], 0),
  ];
  const v = lineupView(roster);
  assert.deepEqual(v.emptySlots, ["C"]);
  assert.equal(v.starters.length, 5);
  assert.equal(v.starters.find((s) => s.slot === "C").player, null);
  assert.equal(v.bench.length, 6);
  assert.equal(v.starters.filter((s) => s.player).length + v.bench.length, roster.length);
  assert.deepEqual(new Set(v.bench.map((p) => p.id)), new Set(["b1", "b2", "b3", "b4", "b5", "b6"]));
});
test("lineupView : cinq complet, banc = le reste ; équipe vide", () => {
  const roster = [P("pg", ["PG"], 9), P("sg", ["SG"], 9), P("sf", ["SF"], 9), P("pf", ["PF"], 9), P("c", ["C"], 9), P("x", ["C"], 1)];
  const v = lineupView(roster);
  assert.deepEqual(v.emptySlots, []);
  assert.deepEqual(v.bench.map((p) => p.id), ["x"]);
  const empty = lineupView([]);
  assert.deepEqual(empty.emptySlots, ["PG", "SG", "SF", "PF", "C"]);
  assert.deepEqual(empty.bench, []);
});

test("libellés de disponibilité : vrais aussi quand c'est mon tour", () => {
  assert.equal(TIER_LABELS.gone, "⏳ Pas dispo à ton prochain tour");
  assert.equal(TIER_LABELS.coinflip, "⚖️ Peut-être encore là à ton prochain tour");
  assert.equal(TIER_LABELS.wait, "✅ Sera sûrement encore là à ton prochain tour");
});

test("légende : points au-dessus d'un remplaçant, arrondi, format français", () => {
  assert.equal(
    rankingCaption(28.4),
    "Classés selon les points fantasy au-dessus d'un remplaçant (≈ 28/match) × matchs prévus, puis le poste à combler et la profondeur de banc.",
  );
  assert.match(rankingCaption(27.5), /\(≈ 28\/match\)/);
});
test("ligne de valeur : +N pts de plus qu'un remplaçant, ou pas mieux", () => {
  assert.match(valueLine(2912.6), /^\+2[\s\u00a0\u202f]913 pts de plus qu'un remplaçant$/);
  assert.equal(valueLine(42), "+42 pts de plus qu'un remplaçant");
  assert.equal(valueLine(0), "pas mieux qu'un remplaçant");
  assert.equal(valueLine(-80.2), "pas mieux qu'un remplaçant");
  assert.equal(valueLine(0.3), "pas mieux qu'un remplaçant");
});
test("postes manquants : rouge seulement si draft finie ou plus assez de picks, sinon ligne grise", () => {
  const alert = (t) => ({ level: "alert", text: t });
  const info = (t) => ({ level: "info", text: t });
  assert.equal(missingSlotsNotice({ emptySlots: [], picksLeft: 3, over: false }), null);
  assert.equal(missingSlotsNotice({ emptySlots: [], picksLeft: 0, over: true }), null);
  assert.deepEqual(missingSlotsNotice({ emptySlots: ["PG", "C"], picksLeft: 8, over: false }), info("Postes à remplir : PG · C"));
  assert.deepEqual(missingSlotsNotice({ emptySlots: ["PG", "C"], picksLeft: 3, over: false }), info("Postes à remplir : PG · C"));
  assert.deepEqual(missingSlotsNotice({ emptySlots: ["PG", "C"], picksLeft: 2, over: false }), alert("Il te manque : PG · C"));
  assert.deepEqual(missingSlotsNotice({ emptySlots: ["C"], picksLeft: 0, over: false }), alert("Il te manque : C"));
  assert.deepEqual(missingSlotsNotice({ emptySlots: ["C"], picksLeft: 9, over: true }), alert("Il te manque : C"));
});
test("explication : toujours une décimale", () => {
  const p = P("c1", ["C"], 1000, { fpg: 52, statsLine: null });
  assert.equal(explain({ fillsSlot: "C", lineupGain: 1 }, p), "52,0 pts fantasy/match, comble ton poste C");
});

test("B1 gapLine : écart avec le n°2, arrondi", () => {
  const recs = [{ score: 1500.4 }, { score: 1380 }];
  assert.equal(gapLine(recs), "+120 pts d'apport de plus que le n°2");
  assert.equal(gapLine([{ score: 2450 }, { score: 1000 }]), "+1\u202f450 pts d'apport de plus que le n°2");
});
test("B1 gapLine : choix serré sous 50 pts, absent avec une seule carte", () => {
  assert.equal(gapLine([{ score: 1000 }, { score: 960 }]), "Choix serré avec le n°2 (écart 40 pts)");
  assert.equal(gapLine([{ score: 1000 }, { score: 1000 }]), "Choix serré avec le n°2 (écart 0 pts)");
  assert.equal(gapLine([{ score: 1049.4 }, { score: 1000 }]), "Choix serré avec le n°2 (écart 49 pts)");
  assert.equal(gapLine([{ score: 1050 }, { score: 1000 }]), "+50 pts d'apport de plus que le n°2");
  assert.equal(gapLine([{ score: 1000 }]), null);
  assert.equal(gapLine([]), null);
});
test("B3 signedPts et cardMarker", () => {
  assert.equal(signedPts(1349.6), "+1\u202f350");
  assert.equal(signedPts(12.2), "+12");
  assert.equal(signedPts(0.2), "0");
  assert.equal(signedPts(-12.4), "\u221212");
  assert.deepEqual([0, 1, 2, 3].map(cardMarker), ["①", "②", "③", "④"]);
  assert.equal(cardMarker(4), "");
  assert.equal(cardMarker(-1), "");
});
test("B6 seasonPts : fpg × matchs prévus arrondi", () => {
  assert.equal(seasonPts({ fpg: 48.04, expectedGames: 60 }), 2882);
});
const F = (id, positions, fpg, games = 50) => ({ id, name: id, positions, value: fpg * games, fpg, expectedGames: games });
const fiveOf = (fpg) => [F("pg", ["PG"], fpg), F("sg", ["SG"], fpg), F("sf", ["SF"], fpg), F("pf", ["PF"], fpg), F("c", ["C"], fpg)];
test("B6 compareFives : totaux du meilleur cinq, rang, moyenne", () => {
  const rosters = { 1: fiveOf(40), 2: fiveOf(30), 7: fiveOf(20), 4: fiveOf(10) };
  const c = compareFives({ rosters, myRosterId: 2, teams: 4 });
  assert.deepEqual(c, { mine: 7500, rank: 2, teams: 4, average: (10000 + 7500 + 5000 + 2500) / 4 });
});
test("B6 compareFives : le banc ne compte pas, joueur sans stats = 0, équipes vides comptées", () => {
  const mine = [...fiveOf(20), F("bench", ["PG"], 5)];
  mine[0] = F("pg", ["PG"], 50);
  const rosters = { 3: mine, 5: [F("inconnu", ["PG"], 0, 0)] };
  const c = compareFives({ rosters, myRosterId: 3, teams: 12 });
  assert.equal(c.mine, 2500 + 3 * 1000 + 1000);
  assert.equal(c.rank, 1);
  assert.equal(c.teams, 12);
  assert.equal(c.average, c.mine / 12);
});
test("B6 compareFives : égalité = même rang, équipe vide → rang dernier", () => {
  const rosters = { 1: fiveOf(10), 2: fiveOf(10) };
  assert.equal(compareFives({ rosters, myRosterId: 2, teams: 3 }).rank, 1);
  assert.equal(compareFives({ rosters: { 1: fiveOf(10), 2: [] }, myRosterId: 2, teams: 2 }).rank, 2);
  assert.equal(compareFives({ rosters: { 1: fiveOf(10) }, myRosterId: 2, teams: 2 }).mine, 0);
});
test("B6 comparisonLine : format, 1re / 2e", () => {
  assert.equal(comparisonLine({ mine: 11121, rank: 3, teams: 12, average: 10400.4 }), "Ton cinq : ≈ 11\u202f121 pts fantasy — 3e sur 12 équipes (moyenne ≈ 10\u202f400)");
  assert.equal(comparisonLine({ mine: 500, rank: 1, teams: 12, average: 400 }), "Ton cinq : ≈ 500 pts fantasy — 1re sur 12 équipes (moyenne ≈ 400)");
});
