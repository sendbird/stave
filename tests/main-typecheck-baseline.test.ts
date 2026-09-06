import { expect, test } from "bun:test";
import {
  countDiagnostics,
  compareDiagnostics,
} from "../scripts/main-typecheck-baseline.mjs";
const issue = { file: "electron/example.ts", code: 2322, source: "value" };
test("new diagnostics and additional occurrences fail the baseline comparison", () => {
  const baseline = countDiagnostics([issue]);
  expect(
    compareDiagnostics(countDiagnostics([issue, issue]), baseline).added[0]
      .count,
  ).toBe(1);
  expect(
    compareDiagnostics(
      countDiagnostics([{ ...issue, file: "electron/other.ts" }]),
      baseline,
    ).added,
  ).toHaveLength(1);
});
test("resolved diagnostics must be removed so they cannot silently return", () => {
  expect(
    compareDiagnostics({}, countDiagnostics([issue])).removed[0].count,
  ).toBe(1);
  expect(
    compareDiagnostics(countDiagnostics([issue]), countDiagnostics([issue])),
  ).toEqual({ added: [], removed: [] });
});
