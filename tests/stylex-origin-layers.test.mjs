/**
 * Compatibility test for the origin-aware StyleX pipeline.
 *
 * `scripts/vite-ads-stylex.mjs` reaches past `@stylexjs/unplugin`'s public
 * surface: it builds two core instances from the exported `unpluginFactory`,
 * reads the `__stylex*` properties that factory hangs on its return value, and
 * relies on two facts about the compiler that are observable but undocumented —
 * that a rule key's leading `classNamePrefix` identifies its origin, and that a
 * `defineConsts` key hash is prefix-invariant.
 *
 * If any of those move, the symptom is not a build error. It is a stylesheet
 * whose layers are wrong, or whose media queries silently do not apply. So each
 * one is asserted here against the installed compiler rather than trusted.
 */
import { expect, test } from "bun:test";
import { unpluginFactory } from "@stylexjs/unplugin";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// The compiler and its `@babel/core` come from the same borrow the pipeline
// makes: `@stylexjs/unplugin` is the only StyleX package this repository
// declares, and none of its dependencies is hoisted.
const { transformAsync } = requireFromUnplugin("@babel/core");

import {
  STYLEX_ORIGINS,
  createOriginClassifier,
  originOfRuleKey,
  processRulesByOrigin,
  reprefixConstRule,
  requireFromUnplugin,
  styleXBabel,
} from "../scripts/vite-ads-stylex.core.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/*
 * StyleX's `commonJS` resolution reads a token import's path off disk, so the
 * fixture modules have to exist. They go in a temp tree rather than the
 * repository so nothing here can be mistaken for a real token group.
 *
 * `realpathSync` is load-bearing. A token's variable name is hashed from the
 * file's path RELATIVE to `rootDir`, and the resolver canonicalises the
 * import's path while `rootDir` is taken verbatim. On macOS `mkdtemp` hands
 * back `/var/folders/…`, a symlink to `/private/var/folders/…`, so an
 * un-canonicalised root makes the definition and the reference hash to
 * different names and every substitution in the fixture silently fails —
 * which looks exactly like the cross-origin bug this file exists to catch.
 */
const FIXTURE_DIR = realpathSync(
  mkdtempSync(join(tmpdir(), "ads-stylex-probe-")),
);
mkdirSync(join(FIXTURE_DIR, "tokens"));
mkdirSync(join(FIXTURE_DIR, "app"));

async function compile(filename, code, classNamePrefix) {
  const result = await transformAsync(code, {
    babelrc: false,
    configFile: false,
    filename,
    parserOpts: { plugins: ["jsx", "typescript"] },
    plugins: [
      styleXBabel.withOptions({
        classNamePrefix,
        dev: false,
        unstable_moduleResolution: { rootDir: FIXTURE_DIR, type: "commonJS" },
      }),
    ],
  });
  return result.metadata.stylex ?? [];
}

const TOKENS = `
import * as stylex from "@stylexjs/stylex";
export const vars = stylex.defineVars({ "--ads-probe-ink": "black" });
`;
const CONSTS = `
import * as stylex from "@stylexjs/stylex";
export const bp = stylex.defineConsts({ md: "@media (max-width: 768px)" });
`;
const CONSUMER = `
import * as stylex from "@stylexjs/stylex";
import { vars } from "../tokens/probe-tokens.stylex";
import { bp } from "../tokens/probe-consts.stylex";
export const s = stylex.create({
  a: { color: vars["--ads-probe-ink"], inlineSize: { default: "100%", [bp.md]: "50%" } },
  shared: { display: "flex" },
  dynamic: (h) => ({ blockSize: h }),
});
`;

const tokensFile = join(FIXTURE_DIR, "tokens/probe-tokens.stylex.ts");
const constsFile = join(FIXTURE_DIR, "tokens/probe-consts.stylex.ts");
const consumerFile = join(FIXTURE_DIR, "app/probe-consumer.ts");
writeFileSync(tokensFile, TOKENS);
writeFileSync(constsFile, CONSTS);
writeFileSync(consumerFile, CONSUMER);

