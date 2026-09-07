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
  });

  test("the reset layer removes the user-agent fieldset box and list indent", () => {
    const css = read(`${ADS}/styles.css`);
    const reset = css.slice(
      css.indexOf("@layer reset {"),
      css.indexOf("@layer base"),
    );
    // `fieldset` is the only element whose UA box is a visible border, so every
    // form that grouped its controls for assistive tech drew a `2px groove`
    // rectangle inside whatever card already framed it. `min-inline-size` goes
    // with it: the UA's `min-content` silently blocks the fieldset from
    // shrinking in a flex or grid parent.
    const fieldset = reset.slice(reset.indexOf("  fieldset {"));
    const fieldsetBody = fieldset.slice(0, fieldset.indexOf("}"));
    expect(fieldsetBody).toContain("border-width: 0");
    expect(fieldsetBody).toContain("border-style: solid");
    expect(fieldsetBody).toContain("min-inline-size: 0");
    expect(fieldsetBody).toContain("padding: 0");

    // A list is this system's row container, and the UA's 40px indent is never
    // wanted there — measured on a Settings model list whose rows started 40px
    // inside their own card. Prose states its own markers and indent, so both
    // halves go together.
    const list = reset.slice(reset.lastIndexOf("  ol,"));
    expect(list).toContain("list-style: none");
    expect(list).toContain("padding-inline-start: 0");
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

  test("the theme provider restores host-owned <html> styles it overwrote", () => {    // A light<->dark switch re-runs the sync effect. Deleting the names it wrote
    // on cleanup took the host's own values with them, and the unconditional
    // `background-color` removal deleted a background a host had set on purpose.
    const source = read(`${ADS}/components/ThemeProvider.tsx`);
    expect(source).toContain("const previousVars = new Map<string, string>()");
    expect(source).toContain(
      "previousVars.set(name, root.style.getPropertyValue(name))",
    );
    expect(source).toContain("if (root.dataset.adsBootBackground != null)");
  });

  test("trigger chrome states border width and style, not only colour", () => {
    // Both keys land on native `<button>` elements, which arrive with the UA's
    // `2px outset` box. Stating only `border-color` recoloured that box instead
    // of replacing it: a quiet trigger carried 4px of invisible size, and one
    // sidebar button rendered a visible ridge.
    const recipe = read(`${ADS}/recipes/control-chrome.ts`);
    const trigger = recipe.slice(
      recipe.indexOf("  trigger: {"),
      recipe.indexOf("  triggerQuiet: {"),
    );
    expect(trigger).toContain('borderStyle: "solid"');
    expect(trigger).toContain("borderWidth: vars.borderWidthHairline");

    const quiet = recipe.slice(recipe.indexOf("  triggerQuiet: {"));
    const quietBody = quiet.slice(0, quiet.indexOf("\n  },"));
    expect(quietBody).toContain('borderStyle: "solid"');
    expect(quietBody).toContain("borderWidth: 0");
  });

  test("command groups do not shrink inside their scrolling list", () => {
    // `list` is a scrolling flex column, so a group is a flex item in it. A grid
    // item that shrinks below its own rows clips rather than reflows: measured 5
    // rows summing 152px inside a 71px box, with each group starting inside the
    // previous one's rows.
    const styles = read(`${ADS}/components/Command.styles.ts`);
    const group = styles.slice(styles.indexOf("  group: {"));
    expect(group.slice(0, group.indexOf("\n  },"))).toContain("flexShrink: 0");
  });

  test("the host command layout does not re-zero the group's minimum size", () => {
    // `overflow: hidden` on a flex item makes its automatic minimum size 0,
    // which is what let the groups shrink in the first place.
    const layout = read("src/components/ui/command-layout.stylex.ts");
    const group = layout.slice(layout.indexOf("  group: {"));
    expect(group.slice(0, group.indexOf("},"))).not.toContain("overflow");
  });

  test("accent and danger interaction states are derived hue-safely", () => {
    // `color-mix(in oklch, …)` interpolates HUE, and a near-neutral operand
    // still carries a nominal one: measured `oklch(0.54 0.18 260)` hovering to
    // `oklch(0.585 0.1623 277.5)` — the blue primary button turned violet.
    // OKLAB is rectangular, so the same mix moves lightness and leaves hue.
    const theme = read("src/components/system/ads-theme.ts");
    expect(theme).not.toMatch(/color-mix\(in oklch[^)]*--primary\)/);
    expect(theme).toContain(
      "color-mix(in oklab, var(--primary-foreground) 8%, var(--primary))",
    );
    expect(theme).toContain(
      "color-mix(in oklab, var(--foreground) 8%, var(--destructive))",
    );
  });
});
