import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";
import { launchStave, seedRepository, type StaveApp } from "./harness/stave-app";

test("checks out a local fixture PR ref through Electron IPC", async () => {
  test.setTimeout(120_000);
  test.skip(process.platform === "win32", "The GitHub CLI fixture is a POSIX executable.");
  const directory = await mkdtemp(path.join(tmpdir(), "stave-pr-e2e-"));
  const cwd = path.join(directory, "repository");
  const bin = path.join(directory, "bin");
  const origin = "https://github.com/fixture/workspace-pr.git";
  const prUrl = "https://github.com/fixture/workspace-pr/pull/123";
  let stave: StaveApp | undefined;
  try {
    await mkdir(cwd);
    await mkdir(bin);
    const git = (...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
    git("init", "-b", "main");
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "test: seed");
    git("update-ref", "refs/pull/123/head", "HEAD");
    git("remote", "add", "origin", origin);
    git("config", `url.${pathToFileURL(path.join(cwd, ".git")).href}.insteadOf`, origin);
    await writeFile(path.join(bin, "gh"), `#!/bin/sh
case "$1 $2" in
  "auth status") exit 0 ;;
  "pr view") printf '%s\\n' '{"number":123,"url":"${prUrl}","headRefName":"review","baseRefName":"main","isCrossRepository":true,"title":"Fixture PR","state":"OPEN","mergeable":"MERGEABLE","mergeStateStatus":"CLEAN"}' ;;
  *) exit 1 ;;
esac
`, { mode: 0o755 });

    stave = await launchStave({ env: { PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}` } });
    const { page } = stave;
    await seedRepository(page, { repositoryPath: cwd });
    const trigger = page.getByTestId(`new-workspace-${cwd}`);
    await page.getByRole("complementary").getByText("stave-e2e", { exact: true }).first().hover();
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "New workspace" });
    await dialog.getByRole("button", { name: "Open From Pull Request" }).click();
    await dialog.getByRole("textbox", { name: "Pull request URL or number" }).fill("#123");
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(git("rev-parse", "--symbolic-full-name", "review@{upstream}")).toBe("refs/remotes/stave-pr-123/head");
    await expect.poll(() => page.evaluate(async ({ repositoryPath, url }) => {
      const registry = await window.api.persistence!.loadRepositoryRegistry!();
      const repository = registry.repositories.find((item) =>
        (item as { repositoryPath?: string }).repositoryPath === repositoryPath,
      ) as { activeWorkspaceId: string } | undefined;
      if (!repository?.activeWorkspaceId) return false;
      const result = await window.api.persistence!.loadWorkspace!({ workspaceId: repository.activeWorkspaceId });
      return result.snapshot?.workspaceInformation?.linkedPullRequests.some((resource) => resource.url === url) ?? false;
    }, { repositoryPath: cwd, url: prUrl })).toBe(true);
    await page.getByRole("button", { name: "PR status menu" }).click();
    await expect(page.getByText("#123 Fixture PR", { exact: true })).toBeVisible();
    const rejected = await page.evaluate((args) => window.api.sourceControl!.checkoutWorkspacePr!(args), {
      cwd, path: path.join(directory, "rejected"), reference: "--help",
    });
    expect(rejected).toEqual({ ok: false, code: "invalidReference" });
  } finally {
    await stave?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
