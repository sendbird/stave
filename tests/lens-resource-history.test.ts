import { expect, test } from "bun:test";
import { LensResourceHistory } from "../src/lib/lens/lens-resource-history";

test("records reopenings only after release and bounds observation memory", () => {
  const history = new LensResourceHistory();
  history.opened("w", "tab", 1);
  expect(history.snapshot()).toEqual([]);
  history.released("w", "tab", 2);
  history.opened("other", "tab", 3);
  history.opened("w", "tab", 4);
  history.opened("w", "tab", 5);
  expect(history.snapshot().map((event) => event.kind)).toEqual(["released", "reopened"]);
  const snapshot = history.snapshot();
  snapshot[0]!.workspaceId = "mutated";
  expect(history.snapshot()[0]!.workspaceId).toBe("w");
  for (let i = 0; i < 200; i++) history.released("w", String(i));
  expect(history.snapshot()).toHaveLength(120);
});
