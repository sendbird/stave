import {
  bandRadius,
  capBand,
  hasBorder,
  isChip,
  isTransparentColor,
  mergeBands,
  type Box,
  type SkeletonRect,
} from "./Skeleton.measured.geometry";

/**
 * The DOM walk behind `Skeleton.Measured`: read the invisible sample render and
 * return the shapes to draw over it. Everything it decides is in the rules
 * below; the arithmetic is `Skeleton.measured.geometry.ts`.
 *
 * Per element, first match wins:
 *
 * 1. `data-skeleton="ignore"` → nothing; `"static"` → nothing (the stylesheet
 *    shows it as-is); `"block"` → one shape for the whole element.
 * 2. Hidden or empty → nothing.
 * 3. Past `maxDepth` → one shape (the cap that keeps a deep tree bounded).
 * 4. Media (`img`, `svg`, `video`, `canvas`, `picture`, `[role=img]`) and
 *    controls (`button`, `input`, `select`, `textarea`, control roles,
 *    `[data-aui-control]`) → one shape in the element's own radius. A control's
 *    label is not drawn on top of it: the shape is the control.
 * 5. A chip: a filled or fully outlined box no taller than an avatar (a
 *    Badge, an Avatar, a tag), or any painted inline box → one shape.
 * 6. Any other painted box (a card, a row with a divider) → a static frame
 *    wearing the element's own classes, then its children.
 * 7. Text → one cap band per line fragment (`Range.getClientRects`), joined
 *    into one bar per visual line.
 */

const MEDIA = new Set(["CANVAS", "IFRAME", "IMG", "PICTURE", "SVG", "VIDEO"]);
const CONTROLS = new Set(["BUTTON", "INPUT", "SELECT", "TEXTAREA"]);
const CONTROL_ROLES = new Set([
  "button",
  "checkbox",
  "combobox",
  "menuitem",
  "option",
  "radio",
  "searchbox",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "textbox",
]);

export type MeasureOptions = {
  /** Deepest element that is still walked into. @default 12 */
  maxDepth?: number;
  /** Most shapes before falling back to coarse blocks. @default 300 */
  maxRects?: number;
};

export type MeasureResult = {
  /** True when the cap was hit and the shapes are the coarse fallback. */
  coarse: boolean;
  rects: SkeletonRect[];
  size: { height: number; width: number };
};

export function measureSkeleton(
  root: HTMLElement,
  ghost: HTMLElement,
  { maxDepth = 12, maxRects = 300 }: MeasureOptions = {},
): MeasureResult {
  const origin = root.getBoundingClientRect();
  const size = { height: origin.height, width: origin.width };
  const fine = walkGhost(ghost, origin, maxDepth);
  if (fine.length <= maxRects) return { coarse: false, rects: fine, size };
  // Over the cap: the same walk, stopped two levels down, draws the big
  // regions as blocks. Still honest about where content goes, at a cost the
  // page can afford.
  return { coarse: true, rects: walkGhost(ghost, origin, 2), size };
}

function walkGhost(ghost: HTMLElement, origin: DOMRect, maxDepth: number) {
  const shapes: SkeletonRect[] = [];
  const bands: Box[] = [];
  const toBox = (rect: DOMRect | DOMRectReadOnly): Box => ({
    height: rect.height,
    width: rect.width,
    x: rect.left - origin.left,
    y: rect.top - origin.top,
  });
  const shape = (element: Element, style: CSSStyleDeclaration) => {
    const box = toBox(element.getBoundingClientRect());
    if (box.width < 0.5 || box.height < 0.5) return;
    shapes.push({ ...box, kind: "shape", radius: style.borderRadius });
  };

  const walk = (element: Element, depth: number) => {
    const hint = element.getAttribute("data-skeleton");
    if (hint === "ignore" || hint === "static") return;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "collapse") return;
    if (style.display !== "contents" && element.getClientRects().length === 0)
      return;
    if (hint === "block" || depth > maxDepth) {
      shape(element, style);
      return;
    }
    const tag = element.tagName.toUpperCase();
    const role = element.getAttribute("role");
    if (
      MEDIA.has(tag) ||
      role === "img" ||
      CONTROLS.has(tag) ||
      (role != null && CONTROL_ROLES.has(role)) ||
      element.hasAttribute("data-aui-control")
    ) {
      shape(element, style);
      return;
    }
    const filled = !isTransparentColor(style.backgroundColor);
    const widths = [
      style.borderTopWidth,
      style.borderRightWidth,
      style.borderBottomWidth,
      style.borderLeftWidth,
    ];
    const edges = [
      style.borderTopStyle,
      style.borderRightStyle,
      style.borderBottomStyle,
      style.borderLeftStyle,
    ];
    const outlined = hasBorder(widths, edges);
    const box = element.getBoundingClientRect();
    if (
      isChip({
        boxed:
          filled ||
          edges.every((edge, index) => hasBorder([widths[index]!], [edge])),
        display: style.display,
        height: box.height,
        painted: filled || outlined,
      })
    ) {
      shape(element, style);
      return;
    }
    if ((filled || outlined) && depth > 0 && element instanceof HTMLElement) {
      shapes.push({
        ...toBox(box),
        kind: "frame",
        // The element's own classes, not its computed colours: a frame keeps
        // following the theme (a colour copied in light stays light in dark).
        paint: { className: element.className },
      });
    }
    const fontSize = parseFloat(style.fontSize) || 14;
    for (const child of element.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (!child.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(child);
        for (const fragment of range.getClientRects()) {
          if (fragment.width < 0.5) continue;
          bands.push(capBand(toBox(fragment), fontSize));
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child as Element, depth + 1);
      }
    }
  };

  walk(ghost, 0);
  const frames = shapes.filter((rect) => rect.kind === "frame");
  const blocks = shapes.filter((rect) => rect.kind !== "frame");
  const lines: SkeletonRect[] = mergeBands(bands).map((band) => ({
    ...band,
    kind: "band",
    radius: bandRadius(band.height),
  }));
  // Frames first: they paint under the sample, the placeholders over it.
  return [...frames, ...blocks, ...lines];
}
