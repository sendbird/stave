/**
 * Locale catalog completeness checks.
 *
 * `src/locales/<locale>/<namespace>.json` holds nested message objects. The
 * source locale (English) defines the key set; every other locale must carry
 * the same keys with non-empty values, the same interpolation variables and
 * the same `<Trans>` tags. Plural keys follow i18next suffixes and each locale
 * must provide exactly the categories its language uses (`Intl.PluralRules`),
 * so Korean has `_other` where English has `_one` and `_other`.
 */

const PLURAL_SUFFIX = /_(?:ordinal_)?(zero|one|two|few|many|other)$/;
const KEY_SEGMENT = /^[a-z][a-zA-Z0-9]*$/;
/** Locales whose translations must contain their own script when English has words. */
const NATIVE_SCRIPT = { ko: /[\u3131-\u318E\uAC00-\uD7A3]/ };

/** Flatten a nested catalog into `path -> value` entries. */
export function flattenCatalog(catalog, prefix = "", out = new Map(), problems = []) {
  for (const [key, value] of Object.entries(catalog)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      flattenCatalog(value, path, out, problems);
    } else if (typeof value === "string") {
      out.set(path, value);
    } else {
      problems.push({ path, message: "value must be a string or a nested object" });
    }
  }
  return { entries: out, problems };
}

export function interpolationNames(value) {
  const names = new Set();
  for (const match of value.matchAll(/\{\{\s*([^,}\s]+)[^}]*\}\}/g)) names.add(match[1]);
  for (const match of value.matchAll(/\$t\(([^),]+)/g)) names.add(`$t(${match[1].trim()})`);
  return names;
}

export function tagNames(value) {
  const names = new Set();
  for (const match of value.matchAll(/<\/?([A-Za-z0-9]+)\s*\/?>/g)) names.add(match[1]);
  return names;
}

function sameSet(left, right) {
  if (left.size !== right.size) return false;
  for (const value of left) if (!right.has(value)) return false;
  return true;
}

function formatSet(values) {
  return values.size === 0 ? "none" : [...values].sort().join(", ");
}

function stripForProse(value, terms) {
  let text = value
    .replace(/\{\{[^}]*\}\}/g, " ")
    .replace(/\$t\([^)]*\)/g, " ")
    .replace(/<\/?[A-Za-z0-9]+\s*\/?>/g, " ");
  for (const term of [...terms].sort((a, b) => b.length - a.length)) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "g"), " ");
  }
  return text;
}

