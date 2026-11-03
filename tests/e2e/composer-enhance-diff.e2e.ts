import { expect, test, type Page } from "@playwright/test";

/**
 * Enhance's "View changes" on the real toast and popover (composer-frame
 * preview, `&enhanceDiff=1`). The toast keeps Undo and adds View changes; the
 * popover sits over the composer with a word diff that does not rest on
 * colour (struck-through `<del>`, underlined `<ins>`, spoken markers) and
 * Keep / Revert. English and Korean, light and dark, a wide and a narrow
 * composer.
 */

const SOURCE = "fix the bug in login where users end up on the wrong page";
const ENHANCED =
  "Fix the login redirect bug: after sign-in, users land on /home instead of the page they requested. Add a regression test.";

const COPY = {
  en: { toast: "Prompt enhanced", view: "View changes", undo: "Undo", keep: "Keep", revert: "Revert to original", title: "Changes from Enhance" },
  ko: { toast: "프롬프트 개선됨", view: "변경 보기", undo: "실행 취소", keep: "유지", revert: "원래대로 되돌리기", title: "프롬프트 개선으로 바뀐 내용" },
} as const;

async function open(page: Page, args: { locale: "en" | "ko"; dark: boolean; narrow: boolean }) {
  const params = new URLSearchParams({ stavePreview: "composer-frame", case: "idle", enhanceDiff: "1", lang: args.locale });
  if (!args.dark) params.set("theme", "light");
  if (args.narrow) params.set("w", "420");
  await page.goto(`/?${params}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByText(COPY[args.locale].toast)).toBeVisible();
}

for (const locale of ["en", "ko"] as const) {
  for (const dark of [false, true]) {
    for (const narrow of [false, true]) {
      test(`view changes opens a word diff over the composer (${locale}, ${dark ? "dark" : "light"}, ${narrow ? "narrow" : "wide"})`, async ({ page }) => {
        test.setTimeout(60_000);
        await open(page, { locale, dark, narrow });
        const copy = COPY[locale];

        // The toast keeps Undo and puts View changes before it, on one row
        // under the title, with neither label cut.
        const view = page.getByRole("button", { name: copy.view, exact: true });
        const undo = page.getByRole("button", { name: copy.undo, exact: true });
        await expect(view).toBeVisible();
        await expect(undo).toBeVisible();
        const [viewBox, undoBox, titleBox] = await Promise.all([
          view.boundingBox(),
          undo.boundingBox(),
          page.getByText(copy.toast).boundingBox(),
        ]);
        expect(viewBox!.x + viewBox!.width).toBeLessThanOrEqual(undoBox!.x);
        expect(Math.abs(viewBox!.y + viewBox!.height / 2 - (undoBox!.y + undoBox!.height / 2))).toBeLessThanOrEqual(1);
        expect(viewBox!.y).toBeGreaterThanOrEqual(titleBox!.y + titleBox!.height);
        for (const button of [view, undo]) {
          expect(await button.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
        }

        await view.click();
        const popover = page.locator('[data-slot="popover-content"]').filter({ hasText: copy.title });
        await expect(popover).toBeVisible();

        const geometry = await popover.evaluate((element) => {
          const anchor = document.querySelector<HTMLElement>('[data-testid="preview-composer-measure"]')!;
          const del = element.querySelector("del")!;
          const ins = element.querySelector("ins")!;
          const box = element.getBoundingClientRect();
          const anchorBox = anchor.getBoundingClientRect();
          const buttons = [...element.querySelectorAll("button")].map((button) => button.getBoundingClientRect());
          return {
            top: box.top,
            bottom: box.bottom,
            left: box.left,
            right: box.right,
            viewportWidth: window.innerWidth,
            anchorTop: anchorBox.top,
            anchorLeft: anchorBox.left,
            delDecoration: getComputedStyle(del).textDecorationLine,
            insDecoration: getComputedStyle(ins).textDecorationLine,
            delMarker: del.firstElementChild?.textContent ?? "",
            insMarker: ins.firstElementChild?.textContent ?? "",
            buttonCentres: buttons.map((rect) => rect.top + rect.height / 2),
            buttonsRight: Math.max(...buttons.map((rect) => rect.right)),
            overflowing: element.scrollWidth > element.clientWidth + 1,
          };
        });
        // Over the composer, starting at its leading edge, inside the window.
        expect(geometry.bottom).toBeLessThanOrEqual(geometry.anchorTop + 1);
        expect(Math.abs(geometry.left - geometry.anchorLeft)).toBeLessThanOrEqual(1);
        expect(geometry.top).toBeGreaterThanOrEqual(0);
        expect(geometry.left).toBeGreaterThanOrEqual(0);
        expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
        expect(geometry.overflowing).toBe(false);
        // Not colour alone: struck through, underlined, and named for a reader.
        expect(geometry.delDecoration).toContain("line-through");
        expect(geometry.insDecoration).toContain("underline");
        expect(geometry.delMarker.trim().length).toBeGreaterThan(0);
        expect(geometry.insMarker.trim().length).toBeGreaterThan(0);
        // Revert and Keep share one row at the trailing edge.
        expect(geometry.buttonCentres).toHaveLength(2);
        expect(Math.abs(geometry.buttonCentres[0]! - geometry.buttonCentres[1]!)).toBeLessThanOrEqual(1);
        expect(geometry.right - geometry.buttonsRight).toBeLessThanOrEqual(24);

        // Revert puts the draft back.
        await popover.getByRole("button", { name: copy.revert }).click();
        await expect(popover).toBeHidden();
        await expect(page.getByTestId("preview-composer-measure").getByText(SOURCE)).toBeVisible();
      });
    }
  }
}

test("keep closes the diff and leaves the rewrite in the draft", async ({ page }) => {
  await open(page, { locale: "en", dark: true, narrow: false });
  await page.getByRole("button", { name: "View changes", exact: true }).click();
  const popover = page.locator('[data-slot="popover-content"]').filter({ hasText: "Changes from Enhance" });
  await expect(popover).toBeVisible();
  await expect(popover).toContainText("Removed words:");
  await popover.getByRole("button", { name: "Keep" }).click();
  await expect(popover).toBeHidden();
  await expect(page.getByTestId("preview-composer-measure").getByText(ENHANCED)).toBeVisible();
});
