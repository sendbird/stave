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
    await writeFile(wrapper, `#!/bin/sh\nFAKE_CLAUDE_DIR=${quote(fakeDir)} FAKE_CLAUDE_REPLY_FILE=${quote(replyFile)} FAKE_CLAUDE_PROMPT_MARKERS=currentMessage exec ${quote(process.execPath)} ${quote(fakeCli)} "$@"\n`);
    await chmod(wrapper, 0o755);
    const env = { STAVE_CLAUDE_CLI_PATH: wrapper };
    const reasoningCount = async () => (await readFile(turnsFile, "utf8")).split("\n").filter(Boolean)
      .map((line) => JSON.parse(line)).filter((entry) => entry.markers?.currentMessage).length;
    stave = await launchStave({ userDataDir: profileDir, env });
    const settings = { providerId: "claude-code" as const, model: "sonnet", maxTurns: 4, runtimeHints: { claudeBinaryPath: wrapper } };
    await stave.page.evaluate((input) => window.api!.tars!.configureConversation!(input), settings);
    await stave.page.getByRole("button", { name: /^(Tars|Tars)$/ }).click();
    const conversationView = stave.page.getByTestId("tars-view");
    await conversationView.getByRole("textbox").fill("Help clarify this work.");
    await conversationView.getByRole("button", { name: /^(Send|보내기)$/ }).click();
    await expect.poll(() => stave!.page.evaluate(async () => (await window.api!.tars!.getConversation!()).messages.length)).toBe(1);
    const first = (await stave.page.evaluate(() => window.api!.tars!.getConversation!())).messages[0]!;
    const discussion = { requestId: first.requestId, text: first.text };
    await expect.poll(() => stave!.page.evaluate(async (id) =>
      (await window.api!.tars!.getConversation!()).messages.find((row) => row.id === id)?.state, first.id), { timeout: 60_000 }).toBe("answered");
    expect((await stave.page.evaluate(() => window.api!.tars!.get())).responsibilities).toHaveLength(0);
    expect(await reasoningCount()).toBe(1);
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
    const delegation = { requestId: "delegation", text: "Inspect README.md within the registered repository." };
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