/** True when the English value contains words a Korean reader needs translated. */
export function needsTranslation(value, terms) {
  const words = stripForProse(value, terms).match(/[A-Za-z][A-Za-z']+/g) ?? [];
  // ALLCAPS acronyms (PR, MCP, API, CLI) stay as written in Korean UI copy.
  return words.some((word) => !/^[A-Z0-9]+s?$/.test(word));
}

function pluralBase(path) {
  const match = PLURAL_SUFFIX.exec(path);
  if (!match) return null;
  return { base: path.slice(0, match.index), category: match[1], ordinal: path.includes("_ordinal_") };
}

function requiredPluralCategories(locale, ordinal) {
  return new Intl.PluralRules(locale, { type: ordinal ? "ordinal" : "cardinal" })
    .resolvedOptions()
    .pluralCategories;
}

/** Group plural variants by base key, leaving other keys as-is. */
function splitPlurals(entries) {
  const plurals = new Map();
  const singles = new Map();
  for (const [path, value] of entries) {
    const plural = pluralBase(path);
    const groupKey = plural ? `${plural.base}${plural.ordinal ? "_ordinal" : ""}` : null;
    // Treat `_one`/`_other` as plural only when an `_other` sibling exists.
    if (plural && entries.has(`${plural.base}${plural.ordinal ? "_ordinal" : ""}_other`)) {
      const group = plurals.get(groupKey) ?? { base: plural.base, ordinal: plural.ordinal, forms: new Map() };
      group.forms.set(plural.category, value);
      plurals.set(groupKey, group);
    } else {
      singles.set(path, value);
    }
  }
  return { plurals, singles };
}

/**
 * Compare one namespace across locales.
 * @param {{ namespace: string, sourceLocale: string, catalogs: Record<string, object>, terms?: string[], untranslatedKeys?: string[] }} input
 * @returns {Array<{ namespace: string, locale: string, key: string, message: string }>}
 */
export function checkNamespace({ namespace, sourceLocale, catalogs, terms = [], untranslatedKeys = [] }) {
  const issues = [];
  const add = (locale, key, message) => issues.push({ namespace, locale, key, message });
  const allowedUntranslated = new Set(untranslatedKeys);
  const flattened = {};
  for (const [locale, catalog] of Object.entries(catalogs)) {
    const { entries, problems } = flattenCatalog(catalog ?? {});
    for (const problem of problems) add(locale, problem.path, problem.message);
    flattened[locale] = splitPlurals(entries);
    for (const path of entries.keys()) {
      const segments = path.split(".");
      const last = segments.pop().replace(PLURAL_SUFFIX, "").replace(/_ordinal$/, "");
      for (const segment of [...segments, last]) {
        if (!KEY_SEGMENT.test(segment)) {
          add(locale, path, `key segment "${segment}" must be lowerCamelCase`);
          break;
        }
      }
    }
  }
  const source = flattened[sourceLocale];
  if (!source) return [{ namespace, locale: sourceLocale, key: "*", message: "source catalog is missing" }];

  for (const [locale, target] of Object.entries(flattened)) {
    // Plain keys.
    for (const [key, sourceValue] of source.singles) {
      const value = target.singles.get(key);
      if (value === undefined) {
        add(locale, key, target.plurals.has(key) ? "is plural here but not in the source locale" : "missing translation");
        continue;
      }
      if (!value.trim()) {
        add(locale, key, "empty translation");
        continue;
      }
      const sourceVars = interpolationNames(sourceValue);
      const vars = interpolationNames(value);
      if (!sameSet(sourceVars, vars)) {
        add(locale, key, `interpolation mismatch: expected {${formatSet(sourceVars)}}, found {${formatSet(vars)}}`);
      }
      const sourceTags = tagNames(sourceValue);
      const tags = tagNames(value);
      if (!sameSet(sourceTags, tags)) {
        add(locale, key, `markup mismatch: expected <${formatSet(sourceTags)}>, found <${formatSet(tags)}>`);
      }
      const script = NATIVE_SCRIPT[locale];
      if (script && !allowedUntranslated.has(`${namespace}:${key}`) && needsTranslation(sourceValue, terms) && !script.test(value)) {
        add(locale, key, `not translated: "${value}"`);
      }
    }
    for (const key of target.singles.keys()) {
      if (!source.singles.has(key) && !source.plurals.has(key)) add(locale, key, "not in the source locale");
    }

    // Plural groups.
    for (const [groupKey, sourceGroup] of source.plurals) {
      const group = target.plurals.get(groupKey);
      if (!group) {
        add(locale, `${groupKey}_other`, "missing plural translation");
        continue;
      }
      const required = requiredPluralCategories(locale, sourceGroup.ordinal);
      for (const category of required) {
        if (!group.forms.has(category)) add(locale, `${groupKey}_${category}`, `missing plural form "${category}"`);
      }
      for (const [category, value] of group.forms) {
        if (category !== "zero" && !required.includes(category)) {
          add(locale, `${groupKey}_${category}`, `plural form "${category}" is never used in ${locale}`);
        }
        if (!value.trim()) add(locale, `${groupKey}_${category}`, "empty translation");
      }
      const sourceVars = interpolationNames(sourceGroup.forms.get("other") ?? "");
      const otherValue = group.forms.get("other") ?? "";
      const vars = interpolationNames(otherValue);
      if (!sameSet(sourceVars, vars)) {
        add(locale, `${groupKey}_other`, `interpolation mismatch: expected {${formatSet(sourceVars)}}, found {${formatSet(vars)}}`);
      }
      const pluralScript = NATIVE_SCRIPT[locale];
      if (pluralScript && otherValue && !allowedUntranslated.has(`${namespace}:${groupKey}`) && needsTranslation(sourceGroup.forms.get("other") ?? "", terms) && !pluralScript.test(otherValue)) {
        add(locale, `${groupKey}_other`, `not translated: "${otherValue}"`);
      }
    }
    for (const groupKey of target.plurals.keys()) {
      if (!source.plurals.has(groupKey)) add(locale, `${groupKey}_other`, "plural group not in the source locale");
    }
  }
  return issues;
}

/** Canonical on-disk form: two-space JSON with a trailing newline. */
export function formatCatalog(catalog) {
  return `${JSON.stringify(catalog, null, 2)}\n`;
}
