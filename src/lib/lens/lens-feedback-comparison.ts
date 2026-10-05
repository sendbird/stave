import { i18n } from "@/i18n/runtime";
import type { LensAnnotation } from "./lens.types";

export function comparisonScript(annotation: LensAnnotation): string {
  const messages = {
    viewportMismatch: i18n.t("lens:comparison.viewportMismatch", { width: annotation.review.page.viewport.width, height: annotation.review.page.viewport.height }),
    targetMissing: i18n.t("lens:comparison.targetMissing"),
    identityChanged: i18n.t("lens:comparison.identityChanged"),
    scrollPosition: i18n.t("lens:comparison.scrollPosition"),
    targetNotVisible: i18n.t("lens:comparison.targetNotVisible"),
  };
  return `(() => {
    const messages = ${JSON.stringify(messages)};
    const original = ${JSON.stringify(annotation.review)};
    const area = ${JSON.stringify(annotation.kind === "area")};
    if (innerWidth !== original.page.viewport.width || innerHeight !== original.page.viewport.height || devicePixelRatio !== original.page.viewport.devicePixelRatio)
      return { error: messages.viewportMismatch };
    let rect = original.anchor.bounds;
    if (!area) {
      const nodes = document.querySelectorAll(original.anchor.selector || "");
      if (nodes.length !== 1) return { error: messages.targetMissing };
      const element = nodes[0];
      const identity = original.anchor.element;
      if (identity && (element.tagName.toLowerCase() !== identity.tagName.toLowerCase() || (identity.id && element.id !== identity.id)))
        return { error: messages.identityChanged };
      const box = element.getBoundingClientRect();
      rect = { x: box.x, y: box.y, width: box.width, height: box.height };
    } else if (scrollX !== original.page.scroll.x || scrollY !== original.page.scroll.y) {
      return { error: messages.scrollPosition };
    }
    if (rect.width <= 0 || rect.height <= 0 || rect.x < 0 || rect.y < 0 || rect.x + rect.width > innerWidth || rect.y + rect.height > innerHeight)
      return { error: messages.targetNotVisible };
    return { rect };
  })()`;
}
