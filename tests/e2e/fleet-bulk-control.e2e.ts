import { expect, test, type Page } from "@playwright/test";

async function seed(page: Page) {
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
    // Reuse the app graph revision; a bare import can create a separate store after HMR.
    const { useAppStore } = await import(performance.getEntriesByType("resource").filter((entry) => new URL(entry.name).pathname === "/src/store/app.store.ts").at(-1)!.name);
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
}

test("Fleet bulk keyboard, mouse, stop confirmation and rendered selection states", async ({page}) => {
  test.setTimeout(120_000);
  await seed(page);
  await page.evaluate(async () => {
    const { useFleetSelectionStore } = await import('/src/store/fleet-selection-store.ts');
    useFleetSelectionStore.getState().selectAll();
  });
  await page.evaluate(async () => {
    const {useAppStore} = await import(performance.getEntriesByType("resource").filter((entry) => new URL(entry.name).pathname === "/src/store/app.store.ts").at(-1)!.name);
    useAppStore.getState().updateSettings({patch:{themeMode:'light'}});
  });
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  const toolbar = page.locator('[data-fleet-bulk-control]');
  await expect(toolbar).toHaveCount(1);
  await expect(toolbar.getByRole('button',{name:'Stop all',exact:true})).toHaveCount(0);
  const snooze = toolbar.getByRole('button',{name:/^Snooze \(/});
  await expect(snooze).toBeVisible();
  await snooze.click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.screenshot({animations:'disabled',path:'/tmp/fleet-bulk/after2/en-light-1440-snooze-open.png'});
  await page.keyboard.press('Escape');
  await page.evaluate(async () => {
    const {useFleetSelectionStore} = await import('/src/store/fleet-selection-store.ts');
    const store = useFleetSelectionStore.getState(); store.clear();
    useFleetSelectionStore.getState().toggle(store.visibleTargets[0]!.key);
  });
  await page.evaluate(() => document.fonts.ready);
  // The count reads at the bar's button size and shares their centre line.
  const line = await toolbar.evaluate(bar => {
    const centre = (node: Node) => { const range = document.createRange(); range.selectNodeContents(node); const box = range.getBoundingClientRect(); return box.top + box.height / 2; };
    const label = bar.querySelector('[role="status"]')!;
    const buttons = [...bar.querySelectorAll('button')].filter(button => button.textContent?.trim());
    return { label: getComputedStyle(label).fontSize, sizes: [...new Set(buttons.map(button => getComputedStyle(button).fontSize))], offsets: buttons.map(button => Math.abs(centre(button) - centre(label))) };
  });
  expect(line.sizes).toEqual([line.label]);
  for (const offset of line.offsets) expect(offset).toBeLessThanOrEqual(0.5);
  await toolbar.getByRole('button',{name:'More',exact:true}).click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.screenshot({animations:'disabled',path:'/tmp/fleet-bulk/after2/en-light-1440-more-open.png'});
  await page.keyboard.press('Escape');
  await page.setViewportSize({width:1024,height:900});
  const lineBox = await toolbar.boundingBox();
  expect(lineBox!.height).toBeLessThan(64);
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
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText('Stop 1 task?');
  await confirmation.getByRole('button',{name:'Confirm',exact:true}).click();
  await expect.poll(() => page.evaluate(async () => { const {useAppStore}=await import(performance.getEntriesByType("resource").filter((entry) => new URL(entry.name).pathname === "/src/store/app.store.ts").at(-1)!.name); return useAppStore.getState().activeTurnIdsByTask['task-0-0'] ?? null; })).toBeNull();
});


test("S1 bulk Stop targets exactly the applicable running selection", async ({page}) => {
  test.setTimeout(120_000);
  await seed(page);
  await page.evaluate(async () => {
    const {useAppStore} = await import(performance.getEntriesByType("resource").filter((entry) => new URL(entry.name).pathname === "/src/store/app.store.ts").at(-1)!.name);
    const {useFleetSelectionStore} = await import('/src/store/fleet-selection-store.ts');
    const selected = useFleetSelectionStore.getState(); selected.clear();
    for (const target of selected.visibleTargets) if (['task-0-0','task-2-1','task-3-0'].includes(target.taskId)) selected.toggle(target.key);
    const calls = {stopped:[] as string[],switched:[] as string[]};
    (window as unknown as {fleetCalls:typeof calls}).fleetCalls = calls;
    useAppStore.setState({
      abortTaskTurn:async ({taskId}) => { calls.stopped.push(taskId); return true; },
      switchWorkspace:async ({workspaceId}) => { calls.switched.push(workspaceId); },
    });
  });
  await expect(page.locator('[data-fleet-bulk-control]').getByRole('button',{name:'Stop (2)',exact:true})).toBeVisible();
  await page.locator('[data-fleet-bulk-control]').getByRole('button',{name:'Stop (2)',exact:true}).click();
  const dialog = page.getByRole('dialog');
  const confirmButton = dialog.getByRole('button',{name:'Confirm',exact:true});
  if (await confirmButton.isVisible()) await confirmButton.click();
  await expect.poll(() => page.evaluate(() => { const calls = (window as unknown as {fleetCalls:{stopped:string[];switched:string[]}}).fleetCalls; return {stopped:calls.stopped.slice().sort(),switched:calls.switched}; })).toEqual({stopped:['task-0-0','task-3-0'],switched:[]});
});

test("S2 bulk Archive excludes running and waiting tasks and confirms applicable count", async ({page}) => {
  test.setTimeout(120_000);
  await seed(page);
  await page.evaluate(async () => {
    const {useFleetSelectionStore} = await import('/src/store/fleet-selection-store.ts');
    const state = useFleetSelectionStore.getState(); state.clear();
    for (const target of state.visibleTargets) if (['task-0-0','task-0-1','task-29-1'].includes(target.taskId)) state.toggle(target.key);
  });
  const archive = page.locator('[data-fleet-bulk-control]').getByRole('button',{name:/^Archive \(/});
  await expect(archive).toHaveText('Archive (1)');
  await archive.click();
  await expect(page.getByRole('dialog')).toContainText('Archive 1 task?');
  await expect(page.getByRole('dialog')).toContainText('Work is still running');
  await expect(page.getByRole('dialog')).toContainText('Waiting for an approval or answer');
});

test("Fleet selection marks cold tasks unread and read without changing workspace", async ({ page }) => {
  await seed(page);
  const targets = await page.evaluate(async () => {
    const { useFleetSelectionStore } = await import('/src/store/fleet-selection-store.ts');
    const selection = useFleetSelectionStore.getState();
    selection.clear();
    const targets = selection.visibleTargets.filter(item => item.workspaceId !== 'ws-table-0').slice(0, 2);
    for (const target of targets) useFleetSelectionStore.getState().toggle(target.key);
    return targets;
  });
  expect(targets).toHaveLength(2);
  const toolbar = page.locator('[data-fleet-bulk-control]');
  await toolbar.getByRole('button', { name: 'More', exact: true }).click();
  // One read item per direction: the old outcome-only "Mark read (n)" is merged in.
  await expect(page.getByRole('menuitem', { name: /^Mark read/ })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: /^Mark as read/ })).toHaveCount(1);
  await page.getByRole('menuitem', { name: 'Mark as unread (2)', exact: true }).click();
  for (const target of targets) {
    await expect(page.locator('[data-fleet-task-table-row]').filter({has:page.locator(`[data-task-unread="${target.taskId}"]`)})).toHaveCount(1);
  }
  await page.screenshot({path:'/tmp/gap-h1/after2/fleet-bulk-unread-en-light-1440.png'});
  await toolbar.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Mark as read (2)', exact: true }).click();
  for (const target of targets) await expect(page.locator(`[data-task-unread="${target.taskId}"]`)).toHaveCount(0);
  expect(await page.evaluate(async () => {
    const {useAppStore}=await import(performance.getEntriesByType('resource').filter(entry=>new URL(entry.name).pathname==='/src/store/app.store.ts').at(-1)!.name);
    return useAppStore.getState().activeWorkspaceId;
  })).toBe('ws-table-0');
});
