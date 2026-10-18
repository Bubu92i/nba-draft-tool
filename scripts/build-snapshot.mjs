import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fantasyPointsPerGame } from "../site/lib/scoring.js";
import { historicalPerGame, completePerGame } from "../site/lib/history.js";
import { expectedGames, injuryBadge } from "../site/lib/games.js";
import { replacementFpg, seasonValue } from "../site/lib/value.js";

const LEAGUE_ID = "1411432283293900800";
const DRAFT_ID = "1411432283293900801";
const MY_ROSTER_ID = 7;
const BASE = "https://api.sleeper.app";
const HISTORY_SEASONS = [2025, 2024, 2023];
const PROJECTION_SEASON = 2026;

const ROOT = new URL("../", import.meta.url);
const path = (p) => fileURLToPath(new URL(p, ROOT));

const BODY_PARTS_FR = {
  Knee: "genou", Ankle: "cheville", Foot: "pied", Hamstring: "ischio", Back: "dos",
  Shoulder: "épaule", Hip: "hanche", Calf: "mollet", Achilles: "Achille", Wrist: "poignet",
};

async function fetchJson(endpoint) {
  const url = BASE + endpoint;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      console.error(`Échec ${url} (essai ${attempt}/3) : ${err.message}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw new Error(`Endpoint ${url} en échec après 3 essais : ${lastError.message}`);
}

const fr1 = (n) => n.toFixed(1).replace(".", ",");

function mapInjuryStatus(raw) {
  if (!raw) return null;
  return raw === "Out" || raw === "IR" ? "Out" : "DTD";
}

function injuryText(status, p) {
  if (!status) return null;
  let text = p.injury_status;
  if (p.injury_body_part) text += ` — ${BODY_PARTS_FR[p.injury_body_part] ?? p.injury_body_part}`;
  if (p.injury_notes) text += ` (${p.injury_notes})`;
  return text;
}

function statsLine(pg) {
  const parts = [`${fr1(pg.pts ?? 0)} pts`, `${fr1(pg.reb ?? 0)} reb`, `${fr1(pg.ast ?? 0)} pd`];
  if ((pg.stl ?? 0) >= 1.3) parts.push(`${fr1(pg.stl)} int`);
  if ((pg.blk ?? 0) >= 1.0) parts.push(`${fr1(pg.blk)} ctr`);
  return parts.join(" · ");
}

function byId(rows) {
  const map = new Map();
  for (const row of rows) {
    const list = map.get(String(row.player_id)) ?? [];
    list.push(row);
    map.set(String(row.player_id), list);
  }
  return map;
}

export function buildSnapshot({ league, players, projections, stats, overrides, now = new Date() }) {
  const scoring = league.scoring_settings;
  const projById = new Map();
  for (const row of projections) {
    const id = String(row.player_id);
    const prev = projById.get(id);
    if (!prev || (typeof row.stats?.pts === "number" && typeof prev.stats?.pts !== "number")) projById.set(id, row);
  }
  const statsBySeason = Object.fromEntries(HISTORY_SEASONS.map((s) => [s, byId(stats[s])]));

  const rows = [];
  for (const [id, p] of Object.entries(players)) {
    if (p.active !== true || !p.fantasy_positions?.length) continue;
    const proj = projById.get(id)?.stats ?? null;
    const projPerGame = proj && typeof proj.pts === "number" ? proj : null;
    const adp = typeof proj?.adp_std === "number" ? proj.adp_std : 999;
    const gp2025 = statsBySeason[2025].get(id)?.[0]?.stats?.gp ?? 0;
    if (!(projPerGame || adp < 999 || gp2025 >= 10)) continue;

    const yearsExp = p.years_exp ?? 0;
    const seasonRows = [];
    const gpHistory = [];
    for (const season of HISTORY_SEASONS) {
      const row = statsBySeason[season].get(id)?.[0];
      if (row?.stats) seasonRows.push({ season, stats: row.stats });
      if (season >= PROJECTION_SEASON - yearsExp) gpHistory.push({ season, gp: row?.stats?.gp ?? 0 });
    }
    const hist = historicalPerGame(seasonRows);
    const { perGame, source } = completePerGame(projPerGame, hist);
    const fpg = Math.round(fantasyPointsPerGame(perGame, scoring) * 10) / 10;
    const status = mapInjuryStatus(p.injury_status);
    const text = injuryText(status, p);
    const override = overrides[id];
    const expected = expectedGames({ gpHistory, yearsExp, injuryStatus: status, override });
    rows.push({
      id,
      name: p.full_name || `${p.first_name} ${p.last_name}`,
      team: p.team ?? null,
      positions: p.fantasy_positions,
      fpg,
      fpgSource: source,
      expectedGames: expected,
      adp,
      injury: { status, text },
      gpHistory,
      injuryBadge: injuryBadge({ gpHistory, injuryText: text, override }),
      statsLine: source === "default" ? null : statsLine(perGame),
    });
  }

  const replFpg = Math.round(replacementFpg(rows.map((r) => r.fpg)) * 10) / 10;
  const outPlayers = {};
  for (const r of rows) outPlayers[r.id] = { ...r, value: seasonValue(r.fpg, r.expectedGames, replFpg) };

  const check = [...stats[2025]]
    .filter((r) => outPlayers[String(r.player_id)] && !/^TEAM_/.test(String(r.player_id)) && r.stats?.gp > 0 && typeof r.stats.pts === "number")
    .sort((a, b) => b.stats.pts - a.stats.pts)
    .slice(0, 10)
    .map((r) => {
      const totals = {};
      for (const k of Object.keys(scoring)) if (typeof r.stats[k] === "number") totals[k] = r.stats[k];
      return { id: String(r.player_id), name: outPlayers[String(r.player_id)].name, gp: r.stats.gp, totals };
    });

  return {
    generatedAt: now.toISOString(),
    leagueId: LEAGUE_ID,
    draftId: DRAFT_ID,
    myRosterId: MY_ROSTER_ID,
    scoring,
    replacementFpg: replFpg,
    players: outPlayers,
    check,
  };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function renderTop50(snapshot) {
  const top = Object.values(snapshot.players).sort((a, b) => b.value - a.value).slice(0, 50);
  const date = new Date(snapshot.generatedAt).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" });
  const body = top.map((p, i) => `<tr><td class="n">${i + 1}</td><td><b>${esc(p.name)}</b></td><td>${esc(p.positions.join("/"))}</td><td>${esc(p.team ?? "—")}</td><td class="n">${fr1(p.fpg)}</td><td class="n">${Math.round(p.expectedGames)}</td><td class="b">${p.injuryBadge ? esc(p.injuryBadge) : ""}</td></tr>`).join("\n");
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Top 50 — draft And1 (secours)</title>
<style>
@page { size: A4; margin: 10mm; }
body { font: 11px/1.25 system-ui, sans-serif; margin: 0; color: #000; }
h1 { font-size: 16px; margin: 0 0 2px; }
p.d { margin: 0 0 6px; color: #444; }
table { border-collapse: collapse; width: 100%; }
th, td { border-bottom: 1px solid #bbb; padding: 2px 4px; text-align: left; vertical-align: top; }
th { background: #eee; font-size: 10px; }
td.n, th.n { text-align: right; white-space: nowrap; }
td.b { font-size: 9.5px; color: #8a1c1c; }
tr { page-break-inside: avoid; }
</style></head><body>
<h1>Top 50 — draft And1 (secours)</h1>
<p class="d">Généré le ${esc(date)} · classé par valeur sur la saison · pts/match = points fantasy par match</p>
<table><thead><tr><th class="n">Rang</th><th>Nom</th><th>Postes</th><th>Équipe</th><th class="n">Pts/match</th><th class="n">Matchs att.</th><th>Blessure</th></tr></thead>
<tbody>
${body}
</tbody></table>
</body></html>
`;
}

async function main() {
  const league = await fetchJson(`/v1/league/${LEAGUE_ID}`);
  const players = await fetchJson("/v1/players/nba");
  const projections = await fetchJson(`/projections/nba/${PROJECTION_SEASON}?season_type=regular`);
  const stats = {};
  for (const s of HISTORY_SEASONS) stats[s] = await fetchJson(`/stats/nba/${s}?season_type=regular`);

  const overridesPath = path("data/injury-overrides.json");
  const overrides = existsSync(overridesPath) ? JSON.parse(readFileSync(overridesPath, "utf8")) : {};

  const snapshot = buildSnapshot({ league, players, projections, stats, overrides });
  mkdirSync(path("site/data"), { recursive: true });
  writeFileSync(path("site/data/snapshot.json"), JSON.stringify(snapshot));
  writeFileSync(path("site/top50.html"), renderTop50(snapshot));

  const seen = [...new Set(Object.values(players).map((p) => p.injury_status ?? null))];
  console.log("injury_status distincts :", JSON.stringify(seen));
  const list = Object.values(snapshot.players);
  console.log(`${list.length} joueurs, replacementFpg ${snapshot.replacementFpg}, overrides ${Object.keys(overrides).length}`);
  const top150 = list.sort((a, b) => b.value - a.value).slice(0, 150);
  console.log("Out/IR dans le top 150 par valeur :");
  top150.forEach((p, i) => {
    if (p.injury.status === "Out") console.log(`  #${i + 1} ${p.id} ${p.name} (${p.team}) value ${p.value} — ${p.injury.text}${overrides[p.id] ? " [override]" : ""}`);
  });
  console.log("Top 150 sans statut blessure, 0 match lors de la dernière saison (2025) :");
  top150.forEach((p, i) => {
    if (!p.injury.status && p.gpHistory[0]?.season === 2025 && p.gpHistory[0].gp === 0) console.log(`  #${i + 1} ${p.id} ${p.name} (${p.team}) value ${p.value}, eg ${p.expectedGames}${overrides[p.id] ? " [override]" : ""}`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
