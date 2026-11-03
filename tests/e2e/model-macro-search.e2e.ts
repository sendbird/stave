import { expect, test } from "@playwright/test";

test("the preset editor's model list searches names and ids and shows published prices", async ({ page }) => {
  await page.goto("/tests/e2e/fixtures/task-presets.html");
  await page.getByRole("button", { name: "Edit Planning", exact: true }).click();
  const form = page.locator("form");
  const model = form.getByRole("combobox", { name: /^Model/ });
  await expect(model).toContainText("Claude Opus 5.5");
  await model.click();
  const search = page.getByRole("combobox", { name: "Search models" });
  await expect(search).toBeFocused();
  await search.fill("opus");
  const rows = page.getByRole("listbox").getByRole("option");
  await expect(rows.first()).toBeVisible();
  for (const text of await rows.allInnerTexts()) expect(text.toLowerCase()).toContain("opus");
  // A Claude model carries its list price.
  await expect(rows.first()).toContainText("/ MTok");
  await search.fill("no-such-model");
  await expect(page.getByText("No models match.", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(model).toContainText("Claude Opus 5.5");
});

test("the composer's Macros list keeps its trigger in place and searches label, slug and description", async ({ page }) => {
  await page.goto("/?stavePreview=composer-frame&case=idle");
  const trigger = page.locator('[data-macro-control="true"]');
  await expect(trigger).toBeVisible();
  const before = (await trigger.boundingBox())!;
  await trigger.click();
  const search = page.getByRole("combobox", { name: "Search macros" });
  await expect(search).toBeFocused();
  const all = await page.getByRole("listbox").getByRole("option").count();
  expect(all).toBeGreaterThan(0);
  await search.fill("zzz-no-macro");
  await expect(page.getByText("No macros match.", { exact: true })).toBeVisible();
  await search.fill("");
  const first = page.getByRole("listbox").getByRole("option").first();
  const slug = (await first.innerText()).match(/!([\w-]+)/)?.[1];
  expect(slug).toBeTruthy();
  await search.fill(`!${slug}`);
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Escape");
  const after = (await trigger.boundingBox())!;
  expect(after.x).toBeCloseTo(before.x, 0);
  expect(after.y).toBeCloseTo(before.y, 0);
  expect(after.height).toBeCloseTo(before.height, 0);
});
