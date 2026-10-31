/** Literal spacing debt, keyed by declaration rather than a per-file quota.
 * Product spacing uses ADS space tokens or densityPad. Zero, percentages and
 * auto remain valid. ADS owns the underlying scale and is outside this scan.
 * This checks declarations, not rendered alignment or arbitrary JS evaluation.
 */
import { readFileSync, readdirSync } from "node:fs";
import { sep } from "node:path";
import ts from "typescript";

const SPACING_PROPERTY = /^(?:(?:padding|margin)(?:Top|Right|Bottom|Left|Block|BlockStart|BlockEnd|Inline|InlineStart|InlineEnd)?|gap|rowGap|columnGap)$/;
const LENGTH = /(?<![\w.])-?(?:\d*\.)?\d+(?:px|rem|em|pt|pc|cm|mm|in)\b/gi;
const printer = ts.createPrinter({ removeComments: true });

function name(node) {
  if (!node.name) return null;
  return ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)
    ? node.name.text : node.name.getText();
}

function hasLiteral(node) {
  if (ts.isNumericLiteral(node)) return Number(node.text) !== 0;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
    return [...node.text.matchAll(LENGTH)].some(([length]) => Number.parseFloat(length) !== 0);
  }
  if (ts.isConditionalExpression(node)) return hasLiteral(node.whenTrue) || hasLiteral(node.whenFalse);
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return hasLiteral(node.body);
  // Named tokens and density steps are authoritative. Do not inspect arguments
  // of calls (e.g. a token resolver), or property names in conditional maps.
  if (ts.isCallExpression(node) || ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) return false;
  if (ts.isObjectLiteralExpression(node))
    return node.properties.some((branch) => ts.isPropertyAssignment(branch) && hasLiteral(branch.initializer));
  let found = false;
  ts.forEachChild(node, (child) => { if (hasLiteral(child)) found = true; });
  return found;
}

function owner(node) {
  const parts = [];
  for (let parent = node; parent; parent = parent.parent) {
    if (ts.isPropertyAssignment(parent) || ts.isVariableDeclaration(parent)) {
      const part = name(parent);
      if (part) parts.unshift(part);
    }
  }
  return parts.join(".");
}

/** Return findings with stable semantic identities; moving a line is harmless. */
export function spacingLiterals(srcRoot) {
  const findings = [];
  for (const relative of readdirSync(srcRoot, { recursive: true }).sort()) {
    const path = relative.split(sep).join("/");
    if (!/\.tsx?$/.test(path) || path.startsWith("components/ads/")) continue;
    const source = readFileSync(new URL(relative, srcRoot), "utf8");
    const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true,
      path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    function visit(node) {
      if (ts.isPropertyAssignment(node) && SPACING_PROPERTY.test(name(node) ?? "")) {
        if (hasLiteral(node.initializer)) {
          const value = printer.printNode(ts.EmitHint.Expression, node.initializer, tree);
          findings.push({ path: `src/${path}`, line: tree.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            declaration: `${owner(node)} = ${value}` });
        }
        return;
      }
      ts.forEachChild(node, visit);
    }
    visit(tree);
  }
  return findings;
}

export function spacingInventory(findings) {
  const files = {};
  for (const finding of findings) {
    const entries = files[finding.path] ??= {};
    entries[finding.declaration] = (entries[finding.declaration] ?? 0) + 1;
  }
  return files;
}

/** Exact declarations must match: removing debt cannot buy a new exception. */
export function spacingFailures(findings, baseline) {
  const current = spacingInventory(findings);
  const failures = [];
  for (const finding of findings) {
    const count = current[finding.path][finding.declaration];
    if (count > (baseline[finding.path]?.[finding.declaration] ?? 0))
      failures.push(`${finding.path}:${finding.line}: literal spacing \`${finding.declaration}\`; use ADS space tokens or densityPad`);
  }
  for (const [path, declarations] of Object.entries(baseline))
    for (const [declaration, count] of Object.entries(declarations))
      if ((current[path]?.[declaration] ?? 0) < count)
        failures.push(`${path}: remove or lower stale spacing debt \`${declaration}\` in config/spacing-ratchet.json`);
  return [...new Set(failures)];
}
