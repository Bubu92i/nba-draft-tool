export const SEASON_WEIGHTS = { 2025: 0.5, 2024: 0.3, 2023: 0.2 };
export const HISTORY_FILL_KEYS = ["oreb", "pf", "tf", "ff", "bonus_pt_40p", "bonus_pt_50p", "bonus_reb_20p", "bonus_ast_15p"];
const DEFAULT_PER_GAME = { pts: 6, reb: 2.5, ast: 1.2, stl: 0.4, blk: 0.3, to: 0.8 };

export function historicalPerGame(seasons) {
  const played = (seasons || []).filter((s) => s && s.stats && s.stats.gp > 0 && SEASON_WEIGHTS[s.season] > 0);
  if (!played.length) return null;
  const totalWeight = played.reduce((sum, s) => sum + SEASON_WEIGHTS[s.season], 0);
  const keys = new Set();
  for (const s of played) for (const k of Object.keys(s.stats)) if (k !== "gp") keys.add(k);
  const out = {};
  for (const k of keys) {
    let acc = 0;
    for (const s of played) acc += (SEASON_WEIGHTS[s.season] * (s.stats[k] ?? 0)) / s.stats.gp;
    out[k] = acc / totalWeight;
  }
  return out;
}

export function completePerGame(proj, hist) {
  if (proj && typeof proj.pts === "number") {
    const perGame = { ...proj };
    for (const k of HISTORY_FILL_KEYS) {
      if (!(k in proj)) perGame[k] = hist?.[k] ?? 0;
    }
    return { perGame, source: "proj" };
  }
  if (hist) return { perGame: { ...hist }, source: "history" };
  return { perGame: { ...DEFAULT_PER_GAME }, source: "default" };
}
