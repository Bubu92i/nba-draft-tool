import { SEASON_WEIGHTS } from "./history.js";

export const BASELINE_GAMES = 65;

const SEASONS = [2025, 2024, 2023];
const FACTORS = { Out: 0.6, DTD: 0.97 };

export function expectedGames({ gpHistory, yearsExp, injuryStatus, override }) {
  if (override) return override.games;
  const counted = (gpHistory ?? []).filter((h) => SEASONS.includes(h.season) && h.season >= 2026 - yearsExp);
  let base = BASELINE_GAMES;
  if (counted.length) {
    let num = 0;
    let den = 0;
    for (const { season, gp } of counted) {
      num += SEASON_WEIGHTS[season] * gp;
      den += SEASON_WEIGHTS[season];
    }
    base = 0.75 * (num / den) + 0.25 * BASELINE_GAMES;
  }
  const raw = base * (FACTORS[injuryStatus] ?? 1);
  const clamped = Math.min(82, Math.max(0, raw));
  return Math.round(clamped * 10) / 10;
}

const HIGH_RISK_GP = 50;
const LOW_SEASON_GP = 55;

function recentSeasons(gpHistory) {
  return SEASONS.map((s) => (gpHistory ?? []).find((h) => h.season === s)).filter(Boolean);
}

function historyPart(seasons) {
  if (!seasons.some((h) => h.gp < LOW_SEASON_GP)) return null;
  const [last, ...before] = seasons;
  const when = last.season === SEASONS[0] ? "l'an dernier" : `en ${last.season}`;
  const text = `${last.gp} ${last.gp < 2 ? "match" : "matchs"} ${when}`;
  return before.length ? `${text} (${before.map((h) => h.gp).join(", ")} avant)` : text;
}

export function injuryLevel({ gpHistory, injuryText, injuryStatus, override }) {
  const seasons = recentSeasons(gpHistory);
  if (!injuryText && !override?.note && !historyPart(seasons)) return null;
  if (injuryStatus === "Out" || (seasons.length && seasons[0].gp < HIGH_RISK_GP)) return "high";
  return "moderate";
}

export function injuryBadge({ gpHistory, injuryText, injuryStatus, override }) {
  const level = injuryLevel({ gpHistory, injuryText, injuryStatus, override });
  if (!level) return null;
  const head = level === "high" ? "Risque élevé" : "Risque modéré";
  const parts = [historyPart(recentSeasons(gpHistory)), injuryText, override?.note].filter(Boolean);
  return parts.length ? `${head} — ${parts.join(" · ")}` : head;
}
