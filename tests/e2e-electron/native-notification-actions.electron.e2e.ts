import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave } from "./harness/stave-app";

const FAKE_CLI = path.join(import.meta.dirname, "harness", "fake-claude-cli.cjs");

test("native approval action reaches the host responder and settles the in-app card", async () => {
  test.skip(process.platform !== "darwin", "Native notification actions require macOS.");
  test.setTimeout(180_000);
  const directory = await mkdtemp(path.join(tmpdir(), "stave-native-actions-"));
  const repositoryPath = path.join(directory, "repository");
  const fakeDir = path.join(directory, "fake-cli");
  await mkdir(repositoryPath); await mkdir(fakeDir);
  execFileSync("git", ["init", "-b", "main"], { cwd: repositoryPath });
  await writeFile(path.join(repositoryPath, "README.md"), "Native action validation.\n");
  execFileSync("git", ["add", "README.md"], { cwd: repositoryPath });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "test: initialize"], { cwd: repositoryPath });
  const wrapper = path.join(fakeDir, "claude");
  await writeFile(wrapper, `#!/bin/sh\nFAKE_CLAUDE_DIR='${fakeDir}' exec '${process.execPath}' '${FAKE_CLI}' "$@"\n`);
  await chmod(wrapper, 0o755);
  const stave = await launchStave({ env: { STAVE_CLAUDE_CLI_PATH: wrapper } });
  try {
    // Capture real notification objects; delivery depends on OS permission and signing.
    await stave.app.evaluate(({ Notification }) => {
      const target = globalThis as unknown as { nativeActionNotifications: Electron.Notification[] };
      target.nativeActionNotifications = [];
      Notification.prototype.show = function () { target.nativeActionNotifications.push(this); };
    });
    const page = stave.page;
    await page.getByTestId("workspace-welcome").getByRole("button", { name: "Open repository", exact: true }).click();
    await page.getByPlaceholder("~/projects/my-app").fill(repositoryPath);
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await expect(page.getByTestId("workspace-welcome")).toHaveCount(0);
    await page.getByRole("button", { name: "New Task", exact: true }).click();
    await page.getByRole("button", { name: /^Claude Auto:/ }).click();
    await page.getByRole("radio", { name: /^Guided/ }).click();
    const composer = page.locator('[data-prompt-lexical-editor="true"]');
    for (const pass of [0, 1]) {
    await composer.fill("[permissions] Run the checks and clean the build"); await composer.press("Enter");
    const queue = page.getByRole("region", { name: "Approval queue" });
    await expect(queue).toContainText("rm -rf build", { timeout: 30_000 });
    const shown = await page.evaluate(async () => {
      const api = window.api!.notifications!;
      await api.setActionsEnabled!({ enabled: true });
      const response = await window.api!.persistence!.listNotifications!({});
      const row = response.notifications.find(item => item.kind === "task.approval_requested" && !item.resolvedAt)!;
      if (!row) throw new Error("No approval notification stored");
      return api.showNative!({ notificationId: row.id, title: row.title, body: row.body });
    });
    expect(shown.ok).toBe(true);
    expect(await page.evaluate(async () => window.api!.notifications!.setActionsEnabled!({ enabled: false, scope: "always" } as unknown as { enabled: boolean }))).toEqual({ ok: false });
    await page.evaluate(async () => window.api!.notifications!.setActionsEnabled!({ enabled: false }));
    await stave.app.evaluate(() => {
      const target = globalThis as unknown as { nativeActionNotifications: Electron.Notification[] };
      target.nativeActionNotifications.at(-1)!.emit("action", {}, 0);
    });
    await expect(queue).toContainText("rm -rf build");
    await page.evaluate(async () => window.api!.notifications!.setActionsEnabled!({ enabled: true }));
    const actions = await stave.app.evaluate(() => {
      const target = globalThis as unknown as { nativeActionNotifications: Electron.Notification[] };
      const notification = target.nativeActionNotifications.at(-1)!;
      const labels = notification.actions.map(action => action.text);
      notification.emit("action", {}, 0);
      notification.emit("action", {}, 1);
      return labels;
    });
    expect(actions).toEqual(["Allow once", "Deny"]);
    await expect(page.getByText("Permissions: Edit allowed, Bash allowed.")).toHaveCount(pass + 1, { timeout: 10_000 });
    await expect(queue).toHaveCount(0);
    }
  } finally {
    await stave.close(); await rm(directory, { recursive: true, force: true });
  }
});
