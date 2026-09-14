/**
 * The origin split, as pure functions.
 *
 * Everything here is about StyleX's own output: which origin a module belongs
 * to, which origin a collected rule belongs to, and how the two origins'
 * rules become one stylesheet with a seam between them. None of it knows
 * about Vite. `vite-ads-stylex.mjs` is the integration and carries the
 * reasoning for why the split exists at all — read that first.
 *
 * Split out of it because a new source file has to stay at or below 500 lines
 * and because the compiler facts asserted by
 * `scripts/vite-ads-stylex.test.mjs` are all in here.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

/*
 * `@stylexjs/unplugin` is the one StyleX package this repository declares, and
 * everything below is reached through it: the compiler itself, plus the
 * `lightningcss` and `browserslist` that lower and prefix the emitted CSS.
 * None of the three is hoisted — `@stylexjs/babel-plugin` resolves from the
 * repository root but not from `scripts/`, and not at all from a fresh CI
 * install. Borrowing keeps one pinned version (0.19.0) instead of a second set
 * that would then be ours to keep in step, and the compatibility test asserts
 * each borrow resolves.
 */
const requireHere = createRequire(import.meta.url);
export const requireFromUnplugin = createRequire(
  requireHere.resolve("@stylexjs/unplugin"),
);

/*
 * Interop, not paranoia: Bun's `require` of that CJS module hands back the
 * compiler API directly, Node's hands back `{default: …}`. Both runtimes load
 * this file — Vite's config loader and `bun test`.
 */
const styleXBabelModule = requireFromUnplugin("@stylexjs/babel-plugin");
export const styleXBabel = styleXBabelModule.withOptions
  ? styleXBabelModule
  : styleXBabelModule.default;
const { browserslistToTargets, transform: lightningcssTransform } =
  requireFromUnplugin("lightningcss");
const browserslist = requireFromUnplugin("browserslist");

/**
 * The origins, in cascade order. `ads` keeps StyleX's default `x` prefix so
 * that splitting the pipeline renames nothing on the ADS side — the visual
 * suite, the ADS usage baseline and the runtime cascade probes all keep
 * matching. Neither prefix may be a prefix of the other, or partitioning the
 * collected rules by class name would be ambiguous.
 */
export const STYLEX_ORIGINS = [
  { classNamePrefix: "x", layer: "ads", name: "ads" },
  { classNamePrefix: "p", layer: "product", name: "product" },
];

for (const a of STYLEX_ORIGINS) {
  for (const b of STYLEX_ORIGINS) {
    if (a !== b && a.classNamePrefix.startsWith(b.classNamePrefix)) {
      throw new Error(
        `[ads-stylex] origin prefixes must be mutually non-prefixing: "${a.classNamePrefix}" starts with "${b.classNamePrefix}"`,
      );
    }
  }
}

/** Resolve through symlinks so a linked workspace copy classifies the same. */
function realPath(target) {
  try {
    return fs.realpathSync.native(target);
  } catch {
    return target;
  }
}

function normalizeId(id) {
  const withoutQuery = id.split("?")[0] ?? id;
  return realPath(path.resolve(withoutQuery)).split(path.sep).join("/");
}

function normalizeRoot(root) {
  const resolved = realPath(path.resolve(root)).split(path.sep).join("/");
  return resolved.endsWith("/") ? resolved : `${resolved}/`;
}

/**
 * Which origin owns a module.
 *
 * ADS is identified by an explicit list of roots. This is a source install, so
 * ADS lives inside the host's own tree and `adsRoots` is the only thing that
 * can name it; upstream additionally defaults to its workspace package root,
 * which does not exist here. Anything the caller has not declared as ADS is a
 * product module, which is the safe direction — the product layer is the
 * topmost, so a misfiled module loses its ability to be re-themed rather than
 * gaining the ability to outrank one.
 *
 * A module under `node_modules` that is neither is third-party StyleX. It
 * compiles as product and is documented as doing so; ADS ships no such
 * dependency today.
 */
export function createOriginClassifier(adsRoots) {
  const roots = (adsRoots ?? []).map(normalizeRoot);
  return function classify(id) {
    const normalized = normalizeId(id);
    for (const root of roots) {
      if (normalized.startsWith(root)) return "ads";
    }
    // A published install, wherever the package manager put it.
    if (normalized.includes("/@delightai/ads/")) return "ads";
    return "product";
  };
}

const isConstRule = (rule) =>
  rule?.[1]?.constKey != null && rule?.[1]?.constVal != null;

