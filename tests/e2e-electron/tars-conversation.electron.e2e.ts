import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave, seedRepository, E2E_WORKSPACE_ID } from "./harness/stave-app";

// Real main/host/preload, coordinator and SQLite. Only model responses are fixtures.
test("global conversation works without a workspace, admits one decision, and survives restart", async ({ playwright: _playwright }, testInfo) => {
  test.setTimeout(240_000);
  const directory = await mkdtemp(path.join(tmpdir(), "stave-conversation-e2e-"));
  const repositoryPath = path.join(directory, "repository");
  const profileDir = path.join(directory, "profile");
  const fakeDir = path.join(directory, "provider");
  let stave: Awaited<ReturnType<typeof launchStave>> | null = null;
  try {
    await Promise.all([mkdir(repositoryPath), mkdir(profileDir), mkdir(fakeDir)]);
    execFileSync("git", ["init", "-b", "main"], { cwd: repositoryPath });
    await writeFile(path.join(repositoryPath, "README.md"), "Conversation integration fixture.\n");
    execFileSync("git", ["add", "README.md"], { cwd: repositoryPath });
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "test: initialize"], { cwd: repositoryPath });
    const turnsFile = path.join(fakeDir, "turns.jsonl");
    const replyFile = path.join(fakeDir, "reply.json");
    await writeFile(turnsFile, `${JSON.stringify({ runTurn: true, fixture: true })}\n`);
    await writeFile(replyFile, JSON.stringify({ reply: "We can discuss before starting work.", actions: [] }));
    const fakeCli = path.join(import.meta.dirname, "harness", "fake-claude-cli.cjs");
    const wrapper = path.join(fakeDir, "claude");
    const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
    await writeFile(wrapper, `#!/bin/sh\nFAKE_CLAUDE_DIR=${quote(fakeDir)} FAKE_CLAUDE_REPLY_FILE=${quote(replyFile)} FAKE_CLAUDE_PROMPT_MARKERS=currentMessage,tars-attachment-proof,c2NyZWVu exec ${quote(process.execPath)} ${quote(fakeCli)} "$@"\n`);
    await chmod(wrapper, 0o755);
    const env = { STAVE_CLAUDE_CLI_PATH: wrapper };
    const reasoningCount = async () => (await readFile(turnsFile, "utf8")).split("\n").filter(Boolean)
      .map((line) => JSON.parse(line)).filter((entry) => entry.markers?.currentMessage).length;
    stave = await launchStave({ userDataDir: profileDir, env });
    const settings = { providerId: "claude-code" as const, model: "sonnet", maxTurns: 4, runtimeHints: { claudeBinaryPath: wrapper } };
    await stave.page.evaluate((input) => window.api!.tars!.configureConversation!(input), settings);
    await stave.page.getByRole("button", { name: /^(Tars|Tars)$/ }).click();
    const conversationView = stave.page.getByTestId("tars-view");
    const notes = Buffer.from("tars-attachment-proof: preserve the saved labels");
    const screen = Buffer.concat([Buffer.from("screen"), Buffer.alloc(4_000_000 - 6)]);
    await conversationView.locator('input[type="file"]').setInputFiles([
      { name: "notes.txt", mimeType: "text/plain", buffer: notes },
      { name: "screen.png", mimeType: "image/png", buffer: screen },
    ]);
    await expect(conversationView.getByRole("button", { name: "Remove attached file notes.txt", exact: true })).toBeVisible();
    await conversationView.getByRole("textbox").fill("Help clarify this work.");
    await conversationView.getByRole("button", { name: /^(Send|보내기)$/ }).click();
    await expect.poll(() => stave!.page.evaluate(async () => (await window.api!.tars!.getConversation!()).messages.length)).toBe(1);
    const snapshot = await stave.page.evaluate(() => window.api!.tars!.getConversation!());
    const first = snapshot.messages[0]!;
    // The conversation a window reads carries each attachment's name, type and size, never its content.
    expect(first.attachments).toEqual([{ kind: "file", name: "notes.txt", type: "txt", size: notes.byteLength },
      { kind: "image", name: "screen.png", type: "image/png", size: screen.byteLength }]);
    expect(JSON.stringify(snapshot)).not.toContain("data:image");
    expect(JSON.stringify(snapshot)).not.toContain("tars-attachment-proof");
    // The same message again, as the composer read it: the retry identity is the saved snapshot.
    const discussion = { requestId: first.requestId, text: first.text, attachments: [
      { type: "file_context" as const, filePath: "notes.txt", content: notes.toString("utf8"), language: "txt" },
      { type: "image_context" as const, label: "screen.png", dataUrl: `data:image/png;base64,${screen.toString("base64")}`, mimeType: "image/png" as const }] };
    // Largest advertised single image: its base64 request crosses the old 4 MiB
    // host boundary. The actual SDK/fixture CLI must receive it and settle.
    expect(discussion.attachments[1]!.dataUrl.length).toBeGreaterThan(4 * 1024 * 1024);
    await expect.poll(() => stave!.page.evaluate(async (id) =>
      (await window.api!.tars!.getConversation!()).messages.find((row) => row.id === id)?.state, first.id), { timeout: 60_000 }).toBe("answered");
    expect((await stave.page.evaluate(() => window.api!.tars!.get())).responsibilities).toHaveLength(0);
    expect(await reasoningCount()).toBe(1);
    const recorded = (await readFile(turnsFile, "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line)).find((entry) => entry.markers?.currentMessage);
    expect(recorded.markers["tars-attachment-proof"]).toBe(true);
    expect(recorded.markers.c2NyZWVu).toBe(true);
    await expect(conversationView.locator("[data-tars-message-attachments]")).toContainText("notes.txt");
    await expect(conversationView.getByText("We can discuss before starting work.", { exact: true })).toBeVisible();

    await seedRepository(stave.page, { repositoryPath, settings: { autoRoutingEnabled: false } });
    await expect.poll(() => stave!.page.evaluate(async (repository) => {
      const registry = await window.api!.persistence!.loadRepositoryRegistry!();
      return registry.repositories.some((entry) => (entry as { repositoryPath: string }).repositoryPath === repository);
    }, repositoryPath)).toBe(true);
    await writeFile(replyFile, JSON.stringify({ reply: "I propose one bounded work unit.", actions: [{ kind: "delegate",
      workspaceId: E2E_WORKSPACE_ID,
      title: "Inspect the fixture", instruction: "[hold] Inspect README.md and report the result.",
      acceptanceCriteria: ["README.md was inspected."], priority: 60, branchName: "chore/inspect fixture" }] }));
    // The same screenshot and notes again: the work this message delegates carries them to its run's first turn.
    const delegation = { requestId: "delegation", text: "Inspect README.md within the registered repository.", attachments: discussion.attachments };
    const delegated = await stave.page.evaluate((input) => window.api!.tars!.sendMessage!(input), delegation);
    await expect.poll(() => stave!.page.evaluate(async (id) =>
      (await window.api!.tars!.getConversation!()).receipts.find((row) => row.messageId === id)?.status, delegated.id), { timeout: 60_000 }).toBe("applied");
    await expect.poll(() => stave!.page.evaluate(async () => {
      const row = (await window.api!.tars!.get()).responsibilities[0];
      return { state: row?.state, hasRun: Boolean(row?.agentRunId) };
    }), { timeout: 90_000 }).toEqual({ state: "running", hasRun: true });
    const responsibilities = (await stave.page.evaluate(() => window.api!.tars!.get())).responsibilities;
    expect(responsibilities).toHaveLength(1);
    expect(responsibilities[0]).toMatchObject({ title: "Inspect the fixture", maxTurns: 4, providerId: "claude-code" });
    // The execution workspace's branch is the planner's proposal, made git-safe, with a unique suffix.
    expect(responsibilities[0]!.branchName).toMatch(/^chore\/inspect-fixture-[0-9a-f]{8}$/);
    expect(execFileSync("git", ["worktree", "list", "--porcelain"], { cwd: repositoryPath, encoding: "utf8" }))
      .toContain(`branch refs/heads/${responsibilities[0]!.branchName}`);
    expect(await reasoningCount()).toBe(2);
    // The delegated run's first turn received the image bytes and the file's text, like the planner did.
    const runTurns = async () => (await readFile(turnsFile, "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line))
      .filter((entry) => entry.runTurn && !entry.fixture);
    await expect.poll(async () => (await runTurns()).length, { timeout: 60_000 }).toBeGreaterThan(0);
    expect((await runTurns())[0]!.markers).toEqual({ currentMessage: false, "tars-attachment-proof": true, c2NyZWVu: true });
    // The work keeps their names for its request view; no snapshot a window reads holds their content.
    const brief = await stave.page.evaluate((id) => window.api!.tars!.getBrief!({ responsibilityId: id }), responsibilities[0]!.id);
    expect(brief.attachments).toEqual(first.attachments);
    expect(JSON.stringify(await stave.page.evaluate(() => window.api!.tars!.get()))).not.toContain("c2NyZWVu");
    // Stop owned execution, independently of the conversation's settled receipt.
    const cancelled = await stave.page.evaluate((row) => window.api!.tars!.act({ requestId: "cancel-click", responsibilityId: row.id,
      expectedRevision: row.revision, operation: "cancel", source: "click" }), responsibilities[0]!);
    expect(cancelled.record, cancelled.record.error ?? undefined).toMatchObject({ status: "applied" });
    await rm(path.join(fakeDir, "held-once"), { force: true });

    const held = await stave.page.evaluate((input) => window.api!.tars!.sendMessage!(input),
      { requestId: "cancelled", text: "[hold] Discuss the next step." });
    await expect.poll(reasoningCount, { timeout: 60_000 }).toBe(3);
    const current = await stave.page.evaluate(async (id) =>
      (await window.api!.tars!.getConversation!()).messages.find((row) => row.id === id)!, held.id);
    expect(current.state).toBe("reasoning");
    await stave.page.evaluate((row) => window.api!.tars!.cancelMessage!({ messageId: row.id, expectedRevision: row.revision }), current);
    await writeFile(path.join(fakeDir, "release"), "");
    await stave.close(); stave = null;

    stave = await launchStave({ userDataDir: profileDir, env });
    const restored = await stave.page.evaluate(() => window.api!.tars!.getConversation!());
    expect(restored.settings).toEqual(settings);
    expect(restored.messages[0]?.attachments).toEqual(first.attachments);
    expect(restored.messages.map((row) => row.state)).toEqual(["answered", "answered", "cancelled"]);
    expect(restored.receipts).toHaveLength(1);
    expect(restored.receipts[0]?.status).toBe("applied");
    expect(restored.activity.some((event) => event.state === "cancelled")).toBe(true);
    // The click is a timeline record, not a user message, and survives restart.
    expect(restored.records).toMatchObject([{ requestId: "cancel-click", status: "applied", action: { operation: "cancel" } }]);
    expect((await stave.page.evaluate((input) => window.api!.tars!.sendMessage!(input), discussion)).id).toBe(first.id);
    expect((await stave.page.evaluate((input) => window.api!.tars!.sendMessage!(input), delegation)).id).toBe(delegated.id);
    expect(await reasoningCount()).toBe(3);
    expect((await stave.page.evaluate(() => window.api!.tars!.get())).responsibilities).toHaveLength(1);
    await testInfo.attach("conversation-recovery", { body: JSON.stringify({ states: restored.messages.map((row) => row.state),
      receipts: restored.receipts.map((row) => row.status), reasoningCalls: await reasoningCount() }), contentType: "application/json" });
  } finally {
    await stave?.close();
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});

// The composer's "Include my working changes" goes with one message; admission snapshots the source workspace
// without touching its index or files, and the execution workspace starts from that snapshot.
test("a message that includes working changes starts its work from the uncommitted change", async ({ playwright: _playwright }, testInfo) => {
  test.setTimeout(240_000);
  const directory = await mkdtemp(path.join(tmpdir(), "stave-working-changes-e2e-"));
  const repositoryPath = path.join(directory, "repository");
  const profileDir = path.join(directory, "profile");
  const fakeDir = path.join(directory, "provider");
  let stave: Awaited<ReturnType<typeof launchStave>> | null = null;
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repositoryPath, encoding: "utf8", env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } }).trim();
  try {
    await Promise.all([mkdir(repositoryPath), mkdir(profileDir), mkdir(fakeDir)]);
    git("init", "-b", "main");
    await writeFile(path.join(repositoryPath, "README.md"), "Committed text.\n");
    await writeFile(path.join(repositoryPath, ".gitignore"), "*.log\n");
    git("add", "README.md", ".gitignore");
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "test: initialize");
    const head = git("rev-parse", "HEAD");
    const turnsFile = path.join(fakeDir, "turns.jsonl");
    const replyFile = path.join(fakeDir, "reply.json");
    await writeFile(turnsFile, `${JSON.stringify({ runTurn: true, fixture: true })}\n`);
    await writeFile(replyFile, JSON.stringify({ reply: "I propose one bounded work unit.", actions: [{ kind: "delegate",
      workspaceId: E2E_WORKSPACE_ID, title: "Build on my edits", instruction: "[hold] Continue the README change and report the result.",
      acceptanceCriteria: ["README.md keeps the uncommitted line."], priority: 60, branchName: "chore/build on edits" }] }));
    const fakeCli = path.join(import.meta.dirname, "harness", "fake-claude-cli.cjs");
    const wrapper = path.join(fakeDir, "claude");
    const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
    await writeFile(wrapper, `#!/bin/sh\nFAKE_CLAUDE_DIR=${quote(fakeDir)} FAKE_CLAUDE_REPLY_FILE=${quote(replyFile)} FAKE_CLAUDE_PROMPT_MARKERS=currentMessage,tars-attachment-proof,c2NyZWVu exec ${quote(process.execPath)} ${quote(fakeCli)} "$@"\n`);
    await chmod(wrapper, 0o755);
    stave = await launchStave({ userDataDir: profileDir, env: { STAVE_CLAUDE_CLI_PATH: wrapper } });
    await stave.page.evaluate((input) => window.api!.tars!.configureConversation!(input),
      { providerId: "claude-code" as const, model: "sonnet", maxTurns: 4, runtimeHints: { claudeBinaryPath: wrapper } });
    await seedRepository(stave.page, { repositoryPath, settings: { autoRoutingEnabled: false } });
    await expect.poll(() => stave!.page.evaluate(async (repository) => {
      const registry = await window.api!.persistence!.loadRepositoryRegistry!();
      return registry.repositories.some((entry) => (entry as { repositoryPath: string }).repositoryPath === repository);
    }, repositoryPath)).toBe(true);

    // Uncommitted work of every kind the snapshot must handle.
    await writeFile(path.join(repositoryPath, "README.md"), "Committed text.\nUncommitted line from the user.\n");
    await writeFile(path.join(repositoryPath, "notes.txt"), "An untracked file.\n");
    await writeFile(path.join(repositoryPath, "debug.log"), "Ignored output.\n");
    const indexPath = path.join(repositoryPath, ".git", "index");
    // This fixture does not ignore `.stave/`, where Stave creates the execution worktree; that folder is Stave's, not a change to the user's files.
    const status = () => git("status", "--porcelain=v1", "--untracked-files=all", "--ignored").split("\n").filter((line) => !line.includes(" .stave/")).join("\n");
    const before = { index: await readFile(indexPath), status: status() };

    await stave.page.getByRole("button", { name: /^(Tars|Tars)$/ }).click();
    const conversationView = stave.page.getByTestId("tars-view");
    const toggle = conversationView.getByRole("switch", { name: /^(Include my working changes|작업 중인 변경 포함)$/ });
    await expect(toggle).not.toBeChecked();
    await conversationView.getByRole("textbox").fill("Continue my README change in the registered repository.");
    await toggle.click();
    await expect(toggle).toBeChecked();
    await conversationView.getByRole("button", { name: /^(Send|보내기)$/ }).click();
    await expect.poll(() => stave!.page.evaluate(async () => (await window.api!.tars!.getConversation!()).messages.length)).toBe(1);
    // The choice went with this message only.
    await expect(toggle).not.toBeChecked();
    const message = (await stave.page.evaluate(() => window.api!.tars!.getConversation!())).messages[0]!;
    expect(message.includeWorkingChanges).toBe(true);
    await expect.poll(() => stave!.page.evaluate(async (id) =>
      (await window.api!.tars!.getConversation!()).receipts.find((row) => row.messageId === id)?.status, message.id), { timeout: 60_000 }).toBe("applied");
    await expect.poll(() => stave!.page.evaluate(async () => {
      const row = (await window.api!.tars!.get()).responsibilities[0];
      return { state: row?.state, hasWorkspace: Boolean(row?.executionWorkspaceId) };
    }), { timeout: 90_000 }).toMatchObject({ hasWorkspace: true });
    const row = (await stave.page.evaluate(() => window.api!.tars!.get())).responsibilities[0]!;
    expect(row.workingChanges?.kind).toBe("snapshot");
    const snapshot = row.workingChanges!.kind === "snapshot" ? row.workingChanges! : null;

    // The user's index and files are exactly as they were.
    expect((await readFile(indexPath)).equals(before.index)).toBe(true);
    expect(status()).toBe(before.status);
    expect(git("rev-parse", "HEAD")).toBe(head);
    // The snapshot commit sits on HEAD. Once the only unit sharing it has its workspace, the ref is released
    // and the workspace's own branch keeps the commit reachable.
    expect(git("rev-parse", `${snapshot!.commit}^`)).toBe(head);
    expect(() => git("rev-parse", "--verify", "--quiet", snapshot!.ref)).toThrow();
    // The execution workspace's branch starts at the snapshot, so it has the uncommitted change and the new file, never the ignored one.
    const worktrees = git("worktree", "list", "--porcelain").split("\n\n");
    const entry = worktrees.find((block) => block.includes(`branch refs/heads/${row.branchName}`));
    expect(entry, worktrees.join("\n---\n")).toBeTruthy();
    const worktreePath = /^worktree (.+)$/m.exec(entry!)![1]!;
    expect(git("rev-parse", `${row.branchName}`)).toBe(snapshot!.commit);
    expect(await readFile(path.join(worktreePath, "README.md"), "utf8")).toBe("Committed text.\nUncommitted line from the user.\n");
    expect(await readFile(path.join(worktreePath, "notes.txt"), "utf8")).toBe("An untracked file.\n");
    await expect(readFile(path.join(worktreePath, "debug.log"), "utf8")).rejects.toThrow();
    expect(git("log", "-1", "--format=%s", snapshot!.commit)).toBe("chore(tars): start from working changes");
    expect(git("ls-tree", "-r", "--name-only", snapshot!.commit).split("\n").sort()).toEqual([".gitignore", "README.md", "notes.txt"]);

    // The tray card says where the work started, with the short commit.
    // A narrow window keeps the tray behind its header indicator; open it the way the user would.
    if (!(await stave.page.locator("[data-tars-tray]").first().isVisible().catch(() => false)))
      await conversationView.locator("[data-tars-tray-indicator]").locator("xpath=ancestor::button[1]").click();
    await expect(stave.page.locator(`[data-tars-card="${row.id}"] [data-tars-working-changes="snapshot"]`).first())
      .toContainText(snapshot!.commit.slice(0, 7));
    await testInfo.attach("working-changes", { body: JSON.stringify({ commit: snapshot!.commit, ref: snapshot!.ref, branch: row.branchName }), contentType: "application/json" });

    const current = (await stave.page.evaluate(() => window.api!.tars!.get())).responsibilities[0]!;
    await stave.page.evaluate((target) => window.api!.tars!.act({ requestId: "cancel-working-changes", responsibilityId: target.id,
      expectedRevision: target.revision, operation: "cancel", source: "click" }), current);
  } finally {
    await stave?.close();
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
