import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave } from "./harness/stave-app";

test("a rejected workspace write stays visible and retry saves the current draft", async ({}, testInfo) => {
  const projectPath = await mkdtemp(path.join(tmpdir(), "stave-save-failure-"));
  const stave = await launchStave();
  const errors: string[] = [];
  stave.page.on("pageerror", (error) => errors.push(error.message));
  try {
    await stave.page.getByTestId("workspace-welcome").getByRole("button", { name: "Open a project" }).click();
    await stave.page.getByPlaceholder("~/projects/my-app").fill(projectPath);
    await stave.page.getByRole("button", { name: "Open", exact: true }).click();
    await expect(stave.page.getByTestId("workspace-welcome")).toHaveCount(0);
    await stave.page.getByRole("button", { name: "New Task", exact: true }).click();
    const editor = stave.page.locator('[data-prompt-lexical-editor="true"]');
    await expect(editor).toBeVisible();

    // Inject rejection at the main IPC boundary in this throwaway process.
    // Everything from autosave through the notice and retry remains real.
    await stave.app.evaluate(({ ipcMain }) => {
      const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, unknown> })._invokeHandlers;
      const key = "persistence:upsert-workspace";
      const original = handlers.get(key);
      if (!original) throw new Error("Workspace write handler missing");
      handlers.set("stave-e2e:original-workspace-write", original);
      ipcMain.removeHandler(key);
      ipcMain.handle(key, () => ({ ok: false }));
    });
    await editor.fill("Keep this draft after a failed save.");
    const notice = stave.page.getByRole("alert", { name: "Unsaved workspace changes" });
    await expect(notice).toBeVisible({ timeout: 10_000 });
    await editor.fill("Save the latest draft after recovery.");
    await stave.page.screenshot({ path: testInfo.outputPath("unsaved-workspace-notice.png") });
    await notice.getByRole("button", { name: "Retry save" }).click();
    await expect(notice.getByRole("button", { name: "Retry save" })).toBeEnabled();
    await expect(notice).toBeVisible();

    await stave.app.evaluate(({ ipcMain }) => {
      const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, unknown> })._invokeHandlers;
      const original = handlers.get("stave-e2e:original-workspace-write");
      if (!original) throw new Error("Original workspace write handler missing");
      handlers.set("persistence:upsert-workspace", original);
      handlers.delete("stave-e2e:original-workspace-write");
    });
    await notice.getByRole("button", { name: "Retry save" }).click();
    await expect(notice).toHaveCount(0);
    await stave.page.reload();
    await expect(editor).toContainText("Save the latest draft after recovery.");
    expect(errors).toEqual([]);
  } finally {
    await stave.close();
    await rm(projectPath, { recursive: true, force: true });
  }
});
