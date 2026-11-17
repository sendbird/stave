import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const fixture = "/tests/e2e/fixtures/turn-snapshots.html";
for (const [lang, theme, density] of [["en", "light", "regular"], ["ko", "dark", "compact"]] as const) {
  for (const provider of ["codex", "claude-code"] as const) {
    test(`file restore choices and undo (${lang} ${theme} ${provider})`, async ({ page }) => {
      await page.setViewportSize({ width: 800, height: 700 });
      await page.goto(`${fixture}?lang=${lang}&theme=${theme}&density=${density}&provider=${provider}`, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => document.fonts.ready);
      await page.getByRole("button", { name: lang === "en" ? "Restore files to before this turn" : "이 턴 이전으로 파일 복원", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      const combined = page.getByRole("button", { name: lang === "en" ? "Restore files and roll back conversation" : "파일 복원 및 대화 되돌리기", exact: true });
      await expect(combined).toHaveCount(provider === "codex" ? 1 : 0);
      const box = await dialog.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(800);
      for (const button of await dialog.getByRole("button").all()) {
        const control = await button.boundingBox();
        expect(control!.x).toBeGreaterThanOrEqual(box!.x - 1);
        expect(control!.x + control!.width).toBeLessThanOrEqual(box!.x + box!.width + 1);
      }
      await mkdir("/tmp/gap-h6", { recursive: true });
      await page.screenshot({ path: `/tmp/gap-h6/restore-${lang}-${theme}-${provider}.png` });
      await dialog.getByRole("button", { name: lang === "en" ? "Keep conversation, restore files" : "대화 유지 및 파일 복원", exact: true }).click();
      await expect(dialog).not.toBeVisible();
      await page.getByRole("button", { name: lang === "en" ? "Undo restore" : "파일 복원 취소", exact: true }).click();
      await expect.poll(() => page.evaluate(() => (window as unknown as { __turnSnapshotCalls: unknown[] }).__turnSnapshotCalls)).toEqual([
        { method: "restore", workspaceId: "snapshot-ws", taskId: "snapshot-task", turnId: "turn-first" },
        { method: "undo", workspaceId: "snapshot-ws", taskId: "snapshot-task" },
      ]);
    });
  }
}


test("returning a fork prepares the original draft with attached details and never sends", async ({ page }) => {
  await page.goto(fixture, { waitUntil: "domcontentloaded" });
  await page.getByTestId("fork-return").click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __turnSnapshotFixtureStore: { getState(): { activeTaskId: string } } }).__turnSnapshotFixtureStore.getState().activeTaskId)).toBe("original");
  const state = await page.evaluate(() => {
    const state = (window as unknown as { __turnSnapshotFixtureStore: { getState(): { promptDraftByTask: Record<string, unknown>; messagesByTask: Record<string, unknown[]>; activeTurnIdsByTask: Record<string, string> } } }).__turnSnapshotFixtureStore.getState();
    return { draft: state.promptDraftByTask.original, messages: state.messagesByTask.original, active: state.activeTurnIdsByTask };
  });
  expect(state.draft).toMatchObject({
    text: expect.stringContaining("> Navigation is ready."),
    attachments: [expect.objectContaining({ kind: "task-context", taskId: "snapshot-task", scope: "conversation" })],
  });
  expect((state.draft as { text: string }).text).toContain("stave://workspace/snapshot-ws/task/snapshot-task");
  expect(state.messages).toEqual([]);
  expect(state.active).toEqual({});
});


test("restore refusal explains why and keeps the conversation", async ({ page }) => {
  await page.goto(`${fixture}?refuse=1`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Restore files to before this turn", exact: true }).click();
  await page.getByRole("button", { name: "Keep conversation, restore files", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Files changed since another task used this worktree. Restore was refused to protect those changes.");
  await expect(page.getByRole("button", { name: "Undo restore", exact: true })).toHaveCount(0);
});

for (const [lang, theme, density] of [["en", "light", "regular"], ["ko", "dark", "compact"]] as const) {
  test(`restore dialog contains its choices in a narrow container (${lang} ${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${fixture}?lang=${lang}&theme=${theme}&density=${density}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: lang === "en" ? "Restore files to before this turn" : "이 턴 이전으로 파일 복원", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await page.evaluate(() => document.fonts.ready);
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    for (const button of await dialog.getByRole("button").all()) {
      const box = await button.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(bounds!.x - 1);
      expect(box!.x + box!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await mkdir("/tmp/gap-h6", { recursive: true });
    await page.screenshot({ path: `/tmp/gap-h6/restore-${lang}-${theme}-narrow.png` });
  });
}

test("combined restore removes the selected turn and keeps file undo available", async ({ page }) => {
  await page.goto(fixture, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Restore files to before this turn", exact: true }).click();
  await page.getByRole("button", { name: "Restore files and roll back conversation", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __turnSnapshotFixtureStore: { getState(): { messagesByTask: Record<string, unknown[]> } } }).__turnSnapshotFixtureStore.getState().messagesByTask["snapshot-task"].length)).toBe(0);
  await expect(page.getByRole("button", { name: "Undo restore", exact: true })).toBeVisible();
});
