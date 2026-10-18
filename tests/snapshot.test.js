import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fantasyPointsPerGame } from "../site/lib/scoring.js";

const SNAPSHOT_URL = new URL("../site/data/snapshot.json", import.meta.url);
const missing = !existsSync(SNAPSHOT_URL);
const loadSnapshot = () => JSON.parse(readFileSync(SNAPSHOT_URL, "utf8"));
const perGameOf = (c) => Object.fromEntries(Object.entries(c.totals).map(([k, v]) => [k, v / c.gp]));

test("contrôle du barème sur la saison 2025 réelle", { skip: missing && "snapshot absent" }, () => {
  const s = loadSnapshot();
  assert.equal(s.check.length, 10);
  for (const c of s.check) {
    let manual = 0;
    for (const [k, w] of Object.entries(s.scoring)) manual += (c.totals[k] ?? 0) * w;
    assert.ok(Math.abs(fantasyPointsPerGame(perGameOf(c), s.scoring) - manual / c.gp) < 0.01, c.name);
  }
  const best = Math.max(...s.check.map((c) => fantasyPointsPerGame(perGameOf(c), s.scoring)));
  assert.ok(best > 50);
});

test("cohérence globale", { skip: missing && "snapshot absent" }, () => {
  const s = loadSnapshot();
  const top = Object.values(s.players).sort((a, b) => b.value - a.value);
  assert.ok(top.length > 300);
  assert.ok(s.replacementFpg > 10 && s.replacementFpg < 35);
  assert.ok(top.slice(0, 20).every((p) => p.fpg > 35));
  assert.ok(top.slice(0, 150).every((p) => p.injury.status !== "Out" || p.injuryBadge));
  for (const p of top) assert.ok(Number.isFinite(p.value) && p.positions.length > 0);
});
