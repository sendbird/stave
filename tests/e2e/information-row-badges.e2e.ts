import { expect, test } from "@playwright/test";

for (const width of [300, 340, 420]) {
  for (const dark of [false, true]) {
    test(`information chips stay contained at ${width}px in ${dark ? "dark" : "light"}`, async ({ page }) => {
      await page.goto("/?stavePreview=information-rows");
      const rail = page.locator("[data-review-information-rail]");
      await rail.evaluate((element, width) => {
        element.style.inlineSize = `${width}px`;
      }, width);
      if (dark) await page.getByRole("button", { name: "Light", exact: true }).click();

      const badges = page.locator('[data-review-storybook] [data-slot="badge"]');
      await expect(badges).toHaveCount(4);
      const geometry = await badges.evaluateAll((elements) => elements.map((element) => {
        const box = element.getBoundingClientRect();
        const label = element.firstElementChild!;
        const labelBox = label.getBoundingClientRect();
        return {
          height: box.height,
          contained: element.scrollWidth <= element.clientWidth,
          labelContained: labelBox.left >= box.left && labelBox.right <= box.right,
          labelFits: label.scrollWidth <= label.clientWidth,
          ellipsis: getComputedStyle(label).textOverflow,
        };
      }));
      for (const [index, badge] of geometry.entries()) {
        expect(badge.height).toBe(20);
        expect(badge.contained).toBe(true);
        expect(badge.labelContained).toBe(true);
        if (index % 2 === 0) expect(badge.labelFits).toBe(true);
        else expect(badge.ellipsis).toBe("ellipsis");
      }

      const longBadge = page.locator('[data-review-badges] [data-slot="badge"]').first();
      const label = longBadge.locator('[data-ads-slot="label"]');
      await expect(label).toHaveCSS("text-overflow", "ellipsis");
      expect(await longBadge.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

      const paint = (selector: string) => page.locator(selector).evaluate((element) => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, color: style.color };
      });
      expect(await paint("[data-review-shim-solid]")).toEqual(await paint("[data-review-ads-solid]"));

      const title = page.getByRole("button", { name: "Companion Rich UI — long component title" }).first();
      await title.focus();
      await expect(title).toBeFocused();
      const remove = page.locator("[data-review-storybook]").getByRole("button", { name: "Remove", exact: true }).first();
      await page.keyboard.press("Tab");
      await expect(remove).toBeFocused();
      await expect(remove).toBeVisible();
    });
  }
}
