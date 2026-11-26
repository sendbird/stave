import { expect, test } from "@playwright/test";

// The actual palette and cleanup components run against a simulated host API.
// Git, SQLite and runtime guards are covered by the host integration tests.
test("palette opens cleanup, archive can be undone and archived work restored", async ({ page }) => {
  await page.goto("/?stavePreview=command-palette&cleanupPreview=1");
  await page.getByPlaceholder("Find a command, task, workspace, or setting").fill("Clean up workspaces");
  await page.getByText("Clean up workspaces", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Clean up workspaces" })).toBeVisible();
  const row = page.getByTestId("cleanup-row-cleanup-one");
  await row.getByRole("checkbox").click();
  await page.getByRole("button", { name: "Archive (1)", exact: true }).click();
  await expect(page.getByRole("dialog").last()).toContainText("tasks, messages and history");
  await page.getByRole("button", { name: "Confirm action" }).click();
  await expect(row).toContainText("Archived");
  await page.getByRole("button", { name: "Undo archive" }).click();
  await expect(row).not.toContainText("Archived");
  await page.getByTestId("cleanup-row-cleanup-archived").getByRole("checkbox").click();
  await page.getByRole("button", { name: "Restore (1)", exact: true }).click();
  await expect(page.getByTestId("cleanup-row-cleanup-archived")).not.toContainText("Archived");
  await page.getByRole("button", { name: "Select all ready" }).click();
  await expect(page.getByTestId("cleanup-row-cleanup-dirty").getByRole("checkbox")).not.toBeChecked();
});

test("blocked rows cannot be selected, zero-count actions are hidden and archived rows have no size", async ({ page }) => {
  await page.goto("/?stavePreview=command-palette&cleanupPreview=1");
  await page.getByPlaceholder("Find a command, task, workspace, or setting").fill("Clean up workspaces");
  await page.getByText("Clean up workspaces", { exact: true }).click();
  const footer = page.locator("[data-cleanup-footer]");
  await expect(page.getByTestId("cleanup-row-cleanup-one")).toBeVisible();
  await expect(footer.getByRole("button")).toHaveCount(0);
  const blocked = page.getByTestId("cleanup-row-cleanup-dirty");
  const checkbox = blocked.getByRole("checkbox");
  await expect(checkbox).toBeDisabled();
  await expect(checkbox).toHaveAccessibleDescription("Can't be selected: Changed files");
  await expect(blocked).toContainText("Changed files");
  await expect(blocked.getByRole("button")).toHaveCount(0);
  await expect(page.getByTestId("cleanup-row-cleanup-archived")).toContainText("No worktree");
  await expect(page.getByTestId("cleanup-row-cleanup-archived")).not.toContainText("0.0 MB");
  await page.getByTestId("cleanup-row-cleanup-one").getByRole("button").click();
  await page.getByTestId("cleanup-row-cleanup-archived").getByRole("button").click({ modifiers: ["Shift"] });
  await expect(checkbox).not.toBeChecked();
  const reversible = footer.getByRole("group", { name: "Reversible actions" });
  const destructive = footer.getByRole("group", { name: "Destructive actions" });
  await expect(reversible.getByRole("button")).toHaveText(["Archive (1)", "Restore (1)"]);
  await expect(destructive.getByRole("button")).toHaveText(["Delete permanently (2)"]);
  await expect(footer.getByRole("button", { name: /^Delete branches/ })).toHaveCount(0);
});

for (const width of [1440, 1024]) for (const [lang, theme] of [["en", "light"], ["ko", "dark"]]) {
  test(`cleanup contains wrapping labels at ${width} ${lang} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/?stavePreview=command-palette&cleanupPreview=1&lang=${lang}&theme=${theme}`);
    const label = lang === "en" ? "Clean up workspaces" : "워크스페이스 정리";
    await page.locator("input[data-slot=command-input]").fill(label);
    await page.getByText(label, { exact: true }).click();
    const dialog = page.getByRole("dialog").last();
    await expect(dialog).toContainText(lang === "en" ? "Clean up workspaces" : "워크스페이스 정리");
    await expect(page.getByTestId("cleanup-row-cleanup-one")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const geometry = await dialog.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const row = element.querySelector('[data-testid="cleanup-row-cleanup-one"]')!;
      const checkbox = row.querySelector('[role="checkbox"]')!.getBoundingClientRect();
      const text = row.querySelector('button[aria-pressed]')!.getBoundingClientRect();
      return { right: box.right, width: box.width, overflow: element.scrollWidth > element.clientWidth, summaryHeight: element.querySelector("summary")!.getBoundingClientRect().height, checkboxHeight: checkbox.height, centerDifference: Math.abs((checkbox.top + checkbox.bottom) / 2 - (text.top + text.bottom) / 2) };
    });
    expect(geometry.right).toBeLessThanOrEqual(width);
    expect(geometry.overflow).toBe(false);
    expect(geometry.summaryHeight).toBeGreaterThanOrEqual(24);
    expect(geometry.checkboxHeight).toBeGreaterThanOrEqual(24);
    expect(geometry.centerDifference).toBeLessThan(1);
    await page.getByTestId("cleanup-row-cleanup-one").getByRole("checkbox").click();
    await page.getByTestId("cleanup-row-cleanup-archived").getByRole("checkbox").click();
    // Footer actions sit at the content's trailing edge: 8px inside a group, 16px between groups.
    const footer = await dialog.evaluate((element) => {
      const row = element.querySelector("[data-cleanup-footer]")!;
      const buttons = [...row.querySelectorAll("button")].map((button) => button.getBoundingClientRect());
      return { contentRight: element.querySelector('[aria-busy]')!.getBoundingClientRect().right, right: buttons.at(-1)!.right, gaps: buttons.slice(1).map((box, index) => Math.round(box.left - buttons[index]!.right)), centers: new Set(buttons.map((box) => box.top + box.height / 2)).size };
    });
    expect(footer.gaps).toEqual([8, 16]);
    expect(Math.abs(footer.right - footer.contentRight)).toBeLessThan(0.5);
    expect(footer.centers).toBe(1);
    await page.getByTestId("cleanup-row-cleanup-one").getByRole("checkbox").click();
    await page.getByTestId("cleanup-row-cleanup-archived").getByRole("checkbox").click();
    if (process.env.CLEANUP_SCREENSHOT_DIR) {
      const { mkdir } = await import("node:fs/promises");
      await mkdir(process.env.CLEANUP_SCREENSHOT_DIR, { recursive: true });
      const prefix = `${process.env.CLEANUP_SCREENSHOT_DIR}/${lang}-${theme}-${width}`;
      await page.screenshot({ animations: "disabled", path: `${prefix}-center.png` });
      await page.getByTestId("cleanup-row-cleanup-one").getByRole("checkbox").click();
      await page.getByRole("button", { name: lang === "en" ? "Delete permanently (1)" : "영구 삭제 (1)", exact: true }).click();
      await expect(page.getByRole("dialog").last().getByRole("button", { name: lang === "en" ? "Cancel" : "취소", exact: true })).toBeFocused();
      await page.screenshot({ animations: "disabled", path: `${prefix}-delete-dialog.png` });
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: lang === "en" ? "Archive (1)" : "보관 (1)", exact: true }).click();
      await expect(page.getByRole("dialog").last()).toContainText(lang === "en" ? "tasks, messages and history" : "기록");
      await page.screenshot({ animations: "disabled", path: `${prefix}-archive-dialog.png` });
    }

  });
}

