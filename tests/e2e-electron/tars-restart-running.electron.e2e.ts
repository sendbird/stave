import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { TarsResponsibility } from "@/lib/tars/types";
import { launchStave, seedRepository, E2E_WORKSPACE_ID } from "./harness/stave-app";

/**
 * Restarting Stave while Tars's run is mid-turn keeps the work Tars's. Found
 * by the live verification (`tars-live-provider.electron.e2e.ts`, scenario D):
 * after a relaunch the run paused with `task-identity-changed` and Tars
 * blocked it as `taskUnavailable`. Real main/host/SQLite; only the CLI is a stand-in.
 */
for (const resolved of [false, true]) {
  test(`a running Tars responsibility survives a restart (${resolved ? "resolved" : "as given"} repository path)`, async ({}, testInfo) => {
    test.setTimeout(240_000);
    const created = await mkdtemp(path.join(tmpdir(), "stave-tars-restart-e2e-"));
    // macOS's temporary directory is a symbolic link (/var → /private/var), as a user's repository path can be.
    const directory = resolved ? await realpath(created) : created;
    const repositoryPath = path.join(directory, "repository");
    const profileDir = path.join(directory, "profile");
    const fakeDir = path.join(directory, "fake-claude");
    let stave: Awaited<ReturnType<typeof launchStave>> | null = null;
    try {
      await Promise.all([mkdir(repositoryPath), mkdir(profileDir), mkdir(fakeDir)]);
      execFileSync("git", ["init", "-b", "main"], { cwd: repositoryPath });
      await writeFile(path.join(repositoryPath, "README.md"), "Tars restart fixture.\n");
      execFileSync("git", ["add", "README.md"], { cwd: repositoryPath });
      execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "test: initialize"], { cwd: repositoryPath });
      const turnsFile = path.join(fakeDir, "turns.jsonl");
      await writeFile(turnsFile, `${JSON.stringify({ at: "fixture", runTurn: true, resumed: false })}\n`);
      const fakeCli = path.join(import.meta.dirname, "harness", "fake-claude-cli.cjs");
      const wrapper = path.join(fakeDir, "claude");
      const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
      await writeFile(wrapper, `#!/bin/sh\nFAKE_CLAUDE_DIR=${quote(fakeDir)} exec ${quote(process.execPath)} ${quote(fakeCli)} "$@"\n`);
      await chmod(wrapper, 0o755);
      const env = { STAVE_CLAUDE_CLI_PATH: wrapper };
      stave = await launchStave({ userDataDir: profileDir, env });
      await seedRepository(stave.page, { repositoryPath, settings: { autoRoutingEnabled: false } });
      await expect.poll(async () => stave!.page.evaluate(async (repository) => {
        const registry = await window.api!.persistence!.loadRepositoryRegistry!();
        return registry.repositories.some((entry) => (entry as { repositoryPath: string }).repositoryPath === repository);
      }, repositoryPath)).toBe(true);
      const snapshot = await stave.page.evaluate((request) => window.api!.tars!.create(request), {
        requestId: "tars-restart-running", title: "Hold isolated work", instruction: "[hold] Inspect README.md and wait for further direction.",
        acceptanceCriteria: ["README.md was inspected."], workspaceId: E2E_WORKSPACE_ID, repositoryPath, providerId: "claude-code" as const,
        model: "sonnet", maxTurns: 6, priority: 50 });
      const id = snapshot.responsibilities[0]!.id;
      let row: TarsResponsibility = snapshot.responsibilities[0]!;
      await expect.poll(async () => {
        row = (await stave!.page.evaluate(() => window.api!.tars!.get())).responsibilities.find((entry) => entry.id === id)!;
        return { state: row.state, run: Boolean(row.agentRunId) };
      }, { timeout: 90_000 }).toEqual({ state: "running", run: true });
      // The run's turn is held in flight when the app goes away.
      await expect.poll(async () => (await readFile(turnsFile, "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line)).filter((entry) => entry.runTurn).length,
        { timeout: 60_000 }).toBe(2);
      const before = { taskId: row.taskId, executionWorkspaceId: row.executionWorkspaceId, agentRunId: row.agentRunId };
      await stave.close(); stave = null;

      stave = await launchStave({ userDataDir: profileDir, env });
      // Several host observations and a renderer workspace refresh happen in this window.
      const observed: Array<{ state: string; detailCode: string | null; pauseReason: string | null }> = [];
      for (let index = 0; index < 8; index += 1) {
        await stave.page.waitForTimeout(4_000);
        row = (await stave.page.evaluate(() => window.api!.tars!.get())).responsibilities.find((entry) => entry.id === id)!;
        const detail = (await stave.page.evaluate((agentRunId) => window.api!.agentRuns!.get({ agentRunId }), row.agentRunId!)).agentRun;
        observed.push({ state: row.state, detailCode: row.detailCode ?? null, pauseReason: detail?.agentRun.pauseReason ?? null });
      }
      const registry = await stave.page.evaluate(() => window.api!.persistence!.loadRepositoryRegistry!());
      await writeFile(testInfo.outputPath("observed.json"), JSON.stringify({ before, observed, registry }, null, 2));
      expect(row).toMatchObject(before);
      expect(observed.filter((entry) => entry.state === "blocked" || entry.pauseReason === "task-identity-changed"), JSON.stringify(observed)).toEqual([]);
    } finally {
      await writeFile(path.join(fakeDir, "release"), "").catch(() => undefined);
      await stave?.close();
      await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  });
}
