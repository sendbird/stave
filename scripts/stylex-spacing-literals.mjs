/**
 * Off-grid spacing in product StyleX.
 *
 * Stave spaces on a 4px grid: the `--ads-space-*` tokens (4, 8, 12, 16, …),
 * which the Compact density preset moves together, and `densityPad` for a
 * component's own density. A literal 6 or 10 on a padding, margin or gap sits
 * between two steps, so it reads as a near miss of the grid and never follows
 * the preset. Most of them predate the tokens; the count is a ratchet so the
 * number can only fall (`config/spacing-ratchet.json`, checked by
 * `scripts/check-design-system-migration.mjs`).
 *
 * What is counted: a padding, margin or gap property (`padding`, `paddingBlock`,
 * `marginInlineStart`, `rowGap`, …) whose value is the numeric literal 6 or 10
 * (or its negative), directly or inside a conditional map
 * (`gap: { default: 6, "@media …": 10 }`), and every standalone `6px` or `10px`
 * in a string value (`"6px 10px"` counts twice), in any `.ts`/`.tsx` under
 * `src/` except the installed ADS copy. Positioning (`top`, `inset*`) is not
 * spacing and is not counted.
 */
import { readFileSync, readdirSync } from "node:fs";
import { sep } from "node:path";
import ts from "typescript";

const SPACING_PROPERTY =
  /^(?:(?:padding|margin)(?:Top|Right|Bottom|Left|Block|BlockStart|BlockEnd|Inline|InlineStart|InlineEnd)?|gap|rowGap|columnGap)$/;
const OFF_GRID = new Set([6, 10]);
const OFF_GRID_PX = /(?<![\d.])-?(?:6|10)px\b/g;

function isScanned(path) {
  return /\.tsx?$/.test(path) && !path.startsWith("components/ads/");
}

function propertyName(node) {
  const name = node.name;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return null;
}

function countValue(node) {
  if (ts.isNumericLiteral(node)) return OFF_GRID.has(Number(node.text)) ? 1 : 0;
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  ) {
    return OFF_GRID.has(Number(node.operand.text)) ? 1 : 0;
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return (node.text.match(OFF_GRID_PX) ?? []).length;
  }
  if (ts.isObjectLiteralExpression(node)) {
    let count = 0;
    for (const branch of node.properties) {
      if (ts.isPropertyAssignment(branch)) count += countValue(branch.initializer);
    }
    return count;
  }
  return 0;
}

/**
 * Scan `srcRoot` (a `file:` URL for `src/`) and return the off-grid spacing
 * count of every file that has any, keyed `src/<path>`.
 */
export function spacingLiterals(srcRoot) {
  const counts = new Map();
  for (const relative of readdirSync(srcRoot, { recursive: true })) {
    const path = relative.split(sep).join("/");
    if (!isScanned(path)) continue;
    const source = readFileSync(new URL(relative, srcRoot), "utf8");
    if (!/\b(?:6|10)(?:px)?\b/.test(source)) continue;
    const tree = ts.createSourceFile(
      path,
      source,
      ts.ScriptTarget.Latest,
      true,
      path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    let count = 0;
    const visit = (node) => {
      if (ts.isPropertyAssignment(node)) {
        const name = propertyName(node);
        if (name && SPACING_PROPERTY.test(name)) {
          count += countValue(node.initializer);
          return;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
    if (count > 0) counts.set(`src/${path}`, count);
  }
  return counts;
}