test("mixed selection reports a blocked item and long lists virtualize", async ({ page }) => {
  await page.goto("/?stavePreview=command-palette&cleanupPreview=1&many=1");
  await page.getByPlaceholder("Find a command, task, workspace, or setting").fill("Clean up workspaces");
  await page.getByText("Clean up workspaces", { exact: true }).click();
  const first = page.getByTestId("cleanup-row-cleanup-one");
  await expect(first).toBeVisible();
  // The host re-checks at run time: a blocker that appears after the list was read is reported, not hidden.
  await page.evaluate(() => {
    const api = window.api!.workspaceCleanup;
    const act = api.act.bind(api);
    api.act = async (args) => args.workspaceId === "cleanup-extra-0" ? { ok: false, action: args.action, workspaceId: args.workspaceId, reason: "changedFiles" } : act(args);
  });
  await first.getByRole("button").click();
  // A range selection passes over the blocked row without selecting it.
  await page.getByTestId("cleanup-row-cleanup-extra-0").getByRole("button").click({ modifiers: ["Shift"] });
  await expect(page.getByTestId("cleanup-row-cleanup-dirty").getByRole("checkbox")).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Archive (2)", exact: true })).toBeEnabled();
  expect(await page.locator('[data-testid^="cleanup-row-"]').count()).toBeLessThan(80);
  await page.getByRole("button", { name: "Archive (2)", exact: true }).click();
  await page.getByRole("button", { name: "Confirm action" }).click();
  await expect(page.getByRole("status")).toContainText("Completed 1; skipped 1.");
  await expect(page.getByTestId("cleanup-row-cleanup-dirty")).toContainText("Changed files");
});

