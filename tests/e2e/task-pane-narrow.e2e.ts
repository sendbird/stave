import { expect, test, type Page } from "@playwright/test";

/**
 * A 1024x768 window with the Information panel open leaves the task pane
 * about 420px wide. The pane's header, its tabs and the composer still keep
 * one line each, every control stays reachable, and tabs are named by what
 * they are.
 */
async function seedNarrowPane(page: Page) {
  await page.addInitScript(() => {
    const repositoryPath = "/tmp/stave-narrow-pane";
    const workspace = { id: "ws-narrow", name: "narrow", updatedAt: "2026-10-22T01:00:00.000Z" };
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([{ ...workspace, snapshot: { activeTaskId: "", tasks: [], messagesByTask: {} } }]),
    );
    window.localStorage.setItem("stave-store", JSON.stringify({
      state: {
        repositoryPath, repositoryName: "stave-narrow-pane", workspaces: [workspace], activeWorkspaceId: workspace.id,
        workspaceBranchById: { [workspace.id]: "main" }, workspacePathById: { [workspace.id]: repositoryPath },
        workspaceDefaultById: { [workspace.id]: true }, activeTaskId: "", tasks: [], messagesByTask: {},
      },
      version: 0,
    }));
    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: { streamTurn: async () => [], respondApproval: async () => ({ ok: true }) },
      terminal: { runCommand: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }) },
      sourceControl: {
        getStatus: async () => ({ ok: true, branch: "main", items: [], hasConflicts: false, stderr: "" }),
        getHistory: async () => ({ ok: true, items: [], stderr: "" }),
      },
    };
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  await page.evaluate(async () => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    const at = "2026-10-22T01:00:00.000Z";
    const task = (id: string, title: string, provider: string) => ({ id, title, provider, updatedAt: at, unread: false, archivedAt: null });
    useAppStore.setState({
      workspaces: [{ id: "ws-narrow", name: "narrow", updatedAt: at }],
      tasks: [
        task("task-shell", "Persist sidebar state per window", "claude-code"),
        task("task-tests", "Stabilize flaky chat-scroll e2e", "codex"),
        task("task-copy", "Shorten settings descriptions", "claude-code"),
      ],
      activeTaskId: "task-shell",
      openTaskTabIds: ["task-shell", "task-tests", "task-copy"],
      messagesByTask: {
        "task-shell": [
          { id: "u1", role: "user", model: "", providerId: "user", content: "Run the shell specs.", parts: [{ type: "text", text: "Run the shell specs." }] },
          {
            id: "a1", role: "assistant", model: "claude-sonnet-4-5", providerId: "claude-code", content: "", turnId: "turn-live",
            parts: [{
              type: "approval", requestId: "approval-e2e", toolName: "Bash", description: "Run the shell e2e specs",
              input: JSON.stringify({ command: "bunx --bun playwright test tests/e2e/ui-shell.e2e.ts" }),
              state: "approval-requested", supportsAllowAlways: true,
            }],
          },
        ],
        "task-tests": [{ id: "u2", role: "user", model: "", providerId: "user", content: "Find the flake.", parts: [{ type: "text", text: "Find the flake." }] }],
        "task-copy": [],
      },
      activeTurnIdsByTask: { "task-shell": "turn-live" },
      taskWorkspaceIdById: { "task-shell": "ws-narrow" },
    } as never);
  });
  await page.getByTestId("workspace-bar").getByRole("button", { name: "Information", exact: true }).click();
  await expect(page.getByRole("region", { name: "Approval queue" })).toBeVisible();
}

test("tabs are named by task, provider and status, with a 24px close target", async ({ page }) => {
  await seedNarrowPane(page);
  await expect(page.getByRole("tab", { name: "Persist sidebar state per window, Claude, awaiting approval" })).toHaveCount(1);
  await expect(page.getByRole("tab", { name: "Stabilize flaky chat-scroll e2e, Codex" })).toHaveCount(1);
  await expect(page.getByRole("tab", { name: /^task:/ })).toHaveCount(0);
  const close = page.getByTestId("close-pane-task:task-shell");
  const box = await close.boundingBox();
  expect(box?.width).toBe(24);
  expect(box?.height).toBe(24);
});

test("the narrow header keeps one line and names the overflowed tabs", async ({ page }) => {
  await seedNarrowPane(page);
  const modeSwitch = page.getByTestId("pane-header-mode-switch");
  await expect(modeSwitch.getByRole("button", { name: "Conversation" })).toBeVisible();
  await expect(modeSwitch.getByRole("button", { name: "Review" })).toBeVisible();
  expect((await modeSwitch.boundingBox())!.height).toBeLessThanOrEqual(36);
  // The pane's own actions stay inside the pane.
  const paneOptions = page.getByRole("button", { name: "Pane options" }).first();
  const pane = await page.locator(".dv-groupview").first().boundingBox();
  const options = await paneOptions.boundingBox();
  expect(options!.x + options!.width).toBeLessThanOrEqual(pane!.x + pane!.width + 0.5);

  const more = page.getByRole("button", { name: /^\d+ more tasks?$/ });
  await expect(more).toBeVisible();
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".dv-tabs-overflow-container")).toBeVisible();
});

test("the composer keeps its controls on one row and reachable from More", async ({ page }) => {
  await seedNarrowPane(page);
  // The idle task has the full control set.
  await page.getByRole("tab", { name: /^Stabilize flaky chat-scroll e2e/ }).click();
  const lane = page.locator('[data-composer-toolbar="true"]:visible');
  await expect(lane).toHaveCount(1);
  await expect(page.getByRole("tab", { name: /^Stabilize flaky chat-scroll e2e/ })).toHaveAttribute("aria-selected", "true");
  await expect(lane.getByRole("button", { name: /^More composer controls/ })).toBeVisible();
  // One row of controls, and a composer about a third of its wrapped height.
  const rowHeight = await lane.evaluate((element) => element.parentElement!.getBoundingClientRect().height);
  expect(rowHeight).toBeLessThanOrEqual(40);
  const composer = await page.locator(".prompt-input-shell:visible").boundingBox();
  expect(composer!.height).toBeLessThanOrEqual(130);

  // The side question stays a direct action, as a glyph that keeps its name.
  const sideQuestion = page.locator('[data-testid="composer-side-question"]:visible');
  await expect(sideQuestion).toHaveAttribute("data-compact", "true");
  await expect(sideQuestion).toHaveAccessibleName(/Ask about this task/);

  await lane.getByRole("button", { name: /^More composer controls/ }).click();
  const menu = page.locator('[data-composer-control-menu="true"]');
  await expect(menu).toBeVisible();
  expect(await menu.locator("[data-composer-control-menu-item]").count()).toBeGreaterThan(0);
});

test("a pending approval is shown once, attached to the composer", async ({ page }) => {
  await seedNarrowPane(page);
  await expect(page.locator("[data-approval-request-id]")).toHaveCount(1);
  await expect(page.getByText(/Needs your attention/)).toHaveCount(0);
});
