import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { E2E_WORKSPACE_ID, launchStave, seedRepository } from "./harness/stave-app";

// Real main, host, preload, native CLI dispatch and SQLite across a restart; provider responses are fixtures.
test("a turn queued for a slot when Stave quits comes back as a restored queue item and never runs on its own", async () => {
  test.setTimeout(240_000);
  const directory = await mkdtemp(path.join(tmpdir(), "stave-turn-restore-"));
  const repositoryPath = path.join(directory, "repository");
  const fakeDir = path.join(directory, "provider");
  const profileDir = path.join(directory, "profile");
  let stave: Awaited<ReturnType<typeof launchStave>> | undefined;
  try {
    await Promise.all([mkdir(repositoryPath), mkdir(fakeDir), mkdir(profileDir)]);
    execFileSync("git", ["init", "-b", "main"], { cwd: repositoryPath });
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "--allow-empty", "-m", "test: initialize"], { cwd: repositoryPath });
    // Seed before launch so the renderer and the host start from one registry with two real tasks.
    const seedEntry = path.join(directory, "seed.ts");
    const seedBundle = path.join(directory, "seed.cjs");
    await writeFile(seedEntry, `
      import { SqliteStore } from ${JSON.stringify(path.resolve("electron/persistence/sqlite-store.ts"))};
      const store = new SqliteStore({ dbPath: ${JSON.stringify(path.join(profileDir, "stave.sqlite"))}, runMaintenance: false });
      const repositoryPath = ${JSON.stringify(repositoryPath)};
      const updatedAt = "2026-01-01T00:00:00.000Z";
      const task = (id) => ({ id, title: id, provider: "claude-code", updatedAt, unread: false, archivedAt: null });
      store.upsertWorkspace({ id: ${JSON.stringify(E2E_WORKSPACE_ID)}, name: "e2e", snapshot: { activeTaskId: "task-restore", tasks: [task("task-hold"), task("task-restore")], messagesByTask: {} } });
      store.saveRepositoryRegistry({ repositories: [{ repositoryPath, repositoryName: "Fixture", lastOpenedAt: updatedAt, defaultBranch: "main", activeWorkspaceId: ${JSON.stringify(E2E_WORKSPACE_ID)},
        workspaces: [{ id: ${JSON.stringify(E2E_WORKSPACE_ID)}, name: "e2e", updatedAt }], workspacePathById: { [${JSON.stringify(E2E_WORKSPACE_ID)}]: repositoryPath }, workspaceBranchById: { [${JSON.stringify(E2E_WORKSPACE_ID)}]: "main" }, workspaceDefaultById: { [${JSON.stringify(E2E_WORKSPACE_ID)}]: true } }],
        activeRepositoryPath: repositoryPath });
      store.close();
    `);
    execFileSync("bun", ["build", seedEntry, "--outfile", seedBundle, "--target=node", "--format=cjs", "--external=better-sqlite3", '--define=import.meta.env.BASE_URL="/"'], { stdio: "pipe" });
    const require = createRequire(import.meta.url);
    execFileSync(require("electron"), [seedBundle], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", NODE_PATH: path.dirname(path.dirname(require.resolve("better-sqlite3/package.json"))) }, stdio: "pipe" });

    const turnsFile = path.join(fakeDir, "turns.jsonl");
    await writeFile(turnsFile, `${JSON.stringify({ runTurn: true })}\n`);
    const fixture = path.join(import.meta.dirname, "harness", "fake-claude-cli.cjs");
    const wrapper = path.join(fakeDir, "provider");
    const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
    await writeFile(wrapper, `#!/bin/sh\nFAKE_CLAUDE_DIR=${quote(fakeDir)} exec ${quote(process.execPath)} ${quote(fixture)} "$@"\n`);
    await chmod(wrapper, 0o755);
    const env = { STAVE_CLAUDE_CLI_PATH: wrapper, FAKE_CLAUDE_HOLD_ALL: "1", FAKE_CLAUDE_PROMPT_MARKERS: "cap-hold,cap-restore" };
    const starts = async (marker: string) => (await readFile(turnsFile, "utf8")).split("\n").filter(Boolean).map(line => JSON.parse(line)).filter(row => row.markers?.[marker]).length;

    stave = await launchStave({ userDataDir: profileDir, env });
    // The renderer pushes its settings on boot; seed the cap there so that push keeps it.
    await seedRepository(stave.page, { repositoryPath, settings: { autoRoutingEnabled: false, globalAgentTurnLimit: 1 } });
    const synced = await stave.page.evaluate(() => window.api!.agents!.sync({ customAgents: [], routeSettings: { routing: { autoRoutingEnabled: false }, classifier: null, globalAgentTurnLimit: 1 } }));
    expect(synced.ok).toBe(true);
    for (const [turnId, taskId, prompt] of [["turn-hold", "task-hold", "[hold] cap-hold"], ["turn-restore", "task-restore", "[hold] cap-restore Please summarize the repository."]] as const) {
      const result = await stave.page.evaluate(async (args) => window.api!.provider!.startStreamTurn!({ ...args, workspaceId: args.workspaceId, providerId: "claude-code", runtimeOptions: { model: "sonnet" } }),
        { turnId, taskId, prompt, cwd: repositoryPath, workspaceId: E2E_WORKSPACE_ID });
      expect(result.ok).toBe(true);
    }
    await expect.poll(() => starts("cap-hold"), { timeout: 60_000 }).toBe(1);
    expect(await starts("cap-restore")).toBe(0);

    // Quit while the second turn still waits for the slot.
    await stave.close();
    stave = await launchStave({ userDataDir: profileDir, env });

    // It comes back in its task's composer queue, marked as restored, and waits for the user.
    await expect(stave.page.getByText(/Waiting to send \(restored\)/)).toBeVisible({ timeout: 60_000 });
    const queued = await stave.page.evaluate(async (workspaceId) => (await window.api!.persistence!.loadWorkspaceShell!({ workspaceId })).shell?.promptDraftByTask?.["task-restore"]?.queuedTurns ?? [], E2E_WORKSPACE_ID);
    expect(queued).toEqual([expect.objectContaining({ id: "restored-turn-restore", content: "[hold] cap-restore Please summarize the repository.", providerId: "claude-code", model: "sonnet" })]);
    // The host never starts it on its own, so a send by the user cannot duplicate work.
    await new Promise(resolve => setTimeout(resolve, 5_000));
    expect(await starts("cap-restore")).toBe(0);
  } finally { await stave?.close(); await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
});
