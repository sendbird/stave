import ts from "typescript";

/** Inventory literal metrics while leaving structural dimensions and data alone. */
export function tokenLiterals(source, path = "component.tsx") {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const counts = {};
  const add = (rule) => { counts[rule] = (counts[rule] ?? 0) + 1; };
  const visit = (node) => {
    if (ts.isPropertyAssignment(node)) {
      const name = node.name.getText(file).replace(/["']/g, "");
      const value = node.initializer.getText(file);
      if (/^(height|width|minHeight|minWidth|blockSize|inlineSize)$/.test(name) && /^(24|28|32|36)$/.test(value)) add("control-metric");
      if (/^(height|width|blockSize|inlineSize)$/.test(name) && /^(12|14|16|18|20)$/.test(value)) add("icon-metric");
      if (name === "animationName" && /spin/i.test(value)) add("custom-spinner");
      if (name === "lineHeight" && /^(?:[\d.]+|["'][\d.]+(?:px|rem)["'])$/.test(value) && !/^(0|1)$/.test(value)) add("line-height");
      if (name === "letterSpacing" && !/vars\[/.test(value) && value !== "0") add("tracking");
      if (/Radius$/.test(name) && /^(?:[\d.]+|["'][\d.]+(?:px|rem)["'])$/.test(value) && value !== "0") add("radius");
      if (name === "color" && /color-mix/.test(value) && /text-muted/.test(value) && /transparent/.test(value)) add("faded-text");
      if (/^(color|backgroundColor|borderColor)$/.test(name) && /color-mix/.test(value) && /--aui-color-(?:warning|danger|success|info)/.test(value)) add("status-mix");
      if (name === "outlineStyle" && value === '"none"' && !/focusRing|focus-ok/.test(source)) add("focus-reset");
    }
    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(file);
      if (/^(size|strokeWidth)$/.test(name) && node.initializer && /^\{[\d.]+\}$/.test(node.initializer.getText(file))) add("icon-metric");
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return counts;
}

export function tokenRatchetFailures(actual, baseline) {
  const failures = [];
  for (const path of new Set([...Object.keys(actual), ...Object.keys(baseline)])) {
    for (const rule of new Set([...Object.keys(actual[path] ?? {}), ...Object.keys(baseline[path] ?? {})])) {
      const count = actual[path]?.[rule] ?? 0;
      const limit = baseline[path]?.[rule] ?? 0;
      if (count > limit) failures.push(`${path}: ${rule} literals ${count} exceed ${limit}; use AUI tokens`);
      if (count < limit) failures.push(`${path}: lower stale ${rule} allowance from ${limit} to ${count} in config/token-ratchet.json`);
    }
  }
  return failures;
}
