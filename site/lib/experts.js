const SOURCES = [["espn", "ESPN"], ["yahoo", "Yahoo"], ["fp", "FantasyPros"]];
const NOTE_ICONS = { sleeper: "💎", bust: "📉", role: "🔄", injury: "🏥" };
const MAX_EXPERT_RANK = 150;
const OUT_OF_TOP = 200;

export const ordinal = (n) => (n === 1 ? "1er" : `${n}e`);

export function expertLine(player) {
  const avg = player.experts?.avgRank;
  if (avg == null) return null;
  const ranks = player.experts.ranks ?? {};
  const parts = SOURCES.filter(([key]) => typeof ranks[key] === "number").map(([key, label]) => `${label} ${ranks[key] === 1 ? "1er" : ranks[key]}`);
  return parts.length ? `Experts : ${ordinal(avg)} (${parts.join(" · ")})` : `Experts : ${ordinal(avg)}`;
}

export function expertDisagreement(player) {
  const avg = player.experts?.avgRank;
  const tool = player.toolRank;
  if (avg == null || typeof tool !== "number" || avg > MAX_EXPERT_RANK) return null;
  if (tool - avg >= Math.max(20, 0.5 * avg)) {
    const here = tool > OUT_OF_TOP ? "hors top 200" : ordinal(tool);
    return { kind: "optimistes", text: `⚠️ Experts plus optimistes : ${ordinal(avg)} chez eux, ${here} dans l'outil (classement général)` };
  }
  if (avg - tool >= Math.max(20, 0.5 * tool)) {
    return { kind: "prudents", text: `⚠️ Experts plus prudents : ${ordinal(avg)} chez eux, ${ordinal(tool)} dans l'outil (classement général)` };
  }
  return null;
}

export function noteBadge(note) {
  return { icon: NOTE_ICONS[note.tag] ?? "ℹ️", text: note.text };
}

export function expertSourcesLine(sources) {
  if (!sources?.length) return null;
  const list = sources
    .map((s) => {
      const [, month, day] = s.date.split("-").map(Number);
      return `${s.label} ${day}/${month}`;
    })
    .join(" · ");
  return `Avis d'experts (ligues aux points) : ${list}. Le classement de l'outil n'en tient pas compte.`;
}
