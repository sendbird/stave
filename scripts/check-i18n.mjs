#!/usr/bin/env node
/**
 * i18n gate.
 *
 * 1. Every namespace in `src/locales/<sourceLocale>/` exists for every locale,
 *    is registered in `src/i18n/resources.ts`, and is stored in canonical
 *    JSON form.
 * 2. Every locale has every key with a non-empty value, matching
 *    interpolation variables, matching `<Trans>` markup, and the plural forms
 *    its language requires. Korean values must contain Korean text whenever
 *    the English value contains words (acronyms and `terms` excepted).
 * 3. No user-facing string literal remains in renderer or main-process UI
 *    code (see `scripts/i18n/hardcoded-strings.mjs`).
 *
 * Usage:
 *   node scripts/check-i18n.mjs            # full gate
 *   node scripts/check-i18n.mjs --fix      # rewrite catalogs canonically, then check
 *   node scripts/check-i18n.mjs --files a.tsx b.ts   # scan only these sources
 *   node scripts/check-i18n.mjs --catalogs # catalogs only, no source scan
 *   node scripts/check-i18n.mjs --summary  # per-file hardcoded-string counts
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { checkNamespace, formatCatalog } from "./i18n/catalog-check.mjs";
import { scanSource } from "./i18n/hardcoded-strings.mjs";

const root = process.cwd();
const config = JSON.parse(readFileSync(path.join(root, "config/i18n.json"), "utf8"));
const args = process.argv.slice(2);
const fix = args.includes("--fix");
const summary = args.includes("--summary");
const catalogsOnly = args.includes("--catalogs");
const filesIndex = args.indexOf("--files");
const explicitFiles = filesIndex >= 0 ? args.slice(filesIndex + 1).filter((arg) => !arg.startsWith("--")) : null;

const failures = [];

// ── catalogs ───────────────────────────────────────────────────────────────
const catalogDir = path.join(root, config.catalogDir);
const namespacesByLocale = {};
for (const locale of config.locales) {
  const dir = path.join(catalogDir, locale);
  namespacesByLocale[locale] = existsSync(dir)
    ? readdirSync(dir).filter((file) => file.endsWith(".json")).map((file) => file.replace(/\.json$/, "")).sort()
    : [];
}
const namespaces = namespacesByLocale[config.sourceLocale];
const resourcesSource = existsSync(path.join(root, config.resourcesFile))
  ? readFileSync(path.join(root, config.resourcesFile), "utf8")
  : "";
let keyCount = 0;

if (!explicitFiles) {
  for (const locale of config.locales) {
    for (const namespace of namespacesByLocale[locale]) {
      if (!namespaces.includes(namespace)) {
        failures.push(`${config.catalogDir}/${locale}/${namespace}.json: namespace is not in ${config.sourceLocale}`);
      }
    }
  }
  for (const namespace of namespaces) {
    const catalogs = {};
    for (const locale of config.locales) {
      const relative = `${config.catalogDir}/${locale}/${namespace}.json`;
      const file = path.join(root, relative);
      if (!existsSync(file)) {
        failures.push(`${relative}: missing (every namespace needs every locale)`);
        continue;
      }
      if (!resourcesSource.includes(`/${locale}/${namespace}.json"`)) {
        failures.push(`${relative}: not imported by ${config.resourcesFile}`);
      }
      const text = readFileSync(file, "utf8");
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        failures.push(`${relative}: invalid JSON (${error.message})`);
        continue;
      }
      const canonical = formatCatalog(parsed);
      if (text !== canonical) {
        if (fix) writeFileSync(file, canonical);
        else failures.push(`${relative}: not canonical JSON (run \`bun run check:i18n --fix\`)`);
      }
      catalogs[locale] = parsed;
    }
    if (!catalogs[config.sourceLocale]) continue;
    for (const issue of checkNamespace({
      namespace,
      sourceLocale: config.sourceLocale,
      catalogs,
      terms: config.terms,
      untranslatedKeys: config.untranslatedKeys,
    })) {
      failures.push(`${config.catalogDir}/${issue.locale}/${issue.namespace}.json: ${issue.key}: ${issue.message}`);
    }
    keyCount += countLeaves(catalogs[config.sourceLocale]);
  }
}

function countLeaves(value) {
  if (typeof value === "string") return 1;
  return Object.values(value ?? {}).reduce((total, child) => total + countLeaves(child), 0);
}

// ── hardcoded strings ──────────────────────────────────────────────────────
function globToRegExp(glob) {
  let pattern = "";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === "*" && glob[index + 1] === "*") {
      pattern += glob[index + 2] === "/" ? "(?:.*/)?" : ".*";
      index += glob[index + 2] === "/" ? 2 : 1;
    } else if (char === "*") {
      pattern += "[^/]*";
    } else {
      pattern += char.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${pattern}$`);
}

function listFiles(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(path.relative(root, full).split(path.sep).join("/"));
    }
  };
  walk(path.join(root, dir));
  return out;
}

const include = config.scan.include.map(globToRegExp);
const exclude = config.scan.exclude.map(globToRegExp);
const inScope = (file) =>
  config.scan.mainProcessFiles.includes(file) ||
  (include.some((pattern) => pattern.test(file)) && !exclude.some((pattern) => pattern.test(file)));

const sourceFiles = catalogsOnly
  ? []
  : explicitFiles
  ? explicitFiles.map((file) => path.relative(root, path.resolve(root, file)).split(path.sep).join("/")).filter(inScope)
  : [...listFiles("src"), ...config.scan.mainProcessFiles].filter(inScope);

const findings = [];
for (const file of [...new Set(sourceFiles)].sort()) {
  findings.push(...scanSource(file, readFileSync(path.join(root, file), "utf8"), { terms: config.terms }));
}

if (summary) {
  const perFile = new Map();
  for (const finding of findings) perFile.set(finding.file, (perFile.get(finding.file) ?? 0) + 1);
  for (const [file, count] of [...perFile].sort((a, b) => b[1] - a[1])) console.log(`${count}\t${file}`);
  console.log(`${findings.length} hardcoded strings in ${perFile.size} files`);
  process.exit(0);
}

for (const finding of findings) {
  failures.push(`${finding.file}:${finding.line}:${finding.column}: hardcoded ${finding.rule} "${finding.text}"`);
}

if (failures.length > 0) {
  console.error("i18n check failed:");
  for (const failure of failures.slice(0, 400)) console.error(`- ${failure}`);
  if (failures.length > 400) console.error(`… and ${failures.length - 400} more`);
  console.error(
    "\nMove user-facing text into src/locales/en and src/locales/ko (see docs/developer/i18n.md).",
  );
  process.exit(1);
}

console.log(
  explicitFiles
    ? `i18n check passed (${sourceFiles.length} files scanned).`
    : `i18n check passed (${namespaces.length} namespaces, ${keyCount} keys per locale, ${config.locales.join("/")}; ${sourceFiles.length} files scanned).`,
);
