import type { LensAnnotation } from "./lens.types";

export function comparisonScript(annotation: LensAnnotation): string {
  return `(() => {
    const original = ${JSON.stringify(annotation.review)};
    const area = ${JSON.stringify(annotation.kind === "area")};
    if (innerWidth !== original.page.viewport.width || innerHeight !== original.page.viewport.height || devicePixelRatio !== original.page.viewport.devicePixelRatio)
      return { error: "Match the original viewport (" + original.page.viewport.width + " × " + original.page.viewport.height + ") before comparing." };
    let rect = original.anchor.bounds;
    if (!area) {
      const nodes = document.querySelectorAll(original.anchor.selector || "");
      if (nodes.length !== 1) return { error: "The original target is missing or ambiguous. Select it again." };
      const element = nodes[0];
      const identity = original.anchor.element;
      if (identity && (element.tagName.toLowerCase() !== identity.tagName.toLowerCase() || (identity.id && element.id !== identity.id)))
        return { error: "The target identity changed. Select it again." };
      const box = element.getBoundingClientRect();
      rect = { x: box.x, y: box.y, width: box.width, height: box.height };
    } else if (scrollX !== original.page.scroll.x || scrollY !== original.page.scroll.y) {
      return { error: "Return to the original scroll position before comparing this area." };
    }
    if (rect.width <= 0 || rect.height <= 0 || rect.x < 0 || rect.y < 0 || rect.x + rect.width > innerWidth || rect.y + rect.height > innerHeight)
      return { error: "Scroll the entire target into view before comparing." };
    return { rect };
  })()`;
}
