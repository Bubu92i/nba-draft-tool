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

export function injuryBadge({ gpHistory, injuryText, override }) {
  const parts = [];
  if (injuryText) parts.push(injuryText);
  if (override?.note) parts.push(override.note);
  const seasons = SEASONS.map((s) => (gpHistory ?? []).find((h) => h.season === s)).filter(Boolean);
  if (seasons.some((h) => h.gp < 55)) {
    parts.push(`a joué ${seasons.map((h) => h.gp).join(", ")} matchs sur ${seasons.length} saisons`);
  }
  return parts.length ? parts.join(" · ") : null;
}
