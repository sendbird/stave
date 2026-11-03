import { expect, test, type Page } from "@playwright/test";

/**
 * The finished turn's "Sources N" line on the real `AssistantMessageBody`
 * (agent trace preview, Completed). It follows the answer, opens to one row
 * per distinct web source, and stays inside the column when the column is
 * narrow. English and Korean, light and dark.
 */

async function open(page: Page, args: { locale: "en" | "ko"; dark: boolean }) {
  await page.goto("/?stavePreview=agent-messages");
  await page.getByRole("button", { name: "Streaming", exact: true }).click();
  if (!args.dark) {
    await page.getByRole("button", { name: "Dark", exact: true }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  }
  await page.evaluate(async (locale) => {
    const path = "/src/i18n/runtime.ts";
    const { i18n } = await import(path);
    await i18n.changeLanguage(locale);
    await document.fonts.ready;
  }, args.locale);
}

for (const locale of ["en", "ko"] as const) {
  for (const dark of [false, true]) {
    test(`a finished turn lists its web sources under the answer (${locale}, ${dark ? "dark" : "light"})`, async ({ page }) => {
      await open(page, { locale, dark });
      const sources = page.locator("[data-turn-sources]");
      await expect(sources).toBeVisible();
      const trigger = sources.getByRole("button");
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await expect(trigger).toContainText("2");

      // After the answer text.
      // The answer is the same turn's text that ends with "bun run typecheck passes.",
      // read inside the turn that holds the sources rather than anywhere on the page.
      const answerBottom = await sources.evaluate((element) => {
        let node: Element | null = element;
        while (node && !node.parentElement?.textContent?.includes("bun run typecheck")) node = node.parentElement;
        const turn = node?.parentElement;
        const texts = turn ? [...turn.querySelectorAll("p, li")].filter((candidate) => candidate.textContent?.includes("bun run typecheck") && !element.contains(candidate)) : [];
        const answer = texts.at(-1);
        return answer ? answer.getBoundingClientRect().bottom : Number.NaN;
      });
      expect(Number.isFinite(answerBottom)).toBe(true);
      const sourcesTop = await sources.evaluate((element) => element.getBoundingClientRect().top);
      expect(sourcesTop).toBeGreaterThanOrEqual(answerBottom);

      await trigger.click();
      const rows = sources.locator("ol > li");
      await expect(rows).toHaveCount(2);
      await expect(rows.first()).toContainText("developer.mozilla.org");

      // Narrow column: rows stay inside it.
      await sources.evaluate((element) => {
        const column = element.closest("section:not([data-turn-sources])") as HTMLElement;
        column.style.width = "320px";
      });
      const geometry = await sources.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const rows = [...element.querySelectorAll("ol > li")].map((row) => row.getBoundingClientRect());
        return {
          right: box.right,
          rowsRight: Math.max(...rows.map((row) => row.right)),
          overflowing: element.scrollWidth > element.clientWidth + 1,
        };
      });
      expect(geometry.rowsRight).toBeLessThanOrEqual(geometry.right + 0.5);
      expect(geometry.overflowing).toBe(false);
    });
  }
}
