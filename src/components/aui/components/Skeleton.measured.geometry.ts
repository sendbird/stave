/**
 * Pure geometry for `Skeleton.Measured`: everything that turns measured boxes
 * into placeholder shapes without touching the DOM, so it can be tested on its
 * own (`test/Skeleton.measured.geometry.test.ts`). The DOM walk that feeds it
 * is `Skeleton.measured.measure.ts`.
 */

/** A measured box, in CSS pixels, relative to the skeleton's own box. */
export type Box = { height: number; width: number; x: number; y: number };

/**
 * What a frame wears: the classes of the element it stands for, so its paint
 * resolves through the same tokens and follows a theme change.
 */
export type FramePaint = { className: string };

/** Tallest box still drawn as one chip-like shape: Avatar `lg`. */
export const CHIP_MAX_HEIGHT = 48;

/**
 * Whether a painted box is a chip — one placeholder shape — rather than a
 * surface to keep as a frame. A painted inline box always is; a block one is
 * when it is filled or outlined on all four sides (a Badge, an Avatar, a tag)
 * and no taller than an avatar. A bordered row (a divider on one side) or a
 * tall card stays a frame.
 */
export function isChip({
  boxed,
  display,
  height,
  painted,
}: {
  boxed: boolean;
  display: string;
  height: number;
  painted: boolean;
}): boolean {
  if (!painted) return false;
  if (display.startsWith("inline")) return true;
  return boxed && height <= CHIP_MAX_HEIGHT;
}

/**
 * One shape the overlay draws.
 *
 * - `band`: a text line's cap band — a pulse bar.
 * - `shape`: a control, image, icon or chip — a pulse block in its own radius.
 * - `frame`: a surface (a card, a bordered row) — its own paint, static, so
 *   the layout around the placeholders stays recognisable.
 */
export type SkeletonRect =
  | (Box & { kind: "band" | "shape"; radius: string })
  | (Box & { kind: "frame"; paint: FramePaint });

/** A box in flow-relative terms, for `inset-inline-start`/`inset-block-start`. */
export type LogicalBox = {
  blockSize: number;
  blockStart: number;
  inlineSize: number;
  inlineStart: number;
};

/** Cap band height as a share of the font size (Geist's cap height ≈ 0.71). */
export const CAP_BAND_RATIO = 0.72;

/**
 * The cap band of one line fragment. A `Range` client rect is the glyph run's
 * content area (ascent + descent), whose centre sits on the line box's centre
 * because the half-leading is split evenly — and so does the cap band, to
 * within a third of a pixel for this font stack. So the band is centred in the
 * fragment rather than hung from a guessed baseline.
 */
export function capBand(
  fragment: Box,
  fontSize: number,
  ratio = CAP_BAND_RATIO,
): Box {
  const height = Math.min(fragment.height, fontSize * ratio);
  return {
    height,
    width: fragment.width,
    x: fragment.x,
    y: fragment.y + (fragment.height - height) / 2,
  };
}

/**
 * A band's corner: the mark radius, never more than half its height. Left to
 * CSS (`min()`) so the token stays a token and no rem has to be resolved here.
 */
export function bandRadius(height: number): string {
  const half = Math.max(0, height / 2);
  return `min(var(--aui-radius-mark), ${Number(half.toFixed(2))}px)`;
}

/**
 * Join bands that are one visual line: same row, same size, and a gap no wider
 * than `gapEm` of their type. Adjacent text nodes ("Owner: " + a name + " updated
 * this") otherwise draw as three bars with hairline seams between them.
 * Direction-agnostic: it works on physical x, so RTL lines merge the same way.
 */
export function mergeBands(bands: readonly Box[], gapEm = 0.6): Box[] {
  const sorted = [...bands].sort((a, b) => a.y - b.y || a.x - b.x);
  const out: Box[] = [];
  for (const band of sorted) {
    const last = out[out.length - 1];
    const sameRow =
      last &&
      Math.abs(last.y - band.y) < 1 &&
      Math.abs(last.height - band.height) < 1;
    const gap = last
      ? band.x - (last.x + last.width)
      : Number.POSITIVE_INFINITY;
    const em = band.height / CAP_BAND_RATIO;
    if (last && sameRow && gap <= gapEm * em) {
      const right = Math.max(last.x + last.width, band.x + band.width);
      last.width = right - last.x;
      continue;
    }
    out.push({ ...band });
  }
  return out;
}

/** Physical box → flow-relative box inside a container `containerWidth` wide. */
export function toLogical(
  box: Box,
  containerWidth: number,
  direction: "ltr" | "rtl",
): LogicalBox {
  return {
    blockSize: box.height,
    blockStart: box.y,
    inlineSize: box.width,
    inlineStart:
      direction === "rtl" ? containerWidth - (box.x + box.width) : box.x,
  };
}

/**
 * Whether a computed CSS colour paints nothing. Covers the keyword, legacy
 * `rgba(…, 0)` and the slash-alpha forms (`oklch(… / 0)`, `color(srgb … / 0)`)
 * a modern engine serialises.
 */
export function isTransparentColor(color: string): boolean {
  const value = color.trim().toLowerCase();
  if (value === "" || value === "transparent") return true;
  if (/\/\s*0(?:\.0+)?%?\s*\)$/.test(value)) return true;
  return /^rgba\(.*,\s*0(?:\.0+)?\s*\)$/.test(value);
}

/** Whether a computed `border-*-width` list draws any edge at all. */
export function hasBorder(
  widths: readonly string[],
  styles: readonly string[],
): boolean {
  return widths.some(
    (width, index) =>
      parseFloat(width) > 0 &&
      styles[index] !== "none" &&
      styles[index] !== "hidden",
  );
}

/**
 * The size change between the last measured sample and the content that
 * replaced it, or `null` when both axes are within `tolerance` — what the
 * development warning reports as a layout shift.
 */
export function sizeDrift(
  sample: { height: number; width: number },
  ready: { height: number; width: number },
  tolerance = 2,
): { height: number; width: number } | null {
  const height = ready.height - sample.height;
  const width = ready.width - sample.width;
  if (Math.abs(height) <= tolerance && Math.abs(width) <= tolerance)
    return null;
  return { height, width };
}

/** A stable key for a measured set, so an unchanged re-measure skips a render. */
export function rectsSignature(rects: readonly SkeletonRect[]): string {
  return rects
    .map(
      (rect) =>
        `${rect.kind}:${rect.x.toFixed(1)},${rect.y.toFixed(1)},${rect.width.toFixed(1)},${rect.height.toFixed(1)}`,
    )
    .join("|");
}
