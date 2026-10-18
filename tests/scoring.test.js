import { test } from "node:test";
import assert from "node:assert/strict";
import { fantasyPointsPerGame } from "../site/lib/scoring.js";

const S = { pts:1, reb:1.2, oreb:0.5, ast:1.5, stl:3, blk:3, to:-1.5, tpm:1, ftmi:-0.5, pf:-0.5, tf:-1, ff:-2, dd:1, td:2, bonus_pt_40p:1, bonus_pt_50p:1, bonus_reb_20p:1, bonus_ast_15p:1 };
test("ligne complète", () => {
  const g = { pts:20, reb:10, oreb:2, ast:5, stl:1, blk:2, to:3, tpm:2, ftmi:1, pf:2, dd:1 };
  // 20 + 12 + 1 + 7.5 + 3 + 6 - 4.5 + 2 - 0.5 - 1 + 1 = 46.5
  assert.equal(fantasyPointsPerGame(g, S), 46.5);
});
test("clé absente = 0, clé hors barème ignorée", () => {
  assert.equal(fantasyPointsPerGame({ pts: 10, fga: 99 }, S), 10);
});
