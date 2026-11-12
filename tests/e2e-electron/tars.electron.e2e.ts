import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
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
    await writeFile(wrapper, `#!/bin/sh\nFAKE_CLAUDE_DIR=${quote(fakeDir)} FAKE_CLAUDE_REPLY_FILE=${quote(replyFile)} FAKE_CLAUDE_PROMPT_MARKERS=${quote("currentMessage,delegated work cannot continue")} exec ${quote(process.execPath)} ${quote(fakeCli)} "$@"\n`);
    await chmod(wrapper, 0o755);
    // Only the follow-up message's own text says "delegated work cannot continue"; the planner's instructions never do.
    const followUpCalls = async () => (await readFile(turnsFile, "utf8")).split("\n").filter(Boolean)
      .map((line) => JSON.parse(line)).filter((entry) => entry.markers?.currentMessage && entry.markers?.["delegated work cannot continue"]).length;
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
    // Admission precedes the host's first task write. Deleting before the
    // provider starts lets that write recreate the task instead of blocking it.
    await expect.poll(async () => (await readFile(turnsFile, "utf8")).split("\n").filter(Boolean)
      .map((line) => JSON.parse(line)).filter((entry) => entry.runTurn).length, { timeout: 60_000 }).toBe(2);
    // The execution task disappears under the run: the host observes it blocked, an event that needs Tars's judgment.
    expect(await stave.page.evaluate((workspaceId) => window.api!.persistence!.closeWorkspace!({ workspaceId }), row.executionWorkspaceId!)).toEqual({ ok: true });
    expect((await stave.page.evaluate((workspaceId) => window.api!.persistence!.loadWorkspace!({ workspaceId }), row.executionWorkspaceId!)).snapshot).toBeNull();
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

/**
 * A stand-in for the GitHub CLI: it resolves the repository, lists no pull
 * request until one is created, prints the created pull request's URL and
 * records every argument array it was called with.
 */
const FAKE_GH = `
const fs = require("node:fs");
const path = require("node:path");
const dir = process.env.FAKE_GH_DIR;
const args = process.argv.slice(2);
fs.appendFileSync(path.join(dir, "calls.jsonl"), JSON.stringify(args) + "\\n");
const created = path.join(dir, "created.json");
if (args[0] === "auth") process.exit(0);
if (args[0] === "repo" && args[1] === "view") { process.stdout.write(JSON.stringify({ nameWithOwner: "example/tars-e2e", url: "https://github.com/example/tars-e2e" })); process.exit(0); }
if (args[0] === "pr" && args[1] === "list") { process.stdout.write(fs.existsSync(created) ? fs.readFileSync(created, "utf8") : "[]"); process.exit(0); }
if (args[0] === "pr" && args[1] === "create") {
  const url = "https://github.com/example/tars-e2e/pull/12";
  fs.writeFileSync(created, JSON.stringify([{ number: 12, url }]));
  process.stdout.write("Creating draft pull request\\n\\n" + url + "\\n");
  process.exit(0);
}
process.stderr.write("unexpected gh " + args.join(" "));
process.exit(1);
`;

