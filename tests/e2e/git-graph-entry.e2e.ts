import { expect, test, type Page } from "@playwright/test";

async function seedProject(page: Page, options: { withWorkspace: boolean }) {
  await page.addInitScript(({ withWorkspace }) => {
    const workspaceId = withWorkspace ? "workspace-1" : "";
    const workspace = {
      id: "workspace-1",
      name: "main",
      updatedAt: "2026-07-31T00:00:00.000Z",
    };
    const workspaceSnapshot = {
      activeTaskId: "",
      openTaskTabIds: [],
      tasks: [],
      messagesByTask: {},
    };

    if (withWorkspace) {
      window.localStorage.setItem(
        "stave:workspace-fallback:v1",
        JSON.stringify([
          {
            ...workspace,
            snapshot: workspaceSnapshot,
          },
        ]),
      );
    }
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          projectPath: "/tmp/stave-project",
          projectName: "stave-project",
          defaultBranch: "main",
          workspaces: withWorkspace ? [workspace] : [],
          activeWorkspaceId: workspaceId,
          workspaceBranchById: withWorkspace ? { [workspaceId]: "main" } : {},
          workspacePathById: withWorkspace
            ? { [workspaceId]: "/tmp/stave-project" }
            : {},
          workspaceDefaultById: withWorkspace ? { [workspaceId]: true } : {},
          settings: { autoRoutingEnabled: true },
          ...workspaceSnapshot,
        },
        version: 0,
      }),
    );

    (
      window as unknown as {
        api?: Record<string, unknown>;
      }
    ).api = {
      provider: {
        getCodexModelCatalog: async () => ({
          ok: true,
          models: [],
          detail: "",
        }),
      },
      sourceControl: {
        getStatus: async () => ({
          ok: true,
          branch: "main",
          items: [],
          hasConflicts: false,
          stderr: "",
        }),
        listBranches: async () => ({
          ok: true,
          current: "main",
          branches: ["main"],
          remoteBranches: [],
          worktreePathByBranch: {},
          stderr: "",
        }),
      },
    };
  }, options);
}

test("shows Git Graph beside branch information instead of in the right rail", async ({
  page,
}) => {
  await seedProject(page, { withWorkspace: true });
  await page.goto("/");

  const topBarButton = page
    .getByTestId("top-bar")
    .getByRole("button", { name: "Git Graph" });
  await expect(topBarButton).toBeVisible();
  await expect(topBarButton).toBeEnabled();
  await expect(topBarButton).toHaveText("Git Graph");
  await expect(
    page
      .getByTestId("workspace-bar")
      .getByRole("button", { name: "Git Graph" }),
  ).toHaveCount(0);
});

test("disables Git Graph when there is no active workspace", async ({
  page,
}) => {
  await seedProject(page, { withWorkspace: true });
  await page.goto("/");
  await page.evaluate(async () => {
    const storeModulePath = "/src/store/app.store.ts";
    const { useAppStore } = (await import(
      storeModulePath
    )) as typeof import("@/store/app.store");
    useAppStore.setState({
      activeWorkspaceId: "",
      workspaces: [],
      workspacePathById: {},
    });
  });

  await expect(
    page.getByTestId("top-bar").getByRole("button", { name: "Git Graph" }),
  ).toBeDisabled();
});
