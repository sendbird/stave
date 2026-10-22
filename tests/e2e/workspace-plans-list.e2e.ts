import { expect, test, type Page } from "@playwright/test";

/** The preview's Documents section, its drawn document rows and its count line. */
function documents(page: Page) {
  const section = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Documents", exact: true }) });
  return {
    section,
    rows: section.locator('[title^=".stave/"]'),
    status: section.locator('[data-workspace-plans-status] [role="status"]'),
    search: section.getByRole("textbox", { name: "Search documents" }),
  };
}

test("the Documents list shows the ten most recent, says how many there are and reaches the rest", async ({ page }) => {
  await page.goto("/?stavePreview=information-rows&plans=many");
  const { section, rows, status, search } = documents(page);

  await expect(status).toHaveText("Showing the 10 most recent of 15");
  await expect(rows).toHaveCount(10);
  await expect(section.getByTitle(".stave/context/plans/oldest-audit-notes.md")).toHaveCount(0);

  // A search covers every document, so it finds one past the recent ten.
  await search.fill("audit");
  await expect(rows).toHaveCount(1);
  await expect(section.getByTitle(".stave/context/plans/oldest-audit-notes.md")).toBeVisible();
  await expect(status).toHaveText("1 of 15 documents match");

  // No match says so; Clear search brings the recent ten back.
  await search.fill("zzz");
  await expect(rows).toHaveCount(0);
  await expect(status).toHaveText("No documents match this search.");
  await section.locator("[data-workspace-plans-status]").getByRole("button", { name: "Clear search" }).click();
  await expect(search).toHaveValue("");
  await expect(rows).toHaveCount(10);

  // Escape clears a typed query.
  await search.fill("retry");
  await expect(rows).toHaveCount(1);
  await search.press("Escape");
  await expect(search).toHaveValue("");
  await expect(rows).toHaveCount(10);

  // Show all draws every document; Show recent only goes back to ten.
  await section.getByRole("button", { name: "Show all" }).click();
  await expect(rows).toHaveCount(15);
  await expect(status).toHaveText("Showing all 15");
  await expect(section.getByTitle(".stave/plans/0b91ff2c_20260901_initial-sweep.md")).toBeVisible();
  await section.getByRole("button", { name: "Show recent only" }).click();
  await expect(rows).toHaveCount(10);
});

test("ten or fewer documents show no search and no count line", async ({ page }) => {
  await page.goto("/?stavePreview=information-rows");
  const { section, rows, search } = documents(page);

  await expect(rows).toHaveCount(4);
  await expect(search).toHaveCount(0);
  await expect(section.locator("[data-workspace-plans-status]")).toHaveCount(0);
});
