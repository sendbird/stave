import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave, seedRepository, E2E_WORKSPACE_ID } from "./harness/stave-app";

// Real main, host, preload, native CLI dispatch and SQLite; external responses are fixtures.
test("global cap admits two native turns, queues three, cancels queued work and refills", async () => {
  test.setTimeout(180_000);
  const directory = await mkdtemp(path.join(tmpdir(), "stave-turn-cap-"));
  const repositoryPath = path.join(directory, "repository");
  const fakeDir = path.join(directory, "provider");
  const profileDir = path.join(directory, "profile");
  let stave: Awaited<ReturnType<typeof launchStave>> | undefined;
  try {
    await Promise.all([mkdir(repositoryPath), mkdir(fakeDir), mkdir(profileDir)]);
    execFileSync("git", ["init", "-b", "main"], { cwd: repositoryPath });
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "--allow-empty", "-m", "test: initialize"], { cwd: repositoryPath });
    const turnsFile = path.join(fakeDir, "turns.jsonl");
    await writeFile(turnsFile, `${JSON.stringify({ runTurn: true })}\n`);
    const fixture = path.join(import.meta.dirname, "harness", "fake-claude-cli.cjs");
    const wrapper = path.join(fakeDir, "provider");
    const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
    await writeFile(wrapper, `#!/bin/sh\nFAKE_CLAUDE_DIR=${quote(fakeDir)} exec ${quote(process.execPath)} ${quote(fixture)} "$@"\n`);
    await chmod(wrapper, 0o755);
    stave = await launchStave({ userDataDir: profileDir, env: { STAVE_CLAUDE_CLI_PATH: wrapper, FAKE_CLAUDE_HOLD_ALL: "1", FAKE_CLAUDE_PROMPT_MARKERS: "cap-turn" } });
    await seedRepository(stave.page, { repositoryPath, settings: { autoRoutingEnabled: false, globalAgentTurnLimit: 2 } });
    const synced = await stave.page.evaluate(() => window.api!.agents!.sync({ customAgents: [], routeSettings: { routing: { autoRoutingEnabled: false }, classifier: null, globalAgentTurnLimit: 2 } }));
    expect(synced.ok).toBe(true);
    const streams: Array<{ streamId: string; turnId: string }> = [];
    for (let n = 0; n < 5; n++) {
      const result = await stave.page.evaluate(async ({ cwd, workspaceId, n }) => {
        const turnId = `cap-${n}`;
        const result = await window.api!.provider!.startStreamTurn!({ turnId, taskId: turnId, workspaceId, cwd, providerId: "claude-code", prompt: "[hold] cap-turn", runtimeOptions: { model: "sonnet" } });
        return { ...result, turnId };
      }, { cwd: repositoryPath, workspaceId: E2E_WORKSPACE_ID, n });
      expect(result.ok).toBe(true); streams.push(result);
    }
    const actualStarts = async () => (await readFile(turnsFile, "utf8")).split("\n").filter(Boolean).map(line => JSON.parse(line)).filter(row => row.markers?.["cap-turn"]).length;
    await expect.poll(actualStarts, { timeout: 60_000 }).toBe(2);
    const queued = await stave.page.evaluate(async (ids) => Promise.all(ids.map(streamId => window.api!.provider!.readStreamTurn!({ streamId, cursor: 0 }))), streams.slice(2).map(row => row.streamId));
    for (const result of queued) expect(result.events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "turn_admission", state: "queued" })]));
    await stave.page.evaluate(id => window.api!.provider!.abortTurn!({ turnId: id }), streams[4]!.turnId);
    await stave.page.evaluate(id => window.api!.provider!.abortTurn!({ turnId: id }), streams[0]!.turnId);
    await expect.poll(actualStarts, { timeout: 60_000 }).toBe(3);
    await writeFile(path.join(fakeDir, "release"), "release");
    await expect.poll(actualStarts, { timeout: 60_000 }).toBe(4);
    await expect.poll(async () => stave!.page.evaluate(async ids => Promise.all(ids.map(streamId => window.api!.provider!.readStreamTurn!({ streamId, cursor: 0 }))).then(rows => rows.every(row => row.done)), streams.map(row => row.streamId)), { timeout: 60_000 }).toBe(true);
  } finally { await stave?.close(); await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
});
