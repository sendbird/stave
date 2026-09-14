#!/usr/bin/env node
/**
 * Style-channel guard.
 *
 * ADS has two ways to hand styles to a component, and only one of them works:
 *
 *   <Button xstyle={styles.wide} />            ← merged, wins, deterministic
 *   <Button className={sx(styles.wide)} />     ← may apply, may not; see below
 *
 * `packages/design-system/src/utils/stylex.ts` already says so — "`className`
 * remains a hook/test-id channel, not a styling channel" — and every component
 * implements it as `cx(sx(...own, xstyle), className)`. `xstyle` goes through
 * `stylex.props()`, which resolves by property name in JS before a class ever
 * reaches the DOM, so the host's value replaces the component's. A `className`
 * string cannot take part in that: it arrives as opaque text, and the two
 * classes then have to be settled by the cascade.
 *
 * The cascade cannot settle them. StyleX is atomic and emits every rule into
 * one flat `@layer priority1…priorityN` regardless of who wrote it, so the
 * winner is whichever class the sheet happens to carry last.
 *
 * It would be easier to explain if the component simply always won. It does
 * not. An atomic class is a pure function of its declaration, so one class is
 * shared by every author of that declaration, and its position in the sheet is
 * fixed by whichever module first produced it ANYWHERE in the program. That is
 * a property of the whole build, not of the call site — so the outcome is
 * decided per property, and two properties written in the same object, on the
 * same element, can go opposite ways.
 *
 * Measured against `main`, on the shell's login screen. One element, one
 * `className={sx(styles.loginBody)}`, two declarations:
 *
 *   display: flex        → rendered `grid`   (the component's value won)
 *   gap: vars.space16    → rendered `16px`   (the app's value won)
 *
 * and its sibling `<Card className={sx(styles.loginCard)}>` asking for
 * `inlineSize: min(380px, 100%)` rendered `380px` — the app's again. Nothing
 * at the call site distinguishes the three. The fixture's `<Button size="md">`
 * given `paddingInline: 41px` is the other kind: it renders the component's
 * `12px`.
 *
 * So the channel is not weak, it is arbitrary — and arbitrary in a way no
 * caller can inspect, which is worse than a rule you can learn.
 *
 * ## Why this is a guard and not a bundler fix
 *
 * The obvious fix — give the library and the product their own cascade layers,
 * `ads-base < product` — does not work, and the reason is worth writing down so
 * it is not attempted a third time.
 *
 * 1. **A layer split alone is unsound.** Atomic class names are a pure function
 *    of the declaration, so `paddingInline: vars.space12` written in `Button`
 *    and in an app file produce the SAME class. One class cannot hold two
 *    cascade positions. Emitting it into both layers makes the `product` copy
 *    beat unrelated product rules; emitting it into one makes an app override
 *    that happens to reuse an ADS value collide with the component's own rule.
 *    Both directions leave a hole, and the hole moves rather than closes.
 * 2. **Per-origin `classNamePrefix` — the fix for (1) — breaks every ADS token,
 *    because of how ADS names them.** `classNamePrefix` feeds the `defineVars`
 *    name hash, and a consuming file re-hashes an imported variable with ITS
 *    OWN prefix. A key that spells its custom property out is not hashed at all
 *    (`key.startsWith('--')` — @stylexjs/babel-plugin@0.19.0 lib/index.js:5409).
 *    Both, measured in one run with the library on `ads` and the consumer on
 *    `x`:
 *
 *      defineVars({space12: '12px'})            hashed, prefix-dependent
 *        tokens   :root{--ads1r4gjym:12px}
 *        consumer .x308fck{padding-inline:var(--x1r4gjym)}     ← undefined
 *
 *      defineVars({'--ads-space-16': '16px'})   named, prefix-independent
 *        tokens   :root{--ads-space-16:16px}
 *        consumer .x1kyng46{margin-inline:var(--ads-space-16)} ← resolves
 *
 *    facebook/astryx#5410 is on the second pair: its per-file prefix router
 *    (packages/build/src/babel.js) is this exact two-instance arrangement, and
 *    it holds because every Astryx token is declared `'--color-accent': …` and
 *    read as `colorVars['--color-accent']`.
 *
 * ADS used to be on the first pair, which is what made the split impossible:
 * 202 tokens declared as bare identifiers and read 13,084 times across 669
 * files. That was the blocker — ADS's token naming, not StyleX and not the
 * wiring — and it is gone. As of `refactor(ads)!: declare tokens as explicit
 * CSS custom properties` (2026-09-09) every ADS token is declared
 * `"--ads-color-text": …` and read as `vars["--ads-color-text"]`, so the split
 * is unblocked. It is not yet built; when it is, it will settle `className`
 * the way a caller expects — host layer above library layer.
 *
 * None of that is what makes `xstyle` right. `xstyle` resolves by property
 * name in JS before the cascade sees anything, so it holds under either layer
 * arrangement and it names the channel at the call site. This guard does not
 * depend on the split, before or after.
 *
 * ## What this flags
 *
 * A JSX element whose tag was imported from ADS, carrying StyleX styles through
 * `className`. Everything else is left alone:
 *
 * - `className={sx(…)}` on a plain DOM element is correct and untouched — there
 *   is no component declaration to lose to.
 * - `className` on an ADS element with a hook, test id, or app class is the
 *   documented use and is untouched.
 * - ADS's own components are not scanned: `cx(sx(own, xstyle), className)` is
 *   the pattern this guard exists to protect.
 *
 * Usage: `node scripts/check-style-channel.mjs` (wired into `bun run check`).
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/*
 * Product source. The installed ADS copy is deliberately absent: inside a
 * component, `className` IS the forwarding channel.
 */
