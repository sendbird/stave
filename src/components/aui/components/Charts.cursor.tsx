import { DefaultZIndexes, ZIndexLayer } from "recharts";

import { vars } from "../tokens/tokens.stylex";

/*
 * Hover feedback drawn behind the categorical forms. recharts filters a cursor
 * *object* down to plain SVG attributes, so a corner radius never reaches its
 * rectangle; a cursor *element* is cloned with the geometry instead, which is
 * how the band gets its rounded corners.
 */

type CursorGeometry = {
  /**
   * Categories on the band axis. recharts hands a mixed (Composed) chart a
   * rule at the category centre plus the plot box instead of a band, so the
   * band's thickness is the plot's extent over this count.
   */
  bands?: number;
  height?: number;
  left?: number;
  points?: ReadonlyArray<{ x: number; y: number }>;
  top?: number;
  width?: number;
  x?: number;
  y?: number;
};

export const CURSOR_RADIUS = 6;

export function BandCursor({
  bands,
  height,
  left,
  points,
  top,
  width,
  x,
  y,
}: CursorGeometry) {
  const [from, to] = points ?? [];
  if (x == null && from && to && bands && width != null && height != null) {
    // Rebuild the band around the rule: columns when the rule is vertical,
    // rows when it is horizontal.
    const vertical = from.x === to.x;
    const thickness = (vertical ? width : height) / bands;
    return (
      <BandCursor
        height={vertical ? height : thickness}
        width={vertical ? thickness : width}
        x={vertical ? from.x - thickness / 2 : (left ?? 0)}
        y={vertical ? (top ?? 0) : from.y - thickness / 2}
      />
    );
  }
  if (x != null && y != null && width != null && height != null) {
    return (
      <rect
        className="recharts-tooltip-cursor atelier-chart-band-cursor"
        fill={vars["--aui-color-border-subtle"]}
        // Lighter than the hairline ink: with the hovered category's marks at
        // full ink the band only has to say "this column", not shade it.
        fillOpacity={0.7}
        height={height}
        pointerEvents="none"
        rx={Math.min(CURSOR_RADIUS, width / 2)}
        width={width}
        x={x}
        y={y}
      />
    );
  }
  // Without a category count (a brushed window), draw the rule as the
  // continuous forms do rather than nothing.
  if (!from || !to) return null;
  return (
    <line
      className="recharts-tooltip-cursor"
      pointerEvents="none"
      stroke={vars["--aui-color-border-strong"]}
      strokeDasharray="3 3"
      x1={from.x}
      x2={to.x}
      y1={from.y}
      y2={to.y}
    />
  );
}

type LineCursorProps = {
  /** The category's text for the pill under the axis. */
  labelOf?: (row: Record<string, unknown>) => string;
  payload?: ReadonlyArray<{ payload?: Record<string, unknown> }>;
  points?: ReadonlyArray<{ x: number; y: number }>;
};

/** Estimated width of a 12px label (the pill sizes to it, padded). */
const pillWidth = (text: string) => text.length * 6.6 + 18;

/**
 * Hover feedback on the continuous forms: a quiet dashed rule at the point,
 * plus an inverted pill under the axis naming the hovered category — the
 * reader's eye stays on the plot and still reads the date (2026-11 refresh).
 * The pill paints in a layer above the tick labels, so it covers the tick it
 * sits on instead of colliding with it.
 */
export function LineCursor({ labelOf, payload, points }: LineCursorProps) {
  const [from, to] = points ?? [];
  if (!from || !to) return null;
  const row = payload?.[0]?.payload;
  const label = row && labelOf ? labelOf(row) : "";
  const bottom = Math.max(from.y, to.y);
  const width = pillWidth(label);
  return (
    <g className="recharts-tooltip-cursor" pointerEvents="none">
      <line
        stroke={vars["--aui-color-border-strong"]}
        strokeDasharray="3 3"
        x1={from.x}
        x2={to.x}
        y1={from.y}
        y2={to.y}
      />
      {label ? (
        // Tick labels paint in recharts' label layer, above the cursor's own;
        // the pill joins a layer just over it so it covers the tick it sits
        // on instead of colliding with it (2026-11 review).
        <ZIndexLayer zIndex={DefaultZIndexes.label + 1}>
          <g className="atelier-chart-cursor-pill">
            <rect
              fill={vars["--aui-color-text"]}
              height={20}
              rx={10}
              width={width}
              x={from.x - width / 2}
              y={bottom + 10}
            />
            <text
              dominantBaseline="central"
              fill={vars["--aui-color-surface-raised"]}
              fontSize={12}
              fontWeight={500}
              textAnchor="middle"
              x={from.x}
              y={bottom + 20}
            >
              {label}
            </text>
          </g>
        </ZIndexLayer>
      ) : null}
    </g>
  );
}
