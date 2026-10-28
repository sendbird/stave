import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spacingLiterals, spacingInventory, spacingFailures } from "../scripts/stylex-spacing-literals.mjs";
import { spacingBaselineGrowth } from "../scripts/check-spacing-baseline.mjs";
import ratchet from "../config/spacing-ratchet.json";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A throwaway `src/` with the given files, as the gate scans it. */
function scan(files: Record<string, string>) {
  const root = mkdtempSync(path.join(tmpdir(), "stave-spacing-"));
  roots.push(root);
  for (const [relative, source] of Object.entries(files)) {
    const file = path.join(root, "src", relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, source);
  }
  return spacingLiterals(pathToFileURL(path.join(root, "src") + path.sep));
}

describe("spacingLiterals", () => {
  test("finds on-grid, off-grid, negative, fractional and conditional spacing", () => {
    const findings = scan({ "components/row.styles.ts": `
      export const styles = stylex.create({
        row: { gap: 8, paddingBlock: 3, marginInlineStart: -0.5 },
        hover: { paddingInline: { default: 0, ":hover": "0.5rem" } },
        shorthand: { padding: "0 8px", margin: "calc(100% - 3px)" },
        dynamic: (compact) => ({ gap: compact ? 4 : 8 }),
      });` });
    expect(findings).toHaveLength(7);
    expect(findings[0].declaration).toBe("styles.row.gap = 8");
    expect(findings.every((finding) => finding.line > 1)).toBe(true);
  });

  test("leaves tokens, density steps, zero, percentages and geometry properties alone", () => {
    const findings = scan({ "components/ok.styles.ts": `
      export const styles = stylex.create({
        row: { gap: vars["--ads-space-8"], padding: densityPad.sm, margin: "auto" },
        conditional: { gap: width > 300 ? vars["--ads-space-8"] : densityPad.sm },
        zero: { gap: 0, padding: "0 0px", margin: "5%" },
        calc: { padding: \`calc(100% - \${vars["--ads-space-8"]})\` },
        other: { top: 6, width: 10, borderRadius: 6, fontSize: "10px" },
      });`,
      "components/ads/components/Thing.tsx": "const s = stylex.create({ a: { gap: 6 } });",
    });
    expect(findings).toEqual([]);
  });

  test("a removed declaration cannot fund a new one in the same file", () => {
    const findings = scan({ "row.ts": "const styles = { newRow: { gap: 8 } };" });
    const failures = spacingFailures(findings, { "src/row.ts": { "styles.oldRow.gap = 8": 1 } });
    expect(failures).toHaveLength(2);
    expect(failures[0]).toContain("src/row.ts:1");
    expect(failures[1]).toContain("stale spacing debt");
  });

  test("line moves and formatting changes preserve semantic debt identity", () => {
    const before = scan({ "row.ts": "const s={row:{gap: {default: 8}}};" });
    const after = scan({ "row.ts": "\n\nconst s = { row: { gap: { default: 8 } } };" });
    expect(spacingFailures(after, spacingInventory(before))).toEqual([]);
  });

  test("changing or duplicating an exempted declaration fails", () => {
    const findings = scan({ "row.ts": "const s={row:{gap: 12}};" });
    expect(spacingFailures(findings, { "src/row.ts": { "s.row.gap = 8": 1 } })).toHaveLength(2);
    expect(spacingFailures([...findings, ...findings], spacingInventory(findings))).not.toEqual([]);
  });
});

test("the recorded total matches its declaration entries", () => {
  expect(ratchet.version).toBe(2);
  expect(Object.values(ratchet.files).flatMap((entries) => Object.values(entries))
    .reduce((sum, count) => sum + count, 0)).toBe(ratchet.total);
});

test("PR baseline comparison rejects additions, value swaps, increases and downgrades", () => {
  const previous = { version: 2, files: { "src/row.ts": { "s.row.gap = 8": 1 } } };
  expect(spacingBaselineGrowth(previous, previous)).toEqual([]);
  expect(spacingBaselineGrowth({ version: 2, files: {} }, previous)).toEqual([]);
  expect(spacingBaselineGrowth({ version: 2, files: { "src/row.ts": { "s.row.gap = 12": 1 } } }, previous)).toHaveLength(1);
  expect(spacingBaselineGrowth({ version: 2, files: { "src/row.ts": { "s.row.gap = 8": 2 } } }, previous)).toHaveLength(1);
  expect(spacingBaselineGrowth({ version: 1, files: {} }, previous)).toHaveLength(1);
});
