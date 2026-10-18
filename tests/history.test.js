import { test } from "node:test";
import assert from "node:assert/strict";
import { historicalPerGame, completePerGame } from "../site/lib/history.js";

test("moyenne pondérée renormalisée", () => {
  const h = historicalPerGame([
    { season: 2025, stats: { gp: 10, pts: 200, oreb: 20 } },
    { season: 2024, stats: { gp: 20, pts: 200, oreb: 20 } },
    { season: 2023, stats: { gp: 0 } } ]);
  assert.equal(h.pts, (20*0.5 + 10*0.3) / 0.8);
  assert.equal(h.oreb, (2*0.5 + 1*0.3) / 0.8);
});
test("aucune saison jouée → null", () => assert.equal(historicalPerGame([{ season: 2025, stats: { gp: 0 } }]), null));
test("projection complétée par l'historique sur oreb/pf/bonus uniquement", () => {
  const r = completePerGame({ pts: 25, reb: 10 }, { pts: 99, oreb: 3, pf: 2.5, blk: 2 });
  assert.equal(r.source, "proj");
  assert.equal(r.perGame.pts, 25);
  assert.equal(r.perGame.oreb, 3);
  assert.equal(r.perGame.pf, 2.5);
  assert.equal(r.perGame.blk ?? 0, 0);
});
test("sans projection → historique, sans rien → défaut", () => {
  assert.equal(completePerGame(null, { pts: 12 }).source, "history");
  assert.equal(completePerGame({}, null).source, "default");
});
