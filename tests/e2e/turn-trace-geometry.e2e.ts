import { expect, test, type Page } from "@playwright/test";

/**
 * The turn timeline's rows on the real component (AUI regression preview, at
 * the Task panel's 560px): every bar sits on one shared axis, centred on its
 * row's label, at the place its observed start puts it; the "now" line runs
 * straight down every track; and a long trailing figure on one row does not
 * move another row's track. Measured in English and Korean, light and dark.
 *
 * Fixture axis: the turn starts at 0s and is live at 95s. "Read file" starts
 * at 5s, the subagent at 54s, the running command at 83s.
 */

async function open(page: Page, args: { locale: "en" | "ko"; dark: boolean }) {
  await page.goto("/?stavePreview=aui-regressions");
  await expect(page.getByTestId("turn-trace-fixture")).toBeVisible();
  if (args.dark) {
    await page.getByRole("button", { name: "Light", exact: true }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
  }
  await page.evaluate(async (locale) => {
    const path = "/src/i18n/runtime.ts";
    const { i18n } = await import(path);
    await i18n.changeLanguage(locale);
    await document.fonts.ready;
  }, args.locale);
}

async function measure(page: Page) {
  return page.getByTestId("turn-trace-fixture").evaluate((fixture) => {
    const rows = [...fixture.querySelectorAll<HTMLElement>("[data-trace-span-id]")];
    return rows.map((row) => {
      const name = row.querySelector<HTMLElement>("[data-trace-span-name]")!.getBoundingClientRect();
      const label = row.querySelector<HTMLElement>("[data-trace-span-name] > span")!.getBoundingClientRect();
      const track = row.querySelector<HTMLElement>('[data-aui-slot="track"]')!.getBoundingClientRect();
      const bar = row.querySelector<HTMLElement>("[data-trace-bar]")!.getBoundingClientRect();
      const marker = row.querySelector<HTMLElement>("[data-trace-marker]")?.getBoundingClientRect() ?? null;
      const rowBox = row.getBoundingClientRect();
      const labelElement = row.querySelector<HTMLElement>("[data-trace-span-name] > span")!;
      return {
        id: row.dataset.traceSpanId!,
        labelTruncated: labelElement.scrollWidth > labelElement.clientWidth + 1,
        labelCentre: label.y + label.height / 2,
        barCentre: bar.y + bar.height / 2,
        nameRight: name.right,
        trackLeft: track.left,
        trackWidth: track.width,
        barLeft: bar.left,
        barRight: bar.right,
        markerX: marker ? marker.left : null,
        markerTop: marker ? marker.top : null,
        markerBottom: marker ? marker.bottom : null,
        rowTop: rowBox.top,
        rowBottom: rowBox.bottom,
        rowRight: rowBox.right,
        overflowing: row.scrollWidth > row.clientWidth + 1,
      };
    });
  });
}

for (const locale of ["en", "ko"] as const) {
  for (const dark of [false, true]) {
    test(`timeline rows share one axis and centre each bar on its label (${locale}, ${dark ? "dark" : "light"})`, async ({ page }) => {
      await open(page, { locale, dark });
      const rows = await measure(page);
      expect(rows.map((row) => row.id)).toEqual([
        "turn",
        "tool:read-1",
        "tool:edit-1",
        "tool:agent-1",
        "tool:read-2",
        "tool:cmd-1",
      ]);

      const [first] = rows;
      for (const row of rows) {
        // One axis: every track starts and ends where the turn's does, whatever
        // the trailing figure on that row measures.
        expect(Math.abs(row.trackLeft - first!.trackLeft), `${row.id} track left`).toBeLessThanOrEqual(0.5);
        expect(Math.abs(row.trackWidth - first!.trackWidth), `${row.id} track width`).toBeLessThanOrEqual(0.5);
        // The bar is centred on its label's line.
        expect(Math.abs(row.labelCentre - row.barCentre), `${row.id} centre`).toBeLessThanOrEqual(1);
        // The label never runs under the track, and nothing spills the row.
        expect(row.nameRight, `${row.id} name/track`).toBeLessThanOrEqual(row.trackLeft + 0.5);
        expect(row.overflowing, `${row.id} overflow`).toBe(false);
        // A bar stays inside its track.
        expect(row.barLeft).toBeGreaterThanOrEqual(row.trackLeft - 0.5);
        expect(row.barRight).toBeLessThanOrEqual(row.trackLeft + row.trackWidth + 0.5);
      }

      // A short span name is never cut for its muted detail.
      for (const id of ["turn", "tool:read-1", "tool:edit-1", "tool:cmd-1"]) {
        expect(rows.find((entry) => entry.id === id)!.labelTruncated, `${id} name cut`).toBe(false);
      }

      // Bars start where their observed start puts them on the 0-95s axis.
      const expectedStart = { "tool:read-1": 5, "tool:agent-1": 54, "tool:cmd-1": 83 } as const;
      for (const [id, seconds] of Object.entries(expectedStart)) {
        const row = rows.find((entry) => entry.id === id)!;
        const expected = row.trackLeft + (seconds / 95) * row.trackWidth;
        expect(Math.abs(row.barLeft - expected), `${id} start`).toBeLessThanOrEqual(1);
      }
      // The running command and the turn run to "now", the end of the axis.
      for (const id of ["turn", "tool:cmd-1"]) {
        const row = rows.find((entry) => entry.id === id)!;
        expect(Math.abs(row.barRight - (row.trackLeft + row.trackWidth)), `${id} end`).toBeLessThanOrEqual(1);
      }

      // The now line is one vertical rule: same x on every row, the row's full height.
      const markerXs = rows.map((row) => row.markerX);
      expect(markerXs.every((x) => x !== null)).toBe(true);
      for (const row of rows) {
        expect(Math.abs(row.markerX! - markerXs[0]!)).toBeLessThanOrEqual(0.5);
        expect(row.markerTop!).toBeLessThanOrEqual(row.rowTop + 1);
        expect(row.markerBottom!).toBeGreaterThanOrEqual(row.rowBottom - 2);
      }
    });
  }
}

async function measureTicks(page: Page) {
  return page.getByTestId("turn-trace-fixture").evaluate((fixture) => {
    const axis = fixture.querySelector<HTMLElement>("[data-trace-axis]")!;
    const firstTrack = fixture.querySelector<HTMLElement>('[data-trace-span-id] [data-aui-slot="track"]')!.getBoundingClientRect();
    const axisTrack = axis.children[1]!.getBoundingClientRect();
    const firstRow = fixture.querySelector<HTMLElement>("[data-trace-span-id]")!.getBoundingClientRect();
    const labels = [...axis.querySelectorAll<HTMLElement>("[data-trace-tick]")].map((label) => {
      const box = label.getBoundingClientRect();
      return { offset: Number(label.dataset.traceTick), text: label.textContent, left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    });
    const rules = [...fixture.querySelectorAll<HTMLElement>("[data-trace-tick-rule]")].map((rule) => ({
      offset: Number(rule.dataset.traceTickRule),
      x: rule.getBoundingClientRect().left,
    }));
    return {
      trackLeft: firstTrack.left,
      trackWidth: firstTrack.width,
      axisTrackLeft: axisTrack.left,
      axisTrackWidth: axisTrack.width,
      axisBottom: axis.getBoundingClientRect().bottom,
      firstRowTop: firstRow.top,
      labels,
      rules,
    };
  });
}

const TICK_TEXT = {
  en: ["0s", "30s", "1m", "1m 30s"],
  ko: ["0초", "30초", "1분", "1분 30초"],
} as const;

for (const locale of ["en", "ko"] as const) {
  for (const dark of [false, true]) {
    test(`time-axis ticks sit on the bars' grid (${locale}, ${dark ? "dark" : "light"})`, async ({ page }) => {
      await open(page, { locale, dark });
      const geometry = await measureTicks(page);

      // The 0-95s axis takes a 30s step: four labels, a rule for each past 0.
      expect(geometry.labels.map((label) => label.offset)).toEqual([0, 30_000, 60_000, 90_000]);
      expect(geometry.labels.map((label) => label.text)).toEqual([...TICK_TEXT[locale]]);
      expect(new Set(geometry.rules.map((rule) => rule.offset))).toEqual(new Set([30_000, 60_000, 90_000]));

      // The axis row's track is the rows' track.
      expect(Math.abs(geometry.axisTrackLeft - geometry.trackLeft)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(geometry.axisTrackWidth - geometry.trackWidth)).toBeLessThanOrEqual(0.5);
      // Labels sit above the first span row, inside the track's extent.
      for (const label of geometry.labels) {
        expect(label.bottom).toBeLessThanOrEqual(geometry.firstRowTop + 0.5);
        expect(label.left).toBeGreaterThanOrEqual(geometry.trackLeft - 0.5);
        expect(label.right).toBeLessThanOrEqual(geometry.trackLeft + geometry.trackWidth + 0.5);
      }

      const xAt = (offset: number) => geometry.trackLeft + (offset / 95_000) * geometry.trackWidth;
      // Every rule, on every row, stands where its time is on the axis.
      for (const rule of geometry.rules) {
        expect(Math.abs(rule.x - xAt(rule.offset)), `rule ${rule.offset}`).toBeLessThanOrEqual(1);
      }
      // The origin label starts at the track; middle labels centre on their
      // rule; the last one, near the end, ends at it.
      const [zero, thirty, sixty, ninety] = geometry.labels;
      expect(Math.abs(zero!.left - geometry.trackLeft)).toBeLessThanOrEqual(1);
      for (const label of [thirty!, sixty!]) {
        expect(Math.abs((label.left + label.right) / 2 - xAt(label.offset)), `label ${label.offset}`).toBeLessThanOrEqual(1);
      }
      expect(Math.abs(ninety!.right - xAt(90_000))).toBeLessThanOrEqual(1);
      // Neighbouring labels never touch.
      for (let index = 1; index < geometry.labels.length; index += 1) {
        expect(geometry.labels[index]!.left).toBeGreaterThan(geometry.labels[index - 1]!.right);
      }
    });
  }
}

test("the Slowest tag, the turn's cost and the unreported step read in Korean", async ({ page }) => {
  await open(page, { locale: "ko", dark: false });
  const fixture = page.getByTestId("turn-trace-fixture");
  await expect(fixture.locator("[data-trace-slowest]")).toHaveText("가장 느림");
  await expect(fixture.locator('[data-trace-span-id="tool:agent-1"] [data-trace-slowest]')).toHaveCount(0);
  await expect(fixture.getByText("시간이 보고되지 않은 단계 1개")).toBeVisible();
  await expect(fixture.getByRole("list", { name: "타임라인 범례" })).toContainText("현재");
});
