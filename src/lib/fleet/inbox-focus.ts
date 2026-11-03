/**
 * Where focus goes when the row `leavingId` leaves the list: the row that
 * followed it, or the one before it when it was last, among the rows still
 * shown. Null when no row is left.
 */
export function nextFocusAfterLeaving(
  orderBefore: readonly string[],
  leavingId: string,
  idsNow: readonly string[],
): string | null {
  const shown = new Set(idsNow);
  const index = orderBefore.indexOf(leavingId);
  if (index < 0) {
    return null;
  }
  const after = orderBefore.slice(index + 1).find((id) => shown.has(id));
  if (after) {
    return after;
  }
  return orderBefore.slice(0, index).reverse().find((id) => shown.has(id)) ?? null;
}
