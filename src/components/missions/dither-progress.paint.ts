/**
 * The pixels of a dithered progress track: an ordered-dither fill that is
 * sparse where the run started and dense at its head, over a faint wash of
 * the same tone, with a short tick at every stage boundary.
 *
 * Pure apart from the 2D context it is handed, so the thresholds, the density
 * ramp and the easing are tested without a canvas.
 */

/** Bayer 8×8 ordered-dither index matrix: each of 0..63 exactly once. */
export const BAYER_8: readonly (readonly number[])[] = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

/** CSS px per dither cell. */
export const DITHER_CELL_PX = 2;
/** The fill's density at its start and at its head. */
const DENSITY_TAIL = 0.1;
const DENSITY_HEAD = 0.92;
/** >1 keeps the start sparse for longer and packs the cells toward the head. */
const DENSITY_CURVE = 1.6;
/** The tone's wash under the cells, so the start of the fill still reads. */
const WASH_ALPHA = 0.16;
/** Tick height as a share of the track, and the ticks' weight on the empty track. */
const TICK_HEIGHT = 0.5;
const TICK_ALPHA = 0.55;
const PASSED_TICK_ALPHA = 0.85;

/** The newest cells shimmer while the run is live: this many CSS px behind the head. */
const SHIMMER_ZONE_PX = 24;
const SHIMMER_AMPLITUDE = 0.12;
const SHIMMER_PERIOD_MS = 2_400;
/** The shimmer steps rather than glides; a pixel track does not need 60fps. */
export const SHIMMER_FRAME_MS = 120;

/** `--ads-motion-duration-emphasis`: the fill eases to a new value over this long. */
export const PROGRESS_EASE_MS = 250;

const clamp01 = (value: number) => (value <= 0 ? 0 : value >= 1 ? 1 : value);
const wrap = (value: number, size: number) => ((value % size) + size) % size;

/** A cell's threshold in (0, 1). The same cell always gets the same one; the pattern tiles every 8 cells. */
export function ditherThreshold(column: number, row: number): number {
  return (BAYER_8[wrap(row, 8)]![wrap(column, 8)]! + 0.5) / 64;
}

/** The share of cells lit at `position` along the fill: 0 is its start, 1 its head. */
export function ditherDensity(position: number): number {
  return DENSITY_TAIL + (DENSITY_HEAD - DENSITY_TAIL) * clamp01(position) ** DENSITY_CURVE;
}

/** A cell is lit when the density at it clears its threshold. */
export function isCellLit(column: number, row: number, density: number): boolean {
  return density > ditherThreshold(column, row);
}

/**
 * A cell's density nudge at `time`: zero outside the newest cells, strongest
 * at the head, phased per cell so the cells twinkle instead of pulsing as one.
 */
export function shimmerOffset(column: number, row: number, distanceFromHeadPx: number, time: number): number {
  if (distanceFromHeadPx >= SHIMMER_ZONE_PX) return 0;
  const weight = 1 - Math.max(0, distanceFromHeadPx) / SHIMMER_ZONE_PX;
  const phase = ditherThreshold(column * 3 + 1, row * 5 + 2) * Math.PI * 2;
  return SHIMMER_AMPLITUDE * weight * Math.sin((time / SHIMMER_PERIOD_MS) * Math.PI * 2 + phase);
}

const bezier = (t: number, p1: number, p2: number) => 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3;

/** `--ads-motion-ease-standard`, cubic-bezier(0.2, 0, 0, 1), for motion drawn in JS. */
export function easeStandard(progress: number): number {
  const x = clamp01(progress);
  if (x === 0 || x === 1) return x;
  let low = 0;
  let high = 1;
  let t = x;
  for (let step = 0; step < 24; step += 1) {
    const value = bezier(t, 0.2, 0);
    if (Math.abs(value - x) < 1e-6) break;
    if (value < x) low = t;
    else high = t;
    t = (low + high) / 2;
  }
  return bezier(t, 0, 1);
}

export interface DitherPaint {
  /** Backing-store size, in device px. */
  width: number;
  height: number;
  /** Device px per CSS px. */
  dpr: number;
  /** 0..1, how far the fill reaches. */
  head: number;
  ticks: readonly number[];
  /** Where the head label covers the track, in device px; ticks under or beside it are left out. */
  label: readonly [start: number, end: number] | null;
  /** Resolved colors: the tone, the ticks on the empty track, and the ticks the fill has passed. */
  fill: string;
  tick: string;
  passedTick: string;
  /** A clock for the shimmer, or null when the track is still. */
  time: number | null;
}

/** Draws one frame. The track's own background shows through everywhere this leaves clear. */
export function paintDitherProgress(context: CanvasRenderingContext2D, paint: DitherPaint) {
  const { width, height, dpr } = paint;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  context.clearRect(0, 0, width, height);
  const cell = Math.max(1, Math.round(DITHER_CELL_PX * dpr));
  // On a dense display a one-pixel gap keeps the cells distinct where they pack.
  const dot = cell > 2 ? cell - 1 : cell;
  const head = Math.round(clamp01(paint.head) * width);

  if (head > 0) {
    context.fillStyle = paint.fill;
    context.globalAlpha = WASH_ALPHA;
    context.fillRect(0, 0, head, height);
    context.globalAlpha = 1;
    context.beginPath();
    const rows = Math.ceil(height / cell);
    for (let column = 0; column * cell < head; column += 1) {
      const x = column * cell;
      const center = x + cell / 2;
      const density = ditherDensity(center / head);
      const distance = (head - center) / dpr;
      for (let row = 0; row < rows; row += 1) {
        const nudge = paint.time === null ? 0 : shimmerOffset(column, row, distance, paint.time);
        if (isCellLit(column, row, density + nudge)) context.rect(x, row * cell, Math.min(dot, head - x), dot);
      }
    }
    context.fill();
  }

  const line = Math.max(1, Math.round(dpr));
  const tickHeight = Math.max(line, Math.round(height * TICK_HEIGHT));
  const top = Math.round((height - tickHeight) / 2);
  for (const tick of paint.ticks) {
    const x = Math.round(tick * width) - Math.floor(line / 2);
    // A tick under the head label is hidden anyway, and one just beside it peeks out.
    const margin = cell * 2;
    if (Math.abs(x - head) < margin) continue;
    if (paint.label && x > paint.label[0] - margin && x < paint.label[1] + margin) continue;
    if (x < head) {
      // A passed boundary: the ink in a clear notch, so it stands out of the cells around it.
      context.clearRect(x - line, top, line * 3, tickHeight);
      context.globalAlpha = PASSED_TICK_ALPHA;
      context.fillStyle = paint.passedTick;
      context.fillRect(x, top, line, tickHeight);
      context.globalAlpha = 1;
    } else {
      context.globalAlpha = TICK_ALPHA;
      context.fillStyle = paint.tick;
      context.fillRect(x, top, line, tickHeight);
      context.globalAlpha = 1;
    }
  }
}
