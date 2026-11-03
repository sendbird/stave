import { expect, test, type Page } from "@playwright/test";

/**
 * A Claude question whose options carry a preview, on the real question card
 * (composer-frame preview, delegated-request slot). The focused or hovered
 * option's preview shows under the options in a capped, scrollable box; an
 * option without one shows no box. The box stays inside the card and does not
 * widen it. English and Korean, light and dark, a wide and a narrow composer.
 */

async function open(page: Page, args: { locale: "en" | "ko"; dark: boolean; narrow: boolean }) {
  const params = new URLSearchParams({
    stavePreview: "composer-frame",
    case: "idle",
    childRequest: "preview",
    lang: args.locale,
  });
  if (!args.dark) params.set("theme", "light");
  if (args.narrow) params.set("w", "420");
  await page.goto(`/?${params}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByText("How should the billing table behave below 600px?")).toBeVisible();
}

const row = (page: Page, value: string) => page.locator(`label[data-option-value="${value}"]`);
const preview = (page: Page) => page.locator("[data-option-preview]");

for (const locale of ["en", "ko"] as const) {
  for (const dark of [false, true]) {
    for (const narrow of [false, true]) {
      test(`option preview follows focus and hover (${locale}, ${dark ? "dark" : "light"}, ${narrow ? "narrow" : "wide"})`, async ({ page }) => {
        test.setTimeout(60_000);
        await open(page, { locale, dark, narrow });

        // Focus picks the option to preview.
        await row(page, "Scroll container").locator("input").focus();
        await expect(preview(page)).toHaveAttribute("data-option-preview", "Scroll container");
        await expect(preview(page)).toContainText("overflow-x: auto");

        // Hover takes over; an option without a preview shows no box.
        await row(page, "Card list").hover();
        await expect(preview(page)).toHaveAttribute("data-option-preview", "Card list");
        await row(page, "Hide secondary columns").hover();
        await expect(preview(page)).toHaveCount(0);

        // Back to the scroll container for geometry.
        await row(page, "Scroll container").hover();
        const geometry = await preview(page).evaluate((element) => {
          const list = element.parentElement!.querySelector<HTMLElement>("label[data-option-value]")!.parentElement!;
          const viewport = element.querySelector<HTMLElement>('[role="region"]')!;
          const text = viewport.querySelector("pre")!;
          const listBox = list.getBoundingClientRect();
          const box = element.getBoundingClientRect();
          return {
            listLeft: listBox.left,
            listRight: listBox.right,
            left: box.left,
            right: box.right,
            gapAbove: box.top - listBox.bottom,
            viewportHeight: viewport.getBoundingClientRect().height,
            viewportCap: Number.parseFloat(getComputedStyle(viewport).maxBlockSize),
            textOverflowsX: text.scrollWidth > text.clientWidth + 1,
            liveRole: viewport.getAttribute("aria-live"),
            role: viewport.getAttribute("role"),
          };
        });
        // Same column as the options, below them, never wider than the card.
        expect(Math.abs(geometry.left - geometry.listLeft)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(geometry.right - geometry.listRight)).toBeLessThanOrEqual(0.5);
        expect(geometry.gapAbove).toBeGreaterThan(0);
        expect(geometry.viewportHeight).toBeLessThanOrEqual(geometry.viewportCap + 1);
        expect(geometry.textOverflowsX).toBe(false);
        // A region, not a live log: swapping previews is not announced.
        expect(geometry.role).toBe("region");
        expect(geometry.liveRole).toBeNull();
      });
    }
  }
}
