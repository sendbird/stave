import { tokenLiterals, tokenRatchetFailures } from "./stylex-token-literals.mjs";
import { readFileSync, readdirSync } from "node:fs";
import { sep } from "node:path";
import ts from "typescript";
import { inventory } from "./style-utility-inventory.mjs";
import { motionlessInteractive } from "./motionless-interactive.mjs";
import { layerLiterals } from "./stylex-layer-literals.mjs";
import { spacingLiterals, spacingFailures } from "./stylex-spacing-literals.mjs";

const manifest = JSON.parse(
  readFileSync(
    new URL("../config/design-system-migration.json", import.meta.url),
    "utf8",
  ),
);
const failures = [];
const baseline = JSON.parse(readFileSync(new URL("../config/style-utility-baseline.json", import.meta.url), "utf8"));
const dataLiterals = baseline.dataLiterals ?? {};
const remaining = inventory();
for (const [path, count] of Object.entries(remaining)) {
  const allowance = baseline.files[path] ?? dataLiterals[path]?.tokens ?? 0;
  if (count > allowance) {
    failures.push(`${path}: ${count} utility tokens exceed ${allowance}; author styles with StyleX and AUI recipes`);
  }
}
for (const path of Object.keys(dataLiterals)) {
  if (!(path in remaining))
    failures.push(`${path}: stale dataLiterals exception; the literals it documents are gone, so remove the entry`);
  if (path in baseline.files)
    failures.push(`${path}: listed in both files and dataLiterals; a path is either migration work or a documented non-authoring literal`);
}
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(
  new URL("../src/globals.css", import.meta.url),
  "utf8",
);
const layerOrder = /@layer reset,[^;]+;/;
const htmlLayers = html.match(layerOrder)?.[0];
const cssLayers = css.match(layerOrder)?.[0];
if (!htmlLayers || htmlLayers !== cssLayers) {
  failures.push(
    "index.html and globals.css must establish the same canonical layer order",
  );
}
/*
 * StyleX no longer emits one flat `priority*` band: `scripts/vite-aui-stylex.mjs`
 * compiles AUI and product modules under different class name prefixes and nests
 * each origin's priority buckets inside `aui` and `product`. `aui-theme` is the
 * seam between them. Drop any of the three, or reorder them, and a brand recipe
 * has no defined position — so the names are asserted, not just the agreement.
 */
