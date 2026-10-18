export function replacementFpg(fpgs, teams = 12, rounds = 10) {
  const sorted = [...fpgs].sort((a, b) => b - a);
  const start = teams * rounds;
  const window = sorted.length < start + 10 ? sorted.slice(-10) : sorted.slice(start, start + 10);
  if (window.length === 0) return 0;
  return window.reduce((s, x) => s + x, 0) / window.length;
}

export function seasonValue(fpg, expectedGames, replFpg) {
  return Math.round((fpg - replFpg) * expectedGames * 10) / 10;
}
