import { expect, test } from "@playwright/test";
import type {} from "./fixtures/workspace-file-search";

test.beforeEach(async ({ page }) => {
  await page.goto("/tests/e2e/fixtures/workspace-file-search.html");
});

test("a slower response cannot replace the latest Explorer search", async ({ page }) => {
  const input = page.locator("[data-explorer-search-input]");
  await input.fill("slow");
  await expect.poll(() => page.evaluate(() => window.workspaceFileSearch.requests.at(-1)?.query)).toBe("slow");
  await input.fill("fast");
  await expect.poll(() => page.evaluate(() => window.workspaceFileSearch.requests.at(-1)?.query)).toBe("fast");
  await page.evaluate(() => window.workspaceFileSearch.reply("fast", {
    ok: true, results: [{ file: "fast.ts", matches: [{ line: 1, text: "fast" }] }], limitHit: false,
  }));
  await expect(page.getByText("fast.ts", { exact: true })).toBeVisible();
  await page.evaluate(() => window.workspaceFileSearch.reply("slow", {
    ok: true, results: [{ file: "slow.ts", matches: [{ line: 1, text: "slow" }] }], limitHit: false,
  }));
  await expect(page.getByText("fast.ts", { exact: true })).toBeVisible();
  await expect(page.getByText("slow.ts", { exact: true })).toHaveCount(0);
});

test("switching workspace cancels the previous workspace's Explorer search", async ({ page }) => {
  const input = page.locator("[data-explorer-search-input]");
  await input.fill("old");
  await expect.poll(() => page.evaluate(() => window.workspaceFileSearch.requests.at(-1)?.workspaceId)).toBe("workspace-a");
  await page.evaluate(() => window.workspaceFileSearch.showWorkspace("workspace-b"));
  await expect(input).toHaveValue("");
  await expect.poll(() => page.evaluate(() => window.workspaceFileSearch.cancellations)).toEqual([
    { workspaceId: "workspace-a", surface: "explorer" },
  ]);
  await page.evaluate(() => window.workspaceFileSearch.reply("old", {
    ok: false, stderr: "Error from old workspace",
  }));
  await expect(page.getByText("Error from old workspace")).toHaveCount(0);
  await input.fill("new");
  await expect.poll(() => page.evaluate(() => window.workspaceFileSearch.requests.at(-1)?.workspaceId)).toBe("workspace-b");
  await page.evaluate(() => window.workspaceFileSearch.reply("new", { ok: true, results: [], limitHit: true }));
  await expect(page.getByText(/result limit reached/)).toBeVisible();
  await expect(page.getByText("No results found.", { exact: true })).toHaveCount(0);
});
