import { test } from "node:test";
import assert from "node:assert/strict";
import { expectedGames, injuryBadge } from "../site/lib/games.js";

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
  assert.equal(injuryBadge({ gpHistory: [{season:2025,gp:0},{season:2024,gp:73},{season:2023,gp:68}], injuryText: null, override: null }), "a joué 0, 73, 68 matchs sur 3 saisons");
  assert.match(injuryBadge({ gpHistory: [], injuryText: "Out — genou (Surgery)", override: { games: 30, note: "retour incertain, ~janvier" } }), /^Out — genou \(Surgery\) · retour incertain/);
});
