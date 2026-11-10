/**
 * Captures the Tars transcript design options from the development gallery
 * (`?stavePreview=tars&gallery=true&recordStyle=…&timeStyle=…&daySeparator=…`)
 * at 1440px and 390px, in English/light and Korean/dark, for side-by-side review.
 *
 *   node scripts/capture-tars-design-options.mjs <output-dir> [base-url]
 *   TARS_OPTIONS_ONLY=record-a,time-grouped node scripts/capture-tars-design-options.mjs /tmp/tars-options
 *
 * It needs a running renderer dev server (`bun run dev`, default
 * http://127.0.0.1:5173). The page clock is fixed so relative times and the
 * gallery's multi-day spread read the same on every run. Every image is a
 * viewport screenshot scrolled to the case that shows the option.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";

const [outputArg, baseArg] = process.argv.slice(2);
if (!outputArg) {
  console.error("Usage: node scripts/capture-tars-design-options.mjs <output-dir> [base-url]");
  process.exit(2);
}
const outputRoot = path.resolve(outputArg);
const baseUrl = baseArg ?? "http://127.0.0.1:5173";
/** 16:00 in Seoul: today's gallery runs land in the afternoon, yesterday's and older on their own days. */
const NOW = new Date("2026-11-10T07:00:00.000Z");
const VARIANTS = [
  { id: "en-light", lang: "en", theme: "light", locale: "en-US" },
  { id: "ko-dark", lang: "ko", theme: "dark", locale: "ko-KR" },
];
const WIDTHS = [{ id: "1440", width: 1440, height: 1000 }, { id: "390", width: 390, height: 844 }];

/**
 * `anchor`: the message scrolled to the top of the transcript, or with `center` to its middle (where yesterday turns into today).
 * `hover`: an exchange hovered so hover-only times show.
 */
const RECORD_REGIONS = [
  { id: "followups", anchor: "g-h", label: "automatic follow-up headers and a refused receipt" },
  { id: "controls", anchor: "g-i", label: "control and queue records, words for a busy run" },
  { id: "notices-publish", anchor: "g-k1", label: "activity notices and publish records" },
  { id: "receipts", anchor: "g-d1", label: "receipts beside delegated work" },
];
const SHOTS = [
  ...["current", "a", "b", "c"].flatMap((style) => RECORD_REGIONS.map((region) => ({
    id: `record-${style}-${region.id}`, query: style === "current" ? "" : `recordStyle=${style}`, anchor: region.anchor }))),
  ...["hover", "edge", "run", "grouped"].map((style) => ({ id: `time-${style}`, query: `timeStyle=${style}`, anchor: "g-h", center: true, hover: "g-h" })),
  ...["rule", "pill"].map((style) => ({ id: `day-${style}`, query: `daySeparator=${style}`, anchor: "g-h", center: true })),
  // The pill while its day scrolls: it stays at the top over today's runs.
  { id: "day-pill-sticky", query: "daySeparator=pill", anchor: "g-i", offset: 120 },
  // The recommended combination.
  { id: "recommended-followups", query: "recordStyle=a&timeStyle=grouped&daySeparator=rule", anchor: "g-h", center: true },
  { id: "recommended-controls", query: "recordStyle=a&timeStyle=grouped&daySeparator=rule", anchor: "g-i" },
];

const only = process.env.TARS_OPTIONS_ONLY?.split(",").map((value) => value.trim()).filter(Boolean);
const shots = only?.length ? SHOTS.filter((shot) => only.some((prefix) => shot.id.startsWith(prefix))) : SHOTS;

const browser = await chromium.launch();
const failures = [];
try {
  for (const variant of VARIANTS) {
    for (const size of WIDTHS) {
      const dir = path.join(outputRoot, `${variant.id}-${size.id}`);
      await mkdir(dir, { recursive: true });
      for (const shot of shots) {
        const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, locale: variant.locale, timezoneId: "Asia/Seoul",
          deviceScaleFactor: size.width < 600 ? 2 : 1, colorScheme: variant.theme });
        const page = await context.newPage();
        try {
          await page.clock.setFixedTime(NOW);
          const query = ["stavePreview=tars", "gallery=true", `lang=${variant.lang}`, `theme=${variant.theme}`, shot.query].filter(Boolean).join("&");
          await page.goto(`${baseUrl}/?${query}`);
          const anchor = page.locator(`[data-tars-message="${shot.anchor}"]`);
          await anchor.waitFor({ state: "visible", timeout: 30_000 });
          await page.evaluate(() => document.fonts.ready);
          // Scroll the transcript so the anchor's exchange starts just under its top edge.
          await anchor.evaluate((node, { offset, center }) => {
            const scroller = node.closest("[data-testid='tars-transcript']");
            if (!scroller) return;
            const top = node.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
            scroller.scrollTop = Math.max(0, top - (center ? scroller.clientHeight * 0.45 : 56) + offset);
          }, { offset: shot.offset ?? 0, center: Boolean(shot.center) });
          if (shot.hover) await page.locator(`[data-tars-message="${shot.hover}"]`).hover();
          await page.waitForTimeout(250);
          await page.screenshot({ path: path.join(dir, `${shot.id}.png`) });
        } catch (error) {
          failures.push(`${variant.id}-${size.id}/${shot.id}: ${error instanceof Error ? error.message.split("\n")[0] : error}`);
        } finally {
          await context.close();
        }
      }
      console.log(`captured ${dir}`);
    }
  }
} finally {
  await browser.close();
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