// Real Electron IPC, host, Git worktree, push and SQLite; only the provider CLI and the GitHub CLI are stand-ins.
test("a confirmed publish card commits, pushes the work's branch and opens a draft pull request", async ({}, testInfo) => {
  test.setTimeout(240_000);
  const directory = await mkdtemp(path.join(tmpdir(), "stave-tars-publish-e2e-"));
  const repositoryPath = path.join(directory, "repository");
  const remotePath = path.join(directory, "remote.git");
  const profileDir = path.join(directory, "profile");
  const fakeDir = path.join(directory, "fake-claude");
  const ghDir = path.join(directory, "fake-gh");
  let stave: Awaited<ReturnType<typeof launchStave>> | null = null;
  const git = (args: string[], cwd = repositoryPath) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  try {
    await Promise.all([mkdir(repositoryPath), mkdir(profileDir), mkdir(fakeDir), mkdir(ghDir)]);
    git(["init", "-b", "main"]);
    await writeFile(path.join(repositoryPath, "README.md"), "Tars publish fixture.\n");
    git(["add", "README.md"]);
    git(["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "test: initialize"]);
    execFileSync("git", ["init", "--bare", "-b", "main", remotePath]);
    git(["remote", "add", "origin", remotePath]);
    git(["push", "origin", "main"]);
    const remoteMain = git(["rev-parse", "main"], remotePath);
    const turnsFile = path.join(fakeDir, "turns.jsonl");
    await writeFile(turnsFile, `${JSON.stringify({ at: "fixture", runTurn: true, resumed: false })}\n`);
    const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
    const wrapper = path.join(fakeDir, "claude");
    await writeFile(wrapper, `#!/bin/sh\nFAKE_CLAUDE_DIR=${quote(fakeDir)} exec ${quote(process.execPath)} ${quote(path.join(import.meta.dirname, "harness", "fake-claude-cli.cjs"))} "$@"\n`);
    await chmod(wrapper, 0o755);
    await writeFile(path.join(ghDir, "fake-gh.cjs"), FAKE_GH);
    await writeFile(path.join(ghDir, "gh"), `#!/bin/sh\nFAKE_GH_DIR=${quote(ghDir)} exec ${quote(process.execPath)} ${quote(path.join(ghDir, "fake-gh.cjs"))} "$@"\n`);
    await chmod(path.join(ghDir, "gh"), 0o755);
    const env = { STAVE_CLAUDE_CLI_PATH: wrapper, PATH: `${ghDir}${path.delimiter}${process.env.PATH ?? ""}`,
      GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.invalid" };

    // Real admission prepares the work's own worktree and branch; the held run is then taken over so nothing else touches it.
    stave = await launchStave({ userDataDir: profileDir, env });
    await seedRepository(stave.page, { repositoryPath, settings: { autoRoutingEnabled: false } });
    await expect.poll(async () => stave!.page.evaluate(async (repository) => {
      const registry = await window.api!.persistence!.loadRepositoryRegistry!();
      return registry.repositories.some((entry) => (entry as { repositoryPath: string }).repositoryPath === repository);
    }, repositoryPath)).toBe(true);
    const created = await stave.page.evaluate((request) => window.api!.tars!.create(request), {
      requestId: "tars-electron-publish", title: "Add a greeting file", instruction: "[hold] Add greeting.txt and wait for further direction.",
      acceptanceCriteria: ["greeting.txt exists."], workspaceId: E2E_WORKSPACE_ID, repositoryPath, providerId: "claude-code" as const, model: "sonnet", maxTurns: 4, priority: 50 });
    const id = created.responsibilities[0]!.id;
    let row: TarsResponsibility = created.responsibilities[0]!;
    await expect.poll(async () => {
      row = (await stave!.page.evaluate(() => window.api!.tars!.get())).responsibilities.find((entry) => entry.id === id)!;
      return { state: row.state, run: Boolean(row.agentRunId) };
    }, { timeout: 90_000 }).toEqual({ state: "running", run: true });
    // Take over only once the run's first turn reached the provider: a takeover before it interrupts no turn.
    await expect.poll(async () => (await readFile(turnsFile, "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line)).filter((entry) => entry.runTurn).length,
      { timeout: 60_000 }).toBe(2);
    row = (await stave.page.evaluate(() => window.api!.tars!.get())).responsibilities.find((entry) => entry.id === id)!;
    const takeover = await stave.page.evaluate((entry) => window.api!.tars!.act({ requestId: "publish-takeover", responsibilityId: entry.id,
      expectedRevision: entry.revision, operation: "takeover", source: "click" }), row);
    expect(takeover.record.status).toBe("applied");
    await expect.poll(async () => (await stave!.page.evaluate((agentRunId) => window.api!.agentRuns!.get({ agentRunId }), row.agentRunId!)).agentRun
      ?.events.some((event) => event.kind === "turn-interrupted"), { timeout: 30_000 }).toBe(true);
    await stave.close(); stave = null;

    // Seed the verified implementation endpoint, not a legacy unscoped completion (which restores as resultReady).
    // Real supervised completion is exercised by the live-provider e2e; this test owns publication.
    const database = new DatabaseSync(path.join(profileDir, "stave.sqlite"));
    const stored = database.prepare("SELECT body_json, revision FROM tars_responsibilities WHERE id = ?").get(id) as { body_json: string; revision: number };
    const { detailCode: _code, detailParams: _params, ...body } = JSON.parse(stored.body_json) as TarsResponsibility;
    const completed = { ...body, state: "completed", completionGoal: "implementation", resultVerifiedRunId: body.agentRunId, detail: null, revision: stored.revision + 1, updatedAt: new Date().toISOString() };
    database.prepare("UPDATE tars_responsibilities SET revision = ?, body_json = ? WHERE id = ?").run(completed.revision, JSON.stringify(completed), id);
    database.close();
    const head = `tars/${id}`;
    const worktree = git(["worktree", "list", "--porcelain"]).split("\n\n").find((entry) => entry.includes(`branch refs/heads/${head}`))!
      .split("\n")[0]!.replace(/^worktree /, "");
    await writeFile(path.join(worktree, "greeting.txt"), "Hello from Tars.\n");

    stave = await launchStave({ userDataDir: profileDir, env });
    await expect.poll(async () => (await stave!.page.evaluate(() => window.api!.tars!.get())).responsibilities.find((entry) => entry.id === id)?.state).toBe("completed");
    row = (await stave.page.evaluate(() => window.api!.tars!.get())).responsibilities.find((entry) => entry.id === id)!;
    const preview = await stave.page.evaluate((responsibilityId) => window.api!.tars!.previewPublish!({ responsibilityId }), id);
    expect(preview).toMatchObject({ reason: null, repository: "example/tars-e2e", base: "main", head, changedFiles: 1, revision: row.revision });
    // A confirmation that names an outdated revision is refused before any command runs.
    const stale = await stave.page.evaluate((entry) => window.api!.tars!.publish!({ requestId: "publish-click:stale", responsibilityId: entry.id,
      expectedRevision: entry.revision - 1, commitMessage: "feat: add a greeting file", title: "feat: add a greeting file", source: "click" }), row);
    expect(stale.record).toMatchObject({ status: "rejected", reason: "stale" });
    expect(git(["status", "--porcelain"], worktree)).toContain("greeting.txt");

    const published = await stave.page.evaluate((entry) => window.api!.tars!.publish!({ requestId: "publish-click:e2e", responsibilityId: entry.id,
      expectedRevision: entry.revision, commitMessage: "feat: add a greeting file", title: "feat: add a greeting file", source: "key" }), row);
    expect(published.record, published.record.error ?? undefined).toMatchObject({ status: "applied", url: "https://github.com/example/tars-e2e/pull/12", number: 12 });
    // The work's branch reached the remote with one commit holding the change; the base branch did not move.
    expect(git(["log", "-1", "--format=%s", head], remotePath)).toBe("feat: add a greeting file");
    expect(git(["ls-tree", "-r", "--name-only", head], remotePath).split("\n")).toContain("greeting.txt");
    expect(git(["rev-parse", "main"], remotePath)).toBe(remoteMain);
    expect(git(["status", "--porcelain"], worktree)).toBe("");
    const calls = (await readFile(path.join(ghDir, "calls.jsonl"), "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line) as string[]);
    const create = calls.filter((args) => args[0] === "pr" && args[1] === "create");
    expect(create).toHaveLength(1);
    expect(create[0]!.slice(0, 6)).toEqual(["pr", "create", "--draft", "--base=main", `--head=${head}`, "--title=feat: add a greeting file"]);
    expect(create[0]!.find((arg) => arg.startsWith("--body="))).toContain("## Acceptance criteria");
    // Never a merge, a ready-for-review or a forced anything.
    expect(calls.some((args) => (args[0] === "pr" && (args[1] === "merge" || args[1] === "ready")) || args.some((arg) => /^(--force|-f)$/.test(arg)))).toBe(false);
    const after = (await stave.page.evaluate(() => window.api!.tars!.get())).responsibilities.find((entry) => entry.id === id)!;
    expect(after.publication).toMatchObject({ state: "opened", branch: head, base: "main", url: "https://github.com/example/tars-e2e/pull/12", number: 12 });
    expect(after.publication?.commit).toBe(git(["rev-parse", head], remotePath));
    const conversation = await stave.page.evaluate(() => window.api!.tars!.getConversation!());
    expect(conversation.publications?.map((record) => [record.requestId, record.status])).toEqual([["publish-click:stale", "rejected"], ["publish-click:e2e", "applied"]]);
    // Publishing again is refused: the draft pull request is already open.
    const again = await stave.page.evaluate((entry) => window.api!.tars!.publish!({ requestId: "publish-click:again", responsibilityId: entry.id,
      expectedRevision: entry.revision, commitMessage: "feat: again", title: "feat: again", source: "click" }), after);
    expect(again.record).toMatchObject({ status: "rejected", reason: "alreadyPublished" });
    await testInfo.attach("publish", { body: JSON.stringify({ id, head, preview, record: published.record, calls }), contentType: "application/json" });
  } finally {
    await writeFile(path.join(fakeDir, "release"), "").catch(() => undefined);
    await stave?.close();
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
