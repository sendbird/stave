import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { TarsResponsibility } from "@/lib/tars/types";
import { launchStave, seedRepository, E2E_WORKSPACE_ID } from "./harness/stave-app";

// Real Electron IPC, host, Git worktrees and SQLite; only the provider CLI is a stand-in.
test("Tars admits isolated work and preserves human takeover across restart", async ({}, testInfo) => {
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
    const env = { STAVE_CLAUDE_CLI_PATH: wrapper };
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
    const denied = await stave.page.evaluate(async (request) => {
      try { await window.api!.tars!.create({ ...request, requestId: "denied", repositoryPath: `${request.repositoryPath}-unregistered` }); return false; }
      catch { return true; }
    }, input);
    expect(denied).toBe(true);
    expect((await stave.page.evaluate(() => window.api!.tars!.get())).responsibilities).toHaveLength(0);

    const created = await stave.page.evaluate((request) => window.api!.tars!.create(request), input);
    const id = created.responsibilities[0]!.id;
    let row: TarsResponsibility = created.responsibilities[0]!;
    await expect.poll(async () => {
      row = (await stave!.page.evaluate(() => window.api!.tars!.get())).responsibilities.find((entry) => entry.id === id)!;
      return { state: row.state, run: Boolean(row.agentRunId) };
    }, { timeout: 90_000 }).toEqual({ state: "running", run: true });
    expect(row.executionWorkspaceId).not.toBe(E2E_WORKSPACE_ID);
    const worktrees = execFileSync("git", ["worktree", "list", "--porcelain"], { cwd: repositoryPath, encoding: "utf8" });
    expect(worktrees.match(/^worktree /gm)).toHaveLength(2);
    expect(worktrees).toContain(`branch refs/heads/tars/${id}`);
    const loaded = await stave.page.evaluate((workspaceId) => window.api!.persistence!.loadWorkspace!({ workspaceId }), row.executionWorkspaceId!);
    expect(loaded.snapshot?.tasks.some((task) => task.id === row.taskId)).toBe(true);
    await expect.poll(async () => (await readFile(turnsFile, "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line)).filter((entry) => entry.runTurn).length,
      { timeout: 60_000 }).toBe(2);

    // Take over through the admitted control path, the same one a click and a spoken request use.
    row = (await stave.page.evaluate(() => window.api!.tars!.get())).responsibilities.find((entry) => entry.id === id)!;
    const takeover = await stave.page.evaluate((entry) => window.api!.tars!.act({ requestId: "takeover-click", responsibilityId: entry.id,
      expectedRevision: entry.revision, operation: "takeover", source: "click" }), row);
    expect(takeover.record, takeover.record.error ?? undefined).toMatchObject({ status: "applied", source: "click" });
    row = takeover.snapshot.responsibilities.find((entry) => entry.id === id)!;
    expect(row.state).toBe("takenOver");
    const beforeRestart = { taskId: row.taskId, executionWorkspaceId: row.executionWorkspaceId, agentRunId: row.agentRunId };
    // The takeover stopped the run's held turn. That ends the turn, not the run: wait until the
    // stopped turn is settled as interrupted, so the restart always starts from it.
    await expect.poll(async () => {
      const detail = (await stave!.page.evaluate((agentRunId) => window.api!.agentRuns!.get({ agentRunId }), row.agentRunId!)).agentRun;
      return { pauseReason: detail?.agentRun.pauseReason, interrupted: detail?.events.some((event) => event.kind === "turn-interrupted") };
    }, { timeout: 30_000 }).toEqual({ pauseReason: "taken-over", interrupted: true });
    await stave.close(); stave = null;

    stave = await launchStave({ userDataDir: profileDir, env });
    await expect.poll(async () => {
      row = (await stave!.page.evaluate(() => window.api!.tars!.get())).responsibilities.find((entry) => entry.id === id)!;
      return row?.state;
    }).toBe("takenOver");
    expect(row).toMatchObject(beforeRestart);
    // Human takeover always wins: resume is refused with a recorded reason; only a hand-back returns the work.
    const resumed = await stave.page.evaluate((entry) => window.api!.tars!.act({ requestId: "resume-click", responsibilityId: entry.id,
      expectedRevision: entry.revision, operation: "resume", source: "click" }), row);
    expect(resumed.record).toMatchObject({ status: "rejected", reason: "takenOver" });
    expect((await stave.page.evaluate(() => window.api!.tars!.getConversation!())).records.map((record) => [record.requestId, record.status]))
      .toEqual([["takeover-click", "applied"], ["resume-click", "rejected"]]);
    expect((await stave.page.evaluate((agentRunId) => window.api!.agentRuns!.get({ agentRunId }), row.agentRunId!)).agentRun?.agentRun.pauseReason).toBe("taken-over");
    expect(execFileSync("git", ["worktree", "list", "--porcelain"], { cwd: repositoryPath, encoding: "utf8" })).toBe(worktrees);
    const replay = await stave.page.evaluate((request) => window.api!.tars!.create(request), input);
    expect(replay.responsibilities).toHaveLength(1);
    expect(replay.responsibilities[0]).toMatchObject({ id, state: "takenOver", ...beforeRestart });
    await testInfo.attach("ownership", { body: JSON.stringify({ id, ...beforeRestart, worktrees }), contentType: "application/json" });
  } finally {
    await stave?.close();
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});

// Real host observation, inbox and conversation queue; only the provider CLI is a stand-in.
test("a blocked run gets exactly one automatic follow-up planner turn", async ({}, testInfo) => {
  test.setTimeout(240_000);
  const directory = await mkdtemp(path.join(tmpdir(), "stave-tars-follow-up-e2e-"));
  const repositoryPath = path.join(directory, "repository");
  const profileDir = path.join(directory, "profile");
  const fakeDir = path.join(directory, "fake-claude");
  let stave: Awaited<ReturnType<typeof launchStave>> | null = null;
  try {
    await Promise.all([mkdir(repositoryPath), mkdir(profileDir), mkdir(fakeDir)]);
    execFileSync("git", ["init", "-b", "main"], { cwd: repositoryPath });
    await writeFile(path.join(repositoryPath, "README.md"), "Tars follow-up fixture.\n");
    execFileSync("git", ["add", "README.md"], { cwd: repositoryPath });
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "test: initialize"], { cwd: repositoryPath });
    const turnsFile = path.join(fakeDir, "turns.jsonl");
    const replyFile = path.join(fakeDir, "reply.json");
    await writeFile(turnsFile, `${JSON.stringify({ at: "fixture", runTurn: true, resumed: false })}\n`);
    await writeFile(replyFile, JSON.stringify({ reply: "The work stopped because its task is gone. Tell me whether to cancel it.", actions: [] }));
    const fakeCli = path.join(import.meta.dirname, "harness", "fake-claude-cli.cjs");
    const wrapper = path.join(fakeDir, "claude");
    const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
    await writeFile(wrapper, `#!/bin/sh\nFAKE_CLAUDE_DIR=${quote(fakeDir)} FAKE_CLAUDE_REPLY_FILE=${quote(replyFile)} FAKE_CLAUDE_PROMPT_MARKERS=${quote("currentMessage,became blocked")} exec ${quote(process.execPath)} ${quote(fakeCli)} "$@"\n`);
    await chmod(wrapper, 0o755);
    // Only the follow-up message's own text says "became blocked"; the planner's instructions never do.
    const followUpCalls = async () => (await readFile(turnsFile, "utf8")).split("\n").filter(Boolean)
      .map((line) => JSON.parse(line)).filter((entry) => entry.markers?.currentMessage && entry.markers?.["became blocked"]).length;
    stave = await launchStave({ userDataDir: profileDir, env: { STAVE_CLAUDE_CLI_PATH: wrapper } });
    await seedRepository(stave.page, { repositoryPath, settings: { autoRoutingEnabled: false } });
    await stave.page.evaluate((input) => window.api!.tars!.configureConversation!(input),
      { providerId: "claude-code" as const, model: "sonnet", maxTurns: 4, runtimeHints: { claudeBinaryPath: wrapper } });
    await expect.poll(async () => stave!.page.evaluate(async (repository) => {
      const registry = await window.api!.persistence!.loadRepositoryRegistry!();
      return registry.repositories.some((entry) => (entry as { repositoryPath: string }).repositoryPath === repository);
    }, repositoryPath)).toBe(true);
    const created = await stave.page.evaluate((request) => window.api!.tars!.create(request), {
      requestId: "tars-electron-follow-up", title: "Hold isolated work", instruction: "[hold] Inspect README.md and wait for further direction.",
      acceptanceCriteria: ["README.md was inspected."], workspaceId: E2E_WORKSPACE_ID, repositoryPath, providerId: "claude-code" as const,
      model: "sonnet", maxTurns: 4, priority: 50 });
    const id = created.responsibilities[0]!.id;
    let row: TarsResponsibility = created.responsibilities[0]!;
    await expect.poll(async () => {
      row = (await stave!.page.evaluate(() => window.api!.tars!.get())).responsibilities.find((entry) => entry.id === id)!;
      return { state: row.state, run: Boolean(row.agentRunId) };
    }, { timeout: 90_000 }).toEqual({ state: "running", run: true });
    expect(await followUpCalls()).toBe(0);
    // The execution task disappears under the run: the host observes it blocked, an event that needs Tars's judgment.
    await stave.page.evaluate((workspaceId) => window.api!.persistence!.closeWorkspace!({ workspaceId }), row.executionWorkspaceId!);
    await expect.poll(async () => (await stave!.page.evaluate(() => window.api!.tars!.get())).responsibilities.find((entry) => entry.id === id)?.state,
      { timeout: 30_000 }).toBe("blocked");
    await expect.poll(followUpCalls, { timeout: 60_000 }).toBe(1);
    await expect.poll(async () => (await stave!.page.evaluate(() => window.api!.tars!.getConversation!())).messages
      .map((message) => [message.origin?.kind, message.origin?.kind === "followUp" ? message.origin.reason : null, message.state]),
    { timeout: 30_000 }).toEqual([["followUp", "blocked", "answered"]]);
    // Later host ticks observe the same block: no new event, no new model call.
    await stave.page.waitForTimeout(12_000);
    expect(await followUpCalls()).toBe(1);
    const conversation = await stave.page.evaluate(() => window.api!.tars!.getConversation!());
    expect(conversation.events?.filter((event) => event.responsibilityId === id).map((event) => [event.kind, event.status])).toEqual([["blocked", "followedUp"]]);
    await testInfo.attach("follow-up", { body: JSON.stringify({ id, calls: await followUpCalls(), events: conversation.events }), contentType: "application/json" });
  } finally {
    await writeFile(path.join(fakeDir, "release"), "").catch(() => undefined);
    await stave?.close();
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
