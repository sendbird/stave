import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave, seedRepository, E2E_WORKSPACE_ID } from "./harness/stave-app";

// Real Electron IPC, host, Git worktrees and SQLite; only the provider CLI is a stand-in.
test("Tars starts independent worktrees concurrently and refills a configured slot", async ({}, testInfo) => {
  test.setTimeout(240_000);
  const directory = await mkdtemp(path.join(tmpdir(), "stave-tars-e2e-"));
  const repositoryPath = path.join(directory, "repository");
  const profileDir = path.join(directory, "profile");
  const fakeDir = path.join(directory, "fake-claude");
  let stave: Awaited<ReturnType<typeof launchStave>> | null = null;
  try {
    await Promise.all([mkdir(repositoryPath), mkdir(profileDir), mkdir(fakeDir)]);
    execFileSync("git", ["init", "-b", "main"], { cwd: repositoryPath });
    await writeFile(path.join(repositoryPath, "README.md"), "Tars integration fixture.\n");
    execFileSync("git", ["add", "README.md"], { cwd: repositoryPath });
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "test: initialize"], { cwd: repositoryPath });
    // Skip the shared fake CLI's first-turn quota scenario; this test needs a held turn.
    const turnsFile = path.join(fakeDir, "turns.jsonl");
    await writeFile(turnsFile, `${JSON.stringify({ at: "fixture", runTurn: true, resumed: false })}\n`);
    const fakeCli = path.join(import.meta.dirname, "harness", "fake-claude-cli.cjs");
    const wrapper = path.join(fakeDir, "claude");
    const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
    await writeFile(wrapper, `#!/bin/sh\nFAKE_CLAUDE_DIR=${quote(fakeDir)} exec ${quote(process.execPath)} ${quote(fakeCli)} "$@"\n`);
    await chmod(wrapper, 0o755);
    const env = { STAVE_CLAUDE_CLI_PATH: wrapper, FAKE_CLAUDE_HOLD_ALL: "1" };
    stave = await launchStave({ userDataDir: profileDir, env });
    await seedRepository(stave.page, { repositoryPath, settings: { autoRoutingEnabled: false, themeMode: "dark" } });
    await expect.poll(async () => stave!.page.evaluate(async (repository) => {
      const registry = await window.api!.persistence!.loadRepositoryRegistry!();
      return registry.repositories.some((entry) => (entry as { repositoryPath: string }).repositoryPath === repository);
    }, repositoryPath)).toBe(true);

    const input = {
      requestId: "tars-electron-one", title: "Hold isolated work", instruction: "[hold] Inspect README.md and wait for further direction.",
      acceptanceCriteria: ["README.md was inspected."], workspaceId: E2E_WORKSPACE_ID,
      repositoryPath, providerId: "claude-code" as const, model: "sonnet", maxTurns: 4, priority: 50,
    };
    await stave.page.evaluate(() => window.api!.tars!.configureConversation!({ providerId: "claude-code", model: "sonnet", maxTurns: 4,
      maxConcurrentResponsibilities: 2 }));
    for (let n = 0; n < 4; n++) await stave.page.evaluate((request) => window.api!.tars!.create(request),
      { ...input, requestId: `parallel-${n}`, title: `Independent held work ${n}`, priority: 100 - n });
    const snapshot = () => stave!.page.evaluate(() => window.api!.tars!.get());
    await expect.poll(async () => (await snapshot()).responsibilities.filter((row) => row.state === "running").length,
      { timeout: 90_000 }).toBe(2);
    const initial = (await snapshot()).responsibilities;
    expect(initial.filter((row) => row.state === "queued").map((row) => row.queueWait), JSON.stringify(initial.map(({ state, detail, requestId }) => ({ state, detail, requestId })))).toEqual([
      { code: "capacity", active: 2, limit: 2 }, { code: "capacity", active: 2, limit: 2 },
    ]);
    // Provider fixture records actual native turn starts. Both start while neither held turn has ended.
    await expect.poll(async () => (await readFile(turnsFile, "utf8")).split("\n").filter(Boolean)
      .map((line) => JSON.parse(line)).filter((entry) => entry.runTurn).length, { timeout: 60_000 }).toBe(3);
    const first = initial.find((row) => row.state === "running")!;
    const cancelled = await stave.page.evaluate((row) => window.api!.tars!.act({ requestId: "cancel-first", responsibilityId: row.id,
      expectedRevision: row.revision, operation: "cancel", source: "click" }), first);
    expect(cancelled.record.status).toBe("applied");
    await expect.poll(async () => (await snapshot()).responsibilities.filter((row) => row.agentRunId).length,
      { timeout: 60_000 }).toBe(3);
    await stave.page.evaluate(() => window.api!.tars!.configureConversation!({ providerId: "claude-code", model: "sonnet", maxTurns: 4,
      maxConcurrentResponsibilities: 0 }));
    await expect.poll(async () => (await snapshot()).responsibilities.filter((row) => row.agentRunId).length,
      { timeout: 60_000 }).toBe(4);
    const final = (await snapshot()).responsibilities;
    expect(new Set(final.map((row) => row.executionWorkspaceId)).size).toBe(4);
    expect(new Set(final.map((row) => row.agentRunId)).size).toBe(4);
    const worktrees = execFileSync("git", ["worktree", "list", "--porcelain"], { cwd: repositoryPath, encoding: "utf8" });
    expect(worktrees.match(/^worktree /gm)).toHaveLength(5);
    await testInfo.attach("parallel-admission", { body: JSON.stringify({ initial, final, worktrees }), contentType: "application/json" });
  } finally {
    await stave?.close();
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
