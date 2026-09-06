import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave } from "./harness/stave-app";

test("a crashed renderer offers native recovery and restores acknowledged work without resending", async ({}, testInfo) => {
  const projectPath = await mkdtemp(
    path.join(tmpdir(), "stave-renderer-recovery-"),
  );
  const stave = await launchStave();
  try {
    await stave.page
      .getByTestId("workspace-welcome")
      .getByRole("button", { name: "Open a project" })
      .click();
    await stave.page.getByPlaceholder("~/projects/my-app").fill(projectPath);
    await stave.page.getByRole("button", { name: "Open", exact: true }).click();
    await expect(stave.page.getByTestId("workspace-welcome")).toHaveCount(0);
    await stave.page
      .getByRole("button", { name: "New Task", exact: true })
      .click();
    await expect(stave.page.getByTestId("task-start-guide")).toBeVisible();
    const editor = stave.page.locator('[data-prompt-lexical-editor="true"]');
    const draft = "Preserve this acknowledged draft after renderer failure.";
    const workspaceId = await stave.page.evaluate(
      async () => (await window.api.persistence!.listWorkspaces!()).rows[0]!.id,
    );
    await expect
      .poll(
        () =>
          stave.page.evaluate(async (workspaceId) => {
            const { shell } = await window.api.persistence!.loadWorkspaceShell!(
              { workspaceId },
            );
            return Boolean(shell?.activeTaskId);
          }, workspaceId),
        { timeout: 15_000 },
      )
      .toBe(true);
    await editor.fill(draft);
    await expect
      .poll(
        () =>
          stave.page.evaluate(async (workspaceId) => {
            const { shell } = await window.api.persistence!.loadWorkspaceShell!(
              {
                workspaceId,
              },
            );
            return Object.values(shell?.promptDraftByTask ?? {}).map(
              (value) => value.text,
            );
          }, workspaceId),
        { timeout: 15_000 },
      )
      .toContain(draft);

    // Only the native user's choice is replaced. Crash, main failure handler,
    // reload, and SQLite restoration use the real product.
    await stave.app.evaluate(({ dialog, BrowserWindow }) => {
      const state = {
        notices: [] as Array<{
          message: string;
          detail: string;
          buttons: string[];
        }>,
        reply: null as
          | ((value: { response: number; checkboxChecked: boolean }) => void)
          | null,
      };
      Object.assign(globalThis, { rendererRecoveryProbe: state });
      dialog.showMessageBox = ((
        _window: unknown,
        options: { message: string; detail: string; buttons: string[] },
      ) => {
        state.notices.push({
          message: options.message,
          detail: options.detail,
          buttons: options.buttons,
        });
        return new Promise((resolve) => {
          state.reply = resolve;
        });
      }) as typeof dialog.showMessageBox;
      const contents = BrowserWindow.getAllWindows()[0]!.webContents;
      setTimeout(() => contents.forcefullyCrashRenderer(), 0);
    });
    await expect
      .poll(() =>
        stave.app.evaluate(
          () =>
            (
              globalThis as unknown as {
                rendererRecoveryProbe: { notices: unknown[] };
              }
            ).rendererRecoveryProbe.notices.length,
        ),
      )
      .toBe(1);
    const notices = await stave.app.evaluate(
      () =>
        (
          globalThis as unknown as {
            rendererRecoveryProbe: {
              notices: Array<{
                message: string;
                detail: string;
                buttons: string[];
              }>;
            };
          }
        ).rendererRecoveryProbe.notices,
    );
    expect(notices[0]?.message).toContain("window stopped");
    expect(notices[0]?.detail).toContain("does not resend");
    expect(notices[0]?.buttons).toEqual(["Reload window", "Keep open"]);
    // The crashed page rejects locator assertions until a new document loads.
    // Observe the user's reload before checking the restored composer.
    const reloaded = stave.page.waitForEvent("domcontentloaded");
    await stave.app.evaluate(() => {
      (
        globalThis as unknown as {
          rendererRecoveryProbe: {
            reply: (value: {
              response: number;
              checkboxChecked: boolean;
            }) => void;
          };
        }
      ).rendererRecoveryProbe.reply({ response: 0, checkboxChecked: false });
    });
    await reloaded;
    // Playwright retains its crashed-target flag after Electron reloads the
    // same WebContents. Inspect the real new document through Electron.
    const restored = await stave.app.evaluate(
      async ({ BrowserWindow }, workspaceId) => {
        return BrowserWindow.getAllWindows()[0]!.webContents.executeJavaScript(`(async () => {
          const workspaceId = ${JSON.stringify(workspaceId)};
          const { shell } = await window.api.persistence.loadWorkspaceShell({ workspaceId });
          if (!shell?.activeTaskId) throw new Error("No restored task");
          const { page } = await window.api.persistence.loadTaskMessages({
            workspaceId,
            taskId: shell.activeTaskId,
            limit: 1,
          });
          return {
            draft: shell.promptDraftByTask[shell.activeTaskId]?.text,
            total: page.totalCount,
          };
        })()`);
      },
      workspaceId,
    );
    expect(restored).toEqual({ draft, total: 0 });
    await expect
      .poll(
        () => stave.app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]!.webContents.executeJavaScript(
            `document.querySelector('[data-prompt-lexical-editor="true"]')?.textContent ?? null`,
          ),
        ),
        { timeout: 20_000 },
      )
      .toBe(draft);
    await testInfo.attach("native-recovery-dialog", {
      body: JSON.stringify(notices),
      contentType: "application/json",
    });
    const screenshot = await stave.app.evaluate(async ({ BrowserWindow }) => {
      const captured = await BrowserWindow.getAllWindows()[0]!
        .webContents.capturePage();
      return captured.toPNG().toString("base64");
    });
    await testInfo.attach("recovered-draft", {
      body: Buffer.from(screenshot, "base64"),
      contentType: "image/png",
    });
  } finally {
    await stave.close();
    await rm(projectPath, { recursive: true, force: true });
  }
});
