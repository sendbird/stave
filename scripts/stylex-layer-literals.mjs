/**
 * Raw stacking numbers in product StyleX.
 *
 * `zIndex: 10` says nothing about what the surface has to beat, so two such
 * numbers written in different files can only be compared by reading both.
 * The host owns one vocabulary for this: the `layers` bands and the
 * `localStack` rungs in `src/lib/ui-layers.stylex.ts`, plus ADS's own
 * `--ads-z-index-*` tokens. A new surface names the rung it sits on, so its
 * position is decided where the other rungs are, not where it is written.
 *
 * What is flagged: a `zIndex` property whose value is a non-zero numeric
 * literal, directly or inside a conditional map
 * (`zIndex: { default: 1, ":hover": 2 }`), in any `.ts`/`.tsx` under `src/`
 * except the installed ADS copy and the tokens file itself. `zIndex: 0` is
 * left alone — it opens a stacking context and claims no order, which is the
 * one number that has no rung to name.
 *
 * Escape: `// layer-ok: <reason>` on the property's line or the line above.
 * A reason is required and every use is printed on success, so an exemption
 * cannot accumulate unread.
 */
import { readFileSync, readdirSync } from "node:fs";
import { sep } from "node:path";
import ts from "typescript";

const ALLOW = /layer-ok:\s*(\S[^*]*?)\s*(?:\*\/|$)/;

function isScanned(path) {
  if (!/\.tsx?$/.test(path)) return false;
  if (path.startsWith("components/ads/")) return false;
  if (path === "lib/ui-layers.stylex.ts") return false;
  return true;
}

function numericValue(node) {
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  ) {
    return -Number(node.operand.text);
  }
  return null;
}

function propertyName(node) {
  const name = node.name;
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name)) return name.text;
  return null;
}

/**
 * Scan `srcRoot` (a `file:` URL for `src/`) and report every raw stacking
 * number as `{ path, line, value }`, with allowed ones listed separately.
 */
export function layerLiterals(srcRoot) {
  const violations = [];
  const allowed = [];
  for (const relative of readdirSync(srcRoot, { recursive: true })) {
    const path = relative.split(sep).join("/");
    if (!isScanned(path)) continue;
    const source = readFileSync(new URL(relative, srcRoot), "utf8");
    if (!source.includes("zIndex")) continue;
    const tree = ts.createSourceFile(
      path,
      source,
      ts.ScriptTarget.Latest,
      true,
      path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const lines = source.split(/\r?\n/);
    const report = (node, value) => {
      const { line } = tree.getLineAndCharacterOfPosition(node.getStart(tree));
      const reason =
        ALLOW.exec(lines[line] ?? "")?.[1] ?? ALLOW.exec(lines[line - 1] ?? "")?.[1] ?? null;
      const entry = { path: `src/${path}`, line: line + 1, value };
      if (reason) allowed.push({ ...entry, reason });
      else violations.push(entry);
    };
    const visit = (node) => {
      if (ts.isPropertyAssignment(node) && propertyName(node) === "zIndex") {
        const direct = numericValue(node.initializer);
        if (direct !== null) {
          if (direct !== 0) report(node, direct);
        } else if (ts.isObjectLiteralExpression(node.initializer)) {
          for (const branch of node.initializer.properties) {
            if (!ts.isPropertyAssignment(branch)) continue;
            const value = numericValue(branch.initializer);
            if (value !== null && value !== 0) report(branch, value);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }
  return { violations, allowed };
}
