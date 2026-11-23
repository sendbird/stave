import { expect, test, type Page } from "@playwright/test";

async function openPullRequest(page: Page, query = "") {
  await page.goto(`/?stavePreview=github-pr-activity${query}`);
  await page.getByRole("button", { name: /Keep the return path after sign-in/ }).click();
  await page.evaluate(() => document.fonts.ready);
}

test("posts a comment, replies to an outdated thread, and resolves and unresolves it", async ({ page }) => {
  await openPullRequest(page);
  await page.getByRole("tab", { name: "Conversation" }).click();
  await expect(page.getByText("Outdated", { exact: true })).toBeVisible();
  await expect(page.getByText(/expired-session-and-query-parameters.test.ts:38/)).toBeVisible();
  await expect(page.locator('time[datetime="2026-11-20T05:00:00Z"]').first()).toBeVisible();

  const comment = page.getByRole("textbox", { name: "Add a PR comment" });
  await comment.fill("Retested the redirect.");
  await page.getByRole("button", { name: "Post comment to GitHub" }).click();
  await expect(page.getByText("Retested the redirect.")).toBeVisible();
  await expect(comment).toBeEmpty();

  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await page.getByRole("textbox", { name: "Reply", exact: true }).fill("I reused the expiry fixture.");
  await page.getByRole("button", { name: "Post reply to GitHub" }).click();
  await expect(page.getByText("I reused the expiry fixture.")).toBeVisible();
  await page.getByRole("button", { name: "Resolve on GitHub", exact: true }).click();
  await expect(page.getByText("Resolved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Unresolve on GitHub", exact: true }).click();
  await expect(page.getByText("Unresolved", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Attach evidence for the agent…" }).click();
  const dialog = page.getByRole("dialog", { name: "Attach PR context" });
  await expect(dialog).toContainText("Fix the login redirect");
  await expect(dialog.getByText("Review threads", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Post comment to GitHub" })).toHaveCount(0);
});

test("loads logs on demand and refreshes the attempt after requesting a rerun", async ({ page }) => {
  await openPullRequest(page);
  await page.getByRole("tab", { name: /Checks/ }).click();
  await page.getByRole("button", { name: "Browser tests #5317" }).press("Enter");
  await expect(page.getByText("Step 5 · Run browser tests")).toBeVisible();
  await expect(page.getByLabel("Failed log tail", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Show failed log tail" }).click();
  await expect(page.getByLabel("Failed log tail", { exact: true })).toContainText("Received: /sign-in");
  await expect(page.getByText(/up to 16 KiB/)).toBeVisible();
  await page.getByRole("button", { name: "Re-run failed jobs" }).click();
  await expect(page.getByRole("status")).toContainText("Re-run requested on GitHub");
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByText("Attempt 2")).toBeVisible();
  await expect(page.getByText("Queued", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Re-run failed jobs" })).toHaveCount(0);
});

for (const { lang, theme, density, conversation, checks, logLabel, logControl } of [
  { lang: "en", theme: "light", density: "regular", conversation: "Conversation", checks: "Checks", logLabel: "Failed log tail", logControl: "Show failed log tail" },
  { lang: "ko", theme: "dark", density: "compact", conversation: "대화", checks: "검사", logLabel: "실패 로그 끝부분", logControl: "실패 로그 끝부분 보기" },
]) {
  for (const width of [320, 960]) {
    test(`thread path and log stay inside the rail at ${width}px (${lang}, ${theme}, ${density})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 780 });
      await openPullRequest(page, `&lang=${lang}&theme=${theme}&density=${density}${width === 960 ? "&wide" : ""}`);
      const panel = page.getByTestId("github-pr-activity-preview");
      await page.getByRole("tab", { name: new RegExp(conversation) }).click();
      const path = page.getByText(/expired-session-and-query-parameters.test.ts:38/);
      await expect(path).toBeVisible();
      const thread = path.locator("xpath=ancestor::li");
      expect(await thread.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
      await page.getByRole("tab", { name: new RegExp(checks) }).click();
      await page.getByRole("button", { name: "Browser tests #5317" }).click();
      await page.getByRole("button", { name: logControl, exact: true }).click();
      const log = page.getByLabel(logLabel, { exact: true });
      await expect(log).toBeVisible();
      const bounds = await panel.boundingBox();
      const logBounds = await log.boundingBox();
      if (!bounds || !logBounds) throw new Error("Missing panel or log bounds.");
      expect(logBounds.x + logBounds.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
      expect(await log.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    });
  }
}

test("shows an actionable GitHub CLI sign-in state", async ({ page }) => {
  await openPullRequest(page, "&scenario=unauthenticated");
  await page.getByRole("tab", { name: "Conversation" }).click();
  await expect(page.getByRole("alert")).toContainText("gh auth login");
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeEnabled();
});

test("shows an actionable GitHub CLI install state", async ({ page }) => {
  await openPullRequest(page, "&scenario=missing-gh");
  await page.getByRole("tab", { name: /Checks/ }).click();
  await expect(page.getByRole("alert")).toContainText("Install GitHub CLI");
});

test("drafts a Tars fix request without requesting a GitHub rerun", async ({ page }) => {
  await openPullRequest(page);
  await page.getByRole("tab", { name: /Checks/ }).click();
  await page.getByRole("button", { name: "Browser tests #5317" }).click();
  await page.getByRole("button", { name: "Draft a fix request" }).click();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("pr-activity-fix-draft"))).toBe("Fix the failing CI checks for https://github.com/example/widgets/pull/42.");
  await expect(page.getByRole("button", { name: "Re-run failed jobs" })).toBeEnabled();
  await expect(page.getByText("Attempt 1")).toBeVisible();
});
