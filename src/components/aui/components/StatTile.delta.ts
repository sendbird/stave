import { formatChartValue } from "./Charts.format";

export type StatTileDeltaTone = "danger" | "neutral" | "success";

/** Which way a change is good news: up for revenue, down for latency. */
export type StatTileGoodDirection = "down" | "none" | "up";

const percentChange = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  style: "percent",
});

/**
 * The signed change from `previous` to `value` and the tone it means. The sign
 * is a real minus (U+2212), so a fall does not read as a hyphenated word.
 */
export function deriveDelta(
  value: number,
  previous: number,
  {
    deltaFormat = "percent",
    format = formatChartValue,
    goodDirection = "up",
  }: {
    deltaFormat?: "absolute" | "percent";
    format?: (value: number) => string;
    goodDirection?: StatTileGoodDirection;
  } = {},
): { text: string; tone: StatTileDeltaTone } {
  const change = value - previous;
  const sign = change > 0 ? "+" : change < 0 ? "\u2212" : "";
  const magnitude =
    deltaFormat === "percent" && previous !== 0
      ? percentChange.format(Math.abs(change / previous))
      : format(Math.abs(change));
  const tone: StatTileDeltaTone =
    change === 0 || goodDirection === "none"
      ? "neutral"
      : change > 0 === (goodDirection === "up")
        ? "success"
        : "danger";
  return { text: `${sign}${magnitude}`, tone };
}
