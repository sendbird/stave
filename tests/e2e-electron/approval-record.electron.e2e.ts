import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave } from "./harness/stave-app";

/**
 * The approval record across one Claude turn in Guided mode: the stand-in CLI
 * (`harness/fake-claude-cli.cjs`, `[permissions]`) asks permission for an
 * `Edit`, which Guided's permission mode allows without asking, and then for
 * `rm -rf build`, which shows as a card and is allowed by the user. Activity
 * and Review count the person's approval apart from the automatic one, and
 * the record is still there after a reload.
 *
 * Requires the `out/` desktop build (`bun run build:desktop`).
 */
const FAKE_CLI = path.join(import.meta.dirname, "harness", "fake-claude-cli.cjs");

test("one turn's approvals are counted by who decided them, in Activity and Review, and survive a reload", async ({}, testInfo) => {
  test.setTimeout(180_000);
  const directory = await mkdtemp(path.join(tmpdir(), "stave-approval-record-"));
  const repositoryPath = path.join(directory, "repository");
  const fakeDir = path.join(directory, "fake-claude");
  const profileDir = path.join(directory, "profile");
  await mkdir(repositoryPath);
  await mkdir(fakeDir);
  await mkdir(profileDir);
  execFileSync("git", ["init", "-b", "main"], { cwd: repositoryPath });
  await writeFile(path.join(repositoryPath, "README.md"), "Approval record validation.\n");
  execFileSync("git", ["add", "README.md"], { cwd: repositoryPath });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "test: initialize"], { cwd: repositoryPath });
  const wrapper = path.join(fakeDir, "claude");
  await writeFile(wrapper, `#!/bin/sh\nFAKE_CLAUDE_DIR='${fakeDir}' exec '${process.execPath}' '${FAKE_CLI}' "$@"\n`);
  await chmod(wrapper, 0o755);

  const stave = await launchStave({ userDataDir: profileDir, env: { STAVE_CLAUDE_CLI_PATH: wrapper } });
  const page = stave.page;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.getByTestId("workspace-welcome").getByRole("button", { name: "Open a repository" }).click();
    await page.getByPlaceholder("~/projects/my-app").fill(repositoryPath);
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await expect(page.getByTestId("workspace-welcome")).toHaveCount(0);
    await page.getByRole("button", { name: "New Task", exact: true }).click();

    // Guided: edits pass by the permission mode, shell commands ask.
    await page.getByRole("button", { name: /^Claude Auto:/ }).click();
    await page.getByRole("button", { name: /^Guided/ }).click();
    await expect(page.getByRole("button", { name: /^Claude Guided:/ })).toBeVisible();

    const composer = page.locator('[data-prompt-lexical-editor="true"]');
    await composer.click();
    await composer.fill("[permissions] Run the checks and clean the build");
    await composer.press("Enter");

    // Only the shell command asks.
    const queue = page.getByRole("region", { name: "Approval queue" });
    await expect(queue).toContainText("rm -rf build", { timeout: 30_000 });
    await expect(queue).not.toContainText("README.md");

    // Review hides the conversation: Enter there answers nothing, and Tab
    // moves through Review instead of opening the hidden queue's guidance.
    const shortcut = process.platform === "darwin" ? "Meta+Alt+R" : "Control+Alt+R";
    await page.keyboard.press(shortcut);
    const reviewSurface = page.getByTestId("task-review-surface");
    await expect(reviewSurface).toBeVisible();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => {
      const active = document.activeElement;
      return Boolean(active?.closest('[data-testid="task-review-surface"]')) && active?.tagName === "BUTTON";
    })).toBe(true);
    await page.waitForTimeout(1_000);
    await page.keyboard.press(shortcut);
    await expect(reviewSurface).toHaveCount(0);
    await expect(queue).toContainText("rm -rf build");
    await expect(page.getByText("Permissions: Edit allowed, Bash allowed.")).toHaveCount(0);

    // The user allows it from the queue.
    await queue.getByRole("button", { name: "Allow once" }).click();
    await expect(page.getByText("Permissions: Edit allowed, Bash allowed.")).toBeVisible({ timeout: 30_000 });

    // Activity, under the turn's list: one by you, one automatically.
    const sections = page.getByRole("tablist", { name: "Task sections" });
    if ((await sections.count()) === 0) await page.getByRole("button", { name: "Task", exact: true }).click();
    await sections.getByRole("tab", { name: /^Activity/ }).click();
    const activity = page.getByTestId("turn-approval-record");
    await expect(activity).toContainText("1 allowed by you · 0 allowed by a Stave rule · 1 allowed by the provider's mode");
    await activity.locator("summary").click();
    await expect(activity).toContainText("Edit · README.md allowed by the permission mode");
    await expect(activity).toContainText("Bash · rm -rf build allowed by you");
    await activity.screenshot({ path: testInfo.outputPath("activity-approvals.png") });

    // Review on the turn says the same, and so it does after a reload.
    for (const pass of ["live", "reloaded"]) {
      if (pass === "reloaded") {
        await page.reload({ waitUntil: "domcontentloaded" });
        await expect(page.getByRole("group", { name: "Task view" })).toBeVisible({ timeout: 30_000 });
      }
      await page.keyboard.press(shortcut);
      const approvals = page.getByTestId("task-review-surface").getByTestId("review-approvals");
      await expect(approvals).toContainText("1 allowed by you · 0 allowed by a Stave rule · 1 allowed by the provider's mode", { timeout: 20_000 });
      await expect(approvals).toContainText("Edit · README.md allowed by the permission mode");
      await expect(approvals).toContainText("Bash · rm -rf build allowed by you");
      await approvals.screenshot({ path: testInfo.outputPath(`review-approvals-${pass}.png`) });
      await page.keyboard.press(shortcut);
    }
    expect(errors).toEqual([]);
  } finally {
    await stave.close();
    await rm(directory, { recursive: true, force: true });
  }
});
