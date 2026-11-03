import { expect, test, type Page } from "@playwright/test";

/**
 * The composer context meter's popover on the real composer (composer-frame
 * preview). Claude's composition is read once when the popover opens — never
 * on render — and a reopen inside the cache window reuses it. Its rows share
 * one label edge and one value edge whether or not they expand, and the
 * popover stays inside the window. Another provider gets one "not reported"
 * line. English and Korean, light and dark, a wide and a narrow composer.
 */

const TRIGGER = { en: /^Conversation context 72% used, 28,000 tokens left$/, ko: /^대화 컨텍스트 72% 사용됨, 28,000 토큰 남음$/ };

async function open(page: Page, args: { locale: "en" | "ko"; dark: boolean; narrow: boolean; provider?: "codex" }) {
  const params = new URLSearchParams({ stavePreview: "composer-frame", case: "idle", lang: args.locale });
  if (!args.dark) params.set("theme", "light");
  if (args.narrow) params.set("w", "420");
  if (args.provider) params.set("contextProvider", args.provider);
  await page.goto(`/?${params}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  const trigger = page.getByRole("button", { name: TRIGGER[args.locale] });
  await expect(trigger).toBeVisible();
  return trigger;
}

const loads = (page: Page) =>
  page.evaluate(() => (window as { __contextBreakdownLoads?: number }).__contextBreakdownLoads ?? 0);

for (const locale of ["en", "ko"] as const) {
  for (const dark of [false, true]) {
    for (const narrow of [false, true]) {
      test(`composition reads on open and lines up (${locale}, ${dark ? "dark" : "light"}, ${narrow ? "narrow" : "wide"})`, async ({ page }) => {
        test.setTimeout(60_000);
        const trigger = await open(page, { locale, dark, narrow });
        // Rendering the composer never reads the composition.
        expect(await loads(page)).toBe(0);

        await trigger.click();
        const section = page.locator('[data-context-breakdown="ready"]');
        await expect(section).toBeVisible();
        expect(await loads(page)).toBe(1);

        const geometry = await section.evaluate((element) => {
          const popover = element.closest<HTMLElement>('[data-slot="popover-content"]') ?? element.parentElement!;
          const rows = [...element.querySelectorAll<HTMLElement>("[data-context-breakdown-row]")].map((row) => {
            const cells = row.matches("li") && row.querySelector("button") ? row.querySelector("button")! : row;
            const [gutter, label, value] = [...cells.children] as HTMLElement[];
            return {
              id: row.dataset.contextBreakdownRow!,
              gutterLeft: gutter!.getBoundingClientRect().left,
              labelLeft: label!.getBoundingClientRect().left,
              valueRight: value!.getBoundingClientRect().right,
              labelCentre: label!.getBoundingClientRect().top + label!.getBoundingClientRect().height / 2,
              valueCentre: value!.getBoundingClientRect().top + value!.getBoundingClientRect().height / 2,
            };
          });
          const box = popover.getBoundingClientRect();
          return {
            rows,
            popoverLeft: box.left,
            popoverRight: box.right,
            popoverTop: box.top,
            viewportWidth: window.innerWidth,
            overflowing: popover.scrollWidth > popover.clientWidth + 1,
          };
        });
        expect(geometry.rows.map((row) => row.id)).toEqual([
          "system_prompt",
          "system_tools",
          "mcp_tools",
          "memory_files",
          "skills",
          "conversation",
        ]);
        const [first] = geometry.rows;
        for (const row of geometry.rows) {
          expect(Math.abs(row.labelLeft - first!.labelLeft), `${row.id} label edge`).toBeLessThanOrEqual(0.5);
          expect(Math.abs(row.valueRight - first!.valueRight), `${row.id} value edge`).toBeLessThanOrEqual(0.5);
          expect(Math.abs(row.labelCentre - row.valueCentre), `${row.id} centred`).toBeLessThanOrEqual(1);
        }
        expect(geometry.popoverLeft).toBeGreaterThanOrEqual(0);
        expect(geometry.popoverRight).toBeLessThanOrEqual(geometry.viewportWidth);
        expect(geometry.popoverTop).toBeGreaterThanOrEqual(0);
        expect(geometry.overflowing).toBe(false);

        // MCP tools expand to the tools that are loaded.
        const mcp = section.locator('[data-context-breakdown-row="mcp_tools"] button');
        await mcp.click();
        await expect(mcp).toHaveAttribute("aria-expanded", "true");
        await expect(section.getByText("stave_run_task")).toBeVisible();
        await expect(section.getByText("search_docs")).toHaveCount(0);

        // A reopen inside the cache window reuses the read.
        await page.keyboard.press("Escape");
        await expect(section).toBeHidden();
        await trigger.click();
        await expect(page.locator('[data-context-breakdown="ready"]')).toBeVisible();
        expect(await loads(page)).toBe(1);
      });
    }
  }
}

test("a provider that reports only a total says so and reads nothing", async ({ page }) => {
  const trigger = await open(page, { locale: "en", dark: true, narrow: false, provider: "codex" });
  await trigger.click();
  const section = page.locator('[data-context-breakdown="not-reported"]');
  await expect(section).toBeVisible();
  await expect(section).toContainText("This provider doesn't report what fills the context.");
  expect(await loads(page)).toBe(0);
});
