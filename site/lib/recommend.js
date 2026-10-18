export const STARTER_SLOTS = ["PG", "SG", "SF", "PF", "C"];
export const ROSTER_SIZE = 10;
export const POSITION_CAP = 6;
export const BENCH_WEIGHT = 0.3;

export function bestLineup(players) {
  const memo = new Map();
  const solve = (slotIdx, used) => {
    if (slotIdx === STARTER_SLOTS.length) return { total: 0, filled: 0, picks: [] };
    const key = used * 8 + slotIdx;
    const hit = memo.get(key);
    if (hit) return hit;
    const slot = STARTER_SLOTS[slotIdx];
    let best = null;
    for (let i = 0; i < players.length; i++) {
      if (used & (1 << i) || !players[i].positions.includes(slot)) continue;
      const rest = solve(slotIdx + 1, used | (1 << i));
      const total = Math.max(players[i].value, 0) + rest.total;
      const filled = 1 + rest.filled;
      if (!best || total > best.total || (total === best.total && filled > best.filled)) {
        best = { total, filled, picks: [players[i].id, ...rest.picks] };
      }
    }
    const skipped = solve(slotIdx + 1, used);
    if (!best || skipped.total > best.total || (skipped.total === best.total && skipped.filled > best.filled)) {
      best = { total: skipped.total, filled: skipped.filled, picks: [null, ...skipped.picks] };
    }
    memo.set(key, best);
    return best;
  };
  const result = solve(0, 0);
  const assignment = {};
  STARTER_SLOTS.forEach((slot, i) => {
    assignment[slot] = result.picks[i];
  });
  return { total: result.total, assignment };
}

export function lineupView(roster) {
  const { assignment } = bestLineup(roster);
  const byId = new Map(roster.map((p) => [p.id, p]));
  const starters = STARTER_SLOTS.map((slot) => ({ slot, player: byId.get(assignment[slot]) ?? null }));
  const starterIds = new Set(starters.filter((s) => s.player).map((s) => s.player.id));
  return {
    starters,
    emptySlots: starters.filter((s) => !s.player).map((s) => s.slot),
    bench: roster.filter((p) => !starterIds.has(p.id)),
  };
}

const frNum = (n, opts) => n.toLocaleString("fr-FR", opts);

export function rankingCaption(replacementFpg) {
  return `Classés selon les points fantasy au-dessus d'un remplaçant (≈ ${frNum(replacementFpg, { maximumFractionDigits: 0 })}/match) × matchs prévus, puis le poste à combler et la profondeur de banc.`;
}

export function valueLine(value) {
  const rounded = Math.round(value);
  if (rounded <= 0) return "pas mieux qu'un remplaçant";
  return `+${frNum(rounded, { maximumFractionDigits: 0 })} pts de plus qu'un remplaçant`;
}

export function missingSlotsNotice({ emptySlots, picksLeft, over }) {
  if (!emptySlots.length) return null;
  const list = emptySlots.join(" · ");
  if (over || picksLeft <= emptySlots.length) return { level: "alert", text: `Il te manque : ${list}` };
  return { level: "info", text: `Postes à remplir : ${list}` };
}

export const TIER_LABELS = {
  gone: "⏳ Pas dispo à ton prochain tour",
  coinflip: "⚖️ Peut-être encore là à ton prochain tour",
  wait: "✅ Sera sûrement encore là à ton prochain tour",
};

export function canDraft(candidate, roster) {
  if (roster.length >= ROSTER_SIZE) return false;
  return candidate.positions.some(
    (pos) => roster.filter((p) => p.positions.includes(pos)).length < POSITION_CAP,
  );
}

function normalCdf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  const erf = 1 - poly * Math.exp(-(x * x) / 2);
  return 0.5 * (1 + (x < 0 ? -erf : erf));
}

export function availabilityTier(adp, currentPickNo, myNextPickNo) {
  if (myNextPickNo == null) return null;
  if (adp >= 999) return "wait";
  const sd = 3 + 9 * (currentPickNo / 120);
  const pGone = normalCdf((myNextPickNo - adp) / sd);
  if (pGone >= 0.7) return "gone";
  if (pGone >= 0.3) return "coinflip";
  return "wait";
}

