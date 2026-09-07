import { readFileSync, readdirSync } from "node:fs";
import { sep } from "node:path";
import ts from "typescript";

/**
 * Finds interactive surfaces that change paint on `:hover`/`:active` and have
 * no `transition` anywhere that could animate it — the regression the ADS
 * adoption left behind most often, because extracting a component's styles into
 * a sibling `*.styles.ts` moves the `:hover` arms out of the file that composed
 * `recipes/transition` and nothing complains.
 *
 * Three things make this checkable rather than noisy.
 *
 * 1. The unit is the MODULE GROUP — the file declaring the paint arm plus every
 *    file that imports it. A `*.styles.ts` key may state a bare `:hover` fill as
 *    long as its consumer composes `transition.colors` beside it, which is the
 *    correct authoring shape and by far the common one.
 *
 * 2. Style keys are read by BRACE MATCHING, not by an indentation pattern. The
 *    modules here are a mix of one-declaration-per-line and one-key-per-line, and
 *    a line-anchored regex silently reads a `stylex.keyframes` `from:` as a style
 *    key and then swallows the next real key's `:hover` arm along with it.
 *
 * 3. A paint arm handed to a component that ALREADY transitions is not a
 *    finding. Every ADS control composes a `recipes/transition` key over the
 *    properties merged into it, so `xstyle={fooStyles.deleteButton}` — or the
 *    same thing through `className` — fades its hover ink on the house curve
 *    without the caller restating anything, and demanding a transition there
 *    would mean declaring the same property twice, which the motion ADR forbids.
 *    So each reference is resolved to the JSX element it lands on, that tag is
 *    resolved back to the module it was imported from, and the reference counts
 *    as covered when that module composes a transition. A plain `div`/`label`/
 *    `button` resolves to no import and stays a finding.
 *
 * Ignoring point 3 is what made the first cut of this rule report 45 findings of
 * which 21 were already-correct code; it is why the baseline can be trusted to
 * mean "genuinely silent" rather than "not yet triaged".
 */

/*
 * `textDecorationLine` is deliberately NOT in this list. It is a discrete
 * property: `none -> underline` has no interpolable midpoint, so CSS cannot
 * animate it and no `recipes/transition` key can either. Including it produced
 * one finding that no correct edit could clear —
 * `settings-dialog-changelog-section`'s link, whose only hover change is the
 * underline — and the only ways to "fix" it were to declare a transition that
 * animates nothing or to change the link's resting design. A rule with an
 * unsatisfiable finding in it teaches people to edit the baseline instead of
 * the code. If an underline should ease, the property to name is
 * `text-decoration-color`, and that belongs in a `transition` key first.
 */
const PAINT_STATE =
  /\b(?:backgroundColor|borderColor|color|opacity|boxShadow)\s*:\s*\{[^{}]*?"(?::hover|:active)[^"]*"\s*:/s;
const COMPOSES_TRANSITION = /\btransition/i;

