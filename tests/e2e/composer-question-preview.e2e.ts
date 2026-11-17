import { expect, test, type Page } from "@playwright/test";

/**
 * A Claude question whose options carry a preview, on the real question card
 * (composer-frame preview, delegated-request slot). The focused or hovered
 * option's preview shows under the options in a capped, scrollable box; an
 * option without one shows no box while the preview slot keeps its height. The box stays inside the card and does not
 * widen it. English and Korean, light and dark, a wide and a narrow composer.
 */

async function open(page: Page, args: { locale: "en" | "ko"; dark: boolean; narrow: boolean; composer?: boolean }) {
  const params = new URLSearchParams({
    stavePreview: "composer-frame",
    case: "idle",
    ...(args.composer ? { questionPreview: "1" } : { childRequest: "preview" }),
    lang: args.locale,
  });
  if (!args.dark) params.set("theme", "light");
  if (args.narrow) params.set("w", "420");
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(`/?${params}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByText("How should the billing table behave below 600px?")).toBeVisible();
}

const row = (page: Page, value: string) => page.locator(`label[data-option-value="${value}"]`);
const preview = (page: Page) => page.locator("[data-option-preview]");

for (const locale of ["en", "ko"] as const) {
  for (const dark of [false, true]) {
    for (const narrow of [false, true]) {
      for (const composer of [false, true]) {
        test(`option preview follows focus and hover (${locale}, ${dark ? "dark" : "light"}, ${narrow ? "narrow/compact" : "wide/regular"}, ${composer ? "composer" : "embedded"})`, async ({ page }) => {
          test.setTimeout(60_000);
          await open(page, { locale, dark, narrow, composer });
          await page.evaluate((compact) => {
            document.documentElement.dataset.uiDensity = compact ? "compact" : "regular";
          }, narrow);
          await page.evaluate(() => document.fonts.ready);
          const form = page.locator('form[data-user-input-state="input-requested"]');
          // Measure after the bottom-anchored composer has finished mounting.
          await form.evaluate((element) => new Promise<void>((resolve) => {
            let previous = "";
            let stableFrames = 0;
            const sample = () => {
              const box = element.getBoundingClientRect();
              const current = [box.x, box.y, box.width, box.height].join(",");
              stableFrames = current === previous ? stableFrames + 1 : 0;
              previous = current;
              if (stableFrames >= 12) resolve();
              else requestAnimationFrame(sample);
            };
            requestAnimationFrame(sample);
          }));
          const geometryBefore = await form.boundingBox();
          const optionsBefore = await page.locator("label[data-option-value]").evaluateAll(
            (elements) => elements.map((element) => element.getBoundingClientRect().top),
          );
          const expectStable = async () => {
            const after = await form.boundingBox();
            // Half a CSS pixel allows subpixel rounding, not a moving target.
            expect(Math.abs(after!.y - geometryBefore!.y)).toBeLessThanOrEqual(0.5);
            expect(Math.abs(after!.height - geometryBefore!.height)).toBeLessThanOrEqual(0.5);
            expect(await page.locator("label[data-option-value]").evaluateAll(
              (elements) => elements.map((element) => element.getBoundingClientRect().top),
            )).toEqual(optionsBefore);
          };
          await expect(form.getByRole("region")).toHaveCount(0);

          // Focus picks the option to preview.
          await row(page, "Scroll container").locator("input").focus();
          await expect(preview(page)).toHaveAttribute("data-option-preview", "Scroll container");
          await expect(preview(page)).toContainText("overflow-x: auto");
          await expect(form.getByRole("region")).toHaveAccessibleName(`${locale === "ko" ? "미리보기" : "Preview"} · Scroll container`);
          await expectStable();

          await row(page, "Scroll container").locator("input").press("ArrowDown");
          await expect(preview(page)).toHaveAttribute("data-option-preview", "Card list");
          await expectStable();
          await row(page, "Card list").locator("input").press("ArrowUp");
          await expect(preview(page)).toHaveAttribute("data-option-preview", "Scroll container");
          await expectStable();

          // Hover takes over; an option without a preview shows no box.
          await row(page, "Card list").hover();
          await expect(preview(page)).toHaveAttribute("data-option-preview", "Card list");
          await expectStable();
          const target = await row(page, "Hide secondary columns").boundingBox();
          // A real stationary pointer followed by mouse-down/up: no locator
          // retry may chase a row that moves when its preview disappears.
          await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2);
          await expect(preview(page)).toHaveCount(0);
          await page.evaluate(() => new Promise<void>((resolve) => {
            let frames = 0;
            const sample = () => ++frames === 12 ? resolve() : requestAnimationFrame(sample);
            requestAnimationFrame(sample);
          }));
          await expectStable();
          await page.mouse.down();
          await page.mouse.up();
          await expect(row(page, "Hide secondary columns").locator("input")).toBeChecked();
          await expect(form.getByRole("region")).toHaveCount(0);

          // Back to the scroll container for geometry.
          await row(page, "Scroll container").hover();
          const geometry = await preview(page).evaluate((element) => {
            const list = element.closest("fieldset")!.querySelector<HTMLElement>("label[data-option-value]")!.parentElement!;
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
          await expectStable();
          // Same column as the options, below them, never wider than the card.
          expect(Math.abs(geometry.left - geometry.listLeft)).toBeLessThanOrEqual(0.5);
          expect(Math.abs(geometry.right - geometry.listRight)).toBeLessThanOrEqual(0.5);
          expect(geometry.gapAbove).toBeGreaterThan(0);
          expect(geometry.viewportHeight).toBeLessThanOrEqual(geometry.viewportCap + 1);
          expect(geometry.textOverflowsX).toBe(false);
          // A region, not a live log: swapping previews is not announced.
          expect(geometry.role).toBe("region");
          expect(geometry.liveRole).toBeNull();
          // Start the keyboard phase outside the option rows. Focusing the
          // viewport can scroll the narrow card under a resting pointer and
          // switch the hovered preview before Tab is dispatched.
          await page.mouse.move(0, 0);
          await row(page, "Scroll container").locator("input").focus();
          await expect(preview(page)).toHaveAttribute("data-option-preview", "Scroll container");
          await preview(page).getByRole("region").focus();
          await expect(preview(page).getByRole("region")).toBeFocused();
          await page.keyboard.press("Tab");
          await expect(form.getByRole("button").first()).toBeFocused();
        });
      }
    }
  }
}