export function explain(rec, player) {
  const fpg = frNum(player.fpg, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const stats = player.statsLine ? ` — ${player.statsLine}` : "";
  const shortName = (p) => {
    const words = p.name.trim().split(/\s+/);
    while (words.length > 1 && /^(Jr\.?|Sr\.?|II|III|IV|V)$/i.test(words[words.length - 1])) words.pop();
    return words[words.length - 1];
  };
  const ownSlot = rec.ownSlot === undefined && player.positions.includes(rec.fillsSlot) ? rec.fillsSlot : rec.ownSlot;
  let tail = ", profondeur de banc";
  if (rec.fillsSlot && ownSlot === rec.fillsSlot) tail = `, comble ton poste ${rec.fillsSlot}`;
  else if (rec.fillsSlot && rec.shiftedPlayer) {
    const name = shortName(rec.shiftedPlayer);
    tail = ownSlot
      ? `, complète ton cinq : il joue ${ownSlot}, ${name} passe ${rec.fillsSlot}`
      : `, complète ton cinq (${name} passe ${rec.fillsSlot})`;
  } else if (rec.lineupGain > 0) tail = ", renforce ton cinq";
  return `${fpg} pts fantasy/match${stats}${tail}`;
}

export function recommend({ available, roster, picksLeft, currentPickNo, myNextPickNo, limit = 4 }) {
  const base = bestLineup(roster);
  const emptySlots = STARTER_SLOTS.filter((s) => base.assignment[s] == null).length;
  let recs = available
    .filter((c) => c.expectedGames !== 0 && canDraft(c, roster))
    .map((player) => {
      const next = bestLineup([...roster, player]);
      const lineupGain = next.total - base.total;
      const fillsSlot =
        STARTER_SLOTS.find((s) => base.assignment[s] == null && next.assignment[s] != null) ?? null;
      const ownSlot = STARTER_SLOTS.find((s) => next.assignment[s] === player.id) ?? null;
      const occupantId = fillsSlot ? next.assignment[fillsSlot] : null;
      const shiftedPlayer =
        occupantId != null && occupantId !== player.id ? roster.find((p) => p.id === occupantId) ?? null : null;
      const rec = {
        player,
        score: lineupGain + BENCH_WEIGHT * Math.max(player.value, 0),
        lineupGain,
        fillsSlot,
        ownSlot,
        shiftedPlayer,
        tier: availabilityTier(player.adp, currentPickNo, myNextPickNo),
      };
      rec.reason = explain(rec, player);
      return rec;
    });
  if (picksLeft <= emptySlots) recs = recs.filter((r) => r.fillsSlot);
  return recs.sort((a, b) => b.score - a.score).slice(0, limit);
}

export const seasonPts = (p) => Math.round(p.fpg * p.expectedGames);

export const TIGHT_GAP = 50;

export function gapLine(recs) {
  if (recs.length < 2) return null;
  const [first, second] = recs;
  if (Math.abs(first.score - second.score) < TIGHT_GAP) return "Choix serré avec le n°2";
  const d = Math.round(first.player.value) - Math.round(second.player.value);
  if (d > 0) return `+${frNum(d, { maximumFractionDigits: 0 })} pts de plus que le n°2 sur la saison`;
  if (first.fillsSlot) return `Devant le n°2 car il comble ton poste ${first.fillsSlot}`;
  return "Devant le n°2 car il apporte plus à ton cinq de départ";
}

export function signedPts(value) {
  const rounded = Math.round(value);
  if (rounded > 0) return `+${frNum(rounded, { maximumFractionDigits: 0 })}`;
  if (rounded < 0) return `\u2212${frNum(-rounded, { maximumFractionDigits: 0 })}`;
  return "0";
}

const CARD_MARKERS = ["①", "②", "③", "④"];
export const cardMarker = (i) => CARD_MARKERS[i] ?? "";

export function fiveTotal(players) {
  return lineupView(players).starters.reduce((sum, s) => sum + (s.player ? seasonPts(s.player) : 0), 0);
}

export function compareFives({ rosters, myRosterId, teams }) {
  const totals = new Map(Object.entries(rosters).map(([id, players]) => [String(id), fiveTotal(players)]));
  const myKey = String(myRosterId);
  const mine = totals.get(myKey) ?? 0;
  const everyone = [...totals.values()];
  if (!totals.has(myKey)) everyone.push(0);
  while (everyone.length < teams) everyone.push(0);
  return {
    mine,
    rank: 1 + everyone.filter((t) => t > mine).length,
    teams: everyone.length,
    average: everyone.reduce((a, b) => a + b, 0) / everyone.length,
  };
}

export function comparisonLine({ mine, rank, teams, average }, { complete }) {
  const n = (x) => frNum(Math.round(x), { maximumFractionDigits: 0 });
  const line = `Ton cinq : ≈ ${n(mine)} pts fantasy — ${rank === 1 ? "1re" : `${rank}e`} sur ${teams} équipes (moyenne ≈ ${n(average)})`;
  return complete ? line : `${line} (à ce stade de la draft)`;
}
