import { expect, test } from "bun:test";
import { spacingBaselineGrowth } from "../scripts/check-spacing-baseline.mjs";

test("a base from before the AUI rename does not make renamed declarations read as new spacing debt", () => {
  const previous = { version: 2, files: { "src/x.styles.ts": { "a.padding = `calc(${vars[\"--ads-space-8\"]} + 2px)`": 1 } } };
  const renamed = { version: 2, files: { "src/x.styles.ts": { "a.padding = `calc(${vars[\"--aui-space-8\"]} + 2px)`": 1 } } };
  expect(spacingBaselineGrowth(renamed, previous)).toEqual([]);
  const grown = { version: 2, files: { "src/x.styles.ts": { "a.padding = `calc(${vars[\"--aui-space-8\"]} + 2px)`": 2 } } };
  expect(spacingBaselineGrowth(grown, previous)).toHaveLength(1);
});