const ADS_DIR = "src/components/ads/";
const SCANNED = (file) =>
  file.startsWith("src/") && !file.startsWith(ADS_DIR) && file.endsWith(".tsx");

/*
 * `ads/headless` is deliberately NOT an ADS style origin. Every module under
 * it is a bare re-export of a Base UI part, so a headless part declares
 * nothing for a host style to lose to and `className` is the only channel it
 * has. Flagging those would be telling callers to move to a prop that does not
 * exist.
 */
const ADS_HEADLESS_DIR = `${ADS_DIR}headless/`;

/**
 * An import is "from ADS" when it resolves into the installed ADS directory.
 * This is a source install, so there is no package specifier to match on:
 * call sites reach it through the `@/` alias or a relative path, and the
 * importing file is what makes a relative one answerable.
 */
function isAdsSpecifier(specifier, importer) {
  let resolved;
  if (specifier.startsWith("@/")) {
    resolved = path.posix.join("src", specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    resolved = path.posix.normalize(
      path.posix.join(path.posix.dirname(importer), specifier),
    );
  } else {
    return false;
  }
  if (resolved.startsWith(ADS_HEADLESS_DIR)) return false;
  return resolved.startsWith(ADS_DIR);
}

/*
 * `--others --exclude-standard` alongside `--cached`, matching
 * `check-source-structure.mjs`. Without it the scan is tracked files only, and
 * a brand-new component file — exactly when someone is choosing a channel for
 * the first time — passes locally and fails in CI once it is committed. The
 * guard has to answer for the file in front of you.
 */
function repositoryFiles() {
  return execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    {
      cwd: rootDir,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  )
    .split("\0")
    .filter(Boolean)
    .filter((file) => SCANNED(file));
}

/**
 * `sx` is ADS's `stylex.props(...).className` helper. A call to it inside a
 * `className` expression is the signature this guard looks for — including
 * through `cx(...)`, which only concatenates, and through a local `const`, so
 * hoisting the call one line up does not hide it.
 */
function containsSxCall(node, localSxNames, namespaces = new Set()) {
  let found = false;
  const walk = (current) => {
    if (found) return;
    if (ts.isCallExpression(current)) {
      const callee = current.expression;
      const direct = ts.isIdentifier(callee) && localSxNames.has(callee.text);
      // `import * as ads from "@delightai/ads"` → `ads.sx(...)`.
      const qualified =
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        namespaces.has(callee.expression.text) &&
        callee.name.text === "sx";
      if (direct || qualified) {
        found = true;
        return;
      }
    }
    ts.forEachChild(current, walk);
  };
  walk(node);
  return found;
}

function collectAdsBindings(sourceFile) {
  // `ts.createSourceFile` is handed the repository-relative path, which is what
  // a relative import specifier has to be resolved against.
  const relativeFileName = sourceFile.fileName;
  const components = new Set();
  const sxNames = new Set();
  const namespaces = new Set();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const specifier = statement.moduleSpecifier;
    if (!ts.isStringLiteral(specifier)) continue;
    if (!isAdsSpecifier(specifier.text, relativeFileName)) continue;

    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        const imported = (element.propertyName ?? element.name).text;
        const local = element.name.text;
        if (imported === "sx") sxNames.add(local);
        // A component tag is capitalised; `sx`, `cx` and hooks are not.
        else if (/^[A-Z]/.test(imported)) components.add(local);
      }
    }
    /*
     * `import * as ads from "@delightai/ads"` reaches both halves through one
     * binding: `<ads.Button>` is an ADS element and `ads.sx(...)` is the helper.
     * No file spells it this way today; it is here so that spelling it is not a
     * way past the guard.
     */
    if (bindings && ts.isNamespaceImport(bindings)) {
      namespaces.add(bindings.name.text);
      components.add(bindings.name.text);
    }
    if (statement.importClause?.name) {
      components.add(statement.importClause.name.text);
    }
  }

  return { components, namespaces, sxNames };
}

