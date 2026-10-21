import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave } from "./harness/stave-app";

/**
 * Diff review comments after they are sent. Three comments are added with the
 * mouse and the keyboard, sent with the shortcut, and then one commented line
 * is rewritten on disk, as an agent would. Only that comment says its lines
 * changed, and Resolve clears it. The stand-in CLI answers the review turn.
 *
 * Monaco marks its view-zone layer `aria-hidden`, so the controls inside a
 * review zone are only reachable here with `includeHidden`.
 */
const FAKE_CLI = path.join(import.meta.dirname, "harness", "fake-claude-cli.cjs");
const ORIGINAL = ["export const alpha = 1;", "export const beta = 2;", "export const gamma = 3;", "export const delta = 4;", "export const epsilon = 5;", ""].join("\n");
const EDITED = ORIGINAL.replace("alpha = 1;", "alpha = 10;").replace("gamma = 3;", "gamma = 30;").replace("epsilon = 5;", "epsilon = 50;");

test("sent review comments show which anchored lines changed and resolve by hand", async ({}, testInfo) => {
  test.setTimeout(180_000);
  const directory = await mkdtemp(path.join(tmpdir(), "stave-sent-review-"));
  const repositoryPath = path.join(directory, "repository");
  const fakeDir = path.join(directory, "fake-claude");
  const profileDir = path.join(directory, "profile");
  await mkdir(repositoryPath);
  await mkdir(fakeDir);
  await mkdir(profileDir);
  execFileSync("git", ["init", "-b", "main"], { cwd: repositoryPath });
  await writeFile(path.join(repositoryPath, "sample.ts"), ORIGINAL);
  execFileSync("git", ["add", "sample.ts"], { cwd: repositoryPath });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "test: initialize"], { cwd: repositoryPath });
  await writeFile(path.join(repositoryPath, "sample.ts"), EDITED);
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
    await page.getByRole("button", { name: "Source Control", exact: true }).click();
    await page.getByRole("button", { name: /^sample\.ts/ }).first().click();
    const modified = page.locator(".monaco-diff-editor .editor.modified");
    await expect(modified).toBeVisible({ timeout: 30_000 });

    const comments = [
      { text: "alpha = 10", note: "Check alpha", line: 1 },
      { text: "gamma = 30", note: "Check gamma", line: 3 },
      { text: "epsilon = 50", note: "Check epsilon", line: 5 },
    ];
    for (const comment of comments) {
      await modified.locator(".view-line", { hasText: comment.text }).click();
      await page.getByRole("button", { name: "Add review comment", exact: true }).click();
      const draft = page.getByRole("textbox", { name: `Comment on modified line ${comment.line}`, includeHidden: true });
      // The draft takes focus, so typing goes into the comment and not the file.
      await expect(draft).toBeFocused();
      await page.keyboard.type(comment.note);
      // A mouse click reaches the zone's controls over Monaco's text layer.
      await page.getByRole("button", { name: "Add comment", exact: true, includeHidden: true }).click();
      await expect(draft).toHaveCount(0);
      await expect(page.getByText(comment.note)).toBeVisible();
    }

    await modified.locator(".view-line", { hasText: "beta = 2" }).click();
    await page.keyboard.press("ControlOrMeta+Alt+Enter");
    await expect(page.getByText("Sent · not changed yet")).toHaveCount(3, { timeout: 30_000 });
    await expect(page.getByText("Check alpha")).toBeVisible();

    // The agent rewrites one commented line; the open diff reloads it from disk.
    await writeFile(path.join(repositoryPath, "sample.ts"), EDITED.replace("alpha = 10;", "alpha = 100;"));
    await expect(page.getByText("Sent · lines changed since")).toHaveCount(1, { timeout: 30_000 });
    await expect(page.getByText("Sent · not changed yet")).toHaveCount(2);
    await page.screenshot({ path: testInfo.outputPath("sent-comments.png") });

    await page.getByRole("button", { name: "Resolve the sent comment on line 1", includeHidden: true }).click();
    await expect(page.getByText("Sent · lines changed since")).toHaveCount(0);
    await expect(page.getByText("Check alpha")).toHaveCount(0);
    await expect(page.getByText("Sent · not changed yet")).toHaveCount(2);
    expect(errors).toEqual([]);
  } finally {
    await stave.close();
    await rm(directory, { recursive: true, force: true });
  }
});