/** Top-level `stylex.create({...})` entries, as `[key, body]`. */
function styleEntries(source) {
  const entries = [];
  for (const match of source.matchAll(/stylex\.create\(\s*\{/g)) {
    const open = match.index + match[0].length - 1;
    let depth = 0;
    let close = open;
    for (; close < source.length; close += 1) {
      if (source[close] === "{") depth += 1;
      else if (source[close] === "}" && (depth -= 1) === 0) break;
    }
    const body = source.slice(open + 1, close);
    let nesting = 0;
    let key = null;
    let start = 0;
    for (let index = 0; index < body.length; index += 1) {
      const character = body[index];
      if ("{[(".includes(character)) nesting += 1;
      else if ("}])".includes(character)) nesting -= 1;
      else if (nesting === 0 && character === ":" && key === null)
        key =
          /([A-Za-z_$][\w$]*)\s*$/.exec(body.slice(start, index))?.[1] ?? null;
      else if (nesting === 0 && character === "," && key) {
        entries.push([key, body.slice(start, index)]);
        key = null;
        start = index + 1;
      }
    }
    if (key) entries.push([key, body.slice(start)]);
  }
  return entries;
}

/** Resolve a relative/`@/` specifier against `fromPath` to a key in `sources`. */
function resolveSpecifier(fromPath, specifier, sources) {
  const segments = specifier.startsWith("@/")
    ? specifier.slice(2).split("/")
    : [...fromPath.split("/").slice(0, -1), ...specifier.split("/")];
  const resolved = [];
  for (const segment of segments) {
    if (segment === "." || segment === "") continue;
    if (segment === "..") resolved.pop();
    else resolved.push(segment);
  }
  const target = resolved.join("/");
  return [
    `${target}.ts`,
    `${target}.tsx`,
    `${target}/index.ts`,
    `${target}/index.tsx`,
  ].find((candidate) => sources.has(candidate));
}

/**
 * Follow re-export hops to the module that actually DEFINES `name`.
 *
 * `@/components/ui` is a barrel: it names `Button` but declares nothing, so
 * stopping at the first hop reports every ADS control imported through it as
 * untransitioned. `export { X } from "…"` is followed by name, `export * from`
 * is followed blind, and a module that mentions the name outside an export
 * clause is treated as the definition site.
 */
function definingModule(path, name, sources, seen = new Set()) {
  if (!path || seen.has(path)) return path ?? null;
  seen.add(path);
  const source = sources.get(path);
  if (!source) return null;
  for (const match of source.matchAll(
    /export\s+\{([^}]*)\}\s+from\s+"([^"]+)"/g,
  )) {
    const names = match[1]
      .split(",")
      .map((entry) => entry.trim().split(/\s+as\s+/).pop().trim());
    if (!names.includes(name)) continue;
    const target = resolveSpecifier(path, match[2], sources);
    return definingModule(target, name, sources, seen) ?? path;
  }
  if (new RegExp(`\\b${name}\\b`).test(source.replace(/export\s+\*[^\n]*/g, "")))
    return path;
  for (const match of source.matchAll(/export\s+\*\s+from\s+"([^"]+)"/g)) {
    const target = resolveSpecifier(path, match[1], sources);
    const found = definingModule(target, name, sources, seen);
    if (found) return found;
  }
  return path;
}

/**
 * For every JSX element in `source`, the character range it spans and the
 * module its tag was imported from (`null` for an intrinsic tag such as `div`).
 */
function jsxTagOrigins(path, source, sources) {
  const tree = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const importedFrom = new Map();
  const visitImports = (node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.importClause
    ) {
      const target = resolveSpecifier(
        path,
        node.moduleSpecifier.text,
        sources,
      );
      if (target) {
        const { name, namedBindings } = node.importClause;
        if (name) importedFrom.set(name.text, target);
        if (namedBindings && ts.isNamedImports(namedBindings))
          for (const element of namedBindings.elements)
            importedFrom.set(element.name.text, target);
      }
    }
    ts.forEachChild(node, visitImports);
  };
  visitImports(tree);

  const elements = [];
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      // `<Foo.Bar>` is Foo's module; `<div>` is nobody's.
      const root = node.tagName.getText(tree).split(".")[0];
      elements.push({
        attributes: node.attributes.properties
          .filter((property) => ts.isJsxAttribute(property) && property.initializer)
          .map((property) => ({
            end: property.initializer.getEnd(),
            name: property.name.getText(tree),
            start: property.initializer.getStart(tree),
          })),
        end: node.getEnd(),
        name: root,
        origin: definingModule(importedFrom.get(root) ?? null, root, sources),
        start: node.getStart(tree),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return elements;
}

/** The local names a consumer bound `module`'s exports to. */
function localBindings(consumer, module, sources) {
  const names = [];
  for (const match of sources
    .get(consumer)
    .matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+"([^"]+)"/g)) {
    if (resolveSpecifier(consumer, match[2], sources) !== module) continue;
    for (const entry of match[1].split(","))
      if (entry.trim())
        names.push(entry.trim().split(/\s+as\s+/).pop().trim());
  }
  return names;
}

/**
 * Does `module` forward its `propName` prop onto an element that transitions?
 *
 * The class channel of a composed control is a PROP, not a class:
 * `<ModelSelector triggerClassName={sx(styles.trigger)} />` and
 * `<ChoiceChips optionXstyle={…} />` hand their caller's paint arms to an ADS
 * control one level down, so the caller's surface is animated even though
 * neither the caller nor `ModelSelector` itself says `transition` anywhere.
 * Without this hop those call sites are indistinguishable from a bare `<div>`,
 * which is the difference between a rule worth trusting and a rule with a pile
 * of unexplained exemptions.
 *
 * One hop only, and only when the prop is actually merged into a `className`
 * or `xstyle` on a transitioned element — a prop that is read for some other
 * purpose does not count.
 */
