import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spacingLiterals } from "../scripts/stylex-spacing-literals.mjs";
import ratchet from "../config/spacing-ratchet.json";

let root: string | null = null;

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = null;
});

/** A throwaway `src/` with the given files, as the gate scans it. */
function scan(files: Record<string, string>) {
  root = mkdtempSync(path.join(tmpdir(), "stave-spacing-"));
  for (const [relative, source] of Object.entries(files)) {
    const file = path.join(root, "src", relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, source);
  }
  return spacingLiterals(pathToFileURL(path.join(root, "src") + path.sep));
}

describe("spacingLiterals", () => {
  test("counts 6 and 10 on paddings, margins and gaps, directly, conditionally and in strings", () => {
    const counts = scan({
      "components/row.styles.ts": `
        export const styles = stylex.create({
          row: { gap: 6, paddingBlock: 10, marginInlineStart: -6 },
          hover: { paddingInline: { default: 6, ":hover": 8, "@media (min-width: 640px)": 10 } },
          shorthand: { padding: "6px 10px", margin: "16px 10px" },
        });`,
    });
    expect(counts.get("src/components/row.styles.ts")).toBe(8);
  });

  test("leaves grid steps, other properties and the installed ADS copy alone", () => {
    const counts = scan({
      "components/ok.styles.ts": `
        export const styles = stylex.create({
          row: { gap: 8, paddingBlock: 12, margin: "16px 4px", padding: "0.625rem" },
          other: { top: 6, width: 10, borderRadius: 6, fontSize: "10px", lineHeight: "16px" },
        });`,
      "components/ads/components/Thing.tsx": "const s = stylex.create({ a: { gap: 6 } });",
    });
    expect(counts.size).toBe(0);
  });
});

test("the recorded total matches its per-file entries", () => {
  expect(Object.values(ratchet.files).reduce((sum, count) => sum + count, 0)).toBe(ratchet.total);
});
