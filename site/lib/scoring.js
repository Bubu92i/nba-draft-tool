export function fantasyPointsPerGame(perGame, scoring) {
  let total = 0;
  for (const key of Object.keys(scoring)) {
    total += (perGame[key] ?? 0) * scoring[key];
  }
  return total;
}
