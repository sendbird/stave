import { expect, test, type Page } from "@playwright/test";

/**
 * The Subagents tab with two delegated children in worktrees of their own
 * (`shared=1`): the one writing the changelog and the failed migration both
 * changed `server/users.ts` and `tests/users.test.ts`; the finished review
 * worked in the parent's own workspace and is not compared.
 */
function open(page: Page, args: { shared?: "1" | "none" | "missing"; lang?: "en" | "ko"; theme?: "light" | "dark"; width?: number } = {}) {
  return page.goto(
    `/?stavePreview=task-panel&task=agent-run&tab=team&stuck=1&shared=${args.shared ?? "1"}&panelWidth=${args.width ?? 560}&lang=${args.lang ?? "en"}&theme=${args.theme ?? "light"}`,
  );
}

const calls = (page: Page) => page.evaluate(() => (window as unknown as { __staveReviewDiffCalls?: Array<Record<string, unknown>> }).__staveReviewDiffCalls ?? []);

test("files two child worktrees changed are listed with who changed them", async ({ page }) => {
  await open(page);
  const section = page.getByTestId("shared-files");
  await expect(section.getByRole("heading", { name: "Shared files" })).toBeVisible();
  await expect(section.getByRole("status")).toHaveText("2 files changed in more than one worktree");
  const rows = section.locator("tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveAttribute("data-shared-file", "server/users.ts");
  await expect(rows.nth(1)).toHaveAttribute("data-shared-file", "tests/users.test.ts");
  await expect(rows.nth(0)).toContainText("2 agents");
  // A file only one worktree changed is not shared.
  await expect(section).not.toContainText("CHANGELOG.md");
  // Columns name the children, in the order they were delegated, and their
  // state; the child in the parent's own workspace has no column.
  const headers = section.locator("thead th");
  await expect(headers).toHaveCount(3);
  await expect(headers.nth(1)).toContainText("Migrate users table");
  await expect(headers.nth(1).locator("[data-state]")).toHaveAttribute("data-state", "failed");
  await expect(headers.nth(2)).toContainText("Write changelog entry");
  await expect(section).not.toContainText("Review users pagination");
  await expect(section).toContainText("file level; overlapping lines are not checked");
  // Each worktree is read once, against the merge-base with the default branch.
  const reads = (await calls(page)).filter((call) => "base" in call);
  expect(reads.map((call) => call.base)).toEqual(["merge-base", "merge-base"]);
});

test("Open diff reads that worktree's copy of the file", async ({ page }) => {
  await open(page);
  const section = page.getByTestId("shared-files");
  await section.getByRole("button", { name: "Open the diff of server/users.ts from Claude Sonnet 5 · Write changelog entry" }).click();
  await expect.poll(async () => (await calls(page)).filter((call) => "file" in call)).toEqual([
    { cwd: "/tmp/task-panel-preview-changelog", file: "server/users.ts", baseSha: "3f2a9c1d0b8e7f6a5c4d3e2f1a0b9c8d7e6f5a4b" },
  ]);
});

test("a second read keeps the known base while HEAD has not moved", async ({ page }) => {
  await open(page);
  const section = page.getByTestId("shared-files");
  await expect(section.locator("tbody tr")).toHaveCount(2);
  await section.getByRole("button", { name: "Read shared files again" }).click();
  await expect.poll(async () => (await calls(page)).filter((call) => "base" in call).map((call) => call.base)).toEqual([
    "merge-base", "merge-base", "commit", "commit",
  ]);
  await expect(section.locator("tbody tr")).toHaveCount(2);
});

test("with nothing in common it says so, and a missing worktree is named, not counted", async ({ page }) => {
  await open(page, { shared: "none" });
  await expect(page.getByTestId("shared-files").getByRole("status")).toHaveText("No file changed in more than one worktree");
  await expect(page.getByTestId("shared-files").locator("table")).toHaveCount(0);

  await open(page, { shared: "missing" });
  const section = page.getByTestId("shared-files");
  await expect(section.getByRole("status")).toHaveText("No file changed in more than one worktree");
  await expect(section.getByTestId("shared-files-unreadable")).toContainText("Not compared:");
  await expect(section.getByTestId("shared-files-unreadable")).toContainText("Migrate users table");
});

for (const lang of ["en", "ko"] as const) {
  for (const theme of ["light", "dark"] as const) {
    test(`the shared files table stays inside the rail (${lang}, ${theme})`, async ({ page }) => {
      await page.setViewportSize({ width: 600, height: 900 });
      await open(page, { lang, theme, width: 560 });
      await page.evaluate(() => document.fonts.ready);
      const section = page.getByTestId("shared-files");
      await expect(section.locator("tbody tr")).toHaveCount(2);
      const outer = (await section.boundingBox())!;
      const table = (await section.locator("table").boundingBox())!;
      // The table scrolls inside its frame rather than widening the rail.
      const frame = (await section.locator("table").locator("xpath=..").boundingBox())!;
      expect(frame.x + frame.width).toBeLessThanOrEqual(outer.x + outer.width + 0.5);
      expect(table.x).toBeGreaterThanOrEqual(outer.x - 0.5);
    });
  }
}
