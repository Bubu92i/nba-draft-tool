import { test } from "node:test";
import assert from "node:assert/strict";
import { expectedGames, injuryBadge, injuryLevel } from "../site/lib/games.js";

test("joueur durable", () => {
  const g = expectedGames({ gpHistory: [{season:2025,gp:80},{season:2024,gp:80},{season:2023,gp:80}], yearsExp: 8, injuryStatus: null, override: null });
  assert.equal(g, 76.3);
});
test("rookie → 65", () => assert.equal(expectedGames({ gpHistory: [], yearsExp: 0, injuryStatus: null, override: null }), 65));
test("saison 0 match compte quand le joueur était en NBA", () => {
  const g = expectedGames({ gpHistory: [{season:2025,gp:0},{season:2024,gp:70},{season:2023,gp:70}], yearsExp: 5, injuryStatus: null, override: null });
  assert.equal(g, 42.5);
});
test("Out sans override ×0.6, override prioritaire", () => {
  const h = [{season:2025,gp:80},{season:2024,gp:80},{season:2023,gp:80}];
  assert.equal(expectedGames({ gpHistory: h, yearsExp: 8, injuryStatus: "Out", override: null }), Math.round(76.25*0.6*10)/10);
  assert.equal(expectedGames({ gpHistory: h, yearsExp: 8, injuryStatus: "Out", override: { games: 20 } }), 20);
});
test("DTD ×0.97 et saisons avant la carrière NBA ignorées", () => {
  const h = [{season:2025,gp:60},{season:2024,gp:10},{season:2023,gp:10}];
  assert.equal(expectedGames({ gpHistory: h, yearsExp: 1, injuryStatus: "DTD", override: null }), Math.round((0.75*60 + 16.25)*0.97*10)/10);
});
test("badge : seulement si saison < 55 matchs ou statut", () => {
  assert.equal(injuryBadge({ gpHistory: [{season:2025,gp:80},{season:2024,gp:78},{season:2023,gp:70}], injuryText: null, override: null }), null);
  assert.equal(injuryBadge({ gpHistory: [{season:2025,gp:0},{season:2024,gp:73},{season:2023,gp:68}], injuryText: null, override: null }), "Risque élevé — 0 match l'an dernier (73, 68 avant)");
  assert.match(injuryBadge({ gpHistory: [], injuryText: "Blessé (genou, Surgery)", injuryStatus: "Out", override: { games: 30, note: "retour incertain, ~janvier" } }), /^Risque élevé — Blessé \(genou, Surgery\) · retour incertain/);
});

const H = (...gps) => gps.map((gp, i) => ({ season: 2025 - i, gp }));
test("badge : format du risque avec la dernière saison nommée", () => {
  assert.equal(injuryBadge({ gpHistory: H(36, 67, 73), injuryText: null, override: null }), "Risque élevé — 36 matchs l'an dernier (67, 73 avant)");
  assert.equal(injuryBadge({ gpHistory: H(62, 50, 61), injuryText: null, override: null }), "Risque modéré — 62 matchs l'an dernier (50, 61 avant)");
  assert.equal(injuryBadge({ gpHistory: H(40), injuryText: null, override: null }), "Risque élevé — 40 matchs l'an dernier");
  assert.equal(injuryBadge({ gpHistory: H(1, 70), injuryText: null, override: null }), "Risque élevé — 1 match l'an dernier (70 avant)");
});
test("badge : statut seul (joueur solide) = risque modéré ; Out = risque élevé", () => {
  assert.equal(injuryBadge({ gpHistory: H(80, 78, 70), injuryText: "Incertain (orteil, Bruise)", injuryStatus: "DTD", override: null }), "Risque modéré — Incertain (orteil, Bruise)");
  assert.equal(injuryBadge({ gpHistory: H(80, 78, 70), injuryText: "Blessé (pied)", injuryStatus: "Out", override: null }), "Risque élevé — Blessé (pied)");
});
test("badge : texte, puis note d'override en fin de badge", () => {
  assert.equal(
    injuryBadge({ gpHistory: H(0, 73, 68), injuryText: "Blessé (genou)", injuryStatus: "Out", override: { games: 30, note: "retour ~janvier" } }),
    "Risque élevé — 0 match l'an dernier (73, 68 avant) · Blessé (genou) · retour ~janvier",
  );
});
test("injuryLevel : élevé si Out ou dernière saison < 50, modéré sinon, null sans badge", () => {
  assert.equal(injuryLevel({ gpHistory: H(80, 80, 80), injuryText: null, override: null }), null);
  assert.equal(injuryLevel({ gpHistory: H(49, 80, 80), injuryText: null, override: null }), "high");
  assert.equal(injuryLevel({ gpHistory: H(50, 80, 80), injuryText: null, override: null }), "moderate");
  assert.equal(injuryLevel({ gpHistory: H(80), injuryText: "x", injuryStatus: "Out", override: null }), "high");
  assert.equal(injuryLevel({ gpHistory: H(80), injuryText: "x", injuryStatus: "DTD", override: null }), "moderate");
  assert.equal(injuryLevel({ gpHistory: [], injuryText: null, override: { games: 10, note: "n" } }), "moderate");
});
