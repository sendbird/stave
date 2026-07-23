import { expect, test } from "@playwright/test";

const FIGMA_BOARD_URL =
  "https://www.figma.com/board/eCNzNnA1yqbGxQZbRq5UsW/2607_Actionbook---Knowledge-Sort-Filter---Shared-Asset-Search?node-id=2001-179&p=f&t=Xw0hZUa9FtYkgU3e-0";
const JIRA_ISSUE_URL = "https://company.atlassian.net/browse/DFE-1234";

function seedWorkspace(page: import("@playwright/test").Page) {
  return page.addInitScript(() => {
    // Keep the browser-only dev bridge from replacing this deterministic
    // fixture with host lookups that are unavailable in Playwright.
    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: { streamTurn: async () => [] },
      terminal: {
        runCommand: async () => ({
          ok: true,
          code: 0,
          stdout: "",
          stderr: "",
        }),
      },
    };
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: "ws-main",
          name: "main",
          updatedAt: "2026-03-06T01:00:00.000Z",
          snapshot: {
            activeTaskId: "task-1",
            openTaskTabIds: ["task-1"],
            activeSurface: { kind: "task", taskId: "task-1" },
            tasks: [
              {
                id: "task-1",
                title: "Badge task",
                provider: "claude-code",
                updatedAt: "2026-03-06T01:00:00.000Z",
                unread: false,
                archivedAt: null,
              },
            ],
            messagesByTask: { "task-1": [] },
          },
        },
      ]),
    );
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          projectPath: "/tmp/stave-project",
          projectName: "stave-project",
          workspaces: [
            {
              id: "ws-main",
              name: "main",
              updatedAt: "2026-03-06T01:00:00.000Z",
            },
          ],
          activeWorkspaceId: "ws-main",
          workspaceBranchById: { "ws-main": "main" },
          workspacePathById: { "ws-main": "/tmp/stave-project" },
          workspaceDefaultById: { "ws-main": true },
          activeTaskId: "task-1",
          openTaskTabIds: ["task-1"],
          activeSurface: { kind: "task", taskId: "task-1" },
          tasks: [
            {
              id: "task-1",
              title: "Badge task",
              provider: "claude-code",
              updatedAt: "2026-03-06T01:00:00.000Z",
              unread: false,
              archivedAt: null,
            },
          ],
          messagesByTask: { "task-1": [] },
        },
        version: 0,
      }),
    );
  });
}

test("pasted Figma link tokenizes into a badge chip in the prompt input", async ({
  page,
}) => {
  await seedWorkspace(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const editor = page.locator('[data-prompt-lexical-editor="true"]');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.insertText(FIGMA_BOARD_URL);

  // The URL becomes a chip whose label is the humanized Figma file title.
  await expect(editor).toContainText(
    "2607 Actionbook Knowledge Sort Filter Shared Asset Search",
  );
  const chip = editor.locator(`span[title="${FIGMA_BOARD_URL}"]`);
  await expect(chip).toBeVisible();
});

test("typed Jira issue link tokenizes into an issue-key badge chip", async ({
  page,
}) => {
  await seedWorkspace(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const editor = page.locator('[data-prompt-lexical-editor="true"]');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.type(`See ${JIRA_ISSUE_URL} today`);

  const chip = editor.locator(`span[title="${JIRA_ISSUE_URL}"]`);
  await expect(chip).toBeVisible();
  await expect(chip).toContainText("DFE-1234");
  await expect(editor).toContainText("See");
  await expect(editor).toContainText("today");
});