test("the factory still exposes every internal the adapter reads", () => {
  const instance = unpluginFactory(
    { classNamePrefix: "x" },
    { framework: "vite" },
  );
  expect(typeof instance.transform).toBe("function");
  expect(typeof instance.buildStart).toBe("function");
  expect(typeof instance.shouldTransformCachedModule).toBe("function");
  expect(typeof instance.__stylexGetSharedStore).toBe("function");
  expect(typeof instance.__stylexResetState).toBe("function");
  expect(Array.isArray(instance.__stylexPackages)).toBe(true);
  const store = instance.__stylexGetSharedStore();
  expect(store.rulesById instanceof Map).toBe(true);
  expect(typeof store.version).toBe("number");
});

test("every borrowed dependency still resolves through the plugin", () => {
  // The adapter declares none of these. If the plugin stops depending on one,
  // the symptom is a build that cannot start — or, for lightningcss, a
  // stylesheet that silently stops being lowered and prefixed.
  for (const name of [
    "@stylexjs/babel-plugin",
    "@babel/core",
    "lightningcss",
    "browserslist",
  ]) {
    expect(() => requireFromUnplugin.resolve(name)).not.toThrow();
  }
  expect(typeof styleXBabel.processStylexRules).toBe("function");
  expect(typeof styleXBabel.withOptions).toBe("function");
});

test("origin prefixes are mutually non-prefixing", () => {
  for (const a of STYLEX_ORIGINS) {
    for (const b of STYLEX_ORIGINS) {
      if (a === b) continue;
      expect(a.classNamePrefix.startsWith(b.classNamePrefix)).toBe(false);
    }
  }
});

test("a token declared under an explicit name is prefix-invariant", async () => {
  const [ads] = await compile(tokensFile, TOKENS, "x");
  const [product] = await compile(tokensFile, TOKENS, "p");
  expect(ads[1].ltr).toContain("--ads-probe-ink:black");
  expect(product[1].ltr).toContain("--ads-probe-ink:black");

  // …and a consuming file reads that same name under either prefix. This is
  // the whole reason the token names are explicit: with a hashed key the
  // consumer re-derives `--<its own prefix><hash>` and asks for a variable
  // nothing defines.
  const adsRules = await compile(consumerFile, CONSUMER, "x");
  const productRules = await compile(consumerFile, CONSUMER, "p");
  const colorOf = (rules) =>
    rules.find((rule) => rule[1].ltr?.includes("color:"))?.[1].ltr;
  expect(colorOf(adsRules)).toContain("var(--ads-probe-ink)");
  expect(colorOf(productRules)).toContain("var(--ads-probe-ink)");
});

test("a rule key's leading prefix identifies its origin", async () => {
  const adsRules = await compile(consumerFile, CONSUMER, "x");
  const productRules = await compile(consumerFile, CONSUMER, "p");
  for (const rule of adsRules) {
    if (rule[0].startsWith("--")) continue;
    expect(originOfRuleKey(rule[0])?.name).toBe("ads");
  }
  for (const rule of productRules) {
    if (rule[0].startsWith("--")) continue;
    expect(originOfRuleKey(rule[0])?.name).toBe("product");
  }
});

test("an identical declaration produces a different class per origin", async () => {
  const adsRules = await compile(consumerFile, CONSUMER, "x");
  const productRules = await compile(consumerFile, CONSUMER, "p");
  const flex = (rules) =>
    rules.find((rule) => rule[1].ltr?.includes("display:flex"))?.[0];
  // If these collided, one class would have to hold two cascade positions and
  // the higher copy would silently outrank any theme rule aimed at the lower.
  expect(flex(adsRules)).not.toBe(flex(productRules));
});

test("a defineConsts key hash is prefix-invariant apart from the prefix", async () => {
  const [ads] = await compile(constsFile, CONSTS, "x");
  const [product] = await compile(constsFile, CONSTS, "p");
  expect(ads[0].slice(1)).toBe(product[0].slice(1));
  // Which is what lets the adapter re-key one origin's const rules for
  // another origin's rule-processing run.
  expect(reprefixConstRule(ads, "p")[0]).toBe(product[0]);
});