const AUI_ORIGIN_SEAM = ["aui", "aui-theme", "product"];
const auiStyles = readFileSync(
  new URL("../src/components/aui/styles.css", import.meta.url),
  "utf8",
);
for (const [label, source] of [
  ["index.html", htmlLayers],
  ["src/globals.css", cssLayers],
  ["src/components/aui/styles.css", auiStyles.match(layerOrder)?.[0]],
]) {
  if (!source) {
    failures.push(`${label}: no canonical \`@layer reset, …;\` statement`);
    continue;
  }
  const names = source
    .replace(/^@layer\s+/, "")
    .replace(/;$/, "")
    .split(",")
    .map((name) => name.trim());
  const seam = names.filter((name) => AUI_ORIGIN_SEAM.includes(name));
  if (seam.join(",") !== AUI_ORIGIN_SEAM.join(",")) {
    failures.push(
      `${label}: cascade layer statement must name ${AUI_ORIGIN_SEAM.join(", ")} in that order; found ${seam.join(", ") || "none"}`,
    );
  }
}
for (const file of readdirSync(
  new URL("../src/components/ui", import.meta.url),
)) {
  if (!file.endsWith(".tsx")) continue;
  const path = `src/components/ui/${file}`;
  if (!manifest.files[path] && !manifest.hostUtilities[path])
    failures.push(`${path}: unclassified shared component`);
}
for (const [path, contract] of Object.entries(manifest.files)) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const legacyRecipes = [...source.matchAll(/class-variance-authority/g)]
    .length;
  if (legacyRecipes > contract.legacyRecipeCount)
    failures.push(`${path}: legacy recipe count grew`);
  if (contract.requiresCanonicalSource && !/from ["'][^"']*aui\//.test(source))
    failures.push(`${path}: canonical source dependency missing`);
  if (/from ["']\.\/tokens\.stylex["']/.test(source))
    failures.push(`${path}: obsolete token authority`);
}
const componentRoot = new URL("../src/components/", import.meta.url);
for (const relative of readdirSync(componentRoot, { recursive: true })) {
  if (!relative.endsWith(".tsx") || /^(aui|ui)\//.test(relative)) continue;
  const path = `src/components/${relative}`;
  const source = readFileSync(new URL(relative, componentRoot), "utf8");
  const tree = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let nativeButtons = 0;
  function visit(node) {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(tree) === "button"
    )
      nativeButtons++;
    ts.forEachChild(node, visit);
  }
  visit(tree);
  if (nativeButtons > (manifest.productButtons?.[path] ?? 0))
    failures.push(`${path}: product actions must compose canonical Button`);
}
/*
 * StyleX `{ default: null }` UNSETS a property. On a paint property that is not
 * "leave it alone", it is "delete whatever the AUI recipe declared" — so an AUI
 * quiet control loses its `transparent` background and a `<button>` falls back
 * to the UA's opaque `buttonface`, which is the gray-slab regression. Author the
 * resting value explicitly (`"transparent"`, or the token the state maps to).
 * Only AUI itself owns these contracts, so only `src/components/aui` is exempt.
 */
const unsetPaint = /\b(?:backgroundColor|borderColor|color)\s*:\s*\{\s*default:\s*null/g;
const srcRoot = new URL("../src/", import.meta.url);
for (const relative of readdirSync(srcRoot, { recursive: true })) {
  const path = relative.split(sep).join("/");
  if (!/\.tsx?$/.test(path) || path.startsWith("components/aui/")) continue;
  const source = readFileSync(new URL(relative, srcRoot), "utf8");
  for (const match of source.matchAll(unsetPaint)) {
    const line = source.slice(0, match.index).split("\n").length;
    failures.push(
      `src/${path}:${line}: \`${match[0].split(":")[0].trim()}: { default: null }\` unsets the AUI variant contract; declare the resting value (e.g. "transparent")`,
    );
  }
}

/*
 * Stacking order is named, not numbered. `stylex-layer-literals.mjs` explains
 * the rule and the `// layer-ok: <reason>` escape; allowed uses are printed
 * with the summary so they stay visible.
 */
const { violations: layerViolations, allowed: layerAllowed } = layerLiterals(srcRoot);
for (const literal of layerViolations)
  failures.push(
    `${literal.path}:${literal.line}: \`zIndex: ${literal.value}\` is a raw stacking number; name a \`layers\` band or a \`localStack\` rung from src/lib/ui-layers.stylex.ts (or an \`--aui-z-index-*\` token), or justify it with \`// layer-ok: <reason>\``,
  );

/*
 * The hard-cut ratchet. The analysis lives in `motionless-interactive.mjs`,
 * which documents why an AUI-control call site is not a finding;
 * `motionlessInteractive` in the manifest is the list of groups that were still
 * genuinely silent when the rule landed. It may shrink, never grow, and a stale
 * entry fails too so a fixed surface cannot keep its exemption.
 */
const motionlessBaseline = new Set(manifest.motionlessInteractive ?? []);
const motionless = motionlessInteractive(srcRoot);
for (const path of motionless)
  if (!motionlessBaseline.has(path))
    failures.push(
      `${path}: states a \`:hover\`/\`:active\` paint change and nothing on that element transitions it; compose \`transition.colors\` (or \`transition.control\`) from \`aui/recipes/transition\` at the call site`,
    );
for (const path of motionlessBaseline)
  if (!motionless.includes(path))
    failures.push(
      `${path}: stale \`motionlessInteractive\` entry — the surface has a transition now, so drop the exemption`,
    );

// Literal spacing is a declaration-level ratchet, including on-grid literals.
const spacingBaseline = JSON.parse(
  readFileSync(new URL("../config/spacing-ratchet.json", import.meta.url), "utf8"),
);
const spacing = spacingLiterals(srcRoot);
failures.push(...spacingFailures(spacing, spacingBaseline.files));
const spacingTotal = spacing.length;
const recordedSpacingTotal = Object.values(spacingBaseline.files)
  .flatMap((entries) => Object.values(entries)).reduce((sum, count) => sum + count, 0);
if (spacingBaseline.version !== 2 || spacingBaseline.total !== recordedSpacingTotal)
  failures.push("config/spacing-ratchet.json: expected version 2 and a total matching its declarations");

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
for (const dependency of [
  "sonner",
  "cmdk",
  "react-day-picker",
  "tailwindcss",
  "@tailwindcss/vite",
  "tw-animate-css",
  "shadcn",
  "tailwind-merge",
  "clsx",
  "class-variance-authority",
]) {
  if (packageJson.dependencies?.[dependency] || packageJson.devDependencies?.[dependency])
    failures.push(`${dependency}: retired component engine returned`);
}
const auiSourceDependencies = new Set();
for (const file of [
  ".aui-source.json",
  ".aui-source-controls.json",
  ".aui-source-lightbox.json",
  ".aui-source-async.json",
  ".aui-source-toolbar.json",
  ".aui-source-version-compare.json",
  ".aui-source-review.json",
  ".aui-source-activity-feed.json",
  ".aui-source-relative-time.json",
  ".aui-source-selection.json",
]) {
  const source = JSON.parse(
    readFileSync(new URL(`../src/components/aui/${file}`, import.meta.url), "utf8"),
  );
  for (const dependency of Object.keys(source.dependencies ?? {})) {
    auiSourceDependencies.add(dependency);
  }
}
for (const dependency of auiSourceDependencies) {
  if (
    !packageJson.dependencies?.[dependency] &&
    !packageJson.devDependencies?.[dependency]
  ) {
    failures.push(`${dependency}: AUI source dependency is not declared`);
  }
}
if (!/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?animation-duration:\s*0\.01ms\s*!important/.test(css)) {
  failures.push("globals.css: preserve the global reduced-motion duration floor");
}
const tokenInventory = {};
function collectTokenInventory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) collectTokenInventory(path);
    else if (/\.tsx?$/.test(path) && !path.includes("/aui/")) {
      const counts = tokenLiterals(readFileSync(path, "utf8"), path);
      if (Object.keys(counts).length) tokenInventory[path] = counts;
    }
  }
}
collectTokenInventory("src/components");
const tokenFailures = tokenRatchetFailures(tokenInventory, JSON.parse(readFileSync("config/token-ratchet.json", "utf8")).files);
failures.push(...tokenFailures);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  const pending = Object.keys(remaining).filter((path) => !(path in dataLiterals));
  console.log(
    `Design system ratchet passed (${Object.keys(manifest.files).length} adapters; ${pending.length} files still contain utility syntax; ${Object.keys(dataLiterals).length} documented non-authoring literals; ${layerAllowed.length} justified raw z-index values; ${spacingTotal} literal spacing declarations in ${Object.keys(spacingBaseline.files).length} files).`,
  );
  for (const literal of layerAllowed)
    console.log(`  layer-ok  ${literal.path}:${literal.line} zIndex: ${literal.value} — ${literal.reason}`);
}
