import { test } from "node:test";
import assert from "node:assert/strict";
import { statsLine, injuryText, renderTop50 } from "../scripts/build-snapshot.mjs";

test("statsLine : mots complets, interceptions et contres seulement si significatifs", () => {
  assert.equal(
    statsLine({ pts: 29.74, reb: 10.5, ast: 6.3, stl: 1.5, blk: 1.0 }),
    "29,7 points · 10,5 rebonds · 6,3 passes · 1,5 interceptions · 1,0 contres",
  );
  assert.equal(statsLine({ pts: 12, reb: 3, ast: 2, stl: 1.0, blk: 0.4 }), "12,0 points · 3,0 rebonds · 2,0 passes");
});

test("injuryText : statut en français, parties du corps traduites", () => {
  assert.equal(injuryText("Out", { injury_status: "Out", injury_body_part: "Knee", injury_notes: "Surgery" }), "Blessé (genou, Surgery)");
  assert.equal(injuryText("Out", { injury_status: "IR", injury_body_part: "Foot" }), "Blessé (pied)");
  assert.equal(injuryText("DTD", { injury_status: "DTD", injury_body_part: "Toe", injury_notes: "Bruise" }), "Incertain (orteil, Bruise)");
  assert.equal(injuryText("DTD", { injury_status: "Questionable", injury_body_part: "Calf Strain Mystery" }), "Incertain (Calf Strain Mystery)");
  assert.equal(injuryText("DTD", { injury_status: "DTD" }), "Incertain");
  assert.equal(injuryText("DTD", { injury_status: "DTD", injury_notes: "Soreness" }), "Incertain (Soreness)");
  assert.equal(injuryText(null, { injury_status: null }), null);
});

test("injuryText : traductions fréquentes", () => {
  const cases = {
    Toe: "orteil", Groin: "aine", Illness: "maladie", Thigh: "cuisse", Elbow: "coude", Hand: "main", Finger: "doigt",
    Concussion: "commotion", Quadriceps: "quadriceps", Rest: "repos", Personal: "raisons personnelles",
    Heel: "talon", Pectoral: "pectoral", Undisclosed: "non précisé", "Lower Leg": "jambe",
  };
  for (const [en, fr] of Object.entries(cases)) assert.equal(injuryText("DTD", { injury_status: "DTD", injury_body_part: en }), `Incertain (${fr})`, en);
});

test("Top 50 : en-tête « Pts fantasy/match »", () => {
  const snap = { generatedAt: "2026-10-18T10:00:00Z", players: { a: { id: "a", name: "A", positions: ["PG"], team: "X", fpg: 40, expectedGames: 70, value: 1, injuryBadge: null } } };
  assert.match(renderTop50(snap), /<th class="n">Pts fantasy\/match<\/th>/);
});