// Automatic checkout removal retains archive identity and the same Restore path.
test("recent automatic worktree removal offers restore", async ({ page }) => {
  await page.goto("/?stavePreview=command-palette&cleanupPreview=1");
  await page.getByPlaceholder("Find a command, task, workspace, or setting").fill("Clean up workspaces");
  await page.getByText("Clean up workspaces", { exact: true }).click();
  const row = page.getByTestId("cleanup-row-cleanup-archived");
  await expect(row).toContainText("Archived");
  await page.getByRole("button", { name: "Select all ready" }).click();
  await page.getByRole("button", { name: "Archive (1)", exact: true }).click();
  await expect(page.getByRole("dialog").last()).toContainText("Finished work");
  await expect(page.getByRole("dialog").last()).not.toContainText("Earlier work");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByText("Recent cleanup", { exact: true }).click();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(row).not.toContainText("Archived");
});


test("permanent delete confirmation focuses Cancel, ignores Enter and isolates Escape", async ({ page }) => {
  await page.goto("/?stavePreview=command-palette&cleanupPreview=1");
  await page.getByPlaceholder("Find a command, task, workspace, or setting").fill("Clean up workspaces");
  await page.getByText("Clean up workspaces", { exact: true }).click();
  const row = page.getByTestId("cleanup-row-cleanup-one");
  await row.getByRole("checkbox").click();
  await page.getByRole("button", { name: "Delete permanently (1)", exact: true }).click();
  const confirmation = page.getByRole("dialog").last();
  await expect(confirmation.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await confirmation.getByRole("button", { name: "Confirm action", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(confirmation).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Clean up workspaces" })).toBeVisible();
  await expect(row).toBeVisible();
});

test("archived shelf reads cheap records once across workspace edits and deduplicates invalidations", async ({ page }) => {
  await page.goto("/?stavePreview=command-palette&cleanupPreview=1");
  await page.waitForFunction(() => Boolean(window.api?.workspaceCleanup));
  await page.evaluate(async () => {
    const resources = performance.getEntriesByType("resource");
    const moduleUrl = (name: string) => resources.find(entry => new URL(entry.name).pathname.endsWith(`/deps/${name}.js`))!.name;
    const React = (await import(moduleUrl("react"))).default;
    const { createRoot } = (await import(moduleUrl("react-dom_client"))).default;
    const { ArchivedWorkspaceShelf } = await import("/src/components/layout/ArchivedWorkspaceShelf.tsx");
    const { useAppStore } = await import("/src/store/app.store.ts");
    const { WORKSPACE_CLEANUP_CHANGED_EVENT } = await import("/src/components/layout/workspace-cleanup-events.ts");
    const probe = window as typeof window & { shelfReads: number; fullReads: number; releaseShelf: () => void; updateShelf: () => void };
    probe.shelfReads = 0; probe.fullReads = 0;
    const api = window.api!.workspaceCleanup;
    const cheap = api.listArchived;
    api.list = async () => { probe.fullReads++; throw new Error("Full inspection is forbidden for shelf"); };
    api.listArchived = async () => { probe.shelfReads++; await new Promise<void>(resolve => { probe.releaseShelf = resolve; }); return cheap(); };
    probe.updateShelf = () => {
      useAppStore.setState({ workspaces: [...useAppStore.getState().workspaces] });
      window.dispatchEvent(new Event(WORKSPACE_CLEANUP_CHANGED_EVENT));
      window.dispatchEvent(new Event(WORKSPACE_CLEANUP_CHANGED_EVENT));
    };
    const host = document.createElement("div"); host.id = "shelf-test"; document.body.append(host);
    createRoot(host).render(React.createElement(ArchivedWorkspaceShelf));
  });
  await expect.poll(() => page.evaluate(() => (window as any).shelfReads)).toBe(1);
  await page.evaluate(() => (window as any).updateShelf());
  await expect.poll(() => page.evaluate(() => (window as any).shelfReads)).toBe(1);
  expect(await page.evaluate(() => (window as any).fullReads)).toBe(0);
  await page.evaluate(() => (window as any).releaseShelf());
  const trigger = page.locator("#shelf-test").getByTestId("archived-workspaces-trigger");
  await expect(trigger).toHaveAccessibleName("Archived workspaces (1)");
  // The preview opens the command palette as a modal; close it to reach the footer entry.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Command Palette" })).toHaveCount(0);
  await trigger.click();
  await expect(page.getByTestId("archived-workspaces-list")).toContainText("Earlier work");
});

for (const [lang, theme] of [["en", "light"], ["ko", "dark"]] as const) {
  test(`dirty archive requires explicit save and labels the saved state ${lang} ${theme}`, async ({ page }) => {
    await page.goto(`/?stavePreview=command-palette&cleanupPreview=1&cleanupSavePreview=1&lang=${lang}&theme=${theme}`);
    const label = lang === "en" ? "Clean up workspaces" : "워크스페이스 정리";
    await page.locator("input[data-slot=command-input]").fill(label);
    await page.getByText(label, { exact: true }).click();
    const row = page.getByTestId("cleanup-row-cleanup-dirty");
    await expect(row.getByRole("checkbox")).toBeEnabled();
    await row.getByRole("checkbox").click();
    await expect(page.locator("[data-cleanup-footer]").getByRole("button")).toHaveCount(1);
    await page.getByRole("button", { name: lang === "en" ? "Archive (1)" : "보관 (1)", exact: true }).click();
    const confirmation = page.getByRole("dialog").last();
    const save = confirmation.getByRole("checkbox", { name: lang === "en" ? "Save uncommitted changes and archive" : "커밋하지 않은 변경 사항을 저장하고 보관" });
    await expect(save).not.toBeChecked();
    const confirm = confirmation.getByRole("button", { name: lang === "en" ? "Confirm action" : "작업 확인", exact: true });
    await expect(confirm).toBeDisabled();
    await save.click();
    await expect(confirm).toBeEnabled();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: lang === "en" ? "Archive (1)" : "보관 (1)", exact: true }).click();
    await expect(save).not.toBeChecked();
    await expect(confirm).toBeDisabled();
    await save.click();
    await page.evaluate(() => document.fonts.ready);
    const bounds = await confirmation.evaluate(element => ({ width: element.clientWidth, content: element.scrollWidth }));
    expect(bounds.content).toBeLessThanOrEqual(bounds.width);
    if (process.env.CLEANUP_SCREENSHOT_DIR) {
      const { mkdir } = await import("node:fs/promises");
      await mkdir(process.env.CLEANUP_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ animations: "disabled", path: `${process.env.CLEANUP_SCREENSHOT_DIR}/${lang}-${theme}-save-archive.png` });
    }
    await confirm.click();
    await expect(row).toContainText(lang === "en" ? "Saved changes" : "저장된 변경 사항");
    await row.getByRole("checkbox").click();
    const restore = page.getByRole("button", { name: lang === "en" ? "Restore (1)" : "복원 (1)", exact: true });
    await expect(page.locator("[data-cleanup-footer]").getByRole("button")).toHaveCount(1);
    await restore.click();
    await expect(row).not.toContainText(lang === "en" ? "Saved changes" : "저장된 변경 사항");
  });
}