/**
 * Resolve `className={rowClass}` one hop, so that lifting the call into a
 * `const` on the line above is not a way past the guard.
 */
function buildLocalAliases(sourceFile, sxNames, namespaces) {
  const aliases = new Map();
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      containsSxCall(node.initializer, sxNames, namespaces)
    ) {
      aliases.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return aliases;
}

function tagRootName(tagName) {
  let current = tagName;
  while (ts.isPropertyAccessExpression(current)) current = current.expression;
  return ts.isIdentifier(current) ? current.text : null;
}

/*
 * One deliberate exemption, because there is exactly one honest reason to write
 * the broken channel: a fixture whose job is to render it and prove it loses.
 * `apps/docs/src/fixtures/CascadeLayerFixture.tsx` carries the `override-class`
 * probe that `scripts/cascade-probes.mjs` measures, and a guard with no way to
 * say "this one is the specimen" would have had me quietly rewrite the probe
 * into a copy of its own control — which is what the migration did before this
 * escape hatch existed.
 *
 * A reason is required, and every use is printed on success, so an exemption
 * cannot accumulate unread the way a silent skip list does.
 */
const ALLOW = /ads-style-channel-allow:\s*(\S[^*]*?)\s*(?:\*\/|\}|$)/;

function allowanceFor(sourceFile, source, node) {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
  const lines = source.split(/\r?\n/);
  for (let index = line; index >= 0 && index > line - 3; index--) {
    const match = ALLOW.exec(lines[index] ?? "");
    if (match) return match[1];
  }
  return null;
}

const violations = [];
const allowed = [];

for (const file of repositoryFiles()) {
  const source = readFileSync(path.join(rootDir, file), "utf8");
  // Cheap reject: no `sx(` anywhere means nothing to find.
  if (!source.includes("sx(")) continue;

  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const { components, namespaces, sxNames } = collectAdsBindings(sourceFile);
  if (components.size === 0 || (sxNames.size === 0 && namespaces.size === 0))
    continue;
  const aliases = buildLocalAliases(sourceFile, sxNames, namespaces);

  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const rootName = tagRootName(node.tagName);
      if (rootName && components.has(rootName)) {
        for (const attribute of node.attributes.properties) {
          if (!ts.isJsxAttribute(attribute)) continue;
          if (attribute.name.getText() !== "className") continue;
          const initializer = attribute.initializer;
          if (
            !initializer ||
            !ts.isJsxExpression(initializer) ||
            !initializer.expression
          ) {
            continue;
          }

          const expression = initializer.expression;
          const target =
            ts.isIdentifier(expression) && aliases.has(expression.text)
              ? aliases.get(expression.text)
              : expression;

          if (!containsSxCall(target, sxNames, namespaces)) continue;

          const { line } = sourceFile.getLineAndCharacterOfPosition(
            node.getStart(),
          );
          const reason = allowanceFor(sourceFile, source, attribute);
          if (reason) {
            allowed.push({ file, line: line + 1, reason });
            continue;
          }
          violations.push({
            file,
            line: line + 1,
            tag: node.tagName.getText(),
            expression: expression.getText().replace(/\s+/g, " ").slice(0, 72),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

if (violations.length > 0) {
  console.error(
    `Style-channel check failed: ${violations.length} StyleX style(s) passed to an ADS component through \`className\`.\n`,
  );
  for (const violation of violations) {
    console.error(
      `  ${violation.file}:${violation.line}  <${violation.tag} className={${violation.expression}}>`,
    );
  }
  console.error(
    "\n`className` is a hook/test-id channel on an ADS component, not a styling one.\n" +
      "StyleX passed this way is settled by sheet emission order, which is fixed\n" +
      "globally per declaration — so it is decided per property, and two\n" +
      "properties in the same object can go opposite ways. Some of these apply,\n" +
      "some are silently dropped, and the call site cannot tell you which.\n\n" +
      "Use `xstyle`, which the component merges last through `stylex.props()`:\n\n" +
      "  -  <Button className={sx(styles.wide)} />\n" +
      "  +  <Button xstyle={styles.wide} />\n" +
      "  -  <Card className={sx(styles.a, styles.b)} />\n" +
      "  +  <Card xstyle={[styles.a, styles.b]} />\n\n" +
      "Keep a hook or test id where it is:\n\n" +
      '  -  <Card className={cx(sx(styles.a), "js-target")} />\n' +
      '  +  <Card className="js-target" xstyle={styles.a} />\n\n' +
      "If the component takes no `xstyle`, add `XstyleProp` to it in\n" +
      "`packages/design-system` rather than styling it through `className`.\n" +
      "See docs/design-system/README.md → “Style channels”.",
  );
  process.exit(1);
}

console.log(
  "Style-channel check passed: no StyleX styles reach an ADS component through `className`.",
);
for (const entry of allowed) {
  console.log(`  allowed  ${entry.file}:${entry.line} — ${entry.reason}`);
}
