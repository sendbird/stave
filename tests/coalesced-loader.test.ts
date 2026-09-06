import { expect, test } from "bun:test";
import { createCoalescedLoader } from "../src/lib/coalesced-loader";

test("polling shares a pending read, and mutation refresh discards its stale response", async () => {
  const reads: Array<(value: number) => void> = [];
  const load = createCoalescedLoader(() => new Promise<number>(resolve => reads.push(resolve)));
  const first = load();
  expect(load()).toBe(first);
  expect(load({ fresh: true })).toBe(first);
  expect(load({ fresh: true })).toBe(first);
  expect(reads).toHaveLength(1);
  reads[0]!(1);
  await Promise.resolve();
  expect(reads).toHaveLength(2);
  reads[1]!(2);
  expect(await first).toBe(2);
});

test("a failed request releases the loader so recovery can retry", async () => {
  let failed = true;
  const load = createCoalescedLoader(async () => {
    if (failed) throw new Error("Unavailable");
    return 3;
  });
  await expect(load()).rejects.toThrow("Unavailable");
  failed = false;
  expect(await load()).toBe(3);
});
