import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";

// Prefixes shared with ordinary domain vocabulary ("cursor-user", "content-type",
// "self-contained") only count when the suffix is a real Tailwind value for that
// property. Open-ended prefixes (bg-, text-, border-) stay broad because their
// value space includes arbitrary theme colors.
const constrained = Object.entries({
  cursor:
    "auto|default|pointer|wait|text|move|help|not-allowed|none|progress|cell|crosshair|vertical-text|alias|copy|no-drop|grab|grabbing|all-scroll|(?:col|row|n|e|s|w|ne|nw|se|sw|ew|ns|nesw|nwse)-resize|zoom-in|zoom-out",
  content: "normal|none|center|start|end|between|around|evenly|baseline|stretch",
  self: "auto|start|end|center|stretch|baseline",
  items: "start|end|center|baseline|stretch",
  justify: "normal|start|end|center|between|around|evenly|stretch|(?:items|self)-[\\w-]+",
  align: "baseline|top|middle|bottom|text-top|text-bottom|sub|super",
  flex: "\\d+|auto|initial|none|row|row-reverse|col|col-reverse|wrap|wrap-reverse|nowrap|grow(?:-0)?|shrink(?:-0)?",
  object: "contain|cover|fill|none|scale-down|bottom|center|left|right|top",
  break: "normal|words|all|keep|before|after|inside",
  whitespace: "normal|nowrap|pre|pre-line|pre-wrap|break-spaces",
  select: "none|text|all|auto",
  overflow: "(?:[xy]-)?(?:auto|hidden|clip|visible|scroll)",
}).map(([prefix, values]) => [`${prefix}-`, new RegExp(`^${prefix}-(?:${values})$`)]);
const utility = /^(?:-?(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy]|size|[hw]|min-[hw]|max-[hw]|inset(?:-[xy])?|top|bottom|left|right|z|order|col-(?:start|end|span)|row-(?:start|end|span))-(?:\d|\[|\(|auto|full|screen|dvh|svh|min|max|fit)|(?:bg|text|border|ring|outline|shadow|rounded|font|leading|tracking|opacity|translate-[xy]|scale|rotate|duration|ease|transition|animate|overflow|overscroll|object|cursor|pointer-events|select|whitespace|break|items|justify|self|content|align|flex|grid-cols|grid-rows|shrink|grow|basis)-|sr-only$|not-sr-only$|truncate$)/;
const simple = /^(?:flex|grid|block|inline|inline-flex|inline-grid|hidden|relative|absolute|fixed|sticky|isolate|border|italic|underline|antialiased|tabular-nums)$/;
// `box-sizing: border-box` is a CSS value, never a Tailwind class.
const cssValue = /^border-box$/;

function isUtility(base) {
  if (!utility.test(base) || cssValue.test(base)) return false;
  if (/[[(]/.test(base)) return true;
  const match = constrained.find(([prefix]) => base.startsWith(prefix));
  return match ? match[1].test(base) : true;
}

function baseUtility(token) {
  // Colons inside arbitrary values are CSS; only outer colons delimit variants.
  let depth = 0;
  let start = 0;
  for (let i = 0; i < token.length; i++) {
    if (token[i] === "[" || token[i] === "(") depth++;
    if (token[i] === "]" || token[i] === ")") depth--;
    if (token[i] === ":" && depth === 0) start = i + 1;
  }
  return token.slice(start).replace(/!$/, "");
}

export function utilitySites(source, path) {
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const sites = [];
  function visit(node, classContext = false) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isCallExpression(node) && /^(?:stylex\.)?(?:create|defineVars|defineConsts|keyframes)$/.test(node.expression.getText(tree))) return;
    if (ts.isJsxAttribute(node)) {
      classContext = /(?:className|ClassName)$/.test(node.name.getText(tree));
      if (!classContext) return;
    }
    if (ts.isCallExpression(node) && /^(?:cn|clsx|cx|twMerge)$/.test(node.expression.getText(tree))) classContext = true;
    if (classContext && ts.isTemplateExpression(node)) {
      sites.push({ line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1, utilities: ["interpolated-class"] });
    }
    if (ts.isStringLiteralLike(node) || (classContext && [ts.SyntaxKind.TemplateHead, ts.SyntaxKind.TemplateMiddle, ts.SyntaxKind.TemplateTail].includes(node.kind))) {
      const values = node.text.split(/\s+/).filter((token) => {
        const base = baseUtility(token);
        return isUtility(base) || (classContext && simple.test(base)) || (classContext && /^\[.+:.+\]$/.test(base));
      });
      if (values.length) sites.push({ line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1, utilities: values });
    }
    ts.forEachChild(node, (child) => visit(child, classContext));
  }
  visit(tree);
  return sites;
}

export function inventory(root = "src") {
  const result = {};
  for (const relative of readdirSync(root, { recursive: true }).sort()) {
    if (!/\.[jt]sx?$/.test(relative) || relative.startsWith("components/ads/")) continue;
    const path = `${root}/${relative}`;
    const sites = utilitySites(readFileSync(path, "utf8"), path);
    if (sites.length) result[path] = sites.reduce((total, site) => total + site.utilities.length, 0);
  }
  return result;
}
