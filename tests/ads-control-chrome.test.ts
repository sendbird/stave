import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const read = (relative: string) =>
  readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

const ADS = "src/components/ads";

/**
 * The installed ADS copy is host-owned source, so these are the contracts Stave
 * depends on rather than ADS's own unit tests. Each one pins a defect that was
 * visible in the running app, and each is cheap to re-break by re-syncing a
 * stale upstream revision over the top.
 */
describe("ADS control chrome", () => {
  test("menu rows reset the user-agent button chrome they can be rendered into", () => {
    // `ui/dropdown-menu.tsx` and `ui/context-menu.tsx` render every row as
    // `<button type="button">` with Base UI's `nativeButton`, which is the
    // accessible shape for a row that performs an action. Without this reset the
    // rows took the UA button stylesheet: `ButtonFace` fill (measured
    // `rgb(239,239,239)`), a `2px outset` border, and a centred label inside a
    // `colorSurfaceRaised` popup.
    const recipe = read(`${ADS}/recipes/menu.ts`);
    const item = recipe.slice(
      recipe.indexOf("  item: {"),
      recipe.indexOf("  itemPointer: {"),
    );
    expect(item).toContain('appearance: "none"');
    expect(item).toContain('backgroundColor: "transparent"');
    expect(item).toContain('borderStyle: "none"');
    expect(item).toContain("borderWidth: 0");
    expect(item).toContain('fontFamily: "inherit"');
    expect(item).toContain("margin: 0");
    expect(item).toContain('textAlign: "start"');

    // The hover wash has to stay the only fill in the popup, which only holds
    // while the resting value is stated rather than unset.
    const highlighted = recipe.slice(recipe.indexOf("  itemHighlighted: {"));
    expect(highlighted).toContain("backgroundColor: vars.colorOverlayHover");
  });

  test("the reset layer zeroes user-agent block margins", () => {
    // The UA authors these in `em`, so the value tracks the element's own font
    // size while spacing here belongs to the container's `gap`/`padding`. One
    // settings row rendered 49px between a name and its meta line where the
    // container asked for 4px.
    const css = read(`${ADS}/styles.css`);
    const reset = css.slice(
      css.indexOf("@layer reset {"),
      css.indexOf("@layer base"),
    );
    for (const selector of ["p", "h1", "h6", "ul", "ol", "pre", "blockquote"]) {
      // Either a selector in the list or the last one, which carries the brace.
      expect(reset).toMatch(new RegExp(`^\\s*${selector}(,| \\{)$`, "m"));
    }
    expect(reset).toContain("margin: 0;");
    // Deliberately NOT reset: zeroing the list indent without also removing the
    // markers paints them outside the box.
    expect(reset).not.toContain("padding-inline-start: 0");
  });

  test("empty-state headers centre their media on the copy's axis", () => {
    // The header is a grid, and `justify-items: stretch` cannot stretch a fixed
    // 48px medallion — it lands at the inline start while the title and
    // description centre their text.
    const source = read(`${ADS}/components/EmptyState.tsx`);
    const header = source.slice(source.indexOf("  header: {"));
    expect(header.slice(0, header.indexOf("},"))).toContain(
      'justifyItems: "center"',
    );
  });

  test("the tab ramp offers a dense rung that steps its label down", () => {
    // A 300px rail panel wrapped its strip onto a second row with four counted
    // Body labels; `xs` is the rung for that embedding.
    const styles = read(`${ADS}/components/Tabs.styles.ts`);
    expect(styles).toContain("xs: tabExtraSmallHeight.xs");
    const xs = styles.slice(
      styles.indexOf("const tabExtraSmallHeight"),
      styles.indexOf("export const tabHeightBySize"),
    );
    expect(xs).toContain("fontSize: vars.fontSizeCaption");
    expect(xs).toContain("paddingInline: vars.space8");
    expect(read(`${ADS}/components/Tabs.tsx`)).toContain(
      'export type TabsSize = "md" | "sm" | "xs"',
    );
  });

  test("the theme provider restores host-owned <html> styles it overwrote", () => {
    // A light<->dark switch re-runs the sync effect. Deleting the names it wrote
    // on cleanup took the host's own values with them, and the unconditional
    // `background-color` removal deleted a background a host had set on purpose.
    const source = read(`${ADS}/components/ThemeProvider.tsx`);
    expect(source).toContain("const previousVars = new Map<string, string>()");
    expect(source).toContain(
      "previousVars.set(name, root.style.getPropertyValue(name))",
    );
    expect(source).toContain("if (root.dataset.adsBootBackground != null)");
  });
});
