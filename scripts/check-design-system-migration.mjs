import { readFileSync, readdirSync } from "node:fs";
import { sep } from "node:path";
import ts from "typescript";
import { inventory } from "./style-utility-inventory.mjs";
import { motionlessInteractive } from "./motionless-interactive.mjs";

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
    failures.push(`${path}: ${count} utility tokens exceed ${allowance}; author styles with StyleX and ADS recipes`);
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
const layerOrder = /@layer reset, theme, base, priority1[^;]+;/;
if (
  !html.match(layerOrder) ||
  html.match(layerOrder)?.[0] !== css.match(layerOrder)?.[0]
) {
  failures.push(
    "index.html and globals.css must establish the same canonical layer order",
  );
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
  if (contract.requiresCanonicalSource && !/from ["'][^"']*ads\//.test(source))
    failures.push(`${path}: canonical source dependency missing`);
  if (/from ["']\.\/tokens\.stylex["']/.test(source))
    failures.push(`${path}: obsolete token authority`);
}
const componentRoot = new URL("../src/components/", import.meta.url);
for (const relative of readdirSync(componentRoot, { recursive: true })) {
  if (!relative.endsWith(".tsx") || /^(ads|ui)\//.test(relative)) continue;
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
 * "leave it alone", it is "delete whatever the ADS recipe declared" — so an ADS
 * quiet control loses its `transparent` background and a `<button>` falls back
 * to the UA's opaque `buttonface`, which is the gray-slab regression. Author the
 * resting value explicitly (`"transparent"`, or the token the state maps to).
 * Only ADS itself owns these contracts, so only `src/components/ads` is exempt.
 */
const unsetPaint = /\b(?:backgroundColor|borderColor|color)\s*:\s*\{\s*default:\s*null/g;
const srcRoot = new URL("../src/", import.meta.url);
for (const relative of readdirSync(srcRoot, { recursive: true })) {
  const path = relative.split(sep).join("/");
  if (!/\.tsx?$/.test(path) || path.startsWith("components/ads/")) continue;
  const source = readFileSync(new URL(relative, srcRoot), "utf8");
  for (const match of source.matchAll(unsetPaint)) {
    const line = source.slice(0, match.index).split("\n").length;
    failures.push(
      `src/${path}:${line}: \`${match[0].split(":")[0].trim()}: { default: null }\` unsets the ADS variant contract; declare the resting value (e.g. "transparent")`,
    );
  }
}

/*
 * The hard-cut ratchet. The analysis lives in `motionless-interactive.mjs`,
 * which documents why an ADS-control call site is not a finding;
 * `motionlessInteractive` in the manifest is the list of groups that were still
 * genuinely silent when the rule landed. It may shrink, never grow, and a stale
 * entry fails too so a fixed surface cannot keep its exemption.
 */
const motionlessBaseline = new Set(manifest.motionlessInteractive ?? []);
const motionless = motionlessInteractive(srcRoot);
for (const path of motionless)
  if (!motionlessBaseline.has(path))
    failures.push(
      `${path}: states a \`:hover\`/\`:active\` paint change and nothing on that element transitions it; compose \`transition.colors\` (or \`transition.control\`) from \`ads/recipes/transition\` at the call site`,
    );
for (const path of motionlessBaseline)
  if (!motionless.includes(path))
    failures.push(
      `${path}: stale \`motionlessInteractive\` entry — the surface has a transition now, so drop the exemption`,
    );

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
const adsSourceDependencies = new Set();
for (const file of [
  ".ads-source.json",
  ".ads-source-controls.json",
  ".ads-source-lightbox.json",
]) {
  const source = JSON.parse(
    readFileSync(new URL(`../src/components/ads/${file}`, import.meta.url), "utf8"),
  );
  for (const dependency of Object.keys(source.dependencies ?? {})) {
    adsSourceDependencies.add(dependency);
  }
}
for (const dependency of adsSourceDependencies) {
  if (
    !packageJson.dependencies?.[dependency] &&
    !packageJson.devDependencies?.[dependency]
  ) {
    failures.push(`${dependency}: ADS source dependency is not declared`);
  }
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  const pending = Object.keys(remaining).filter((path) => !(path in dataLiterals));
  console.log(
    `Design system ratchet passed (${Object.keys(manifest.files).length} adapters; ${pending.length} files still contain utility syntax; ${Object.keys(dataLiterals).length} documented non-authoring literals).`,
  );
}
