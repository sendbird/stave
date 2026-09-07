import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The workspace settings dialog has ONE content gutter: the ADS Dialog
 * surface's own `space24` padding, and inside the tab panel the column the
 * `SettingsCard` section sits on (`SettingsCard` deliberately declares no
 * inline padding, so a section inherits its host's gutter instead of adding
 * one).
 *
 * Every symptom this guards was the same mistake — a second inset stacked on
 * top of that gutter, either as a bordered box drawn inside another box or as
 * a per-child padding only some children carried. Text landed on four
 * different gutters in one dialog (measured 253 / 266 / 269 / 431 px).
 *
 * Asserted against the style source rather than the compiled objects on
 * purpose: `stylex.create` is compiled by the Babel plugin, which does not run
 * over `tests/`, so a test cannot author a reference style to compare hashed
 * property keys against. The declaration a reviewer would add back is exactly
 * the text this reads.
 */
const ROOT = join(import.meta.dir, "..", "src", "components", "layout");

function styleBlock(file: string, key: string): string {
  const source = readFileSync(join(ROOT, file), "utf8");
  const start = source.indexOf(`\n  ${key}: {`);
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf("\n  },", start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

const OWN_INSET = /\bpadding[A-Za-z]*\s*:/;
const OWN_BOX = /\bborder(Width|Style|Color|Radius|Top|Bottom|Inline|Block)/;

describe("workspace settings dialog gutter", () => {
  test("the label section is a section, not a second bordered box", () => {
    const block = styleBlock("workspace-settings-dialog.styles.ts", "labelForm");
    expect(block).not.toMatch(OWN_INSET);
    expect(block).not.toMatch(OWN_BOX);
  });

  test("the tab rail and its panel add no block inset of their own", () => {
    // Both carried `paddingTop: space8`, so the rail started 8px below the
    // content column it labels.
    for (const key of ["tabs", "tabPanel"]) {
      const block = styleBlock("workspace-settings-dialog.styles.ts", key);
      expect(block).not.toMatch(/\bpaddingTop\s*:/);
      expect(block).not.toMatch(/\bpaddingBlock[A-Za-z]*\s*:/);
    }
  });

  test("the tab rail cancels the pill track's inline inset", () => {
    // The tab's own `space12` must be the single left inset; the ADS track's
    // `space4` on top of it made a rail label a compound 16px inset while
    // every other row in the dialog sat on the gutter.
    const block = styleBlock("workspace-settings-dialog.styles.ts", "tabsList");
    expect(block).toMatch(/paddingInline:\s*vars\.space0/);
  });

  test("the sync card draws no card inside the settings card", () => {
    for (const key of ["header", "detailPanel"]) {
      const block = styleBlock("workspace-sync-status-card.styles.ts", key);
      expect(block).not.toMatch(OWN_INSET);
      expect(block).not.toMatch(OWN_BOX);
    }
  });

  test("the transient notices share one inline inset", () => {
    const output = styleBlock(
      "workspace-sync-status-card.styles.ts",
      "outputPanel",
    );
    const error = styleBlock(
      "workspace-sync-status-card.styles.ts",
      "errorPanel",
    );
    const inline = (block: string) =>
      block.match(/paddingInline:\s*(vars\.space\d+)/)?.[1];
    expect(inline(output)).toBe("vars.space12");
    expect(inline(error)).toBe(inline(output));
  });
});