/**
 * A rule keyed by a custom property rather than a class, which is how StyleX
 * registers the variable a DYNAMIC style writes:
 * `stylex.create({row: (h) => ({blockSize: h})})` emits
 * `@property --x-blockSize { syntax: "*"; inherits: false }` at priority 0.
 *
 * That name is `--x-` + the property, NOT `--` + `classNamePrefix` — measured
 * identical under prefixes `x` and `p`. So it belongs to no origin, both
 * origins' class rules read the same variable, and it must be emitted exactly
 * once. Priority 0 means `processStylexRules` leaves it unlayered, which is
 * also where an `@property` registration has to be.
 */
const isSharedRule = (rule) =>
  typeof rule?.[0] === "string" && rule[0].startsWith("--");

/** Which origin a collected rule belongs to, read off its own class name. */
export function originOfRuleKey(key) {
  let owner = null;
  for (const origin of STYLEX_ORIGINS) {
    if (typeof key === "string" && key.startsWith(origin.classNamePrefix)) {
      owner = origin;
    }
  }
  return owner;
}

/** Re-key a const rule so `processStylexRules` can substitute it under `prefix`. */
export function reprefixConstRule(rule, prefix) {
  const origin = originOfRuleKey(rule[0]);
  if (!origin || origin.classNamePrefix === prefix) return rule;
  const body = rule[0].slice(origin.classNamePrefix.length);
  return [
    `${prefix}${body}`,
    { ...rule[1], constKey: `${prefix}${body}` },
    rule[2],
  ];
}

/**
 * Turn every collected rule into one sheet, one `@layer <origin>.priority*`
 * block set per origin, in `STYLEX_ORIGINS` order.
 */
export function processRulesByOrigin(allRules, options = {}) {
  const constRules = allRules.filter(isConstRule);
  const byOrigin = new Map(STYLEX_ORIGINS.map((o) => [o.name, []]));
  const shared = [];
  const unclaimed = [];

  for (const rule of allRules) {
    if (isConstRule(rule)) continue;
    if (isSharedRule(rule)) {
      shared.push(rule);
      continue;
    }
    const origin = originOfRuleKey(rule[0]);
    if (!origin) {
      unclaimed.push(rule[0]);
      continue;
    }
    byOrigin.get(origin.name).push(rule);
  }

  if (unclaimed.length > 0) {
    throw new Error(
      `[ads-stylex] ${unclaimed.length} collected rule(s) carry no known origin prefix ` +
        `(${unclaimed.slice(0, 3).join(", ")}). A rule with no origin has no layer, so it ` +
        `would silently take whatever position the sheet gave it.`,
    );
  }

  let css = "";
  let sharedEmitted = false;
  for (const origin of STYLEX_ORIGINS) {
    const rules = byOrigin.get(origin.name);
    if (rules.length === 0) continue;
    const consts = constRules.flatMap((rule) => {
      const reprefixed = reprefixConstRule(rule, origin.classNamePrefix);
      return reprefixed === rule ? [rule] : [rule, reprefixed];
    });
    // Shared `@property` registrations ride the first origin that emits, so
    // they land once and ahead of anything that reads them.
    const withShared = sharedEmitted ? rules : [...shared, ...rules];
    sharedEmitted = true;
    const sheet = styleXBabel.processStylexRules([...consts, ...withShared], {
      enableLTRRTLComments: options.enableLTRRTLComments,
      useLayers: { prefix: origin.layer },
    });
    if (sheet) css += `${sheet}\n`;
  }
  return css;
}

export function lower(css, lightningcssOptions) {
  if (!css) return "";
  const { code } = lightningcssTransform({
    targets: browserslistToTargets(browserslist()),
    ...lightningcssOptions,
    code: Buffer.from(css),
    filename: "ads-stylex.css",
  });
  return code.toString();
}

/** `@stylexjs/unplugin`'s own asset picker, which it does not export. */
export function pickCssAsset(bundle, choose) {
  const assets = Object.values(bundle).filter(
    (a) =>
      a &&
      a.type === "asset" &&
      typeof a.fileName === "string" &&
      a.fileName.endsWith(".css"),
  );
  if (assets.length === 0) return null;
  if (typeof choose === "function") {
    const chosen = assets.find((a) => choose(a.fileName));
    if (chosen) return chosen;
  }
  return (
    assets.find((a) => /(^|\/)index\.css$/.test(a.fileName)) ??
    assets.find((a) => /(^|\/)style\.css$/.test(a.fileName)) ??
    assets[0]
  );
}
