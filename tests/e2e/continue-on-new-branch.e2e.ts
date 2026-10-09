import { expect, test } from "@playwright/test";

/**
 * A merged branch can be continued in place: the Continue dialog defaults to
 * "Here, on a new branch", and confirming it fetches the base and switches
 * this worktree to a new branch instead of creating another workspace.
 */
test("continuing a merged branch here switches this worktree to a new branch", async ({ page }) => {
  await page.addInitScript(() => {
    const harness = { commands: [] as string[] };
    (window as unknown as { __prHarness: typeof harness }).__prHarness = harness;
    const ok = { ok: true, code: 0, stdout: "", stderr: "" };
    (window as unknown as { api?: Record<string, unknown> }).api = {
      // With both of these present the browser dev bridge leaves the harness
      // alone instead of routing commands to a real shell.
      provider: { streamTurn: async () => [] },
      scripts: {},
      shell: {},
      terminal: {
        runCommand: async ({ command }: { command: string }) => {
          harness.commands.push(command);
          return ok;
        },
      },
      sourceControl: {
        getPrStatus: async () => ({
          ok: true,
          stderr: "",
          pr: {
            number: 701,
            title: "refactor(settings): one owner per setting",
            state: "MERGED",
            isDraft: false,
            url: "https://github.com/example/repo/pull/701",
            reviewDecision: "APPROVED",
            mergeable: "UNKNOWN",
            mergeStateStatus: "UNKNOWN",
            checksRollup: "SUCCESS",
            mergedAt: "2026-10-08T10:00:00.000Z",
            baseRefName: "main",
            headRefName: "feature-pr",
          },
        }),
        getStatus: async () => ({ ok: true, branch: "feature-pr", items: [], hasConflicts: false, stderr: "" }),
        getHistory: async () => ({ ok: true, items: [], stderr: "" }),
        listBranches: async () => ({
          ok: true,
          current: "feature-pr",
          branches: ["main", "feature-pr"],
          remoteBranches: ["origin/main"],
          worktreePathByBranch: {},
          stderr: "",
        }),
      },
    };
  });

  await page.goto("/?stavePreview=create-pr");
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Continue This Work")).toBeVisible();
  await expect(dialog.getByRole("radio", { name: /Here, on a new branch/ })).toBeChecked();
  await expect(dialog.getByText("New Branch Name")).toBeVisible();
  const branchName = await dialog.getByRole("textbox").inputValue();
  expect(branchName).toMatch(/^feature-pr--continue--\d{8}-\d{6}$/);

  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  // The dialog closes only on success (this preview mounts no toast host).
  await expect(dialog).toHaveCount(0);

  const commands = await page.evaluate(
    () => (window as unknown as { __prHarness: { commands: string[] } }).__prHarness.commands,
  );
  expect(commands).toEqual([
    "git fetch 'origin' --prune",
    `git switch -c '${branchName}' 'origin/main'`,
  ]);
});
