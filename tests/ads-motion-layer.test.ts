import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The ADS motion layer is a CSS contract with no compiler behind it: a
 * component "has" enter/exit motion because a hand-written string like
 * `"atelier-motion-modal"` reached the right element, and it silently has none
 * the moment that string is absent or misspelled. That is exactly how the
 * command palette — the most frequently opened overlay in the product — shipped
 * as a hard cut while every other Base UI surface scaled and faded: it composes
 * `DialogPopup` out of `headless/dialog` rather than the styled `Dialog` parts,
 * so it never inherited the two classes those parts attach, and nothing failed.
 *
 * These assertions are the missing compiler:
 *
 *  - Every motion class NAMED in TypeScript is DEFINED in the motion sheets
 *    (catches a typo, and catches a class being deleted from CSS out from under
 *    its callers).
 *  - Every motion class DEFINED in the sheets has a caller (the dead-motion
 *    guard — an animation nothing applies is not a feature).
 *  - Every class with a `[data-starting-style]` / `[data-ending-style]` arm is
 *    also listed in its sheet's `prefers-reduced-motion` block. Both sheets
 *    carry a long comment about why the override has to out-specify the arms;
 *    this is the check that comment asks for.
 *  - Every Base UI popup surface in ADS carries a motion class.
 *  - The JS motion layer's root is installed with the layout-projection
 *    feature bundle, because `Switch` and `Tabs` animate `layout`.
 */

const ROOT = join(import.meta.dir, "..");
const ADS = join(ROOT, "src", "components", "ads");
const MOTION_SHEETS = [
  "overlay-motion.css",
  "sidebar-motion.css",
  "inline-disclosure-motion.css",
  "styles.css",
];

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "");

function walk(directory: string): string[] {
  return readdirSync(directory, { recursive: true })
    .map((entry) => String(entry))
    .filter((entry) => /\.tsx?$/.test(entry))
    .map((entry) => join(directory, entry));
}

const sheets = new Map(
  MOTION_SHEETS.map((name) => [
    name,
    stripComments(readFileSync(join(ADS, name), "utf8")),
  ]),
);
const allCss = [...sheets.values()].join("\n");

/** `atelier-*` class names the stylesheets DEFINE (as a selector). */
const defined = new Set(
  [...allCss.matchAll(/\.(atelier-(?:motion|toast|inline)-[a-z-]+)/g)].map(
    (match) => match[1],
  ),
);

/** `atelier-*` class names TypeScript NAMES (as a string literal). */
const named = new Map<string, string[]>();
for (const file of walk(join(ROOT, "src"))) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(
    /"(atelier-(?:motion|toast|inline)-[a-z-]+)"/g,
  )) {
    const list = named.get(match[1]) ?? [];
    list.push(file.slice(ROOT.length + 1));
    named.set(match[1], list);
  }
}

describe("ADS motion layer", () => {
  it("defines every motion class that TypeScript applies", () => {
    const undefinedClasses = [...named.keys()]
      .filter((name) => !defined.has(name))
      .map((name) => `${name} (applied in ${named.get(name)?.join(", ")})`);
    expect(undefinedClasses).toEqual([]);
  });

  it("has a caller for every motion class it defines", () => {
    expect([...defined].filter((name) => !named.has(name)).sort()).toEqual([]);
  });

  it.each([...sheets.keys()])(
    "%s guards every enter/exit arm under prefers-reduced-motion",
    (name) => {
      const css = sheets.get(name) ?? "";
      const [, reduced = ""] = css.split(/@media \(prefers-reduced-motion/);
      const animated = new Set(
        [
          ...css.matchAll(
            /\.(atelier-[a-z-]+)(?=[^{,]*\[data-(?:starting|ending)-style\])/g,
          ),
        ].map((match) => match[1]),
      );
      expect(
        [...animated].filter((clazz) => !reduced.includes(clazz)).sort(),
      ).toEqual([]);
    },
  );

  /*
   * The precise shape of the palette bug, generalised.
   *
   * A file that pulls a `*Popup` or `*Backdrop` part straight out of
   * `../headless/` is rendering a raw Base UI presence surface, so IT is the
   * element that owns the enter/exit contract — there is no styled ADS part
   * underneath it to have attached the class already. Files that compose the
   * styled parts instead (`Select.array.tsx` renders `Popup` from
   * `Select.parts`, which carries the class) are correctly exempt: adding the
   * class again there would animate the same transform twice, which the motion
   * ADR forbids outright.
   */
  it("names a motion class wherever ADS renders a raw headless popup", () => {
    const silent: string[] = [];
    for (const file of walk(join(ADS, "components"))) {
      const source = readFileSync(file, "utf8");
      const headless = source.match(
        /import \{([^}]*)\} from "\.\.\/headless\/[^"]+";/g,
      );
      const parts = (headless ?? []).join(" ");
      if (!/\w*(?:Popup|Backdrop)\b/.test(parts)) continue;
      if (/"atelier-(?:motion|toast)-/.test(source)) continue;
      silent.push(file.slice(ADS.length + 1));
    }
    expect(silent).toEqual([]);
  });
});

describe("ADS JS motion layer", () => {
  // Comment-stripped: this file's own prose names `domAnimation` as the thing
  // that used to be here, and the assertion below is about code, not prose.
  const provider = stripComments(
    readFileSync(
      join(ROOT, "src", "components", "system", "StaveDesignProvider.tsx"),
      "utf8",
    ).replace(/^\s*\/\/.*$/gm, ""),
  );

  /*
   * `Switch`'s thumb and `Tabs`' indicator are both `m.span layout`. Layout
   * projection ships ONLY in `domMax`; a `domAnimation` bundle renders them as
   * static elements, so both snap. This is not a bundle-size preference — it is
   * the difference between those two motions existing and not.
   */
  it("installs the motion feature bundle that includes layout projection", () => {
    expect(provider).toContain("AtelierMotionProvider");
    expect(provider).not.toMatch(/\bdomAnimation\b/);
    const motionProvider = readFileSync(
      join(ADS, "motion", "MotionProvider.tsx"),
      "utf8",
    );
    expect(motionProvider).toContain("domMax");
    expect(motionProvider).toContain('reducedMotion');
  });
});
