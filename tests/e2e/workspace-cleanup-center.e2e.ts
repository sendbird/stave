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
