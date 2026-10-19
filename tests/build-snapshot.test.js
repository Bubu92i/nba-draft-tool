import { test } from "node:test";
import assert from "node:assert/strict";
import { statsLine, injuryText, renderTop50, buildSnapshot } from "../scripts/build-snapshot.mjs";

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

function miniInput(extra = {}) {
  const mk = (id, pts) => [id, { active: true, fantasy_positions: ["PG"], full_name: `P${id}`, team: "X", years_exp: 3 }, { player_id: id, stats: { pts, reb: 5, ast: 5, adp_std: 10, gp: 70 } }];
  const rows = [mk("1", 30), mk("2", 20), mk("3", 25)];
  return {
    league: { scoring_settings: { pts: 1, reb: 1, ast: 1 } },
    players: Object.fromEntries(rows.map(([id, p]) => [id, p])),
    projections: rows.map(([, , proj]) => proj),
    stats: { 2025: [], 2024: [], 2023: [] },
    overrides: {},
    now: new Date("2026-10-19T10:00:00Z"),
    ...extra,
  };
}

const INSIGHTS = {
  sources: [
    { key: "espn", name: "ESPN long", date: "2026-10-09", kind: "ranking" },
    { key: "yahoo", name: "Yahoo long", date: "2026-09-29", kind: "ranking" },
    { key: "fp", name: "FP long", date: "2026-10-18", kind: "ranking" },
    { key: "notes_espn", name: "ESPN notes", date: "2026-09-22", kind: "notes" },
  ],
  players: {
    "2": { name: "P2", ranks: { espn: 10, fp: 15 }, notes: [{ tag: "sleeper", text: "a", source: "s", url: "u" }, { tag: "bust", text: "b", source: "s", url: "u" }, { tag: "role", text: "c", source: "s", url: "u" }] },
    "3": { name: "P3", ranks: {}, notes: [] },
    "999": { name: "Inconnu", ranks: { espn: 1 }, notes: [] },
  },
};

test("buildSnapshot : toolRank pour tous les joueurs, par valeur décroissante", () => {
  const snap = buildSnapshot(miniInput());
  const byValue = Object.values(snap.players).sort((a, b) => b.value - a.value).map((p) => p.id);
  assert.deepEqual(byValue.map((id) => snap.players[id].toolRank), [1, 2, 3]);
  assert.equal(snap.players["1"].toolRank, 1);
});

test("buildSnapshot : sans expert-insights, pas d'experts ni de sources", () => {
  const snap = buildSnapshot(miniInput());
  assert.equal(snap.expertSources, undefined);
  for (const p of Object.values(snap.players)) assert.equal(p.experts, undefined);
});

test("buildSnapshot : expertSources = sources de classement avec libellé court", () => {
  const snap = buildSnapshot(miniInput({ insights: INSIGHTS }));
  assert.deepEqual(snap.expertSources, [
    { key: "espn", label: "ESPN", date: "2026-10-09" },
    { key: "yahoo", label: "Yahoo", date: "2026-09-29" },
    { key: "fp", label: "FantasyPros", date: "2026-10-18" },
  ]);
});

test("buildSnapshot : experts = avgRank arrondi, rangs, 2 notes max sans URL", () => {
  const snap = buildSnapshot(miniInput({ insights: INSIGHTS }));
  assert.deepEqual(snap.players["2"].experts, {
    avgRank: 13,
    ranks: { espn: 10, fp: 15 },
    notes: [{ tag: "sleeper", text: "a" }, { tag: "bust", text: "b" }],
  });
  assert.deepEqual(snap.players["3"].experts, { avgRank: null, ranks: {}, notes: [] });
  assert.equal(snap.players["1"].experts, undefined);
  assert.equal(snap.players["999"], undefined);
});

test("buildSnapshot : les experts ne changent ni value ni fpg", () => {
  const a = buildSnapshot(miniInput());
  const b = buildSnapshot(miniInput({ insights: INSIGHTS }));
  for (const id of Object.keys(a.players)) {
    assert.equal(b.players[id].value, a.players[id].value);
    assert.equal(b.players[id].fpg, a.players[id].fpg);
    assert.equal(b.players[id].toolRank, a.players[id].toolRank);
  }
});