function forwardsToTransitioned(module, propName, sources, jsxFor, seen) {
  if (!module || !propName || seen.has(`${module}#${propName}`)) return false;
  seen.add(`${module}#${propName}`);
  const source = sources.get(module);
  if (!source) return false;
  const reference = new RegExp(`\\b${propName}\\b`, "g");
  for (const match of source.matchAll(reference)) {
    const host = jsxFor(module)
      .filter((element) => element.start <= match.index && match.index < element.end)
      .sort((a, b) => b.start - a.start)[0];
    if (!host) continue;
    const attribute = host.attributes.find(
      (candidate) =>
        candidate.start <= match.index && match.index < candidate.end,
    );
    if (!attribute || !/^(?:className|xstyle|style)$|ClassName$|Xstyle$/.test(attribute.name))
      continue;
    if (host.origin && COMPOSES_TRANSITION.test(sources.get(host.origin)))
      return true;
    if (
      host.origin &&
      forwardsToTransitioned(host.origin, attribute.name, sources, jsxFor, seen)
    )
      return true;
  }
  return false;
}

export function motionlessInteractive(srcRoot) {
  const sources = new Map();
  for (const relative of readdirSync(srcRoot, { recursive: true })) {
    const path = String(relative).split(sep).join("/");
    if (!/\.tsx?$/.test(path)) continue;
    sources.set(path, readFileSync(new URL(relative, srcRoot), "utf8"));
  }

  const importers = new Map();
  for (const [path, source] of sources)
    for (const [, specifier] of source.matchAll(
      /from\s+"((?:\.{1,2}\/|@\/)[^"]+)"/g,
    )) {
      const target = resolveSpecifier(path, specifier, sources);
      if (!target) continue;
      if (!importers.has(target)) importers.set(target, new Set());
      importers.get(target).add(path);
    }

  const jsxCache = new Map();
  const jsxFor = (path) => {
    if (!jsxCache.has(path))
      jsxCache.set(path, jsxTagOrigins(path, sources.get(path), sources));
    return jsxCache.get(path);
  };

  const findings = [];
  for (const [path, source] of sources) {
    // ADS recipes are composed by name at call sites this resolver cannot see,
    // and every ADS component that uses one composes a transition beside it.
    if (path.startsWith("components/ads/recipes/")) continue;
    if (!PAINT_STATE.test(source)) continue;
    const consumers = [...(importers.get(path) ?? [])];
    const group = [source, ...consumers.map((c) => sources.get(c))];
    if (group.some((member) => COMPOSES_TRANSITION.test(member))) continue;

    const keys = styleEntries(source)
      .filter(([, body]) => PAINT_STATE.test(body))
      .map(([key]) => key);
    const silent = keys.filter((key) => {
      let seen = false;
      for (const consumer of consumers) {
        /*
         * Qualify the search by the names THIS consumer bound the module to.
         * A bare `\.row\b` also matches `props.row`, `entry.row`, `thread.row`,
         * and one stray property access outside any JSX element reports the
         * whole module — which is how `workspace-tools`' `url` key was "found"
         * on `{props.url}` in a text node rather than on the `Button` that
         * actually carries it. Reading the binding from the import (rather than
         * from the `export const` in the styles file) is what makes this work
         * through the near-universal `import { fooStyles as styles }` rename.
         */
        const bindings = localBindings(consumer, path, sources);
        if (!bindings.length) continue;
        const reference = new RegExp(
          `\\b(?:${bindings.join("|")})\\.${key}\\b`,
          "g",
        );
        const elements = jsxFor(consumer);
        for (const match of sources.get(consumer).matchAll(reference)) {
          seen = true;
          // INNERMOST enclosing element, not the first one found. A trigger
          // written as `<PopoverTrigger render={<Button xstyle={…} />}>` puts
          // the reference inside BOTH opening elements, and it is the `Button`
          // that will carry the class and the transition — resolving to the
          // outer `PopoverTrigger` (which only forwards) reported every
          // render-prop trigger in the app as a hard cut.
          const host = elements
            .filter(
              (element) =>
                element.start <= match.index && match.index < element.end,
            )
            .sort((a, b) => b.start - a.start)[0];
          const origin = host?.origin;
          if (!origin) return true;
          if (COMPOSES_TRANSITION.test(sources.get(origin))) continue;
          const attribute = host.attributes.find(
            (candidate) =>
              candidate.start <= match.index && match.index < candidate.end,
          );
          if (
            !forwardsToTransitioned(
              origin,
              attribute?.name,
              sources,
              jsxFor,
              new Set(),
            )
          )
            return true;
        }
      }
      // A module that declares and uses its own styles has no consumer to
      // inspect; the group test above already read it, so it stays a finding.
      return !seen;
    });
    if (silent.length) findings.push(`src/${path}`);
  }
  return findings;
}
