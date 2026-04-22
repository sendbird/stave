// ---------------------------------------------------------------------------
// Format element picker result into an AI-friendly chat message
// Includes search hints so the AI agent can locate the source file.
// ---------------------------------------------------------------------------

import type { ElementPickerResult, LensSourceMappingConfig } from "./lens.types";

/**
 * Build search hint strings that help an AI agent locate the source file
 * responsible for the picked element.
 */
function buildSearchHints(result: ElementPickerResult): string[] {
  const hints: string[] = [];

  // Distinctive class combination (skip very common utility-only combos)
  const distinctive = result.classList.filter(
    (c) =>
      !["flex", "block", "inline", "relative", "absolute", "hidden", "w-full", "h-full"].includes(c),
  );
  if (distinctive.length >= 2) {
    hints.push(
      `Search classes: \`${distinctive.slice(0, 4).join(".*")}\``,
    );
  }

  // Text content (good for buttons, headings, labels)
  if (result.textContent && result.textContent.length >= 3 && result.textContent.length <= 60) {
    hints.push(`Search text: \`"${result.textContent}"\``);
  }

  // ID is often unique and maps directly to JSX
  if (result.id) {
    hints.push(`Search id: \`id="${result.id}"\` or \`id=\\{.*${result.id}\\}\``);
  }

  // Component-style class names (PascalCase or BEM-like)
  const componentClasses = result.classList.filter(
    (c) => /^[A-Z]/.test(c) || /^[a-z]+-[a-z]+-/.test(c) || c.includes("__"),
  );
  if (componentClasses.length > 0) {
    hints.push(
      `Likely component class: \`${componentClasses[0]}\``,
    );
  }

  return hints;
}

/**
 * Build a React source location hint from _debugSource data.
 */
function buildDebugSourceHint(result: ElementPickerResult): string | null {
  if (!result.debugSource) return null;
  const { fileName, lineNumber, columnNumber } = result.debugSource;
  const loc =
    columnNumber != null
      ? `${fileName}:${lineNumber}:${columnNumber}`
      : `${fileName}:${lineNumber}`;
  return `React source: \`${loc}\``;
}

export function formatElementForChat(
  result: ElementPickerResult,
  config?: LensSourceMappingConfig,
): string {
  const lines: string[] = [
    `[Lens Element Selection]`,
    ``,
    `**Selector:** \`${result.selector}\``,
    `**Tag:** \`<${result.tagName}>\``,
  ];

  if (result.id) {
    lines.push(`**ID:** \`#${result.id}\``);
  }

  if (result.classList.length > 0) {
    lines.push(
      `**Classes:** ${result.classList.map((c) => `\`.${c}\``).join(", ")}`,
    );
  }

  const { boundingBox: bb } = result;
  lines.push(`**Position:** (${bb.x}, ${bb.y}) ${bb.width}x${bb.height}`);

  // Show relevant styles in a compact format
  const styleEntries = Object.entries(result.computedStyles).filter(
    ([, v]) => v && v !== "none" && v !== "normal" && v !== "auto",
  );
  if (styleEntries.length > 0) {
    const formatted = styleEntries.map(([k, v]) => `${k}: ${v}`).join("; ");
    lines.push(`**Styles:** \`${formatted}\``);
  }

  if (result.textContent) {
    lines.push(`**Text:** "${result.textContent}"`);
  }

  // React _debugSource (exact file:line when available)
  const debugSourceHint = buildDebugSourceHint(result);
  if (debugSourceHint && (config?.reactDebugSource !== false)) {
    lines.push(``, `**${debugSourceHint}**`);
  }

  lines.push(``, `**HTML:**`, "```html", result.outerHTML, "```");

  // Heuristic search hints for AI source-code lookup
  if (config?.heuristic !== false) {
    const hints = buildSearchHints(result);
    if (hints.length > 0) {
      lines.push(
        ``,
        `**Source search hints** (use grep/file search to find the component):`,
        ...hints.map((h) => `- ${h}`),
      );
    }
  }

  return lines.join("\n");
}
