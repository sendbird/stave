// ---------------------------------------------------------------------------
// Format element picker result into an AI-friendly chat message
// Includes search hints so the AI agent can locate the source file.
// ---------------------------------------------------------------------------

import type {
  ElementPickerResult,
  LensAnnotation,
  LensSourceMappingConfig,
} from "./lens.types";

/**
 * Build search hint strings that help an AI agent locate the source file
 * responsible for the picked element.
 */
export function buildSearchHints(result: ElementPickerResult): string[] {
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
export function buildDebugSourceHint(result: ElementPickerResult): string | null {
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

function annotationToElementResult(
  annotation: LensAnnotation,
): ElementPickerResult | null {
  if (!annotation.selector || !annotation.tagName) {
    return null;
  }

  return {
    selector: annotation.selector,
    tagName: annotation.tagName,
    id: annotation.elementId ?? "",
    classList: annotation.classList ?? [],
    boundingBox: annotation.rect,
    computedStyles: annotation.computedStyles ?? {},
    outerHTML: annotation.outerHTML ?? "",
    textContent: annotation.textContent ?? "",
    debugSource: annotation.debugSource,
  };
}

export function formatAnnotationsForChat(
  annotations: LensAnnotation[],
  config?: LensSourceMappingConfig,
): string {
  const lines: string[] = [
    `[Lens Visual Comments]`,
    ``,
    `The user left ${annotations.length} visual comment${annotations.length === 1 ? "" : "s"} on the live page.`,
  ];

  for (const annotation of annotations) {
    lines.push(
      ``,
      `## ${annotation.pin}. ${annotation.kind === "area" ? "Area" : "Element"} Comment`,
      `**Comment:** ${annotation.comment}`,
      `**Position:** (${annotation.rect.x}, ${annotation.rect.y}) ${annotation.rect.width}x${annotation.rect.height}`,
    );

    if (annotation.styleEdits && annotation.styleEdits.length > 0) {
      lines.push(
        `**Style edits:**`,
        ...annotation.styleEdits.map(
          (edit) => `- ${edit.property}: \`${edit.before}\` → \`${edit.after}\``,
        ),
      );
    }

    const elementResult = annotationToElementResult(annotation);
    if (elementResult) {
      lines.push(
        `**Selector:** \`${elementResult.selector}\``,
        `**Tag:** \`<${elementResult.tagName}>\``,
      );

      if (elementResult.id) {
        lines.push(`**ID:** \`#${elementResult.id}\``);
      }

      if (elementResult.classList.length > 0) {
        lines.push(
          `**Classes:** ${elementResult.classList.map((c) => `\`.${c}\``).join(", ")}`,
        );
      }

      const debugSourceHint = buildDebugSourceHint(elementResult);
      if (debugSourceHint && config?.reactDebugSource !== false) {
        lines.push(`**${debugSourceHint}**`);
      }

      if (elementResult.textContent) {
        lines.push(`**Text:** "${elementResult.textContent}"`);
      }

      if (elementResult.outerHTML) {
        lines.push(`**HTML:**`, "```html", elementResult.outerHTML, "```");
      }

      if (config?.heuristic !== false) {
        const hints = buildSearchHints(elementResult);
        if (hints.length > 0) {
          lines.push(
            `**Source search hints:**`,
            ...hints.map((hint) => `- ${hint}`),
          );
        }
      }
    }
  }

  return lines.join("\n");
}
