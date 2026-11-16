import { expect, test } from "@playwright/test";

test("Fleet bulk keyboard, mouse, stop confirmation and rendered selection states", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const repositoryPath = "/tmp/stave-fleet-table";
    const now = Date.now();
    const iso = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
    const workspaces = Array.from({ length: 30 }, (_, index) => ({
      id: `ws-table-${index}`,
      name: `lane-${String(index).padStart(2, "0")}`,
      updatedAt: iso(60),
    }));
    const tasksOf = (index: number) =>
      Array.from({ length: index < 10 ? 4 : 3 }, (_, slot) => ({
        id: `task-${index}-${slot}`,
        title: `Task ${index}.${slot}`,
        provider: "codex",
        updatedAt: iso(30 + slot),
        unread: false,
        archivedAt: null,
      }));
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify(
        workspaces.map((workspace, index) => {
          const tasks = tasksOf(index);
          return {
            ...workspace,
            snapshot: {
              activeTaskId: tasks[0]!.id,
              tasks,
              messagesByTask: {},
              openTaskTabIds: tasks.map((task) => task.id),
            },
          };
        }),
      ),
    );
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          repositoryPath,
          repositoryName: "stave-fleet-table",
          workspaces,
          activeWorkspaceId: "ws-table-0",
          workspaceBranchById: Object.fromEntries(
            workspaces.map((workspace) => [workspace.id, workspace.name]),
          ),
          workspacePathById: Object.fromEntries(
            workspaces.map((workspace) => [workspace.id, repositoryPath]),
          ),
          workspaceDefaultById: { "ws-table-0": true },
          activeTaskId: "task-0-0",
          tasks: tasksOf(0),
          openTaskTabIds: tasksOf(0).map((task) => task.id),
          messagesByTask: {},
        },
        version: 0,
      }),
    );
    // Eight approvals in workspaces nobody opened; lane-29's has waited longest.
    window.localStorage.setItem(
      "stave:notifications-fallback:v1",
      JSON.stringify(
        [1, 5, 9, 13, 17, 21, 25, 29].map((index) => ({
          id: `n-approval-${index}`,
          kind: "task.approval_requested",
          title: `Approve step ${index}`,
          body: "Allow the command.",
          repositoryPath,
          repositoryName: "stave-fleet-table",
          workspaceId: `ws-table-${index}`,
          workspaceName: `lane-${String(index).padStart(2, "0")}`,
          taskId: `task-${index}-1`,
          taskTitle: `Task ${index}.1`,
          turnId: `turn-${index}-1`,
          providerId: "codex",
          action: { type: "approval", requestId: `approval-${index}`, messageId: `m-${index}` },
          payload: {},
          createdAt: iso(10 + index),
          readAt: null,
          resolvedAt: null,
          expiresAt: null,
        })),
      ),
    );
    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: { streamTurn: async () => [] },
      terminal: {
        runCommand: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }),
      },
      sourceControl: {
        getStatus: async () => ({
          ok: true,
          branch: "main",
          items: [],
          hasConflicts: false,
          stderr: "",
        }),
        getHistory: async () => ({ ok: true, items: [], stderr: "" }),
      },
    };
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/", {waitUntil:"domcontentloaded"});
  await expect(page.getByTestId("top-bar")).toBeVisible({timeout:60_000});
  // Two turns have gone quiet: one in the open workspace, one in a workspace
  // another surface already loaded.
  await page.evaluate(async () => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    const { createEmptyWorkspaceState } = await import(
      "/src/store/workspace-session-state.ts"
    );
    const turnStatus = await import("/src/lib/providers/turn-status.ts");
    const now = Date.now();
    const state = useAppStore.getState();
    let activity = state.providerTurnActivityByTask;
    for (const taskId of ["task-0-0", "task-3-0"]) {
      activity = turnStatus.startProviderTurnActivity({
        activityByTask: activity,
        taskId,
        turnId: `turn-${taskId}`,
        providerId: "codex",
        now: now - 25 * 60_000,
      });
      activity = {
        ...activity,
        [taskId]: {
          ...activity[taskId]!,
          lastEventAt: now - 15 * 60_000,
          stalledAt: now - 10 * 60_000,
        },
      };
    }
    const cachedTasks = Array.from({ length: 4 }, (_, slot) => ({
      id: `task-3-${slot}`,
      title: `Task 3.${slot}`,
      provider: "codex" as const,
      updatedAt: new Date(now - (30 + slot) * 60_000).toISOString(),
      unread: false,
      archivedAt: null,
    }));
    // The browser build lists only the worktrees it can find, so the
    // workspaces are restated after hydration.
    const workspaces = Array.from({ length: 30 }, (_, index) => ({
      id: `ws-table-${index}`,
      name: `lane-${String(index).padStart(2, "0")}`,
      updatedAt: new Date(now - 60 * 60_000).toISOString(),
    }));
    useAppStore.setState({
      workspaces,
      workspacePathById: Object.fromEntries(
        workspaces.map((workspace) => [workspace.id, "/tmp/stave-fleet-table"]),
      ),
      workspaceBranchById: Object.fromEntries(
        workspaces.map((workspace) => [workspace.id, workspace.name]),
      ),
      activeTurnIdsByTask: { "task-0-0": "turn-task-0-0" },
      providerTurnActivityByTask: activity,
      taskWorkspaceIdById: { "task-0-0": "ws-table-0", "task-3-0": "ws-table-3" },
      workspaceRuntimeCacheById: {
        "ws-table-3": {
          ...createEmptyWorkspaceState(),
          nativeSessionReadyByTask: {},
          tasks: cachedTasks,
          activeTaskId: "task-3-0",
          openTaskTabIds: cachedTasks.map((task) => task.id),
          messagesByTask: {},
          activeTurnIdsByTask: { "task-3-0": "turn-task-3-0" },
        },
      },
    } as never);
  });

  await page
    .getByTestId("top-bar")
    .getByRole("button", { name: "Open Fleet View" })
    .click();
  const layout = page.getByRole("radiogroup", { name: "Board layout" });
  await layout.getByRole("radio", { name: "Table" }).click();
  await expect(layout.getByRole("radio", { name: "Table" })).toHaveAttribute(
    "aria-checked",
    "true",
  );


  await expect(page.locator('[data-fleet-task-table-row]').first()).toBeVisible();
  for (const [locale, mode] of [["en", "light"], ["ko", "dark"]] as const) {
    await page.evaluate(async ({locale,mode}) => {
      const { applyAppLocale } = await import("/src/i18n/index.ts");
      const { applyThemeClass } = await import("/src/lib/themes/apply.ts");
      applyAppLocale(locale); applyThemeClass({enabled:mode === "dark"});
    }, {locale,mode});
    for (const width of [1440,1024]) {
      await page.setViewportSize({width,height:1000});
      await page.evaluate(async () => { await document.fonts.ready; const {useFleetSelectionStore} = await import('/src/store/fleet-selection-store.ts'); useFleetSelectionStore.getState().clear(); });
      await page.screenshot({animations:"disabled",path:`/tmp/fleet-bulk/after/${locale}-${mode}-${width}-0.png`});
      const first = page.locator('[data-fleet-task-table-row]').first();
      await first.getByRole('button').first().focus();
      await page.keyboard.press('x');
      await expect(first.getByRole('checkbox')).toBeChecked();
      await page.screenshot({animations:"disabled",path:`/tmp/fleet-bulk/after/${locale}-${mode}-${width}-1.png`});
      await page.keyboard.press('ControlOrMeta+a');
      const selected = await page.locator('[data-fleet-task-table-row]').getByRole('checkbox',{checked:true}).count();
      expect(selected).toBeGreaterThan(1);
      await page.screenshot({animations:"disabled",path:`/tmp/fleet-bulk/after/${locale}-${mode}-${width}-many.png`});
      await page.keyboard.press('Escape');
      await expect(first.getByRole('checkbox')).not.toBeChecked();
      await first.click({modifiers:['ControlOrMeta']});
      await expect(first.getByRole('checkbox')).toBeChecked();
    }
  }
  await page.evaluate(async () => { const {applyAppLocale}= await import('/src/i18n/index.ts'); applyAppLocale('en'); });
  await page.getByRole('button',{name:'Stop all',exact:true}).click();
  const confirmation=page.getByRole('dialog');
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText('turns');
  await page.keyboard.press('Enter');
  await expect(confirmation).not.toBeVisible(); // Cancel receives initial focus.
  await page.evaluate(async () => { const {useFleetSelectionStore}=await import('/src/store/fleet-selection-store.ts'); useFleetSelectionStore.getState().clear(); });
  const activeRow=page.locator('[data-fleet-task-table-row]').filter({hasText:'Task 0.0'});
  await activeRow.click({modifiers:['ControlOrMeta']});
  await page.locator('[data-fleet-bulk-control]').getByRole('button',{name:/^Stop \(/}).click();
  await expect.poll(() => page.evaluate(async () => { const {useAppStore}=await import('/src/store/app.store.ts'); return useAppStore.getState().activeTurnIdsByTask['task-0-0'] ?? null; })).toBeNull();
});
