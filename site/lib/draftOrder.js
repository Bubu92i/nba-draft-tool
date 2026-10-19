export function slotForPick(pickNo, teams, reversalRound) {
  const round = Math.ceil(pickNo / teams);
  const idx = (pickNo - 1) % teams;
  const reversed = (round % 2 === 0) !== (reversalRound > 0 && round >= reversalRound);
  return { round, slot: reversed ? teams - idx : idx + 1 };
}

export function pickOwnerRosterId(pickNo, ctx) {
  const { round, slot } = slotForPick(pickNo, ctx.teams, ctx.reversalRound);
  const orig = ctx.slotToRosterId[String(slot)];
  const traded = (ctx.tradedPicks ?? []).find(
    (tp) => tp.round === round && tp.roster_id === orig && String(tp.season) === String(ctx.season),
  );
  return traded ? traded.owner_id : orig;
}

export function myPickNumbers(myRosterId, ctx, totalPicks = ctx.teams * 10) {
  const out = [];
  for (let pickNo = 1; pickNo <= totalPicks; pickNo++) {
    if (pickOwnerRosterId(pickNo, ctx) === myRosterId) out.push(pickNo);
  }
  return out;
}

export function orderKnown(draft) {
  return !!draft.draft_order || ((draft.status === "drafting" || draft.status === "paused") && !!draft.slot_to_roster_id);
}

export function nextMyPick(myPicks, currentPickNo, includeCurrent) {
  const next = myPicks.find((p) => (includeCurrent ? p >= currentPickNo : p > currentPickNo));
  return next ?? null;
}

export function pickLabel(pickNo, teams) {
  return `Tour ${Math.ceil(pickNo / teams)} · choix ${((pickNo - 1) % teams) + 1}`;
}

export function resolveMyRosterId(draft, myUserId, fallback) {
  const slot = draft?.draft_order?.[myUserId];
  const rosterId = slot == null ? undefined : draft.slot_to_roster_id?.[String(slot)];
  return rosterId ?? fallback;
}
