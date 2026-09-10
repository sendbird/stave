import { expect, test } from "@playwright/test";

test("memory row actions appear on hover without focusing them", async ({
  page,
}) => {
  await page.goto("/?stavePreview=information-rows");

  const row = page
    .locator("article")
    .filter({ hasText: "Use Bun for install, test and build" });
  await expect(row).toBeVisible();

  const edit = row.getByRole("button", { name: /Edit memory:/ });
  const trailOpacity = () =>
    edit.evaluate((button) => {
      const parent = button.parentElement;
      return parent ? Number(getComputedStyle(parent).opacity) : NaN;
    });

  expect(await trailOpacity()).toBeCloseTo(0, 1);

  await row.hover({ position: { x: 24, y: 12 } });

  await expect.poll(async () => trailOpacity()).toBeCloseTo(1, 1);
});
