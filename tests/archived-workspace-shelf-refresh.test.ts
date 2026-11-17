import { expect, test } from "bun:test";
import { createArchivedShelfRefresh } from "../src/components/layout/archived-workspace-shelf-refresh";

test("shelf deduplicates pending reads and ignores responses invalidated by repository changes", async () => {
  let resolve!: (rows: string[]) => void;
  let calls = 0;
  const shown: string[][] = [];
  const refresh = createArchivedShelfRefresh(() => { calls++; return new Promise<string[]>(done => { resolve = done; }); }, rows => shown.push(rows));
  const first = refresh.run();
  const second = refresh.run();
  expect(calls).toBe(1);
  refresh.invalidate();
  resolve(["old repository"]);
  await Promise.all([first, second]);
  expect(shown).toEqual([]);
  const third = refresh.run();
  resolve(["current repository"]);
  await third;
  expect(shown).toEqual([["current repository"]]);
});