test("a cross-origin media condition substitutes", async () => {
  // Without the re-keying, a product file asking for an ADS breakpoint ships a
  // literal `var(--p…){…}` block: invalid CSS that takes out every media query
  // in the app. The stock single-prefix pipeline cannot reproduce this.
  const adsConsts = await compile(constsFile, CONSTS, "x");
  const productRules = await compile(consumerFile, CONSUMER, "p");
  const css = processRulesByOrigin([...adsConsts, ...productRules]);
  expect(css).toContain("@media (max-width: 768px)");
  expect(css).not.toMatch(/var\(--[a-z0-9]+\)\s*\{/);
});

test("each origin's rules land in that origin's layer", async () => {
  const adsRules = await compile(consumerFile, CONSUMER, "x");
  const productRules = await compile(consumerFile, CONSUMER, "p");
  const css = processRulesByOrigin([...adsRules, ...productRules]);
  expect(css).toContain("@layer ads.priority");
  expect(css).toContain("@layer product.priority");
  const adsBlock = css.slice(
    css.indexOf("@layer ads."),
    css.indexOf("@layer product."),
  );
  // Anchored, or the `ads.priority2` layer name matches as a selector.
  expect(adsBlock).not.toMatch(/(^|\n)\.p[a-z0-9]{4,}\s*\{/);
});

test("a dynamic style's @property registration is emitted once, unlayered", async () => {
  const adsRules = await compile(consumerFile, CONSUMER, "x");
  const productRules = await compile(consumerFile, CONSUMER, "p");
  // The name is `--x-<property>` under BOTH prefixes — it is not a
  // classNamePrefix namespace — so it belongs to no origin.
  const shared = [...adsRules, ...productRules].filter((rule) =>
    rule[0].startsWith("--"),
  );
  expect(shared.length).toBeGreaterThan(0);
  expect(new Set(shared.map((rule) => rule[0])).size).toBe(1);

  const css = processRulesByOrigin([...adsRules, ...productRules]);
  expect(css.split("@property --x-blockSize").length - 1).toBe(1);
  // Ahead of the first layer BLOCK — the layer statement is the one thing
  // that has to precede it.
  expect(css.indexOf("@property")).toBeLessThan(
    css.indexOf("@layer ads.priority2{"),
  );
});

test("a rule with no recognisable origin fails loudly", () => {
  expect(() =>
    processRulesByOrigin([["zzz1abc", { ltr: ".zzz1abc{color:red}" }, 3000]]),
  ).toThrow(/no known origin prefix/);
});

test("ADS is classified by root, not by node_modules alone", () => {
  const classify = createOriginClassifier(["/tmp/host/vendor/ads/"]);
  expect(classify("/tmp/host/vendor/ads/components/Button.tsx")).toBe("ads");
  expect(
    classify("/tmp/host/node_modules/@delightai/ads/components/Button.tsx"),
  ).toBe("ads");
  expect(classify("/tmp/host/src/App.tsx")).toBe("product");
  // A query suffix is what Vite appends to a module id; it must not change the
  // answer, or one file compiles under two prefixes across a reload.
  expect(classify("/tmp/host/vendor/ads/components/Button.tsx?v=1")).toBe(
    "ads",
  );
});

test("this repository's own ADS root classifies as ADS", () => {
  // The root the Vite configs pass. Stated here so a directory move that
  // silently reclassifies every ADS module as product fails a test instead of
  // shipping a sheet whose `ads` layer is empty.
  const adsRoot = join(ROOT, "src", "components", "ads");
  const classify = createOriginClassifier([adsRoot]);
  expect(classify(join(adsRoot, "components", "Button.tsx"))).toBe("ads");
  expect(classify(join(ROOT, "src", "components", "ui", "button.tsx"))).toBe(
    "product",
  );
  expect(existsSync(join(adsRoot, "tokens", "tokens.stylex.ts"))).toBe(true);
});
