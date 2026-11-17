/** One refusal stays local to its item; workers never abandon the remaining queue. */
export interface FleetControlResult<T> {
  changed: T[];
  skipped: { item: T; reason: string }[];
}
export async function runFleetControl<T>(items: readonly T[], apply: (item: T) => Promise<string | null>, concurrency = 4): Promise<FleetControlResult<T>> {
  const results: Array<{ item: T; reason: string | null }> = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index]!;
      try { results[index] = { item, reason: await apply(item) }; }
      catch { results[index] = { item, reason: "failed" }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(items.length, Math.max(1, Math.floor(concurrency) || 1)) }, worker));
  return { changed: results.filter((result) => result.reason === null).map((result) => result.item), skipped: results.filter((result) => result.reason !== null).map((result) => ({ item: result.item, reason: result.reason! })) };
}
