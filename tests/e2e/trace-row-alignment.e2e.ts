import { expect, test } from "@playwright/test";

/**
 * One left edge for every row on the reasoning rail.
 *
 * A trace row is `agentSurface.row` plus an `InlineDisclosureIcon`, so a tool
 * title, a thought label and a notice title all start one glyph column in from
 * the rail's own edge. Interim prose carries no glyph — nothing produced it
 * but the model writing a sentence — and it used to render flush to that edge,
 * so a sentence sat a glyph column to the left of every row around it and read
 * as though it had escaped the run it belongs to.
 *
 * Measured in a real browser rather than asserted against a class name: the
 * inset is composed from three tokens, and the failure this guards against is
 * the resolved geometry disagreeing, not the source text changing.
 */
test("interim prose starts on the same text column as every other trace row", async ({
  page,
}) => {
  await page.goto("/?stavePreview=turn-events");

  /* `02 · Interim · Tool · 최종 답변` — the one sample that puts interim prose
     and a tool row on the same rail. */
  const sample = page.locator("#event-2");
  await expect(sample).toBeVisible();

  const prose = sample
    .getByText("관련 파일의 레이아웃을 확인하고 있습니다.", { exact: true })
    .first();
  const toolTitle = sample.getByText("Bash", { exact: true }).first();
  await expect(prose).toBeVisible();
  await expect(toolTitle).toBeVisible();

  const [proseBox, toolBox] = await Promise.all([
    prose.boundingBox(),
    toolTitle.boundingBox(),
  ]);
  expect(proseBox, "interim prose is laid out").not.toBeNull();
  expect(toolBox, "tool row title is laid out").not.toBeNull();

  /* Sub-pixel tolerance only: this is the same column, not a similar one. */
  expect(Math.abs(proseBox!.x - toolBox!.x)).toBeLessThanOrEqual(0.5);
});

for (const locale of ["en", "ko"]) {
  for (const theme of ["light", "dark"]) {
    test(`expanded file and JSON details stay inside the trace (${locale}, ${theme})`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width: 360, height: 900 });
      await page.goto(`/?stavePreview=turn-events&toolDetails&lang=${locale}&theme=${theme}&density=${theme === "dark" ? "compact" : "regular"}`);
      const sample = page.locator("#event-1");
      const read = sample.locator("[data-tool-read-detail]");
      const grep = sample.locator("[data-tool-match-detail]");
      const json = sample.locator("[data-tool-json-detail]");
      await expect(read).toContainText(locale === "en" ? "From line 42" : "42번째 줄부터");
      await expect(read).toContainText(locale === "en" ? "up to 2 lines" : "최대 2줄");
      await expect(grep.getByRole("button")).toHaveCount(2);
      const records = json.locator("summary").filter({ hasText: '"records":' });
      await expect(records).toBeVisible();
      await expect(json.getByText('"status": "ready",', { exact: true })).toHaveCount(0);
      await records.click();
      await json.locator("summary").filter({ hasText: "{…" }).click();
      await expect(json.getByText('"status": "ready",', { exact: true })).toBeVisible();
      await expect(page.locator("html")).toHaveClass(theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/);

      await page.evaluate(async () => {
        const clipboard: string[] = [];
        Object.assign(window, { toolDetailClipboard: clipboard });
        Object.defineProperty(navigator, "clipboard", {
          configurable: true, value: { writeText: async (text: string) => clipboard.push(text) },
        });
        await document.fonts.ready;
      });

      for (const width of [360, 760]) {
        await page.setViewportSize({ width, height: 900 });
        const geometry = await sample.evaluate((element) => {
          const trace = element.querySelector("[data-tool-run-status]")!.getBoundingClientRect();
          return Array.from(element.querySelectorAll("[data-tool-read-detail], [data-tool-match-detail], [data-tool-json-detail]"), (detail) => {
            const box = detail.getBoundingClientRect();
            return {
              inset: box.left - trace.left,
              rightInset: trace.right - box.right,
              overflow: detail.scrollWidth - detail.clientWidth,
            };
          });
        });
        expect(geometry).toHaveLength(3);
        for (const detail of geometry) {
          expect(detail.inset).toBeGreaterThan(0);
          expect(detail.inset).toBeCloseTo(geometry[0]!.inset, 0);
          expect(detail.rightInset).toBeGreaterThan(0);
          expect(detail.overflow).toBeLessThanOrEqual(1);
        }
      }

      await page.setViewportSize({ width: 360, height: 900 });
      await read.getByRole("button", { name: /\.tsx:42$/ }).press("Enter");
      await grep.getByRole("button", { name: /\.tsx:43$/ }).click();
      await expect(page.locator("[data-preview-opened-files] li")).toHaveText([
        '{"filePath":"src/components/session/message/very-long-file-name-for-trace-detail.tsx","line":42}',
        '{"filePath":"src/components/session/message/very-long-file-name-for-trace-detail.tsx","line":43}',
      ]);
      await sample.getByRole("button", { name: locale === "en" ? "Copy raw output" : "원본 출력 복사" }).click();
      await expect.poll(() => page.evaluate(() => Reflect.get(window, "toolDetailClipboard"))).toEqual([
        '{"records":[{"status":"ready","tags":["trace","preview"]}],"total":1}',
      ]);
    });
  }
}
