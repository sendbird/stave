import { expect, test, type Page } from "@playwright/test";

async function seedDefaultWorkspaceOnUnexpectedBranch(page: Page) {
  await page.addInitScript(() => {
    let actualBranch = "feature/unexpected";
    const workspaceSnapshot = {
      activeTaskId: "task-branch-integrity",
      openTaskTabIds: ["task-branch-integrity"],
      activeSurface: { kind: "task", taskId: "task-branch-integrity" },
      tasks: [
        {
          id: "task-branch-integrity",
          title: "Branch integrity",
          provider: "codex",
          updatedAt: "2026-07-25T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { "task-branch-integrity": [] },
    };

    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: "ws-default",
          name: "main",
          updatedAt: "2026-07-25T00:00:00.000Z",
          snapshot: workspaceSnapshot,
        },
      ]),
    );
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          projectPath: "/tmp/stave-project",
          projectName: "stave-project",
          defaultBranch: "main",
          workspaces: [
            {
              id: "ws-default",
              name: "main",
              updatedAt: "2026-07-25T00:00:00.000Z",
            },
          ],
          activeWorkspaceId: "ws-default",
          workspaceBranchById: { "ws-default": "main" },
          workspacePathById: { "ws-default": "/tmp/stave-project" },
          workspaceDefaultById: { "ws-default": true },
          settings: { autoRoutingEnabled: true },
          ...workspaceSnapshot,
        },
        version: 0,
      }),
    );

    const branchCheckoutCalls: string[] = [];
    (
      window as unknown as {
        __branchCheckoutCalls?: string[];
        api?: Record<string, unknown>;
      }
    ).__branchCheckoutCalls = branchCheckoutCalls;
    (
      window as unknown as {
        api?: Record<string, unknown>;
      }
    ).api = {
      provider: {
        streamTurn: async () => [],
        getCodexModelCatalog: async () => ({
          ok: true,
          models: [],
          detail: "",
        }),
      },
      terminal: {
        runCommand: async () => ({
          ok: true,
          code: 0,
          stdout: "",
          stderr: "",
        }),
      },
      sourceControl: {
        getStatus: async () => ({
          ok: true,
          branch: actualBranch,
          items: [],
          hasConflicts: false,
          stderr: "",
        }),
        listBranches: async () => ({
          ok: true,
          current: actualBranch,
          branches: ["main", "feature/unexpected", "feature/english-input"],
          remoteBranches: [],
          worktreePathByBranch: {},
          stderr: "",
        }),
        checkoutBranch: async ({ name }: { name: string }) => {
          branchCheckoutCalls.push(name);
          actualBranch = name;
          return { ok: true, stdout: "", stderr: "" };
        },
      },
    };
  });
}

test("default workspace branch search accepts English typing and paste", async ({
  context,
  page,
}) => {
  await seedDefaultWorkspaceOnUnexpectedBranch(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 1100, height: 760 });
  await page.goto("/");

  const branchTrigger = page.getByRole("button", {
    name: /Default workspace is on feature\/unexpected instead of main/,
  });
  await expect(branchTrigger).toBeVisible();
  await branchTrigger.click();

  const search = page.getByPlaceholder("Search branches");
  await expect(search).toBeFocused();
  await search.fill("");
  await search.pressSequentially("feature/english-input");
  await expect(search).toHaveValue("feature/english-input");

  await search.fill("");
  await page.evaluate(() =>
    navigator.clipboard.writeText("feature/unexpected"),
  );
  await search.press(process.platform === "darwin" ? "Meta+V" : "Control+V");
  await expect(search).toHaveValue("feature/unexpected");
});

test("default workspace branch drift offers a return action", async ({
  page,
}) => {
  await seedDefaultWorkspaceOnUnexpectedBranch(page);
  await page.setViewportSize({ width: 1100, height: 760 });
  await page.goto("/");

  const branchTrigger = page.getByRole("button", {
    name: /Default workspace is on feature\/unexpected instead of main/,
  });
  await branchTrigger.click();

  await expect(
    page.getByText("Default workspace is on feature/unexpected", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Return", exact: true }).click();

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __branchCheckoutCalls?: string[];
            }
          ).__branchCheckoutCalls ?? [],
      ),
    )
    .toEqual(["main"]);
  await expect(
    page.getByRole("button", { name: "switch-branch" }),
  ).toContainText("main");
});
