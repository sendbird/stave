import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const stylesSource = readFileSync(
  new URL("../src/components/layout/information-row.styles.ts", import.meta.url),
  "utf8",
);

const rootBlock = stylesSource.slice(
  stylesSource.indexOf("  root: {"),
  stylesSource.indexOf("\n  },", stylesSource.indexOf("  root: {")),
);

const actionOpacityBlock = rootBlock.slice(
  rootBlock.indexOf('"--info-row-action-opacity": {'),
  rootBlock.indexOf("\n    },", rootBlock.indexOf('"--info-row-action-opacity": {')),
);

describe("information row action reveal", () => {
  test("publishes hover and focus-within on one custom-property declaration", () => {
    expect(actionOpacityBlock).toContain('":hover"');
    expect(actionOpacityBlock).toContain('":focus-within"');
    expect(stylesSource).not.toContain("rootFocusWithin");
    expect(stylesSource.split('"--info-row-action-opacity"').length).toBe(2);
  });
});
