import type * as React from "react";

import { i18n, useTranslation } from "@/i18n";

import { summarizeChartTable } from "../utils/chart-transform";
import { Button } from "./Button";
import { csvFileName, formatChartReadout } from "./Charts.format";
import type { ChartTable } from "./Charts.states";
import { Text } from "./Typography";

/*
 * Reading and sharing a chart outside the chart (2026-11-02): the one-sentence
 * `summary` under the header and the `downloadImage` header action.
 */

/** The `summaryLine`: written from the table when `true`, else printed as given. */
export function ChartSummary({
  formatValue,
  ordered = false,
  summary,
  table,
}: {
  formatValue?: (value: number) => string;
  /** The table is an ordered series (axis charts); only then can `true` write a sentence. */
  ordered?: boolean;
  summary?: boolean | React.ReactNode;
  table?: ChartTable;
}) {
  if (summary == null || summary === false) return null;
  const text =
    summary === true
      ? table && ordered
        ? summarizeChartTable(table, formatValue ?? formatChartReadout)
        : ""
      : summary;
  if (text === "" || text == null) return null;
  return (
    <Text as="p" data-chart-summary="" size="sm" tone="muted">
      {text}
    </Text>
  );
}

const PAINT = [
  "fill",
  "fill-opacity",
  "font-family",
  "font-size",
  "font-weight",
  "opacity",
  "stop-color",
  "stop-opacity",
  "stroke",
  "stroke-dasharray",
  "stroke-opacity",
  "stroke-width",
  "text-anchor",
  "dominant-baseline",
] as const;

/** A copy of `svg` whose paint is resolved (tokens are CSS variables, which a file cannot read). */
function resolvedClone(svg: SVGSVGElement): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const from = [svg, ...svg.querySelectorAll("*")];
  const to = [clone, ...clone.querySelectorAll("*")];
  from.forEach((node, index) => {
    const target = to[index];
    if (!target) return;
    const style = getComputedStyle(node);
    for (const name of PAINT) {
      const value = style.getPropertyValue(name);
      if (value && value !== "normal") target.setAttribute(name, value);
    }
    target.removeAttribute("class");
  });
  return clone;
}

function escapeXml(text: string) {
  return text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function save(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Writes the chart in `root` to a file: its plot SVG with the card's title and
 * description drawn above it, on the card's own surface color. `.svg` names
 * keep the vector; anything else is rendered to a 2× PNG.
 */
export async function exportChartImage(
  root: HTMLElement,
  {
    description,
    fileName,
    title,
  }: { description?: string; fileName: string; title?: string },
) {
  // The plot only: a header icon or a legend glyph is never the chart.
  const svg = root.querySelector<SVGSVGElement>("svg.recharts-surface");
  if (!svg) return false;
  const box = svg.getBoundingClientRect();
  const width = Math.max(1, Math.round(box.width));
  const height = Math.max(1, Math.round(box.height));
  const card = getComputedStyle(root);
  const heading = root.querySelector("h3");
  const ink = heading ? getComputedStyle(heading).color : card.color;
  const font = card.fontFamily || "sans-serif";
  const pad = 16;
  const head = (title ? 26 : 0) + (description ? 20 : 0);
  const lines = [
    title
      ? `<text x="${pad}" y="${pad + 14}" fill="${ink}" font-family="${escapeXml(font)}" font-size="15" font-weight="600">${escapeXml(title)}</text>`
      : "",
    description
      ? `<text x="${pad}" y="${pad + (title ? 36 : 14)}" fill="${ink}" fill-opacity="0.7" font-family="${escapeXml(font)}" font-size="12">${escapeXml(description)}</text>`
      : "",
  ].join("");
  const plot = resolvedClone(svg);
  plot.setAttribute("x", String(pad));
  plot.setAttribute("y", String(pad + head + (head ? 8 : 0)));
  plot.setAttribute("width", String(width));
  plot.setAttribute("height", String(height));
  // The legend is HTML, so its keys are redrawn as SVG under the plot —
  // colors without names would make a multi-series image unreadable.
  const keys = [...root.querySelectorAll("li")].flatMap((item) => {
    const swatch = item.querySelector<HTMLElement>("[aria-hidden]");
    const label = (item.textContent ?? "").trim();
    return swatch && label
      ? [{ color: getComputedStyle(swatch).backgroundColor, label }]
      : [];
  });
  const keyTop = pad + head + (head ? 8 : 0) + height + 12;
  let keyX = pad;
  const legend = keys
    .map(({ color, label }) => {
      const mark = `<rect x="${keyX}" y="${keyTop}" width="10" height="10" rx="2" fill="${color}"/><text x="${keyX + 14}" y="${keyTop + 9}" fill="${ink}" font-family="${escapeXml(font)}" font-size="11">${escapeXml(label)}</text>`;
      keyX += 14 + label.length * 6.5 + 14;
      return mark;
    })
    .join("");
  const fullWidth = Math.max(width + pad * 2, keyX + pad);
  const fullHeight =
    height + pad * 2 + head + (head ? 8 : 0) + (keys.length ? 24 : 0);
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${fullWidth}" height="${fullHeight}" viewBox="0 0 ${fullWidth} ${fullHeight}"><rect width="100%" height="100%" fill="${card.backgroundColor || "white"}"/>${lines}${new XMLSerializer().serializeToString(plot)}${legend}</svg>`;
  if (fileName.toLowerCase().endsWith(".svg")) {
    save(new Blob([markup], { type: "image/svg+xml" }), fileName);
    return true;
  }
  const image = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Chart image failed to render"));
  });
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  await loaded;
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = fullWidth * scale;
  canvas.height = fullHeight * scale;
  const context = canvas.getContext("2d");
  if (!context) return false;
  context.scale(scale, scale);
  context.drawImage(image, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) return false;
  save(
    blob,
    fileName.toLowerCase().endsWith(".png") ? fileName : `${fileName}.png`,
  );
  return true;
}

/** The header action; null when there is nothing to save. */
export function ImageAction({
  description,
  downloadImage,
  rootRef,
  title,
}: {
  description?: React.ReactNode;
  downloadImage?: boolean | string;
  rootRef: React.RefObject<HTMLElement | null>;
  title?: React.ReactNode;
}) {
  useTranslation();
  if (!downloadImage) return null;
  const name =
    typeof downloadImage === "string"
      ? downloadImage
      : csvFileName(title).replace(/\.csv$/, ".png");
  return (
    <Button
      data-chart-image=""
      onClick={() => {
        if (rootRef.current) {
          exportChartImage(rootRef.current, {
            description:
              typeof description === "string" ? description : undefined,
            fileName: name,
            title: typeof title === "string" ? title : undefined,
          }).catch((error: unknown) => {
            // A tainted canvas or a blocked download is the browser's to report.
            console.warn("AUI chart image export failed", error);
          });
        }
      }}
      size="xs"
      variant="quiet"
    >
      {i18n.t("ui:chart.downloadImage")}
    </Button>
  );
}