for (const [lang, theme] of [["en", "light"], ["ko", "dark"]] as const) {
  test(`archive offers a retry and lets the user keep the worktree ${lang} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(`/?stavePreview=command-palette&cleanupPreview=1&cleanupRecoveryPreview=1&lang=${lang}&theme=${theme}`);
    const pick = (en: string, ko: string) => lang === "en" ? en : ko;
    const label = pick("Clean up workspaces", "워크스페이스 정리");
    await page.locator("input[data-slot=command-input]").fill(label);
    await page.getByText(label, { exact: true }).click();
    const row = page.getByTestId("cleanup-row-cleanup-one");
    await row.getByRole("checkbox").click();
    await page.getByRole("button", { name: pick("Archive (1)", "보관 (1)"), exact: true }).click();
    await page.getByRole("button", { name: pick("Confirm action", "작업 확인"), exact: true }).click();
    const retry = page.getByRole("button", { name: pick("Retry archive", "보관 다시 시도"), exact: true });
    const keep = page.getByRole("button", { name: pick("Archive and keep files on disk", "파일을 디스크에 남기고 보관"), exact: true });
    await expect(retry).toBeVisible();
    await retry.click();
    await expect(keep).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const bounds = await keep.evaluate(button => ({
      button: button.getBoundingClientRect().right,
      dialog: button.closest('[role="dialog"]')!.getBoundingClientRect().right,
    }));
    expect(bounds.button).toBeLessThanOrEqual(bounds.dialog);
    await keep.click();
    await expect(row).toContainText(pick("Worktree kept on disk", "워크트리를 디스크에 유지함"));
    await row.getByRole("checkbox").click();
    await expect(page.locator("[data-cleanup-footer]").getByRole("button")).toHaveCount(1);
    await page.getByRole("button", { name: pick("Restore (1)", "복원 (1)"), exact: true }).click();
    await expect(row).not.toContainText(pick("Worktree kept on disk", "워크트리를 디스크에 유지함"));
  });
}

test("dirty archive stays unavailable while a turn or run is active", async ({ page }) => {
  for (const blocker of ["runningTurn", "runningRun"]) {
    await page.goto("/?stavePreview=command-palette&cleanupPreview=1");
    await page.waitForFunction(() => Boolean(window.api?.workspaceCleanup));
    await page.evaluate((reason) => {
      const api = window.api!.workspaceCleanup;
      const list = api.list.bind(api);
      api.list = async (args) => {
        const snapshot = await list(args);
        Object.assign(snapshot.rows.find(row => row.id === "cleanup-dirty")!, { canSaveChanges: true, blockers: ["changedFiles", reason] });
        return snapshot;
      };
    }, blocker);
    await page.getByPlaceholder("Find a command, task, workspace, or setting").fill("Clean up workspaces");
    await page.getByText("Clean up workspaces", { exact: true }).click();
    await expect(page.getByTestId("cleanup-row-cleanup-dirty").getByRole("checkbox")).toBeDisabled();
    await expect(page.locator("[data-cleanup-footer]").getByRole("button")).toHaveCount(0);
  }
});


for (const [width, lang, theme] of [[520, "ko", "dark"], [1440, "en", "light"]] as const) {
  test(`moves an archived leftover to Trash and enables Restore at ${width} ${lang} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/?stavePreview=command-palette&cleanupPreview=1&cleanupLeftoverPreview=1&lang=${lang}&theme=${theme}`);
    const pick = (en: string, ko: string) => lang === "en" ? en : ko;
    const cleanup = pick("Clean up workspaces", "워크스페이스 정리");
    await page.locator("input[data-slot=command-input]").fill(cleanup);
    await page.getByText(cleanup, { exact: true }).click();
    const row = page.getByTestId("cleanup-row-cleanup-archived");
    const trash = row.getByRole("button", { name: pick("Move to Trash", "휴지통으로 이동") });
    await expect(trash).toBeVisible();
    await expect(row.getByRole("checkbox")).toBeDisabled();
    await page.evaluate(() => document.fonts.ready);
    const rowBox = (await row.boundingBox())!;
    const buttonBox = (await trash.boundingBox())!;
    expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(rowBox.x + rowBox.width);
    expect(Math.abs(buttonBox.y + buttonBox.height / 2 - rowBox.y - rowBox.height / 2)).toBeLessThanOrEqual(1);
    await page.getByText(pick("Recent cleanup", "최근 정리"), { exact: true }).click();
    await expect(page.locator("details").getByRole("button", { name: pick("Move to Trash", "휴지통으로 이동") })).toBeVisible();
    await trash.click();
    await expect(trash).toHaveCount(0);
    await expect(row.getByRole("checkbox")).toBeEnabled();
    await row.getByRole("checkbox").click();
    await page.getByRole("button", { name: pick("Restore (1)", "복원 (1)"), exact: true }).click();
    await expect(row).not.toContainText(pick("Archived", "보관됨"));
  });
}

// Worktrees Claude Code sub-agents left: their own section, the shared confirmation, per-row results.
for (const [width, lang, theme] of [[1440, "en", "light"], [1024, "ko", "dark"], [1440, "en", "dark"], [1024, "ko", "light"]] as const) {
  test(`sub-agent worktrees are removed only after confirmation at ${width} ${lang} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/?stavePreview=command-palette&cleanupPreview=1&cleanupSubAgents=1&lang=${lang}&theme=${theme}`);
    const pick = (en: string, ko: string) => lang === "en" ? en : ko;
    const cleanup = pick("Clean up workspaces", "워크스페이스 정리");
    await page.locator("input[data-slot=command-input]").fill(cleanup);
    await page.getByText(cleanup, { exact: true }).click();
    const section = page.locator("[data-cleanup-subagents]");
    await expect(section).toContainText(pick("Worktrees left by Claude Code sub-agents. The branch is kept.", "Claude Code 하위 에이전트가 남긴 워크트리입니다. 브랜치는 유지합니다."));
    const blocked = page.getByTestId("cleanup-subagent-row-agent-d4e5f6");
    await expect(blocked.getByRole("checkbox")).toBeDisabled();
    await expect(blocked).toContainText(pick("Changed files · Changed in the last 30 minutes", "변경된 파일 · 최근 30분 안에 변경됨"));
    await expect(page.getByTestId("cleanup-subagent-row-agent-0789ab")).toContainText(pick("Detached HEAD", "분리된 HEAD"));
    // The section stays inside the dialog, with each checkbox centered on its row text.
    const dialog = page.getByRole("dialog").last();
    await page.evaluate(() => document.fonts.ready);
    const geometry = await dialog.evaluate((element) => {
      const row = element.querySelector('[data-testid="cleanup-subagent-row-agent-a1b2c3"]')!;
      const checkbox = row.querySelector('[role="checkbox"]')!.getBoundingClientRect();
      const text = row.querySelector("button[aria-pressed]")!.getBoundingClientRect();
      return { overflow: element.scrollWidth > element.clientWidth, centerDifference: Math.abs((checkbox.top + checkbox.bottom) / 2 - (text.top + text.bottom) / 2) };
    });
    expect(geometry.overflow).toBe(false);
    expect(geometry.centerDifference).toBeLessThan(1);

    const ready = page.getByTestId("cleanup-subagent-row-agent-a1b2c3");
    await ready.getByRole("checkbox").click();
    await page.locator("[data-cleanup-footer]").getByRole("button", { name: pick("Remove worktrees (1)", "워크트리 제거 (1)"), exact: true }).click();
    const confirmation = page.getByRole("dialog").last();
    await expect(confirmation).toContainText(pick("Their branches are kept.", "브랜치는 유지합니다."));
    await expect(confirmation).toContainText("agent-a1b2c3");
    await expect(confirmation).not.toContainText("agent-d4e5f6");
    await expect(confirmation.getByRole("button", { name: pick("Cancel", "취소"), exact: true })).toBeFocused();
    const shots = process.env.CLEANUP_SCREENSHOT_DIR;
    if (shots) {
      const { mkdir } = await import("node:fs/promises");
      await mkdir(shots, { recursive: true });
      await page.screenshot({ animations: "disabled", path: `${shots}/subagents-${lang}-${theme}-${width}-confirm.png` });
    }
    // Enter never confirms a removal that cannot be undone.
    const confirm = confirmation.getByRole("button", { name: pick("Confirm action", "작업 확인"), exact: true });
    await confirm.focus();
    await page.keyboard.press("Enter");
    await expect(confirmation).toBeVisible();
    await confirm.click();
    await expect(page.locator("[data-cleanup-subagent-results]")).toContainText(pick("agent-a1b2c3 · Worktree removed · branch kept", "agent-a1b2c3 · 워크트리 제거됨 · 브랜치 유지됨"));
    await expect(ready).toHaveCount(0);
    await expect(blocked).toBeVisible();
    if (shots) await page.screenshot({ animations: "disabled", path: `${shots}/subagents-${lang}-${theme}-${width}-result.png` });
  });
}

test("a sub-agent worktree that changed after listing is reported and kept", async ({ page }) => {
  await page.goto("/?stavePreview=command-palette&cleanupPreview=1&cleanupSubAgents=1");
  await page.getByPlaceholder("Find a command, task, workspace, or setting").fill("Clean up workspaces");
  await page.getByText("Clean up workspaces", { exact: true }).click();
  const ready = page.getByTestId("cleanup-subagent-row-agent-a1b2c3");
  await expect(ready).toBeVisible();
  // The host checks again right before removing; a file written since the list was read blocks it.
  await page.evaluate(() => {
    const api = window.api!.workspaceCleanup!;
    api.removeSubAgentWorktree = async (args) => ({ ok: false, path: args.path, reason: "changedFiles" });
  });
  await page.getByRole("button", { name: "Select all ready" }).click();
  await expect(page.getByTestId("cleanup-subagent-row-agent-d4e5f6").getByRole("checkbox")).not.toBeChecked();
  await page.getByRole("button", { name: "Remove worktrees (2)", exact: true }).click();
  await page.getByRole("button", { name: "Confirm action" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Completed" })).toHaveText("Completed 0; skipped 2.");
  await expect(page.locator("[data-cleanup-subagent-results]")).toContainText("agent-a1b2c3 · Changed files");
  await expect(ready).toBeVisible();
});

// "Archive workspace…" after a merge opens the center on that workspace.
async function openCleanupFor(page: import("@playwright/test").Page, workspaceId: string | null, query = "") {
  await page.goto(`/?stavePreview=command-palette&cleanupPreview=1${query}`);
  await page.waitForFunction(() => Boolean(window.api?.workspaceCleanup));
  await page.evaluate(async (target) => {
    const { openWorkspaceCleanup } = await import("/src/components/layout/workspace-cleanup-events.ts");
    // Menus and buttons pass their click event; only a real target focuses a row.
    openWorkspaceCleanup(target ? { workspaceId: target } : new MouseEvent("click"));
  }, workspaceId);
  await expect(page.getByRole("heading", { name: "Clean up workspaces" })).toBeVisible();
}

test("opening for a workspace highlights and selects its row", async ({ page }) => {
  await openCleanupFor(page, "cleanup-one");
  const row = page.getByTestId("cleanup-row-cleanup-one");
  await expect(row).toHaveAttribute("data-cleanup-focus", "");
  await expect(row.getByRole("checkbox")).toBeChecked();
  await expect(page.locator("[data-cleanup-focus]")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Archive (1)", exact: true })).toBeEnabled();
  // The highlight is drawn inside the row, so the scrolling list cannot clip it.
  expect(await row.evaluate((element) => getComputedStyle(element).boxShadow)).toContain("inset");
  // Refreshing the list keeps the person's later choices instead of selecting the target again.
  await row.getByRole("checkbox").click();
  await page.getByRole("button", { name: "Refresh checks" }).click();
  await expect(page.getByTestId("cleanup-row-cleanup-one")).toBeVisible();
  await expect(row.getByRole("checkbox")).not.toBeChecked();
});

test("opening for a blocked workspace highlights it without selecting it", async ({ page }) => {
  await openCleanupFor(page, "cleanup-dirty");
  const row = page.getByTestId("cleanup-row-cleanup-dirty");
  await expect(row).toHaveAttribute("data-cleanup-focus", "");
  await expect(row.getByRole("checkbox")).not.toBeChecked();
  await expect(page.locator("[data-cleanup-footer]").getByRole("button")).toHaveCount(0);
});

test("opening without a workspace focuses no row", async ({ page }) => {
  await openCleanupFor(page, null);
  await expect(page.getByTestId("cleanup-row-cleanup-one")).toBeVisible();
  await expect(page.locator("[data-cleanup-focus]")).toHaveCount(0);
  await expect(page.locator("[data-cleanup-footer]").getByRole("button")).toHaveCount(0);
});

test("opening for a workspace scrolls a long list to its row", async ({ page }) => {
  await openCleanupFor(page, "cleanup-extra-120", "&many=1");
  const row = page.getByTestId("cleanup-row-cleanup-extra-120");
  await expect(row).toBeVisible();
  await expect(row).toBeInViewport();
  await expect(row).toHaveAttribute("data-cleanup-focus", "");
  await expect(row.getByRole("checkbox")).toBeChecked();
  // The list stayed virtualized: the first rows are no longer rendered.
  await expect(page.getByTestId("cleanup-row-cleanup-one")).toHaveCount(0);
});
