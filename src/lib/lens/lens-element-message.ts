// ---------------------------------------------------------------------------
// Format element picker result into an AI-friendly chat message
// Includes search hints so the AI agent can locate the source file.
// ---------------------------------------------------------------------------

import type {
  ElementPickerResult,
  LensAnnotation,
  LensSourceMappingConfig,
} from "./lens.types";

const MAX_DISPLAY_CLASSES = 6;
const MAX_DISPLAY_TEXT_LENGTH = 180;
const MAX_STYLE_SUMMARY_ITEMS = 8;
const CORE_STYLE_KEYS = [
  "display",
  "position",
  "fontSize",
  "color",
  "backgroundColor",
  "visibleBackgroundColor",
  "padding",
  "margin",
  "width",
  "height",
  "fontWeight",
  "borderRadius",
  "opacity",
] as const;

function truncateText(
  value: string,
  maxLength = MAX_DISPLAY_TEXT_LENGTH,
): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength - 3)}...`;
}

function formatClassSummary(classList: string[]): string | null {
  if (classList.length === 0) {
    return null;
  }

  const visible = classList.slice(0, MAX_DISPLAY_CLASSES);
  const suffix =
    classList.length > visible.length
      ? ` (+${classList.length - visible.length} more)`
      : "";
  return `${visible.map((className) => `\`.${className}\``).join(", ")}${suffix}`;
}

function formatElementIdentity(result: ElementPickerResult): string {
  const id = result.id ? `#${result.id}` : "";
  const classes = result.classList
    .slice(0, 3)
    .map((className) => `.${className}`)
    .join("");
  return `<${result.tagName}${id}${classes}>`;
}

function isInformativeStyleValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized !== "" &&
    normalized !== "none" &&
    normalized !== "normal" &&
    normalized !== "auto" &&
    normalized !== "initial" &&
    normalized !== "inherit"
  );
}

function formatStyleSummary(styles: Record<string, string>): string | null {
  const entries: Array<[string, string]> = [];
  for (const key of CORE_STYLE_KEYS) {
    const value = styles[key];
    if (typeof value === "string" && isInformativeStyleValue(value)) {
      entries.push([key, value]);
    }
    if (entries.length >= MAX_STYLE_SUMMARY_ITEMS) {
      break;
    }
  }

  if (entries.length === 0) {
    return null;
  }

  return entries
    .map(([key, value]) => `${key}: ${truncateText(value, 72)}`)
    .join("; ");
}

/**
 * Build search hint strings that help an AI agent locate the source file
 * responsible for the picked element.
 */
export function buildSearchHints(result: ElementPickerResult): string[] {
  const hints: string[] = [];

  // Distinctive class combination (skip very common utility-only combos)
  const distinctive = result.classList.filter(
    (c) =>
      ![
        "flex",
        "block",
        "inline",
        "relative",
        "absolute",
        "hidden",
        "w-full",
        "h-full",
      ].includes(c),
  );
  if (distinctive.length >= 2) {
    hints.push(`Search classes: \`${distinctive.slice(0, 4).join(".*")}\``);
  }

  // Text content (good for buttons, headings, labels)
  if (
    result.textContent &&
    result.textContent.length >= 3 &&
    result.textContent.length <= 60
  ) {
    hints.push(`Search text: \`"${result.textContent}"\``);
  }

  // ID is often unique and maps directly to JSX
  if (result.id) {
    hints.push(
      `Search id: \`id="${result.id}"\` or \`id=\\{.*${result.id}\\}\``,
    );
  }

  // Component-style class names (PascalCase or BEM-like)
  const componentClasses = result.classList.filter(
    (c) => /^[A-Z]/.test(c) || /^[a-z]+-[a-z]+-/.test(c) || c.includes("__"),
  );
  if (componentClasses.length > 0) {
    hints.push(`Likely component class: \`${componentClasses[0]}\``);
  }

  return hints;
}

/**
 * Build a React source location hint from _debugSource data.
 */
export function buildDebugSourceHint(
  result: ElementPickerResult,
): string | null {
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
    `- Selector: \`${result.selector}\``,
    `- Element: \`${formatElementIdentity(result)}\``,
    `- Position: (${result.boundingBox.x}, ${result.boundingBox.y}) ${result.boundingBox.width}x${result.boundingBox.height}`,
  ];

  if (result.id) {
    lines.push(`- ID: \`#${result.id}\``);
  }

  const classSummary = formatClassSummary(result.classList);
  if (classSummary) {
    lines.push(`- Classes: ${classSummary}`);
  }

  const styleSummary = formatStyleSummary(result.computedStyles);
  if (styleSummary) {
    lines.push(`- Key styles: \`${styleSummary}\``);
  }

  if (result.textContent) {
    lines.push(`- Text: "${truncateText(result.textContent)}"`);
  }

  const debugSourceHint = buildDebugSourceHint(result);
  if (debugSourceHint && config?.reactDebugSource !== false) {
    lines.push(`- ${debugSourceHint}`);
  }

  if (result.componentNameChain && result.componentNameChain.length > 0) {
    lines.push(
      `- React components: ${result.componentNameChain
        .slice(0, 8)
        .map((name) => `\`${name}\``)
        .join(" → ")}`,
    );
  }

  if (config?.heuristic !== false) {
    const hints = buildSearchHints(result);
    if (hints.length > 0) {
      lines.push(``, `Source search hints:`, ...hints.map((h) => `- ${h}`));
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
    componentNameChain: annotation.componentNameChain,
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
          (edit) =>
            `- ${edit.property}: \`${edit.before}\` → \`${edit.after}\``,
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

export function formatAnnotationsDisplayForChat(
  annotations: LensAnnotation[],
): string {
  const lines: string[] = [
    `[Lens Visual Comments]`,
    ``,
    `The user left ${annotations.length} visual comment${annotations.length === 1 ? "" : "s"} on the live page. Each comment is paired with an attached screenshot of the selected region.`,
  ];

  for (const annotation of annotations) {
    lines.push(
      ``,
      `## ${annotation.pin}. Visual Comment`,
      `**Comment:** ${annotation.comment}`,
    );

    if (annotation.styleEdits && annotation.styleEdits.length > 0) {
      lines.push(
        `**Style edits:**`,
        ...annotation.styleEdits.map(
          (edit) =>
            `- ${edit.property}: \`${edit.before}\` -> \`${edit.after}\``,
        ),
      );
    }
  }

  return lines.join("\n");
}
