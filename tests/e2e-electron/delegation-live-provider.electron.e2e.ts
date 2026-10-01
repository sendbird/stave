import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { DelegatedTaskSummary } from "@/lib/runs/delegated-task";
import { launchStave, type StaveApp } from "./harness/stave-app";

// Two bounded real calls, in an isolated repository/profile. No provider or IPC mocks.
test("ordinary direct work and an inherited read-only delegation persist across Electron restart", async ({}, testInfo) => {
  test.skip(process.env.STAVE_LIVE_PROVIDER_E2E !== "1", "Requires explicit live provider opt-in.");
  test.setTimeout(240_000);
  const directory = await mkdtemp(path.join(tmpdir(), "stave-delegation-live-"));
  const repositoryPath = path.join(directory, "repository");
  const userDataDir = path.join(directory, "profile");
  const directMarker = "STAVE_DIRECT_NO_AGENT_OK";
  const childMarker = "STAVE_DELEGATED_READ_OK";
  const readmeMarker = "TEMPORARY_README_4729";
  let stave: StaveApp | null = null;
  let summary: DelegatedTaskSummary | null = null;
  try {
    await mkdir(repositoryPath);
    execFileSync("git", ["init", "-b", "main"], { cwd: repositoryPath });
    await writeFile(path.join(repositoryPath, "README.md"), `${readmeMarker}\n`);
    execFileSync("git", ["add", "README.md"], { cwd: repositoryPath });
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "test: initialize temporary repository"], { cwd: repositoryPath });
    stave = await launchStave({ userDataDir });
    const catalog = await stave.page.evaluate(async cwd => window.api.provider!.getModelCatalog!({ providerId: "codex", cwd }), repositoryPath);
    if (!catalog.ok) throw new Error(catalog.detail);
    const requestedModel = process.env.STAVE_LIVE_CODEX_MODEL;
    const available = catalog.models.filter(entry => !entry.hidden);
    const model = requestedModel
      ? available.find(entry => entry.model === requestedModel)?.model
      : (available.find(entry => entry.isDefault) ?? available[0])?.model;
    if (!model) throw new Error("No visible runtime-catalog model matches the live test selection.");
    await stave.page.evaluate(settings => {
      const persisted = JSON.parse(localStorage.getItem("stave-store") ?? '{"state":{},"version":0}');
      persisted.state.settings = { ...persisted.state.settings, ...settings };
      persisted.state.draftProvider = "codex";
      localStorage.setItem("stave-store", JSON.stringify(persisted));
    }, {
      modelCodex: model, codexReasoningEffort: "low", codexFileAccess: "read-only", codexApprovalPolicy: "never", codexNetworkAccess: false,
      autoRoutingEnabled: false, advisorEnabled: false, workerEnabled: false, customAgents: [], providerTimeoutMs: 60_000,
    });
    await stave.page.reload({ waitUntil: "domcontentloaded" });
    await stave.page.getByTestId("workspace-welcome").getByRole("button", { name: "Open a repository" }).click();
    await stave.page.getByPlaceholder("~/projects/my-app").fill(repositoryPath);
    await stave.page.getByRole("button", { name: "Open", exact: true }).click();
    await expect(stave.page.getByTestId("workspace-welcome")).toHaveCount(0);
    await expect(stave.page.getByRole("button", { name: "Lens", exact: true })).toBeEnabled();
    const parentWorkspaceId: string = await stave.page.evaluate(() => JSON.parse(localStorage.getItem("stave-store")!).state.activeWorkspaceId);
    await stave.page.getByRole("button", { name: "New Task", exact: true }).click();
    const editor = stave.page.locator('[data-prompt-lexical-editor="true"]');
    await editor.fill(`Reply with exactly ${directMarker}. Do not use tools, edit files, delegate, or take external actions.`);
    await editor.press("Enter");
    let parentTaskId = "";
    await expect.poll(async () => {
      const loaded = await stave!.page.evaluate(async workspaceId => window.api.persistence!.loadWorkspace!({ workspaceId }), parentWorkspaceId);
      parentTaskId = loaded.snapshot?.activeTaskId ?? "";
      return loaded.snapshot?.messagesByTask[parentTaskId]?.some(message => message.role === "assistant" && message.content.trim() === directMarker && !message.isStreaming) ?? false;
    }, { timeout: 90_000, intervals: [500, 1000] }).toBe(true);
    const assignmentResult = await stave.page.evaluate(async () => window.api.agents!.listAssignments!({}));
    expect(assignmentResult.ok).toBe(true);
    expect(assignmentResult.ok && assignmentResult.value.some(row => row.taskId === parentTaskId)).toBe(false);
    const parentPane = stave.page.locator(`.dv-tab.dv-active-tab [data-pane-tab-chip="task:${parentTaskId}"]`);
    await expect(parentPane).toBeVisible();
    const delegated = await stave.page.evaluate(async input => window.api.runs!.delegateTask!({
      repositoryPath: input.repositoryPath, parentWorkspaceId: input.parentWorkspaceId, parentTaskId: input.parentTaskId, model: input.model, delegationKey: "live-read-only", title: "Read-only validation", providerId: "codex", effort: "low",
      lifecycle: "one-turn", workspace: { mode: "same-workspace" }, retry: false,
      prompt: `Read README.md in this workspace once. Reply with exactly ${input.childMarker} followed by a space and the entire first line you read. Do not edit files, use network, ask questions, delegate, or take external actions.`,
    }), { repositoryPath, parentWorkspaceId: parentWorkspaceId, parentTaskId, model, childMarker });
    if (!delegated.accepted || !delegated.child) throw new Error(`Delegation was refused: ${JSON.stringify(delegated)}`);
    summary = delegated.child;
    const expectedChildTaskId = summary.delegatedTaskId;
    await expect(parentPane).toBeVisible();
    await expect.poll(async () => {
      const children = await stave!.page.evaluate(async parentTaskId => window.api.runs!.listDelegatedTasks!({ parentTaskId, includeFinished: true }), parentTaskId);
      summary = children.find(child => child.delegatedTaskId === expectedChildTaskId) ?? null;
      return summary?.phase;
    }, { timeout: 100_000, intervals: [500, 1000] }).toBe("completed");
    if (!summary?.delegatedTurnId) throw new Error("Completed delegation has no exact child turn identity.");
    const readEvidence = async () => stave!.page.evaluate(async ({ summary, parentTaskId }) => {
      const [turns, conversation, receipts, assignments] = await Promise.all([
        window.api.persistence!.listTaskTurns!({ workspaceId: summary.delegatedWorkspaceId, taskId: summary.delegatedTaskId, limit: 10 }),
        window.api.persistence!.loadWorkspace!({ workspaceId: summary.delegatedWorkspaceId }),
        window.api.runs!.listReceipts!({ runId: summary.runId }),
        window.api.agents!.listAssignments!({}),
      ]);
      return { turns, conversation, receipts, assignmentsOk: assignments.ok, assigned: assignments.ok && assignments.value.some(row => row.taskId === parentTaskId || row.taskId === summary.delegatedTaskId),
        activeWorkspaceId: JSON.parse(localStorage.getItem("stave-store")!).state.activeWorkspaceId };
    }, { summary: summary!, parentTaskId });
    const beforeRestart = await readEvidence();
    const evidencePath = testInfo.outputPath("before-restart-evidence.json");
    await writeFile(evidencePath, JSON.stringify({ requestedCatalogModel: model, summary, evidence: beforeRestart }, null, 2));
    await testInfo.attach("before-restart-evidence", { path: evidencePath, contentType: "application/json" });
    const assertEvidence = (evidence: typeof beforeRestart) => {
      expect(evidence.assignmentsOk).toBe(true);
      expect(evidence.assigned).toBe(false);
      expect(evidence.activeWorkspaceId).toBe(parentWorkspaceId);
      expect(evidence.conversation.snapshot?.activeTaskId).toBe(parentTaskId);
      const turn = evidence.turns.turns.find(turn => turn.id === summary!.delegatedTurnId);
      expect(turn?.completedAt).toBeTruthy();
      expect(turn?.terminalReceipt).toMatchObject({ outcome: "completed", doneObserved: true, outputObserved: true, error: null });
      // Native commentary can share the transcript/receipt with the final answer.
      expect(turn?.terminalReceipt?.responseText?.trim().split("\n").at(-1)).toBe(`${childMarker} ${readmeMarker}`);
      const messages = evidence.conversation.snapshot?.messagesByTask[summary!.delegatedTaskId] ?? [];
      expect(messages.some(message => message.role === "assistant" && !message.isStreaming &&
        message.parts.filter(part => part.type === "text").at(-1)?.text.trim() === `${childMarker} ${readmeMarker}`)).toBe(true);
      expect(messages.flatMap(message => message.parts).some(part => part.type === "tool_use" && part.state === "output-available" && part.output?.includes(readmeMarker))).toBe(true);
      expect(messages.flatMap(message => message.parts).filter(part => part.type === "approval" && part.state === "approval-requested" || part.type === "user_input" && part.state === "input-requested")).toEqual([]);
      const policy = evidence.receipts.find(receipt => receipt.type === "accepted")?.detail?.permissionPolicy;
      expect(policy).toMatchObject({ providerId: "codex", source: "parent-turn", requestedProfile: "inherit", options: { codexFileAccess: "read-only", codexApprovalPolicy: "never", codexNetworkAccess: false } });
      expect(evidence.receipts.some(receipt => receipt.type === "completed")).toBe(true);
    };
    assertEvidence(beforeRestart);
    await expect(parentPane).toBeVisible();
    await stave.page.screenshot({ path: testInfo.outputPath("parent-after-child.png") });
    await stave.close(); stave = null;
    stave = await launchStave({ userDataDir });
    await expect(stave.page.getByRole("button", { name: "Lens", exact: true })).toBeEnabled();
    const afterRestart = await readEvidence();
    assertEvidence(afterRestart);
    await expect(stave.page.locator(`.dv-tab.dv-active-tab [data-pane-tab-chip="task:${parentTaskId}"]`)).toBeVisible();
    expect(afterRestart.receipts).toEqual(beforeRestart.receipts);
    expect(afterRestart.turns.turns).toEqual(beforeRestart.turns.turns);
    const restored = await stave.page.evaluate(async parentTaskId => window.api.runs!.listDelegatedTasks!({ parentTaskId, includeFinished: true }), parentTaskId);
    expect(restored.find(child => child.delegatedTaskId === expectedChildTaskId)).toEqual(summary);
    expect(execFileSync("git", ["status", "--porcelain"], { cwd: repositoryPath, encoding: "utf8" })).toBe("");
    const finalEvidencePath = testInfo.outputPath("delegation-evidence.json");
    await writeFile(finalEvidencePath, JSON.stringify({ model, effort: "low", summary, beforeRestart, afterRestart }, null, 2));
    await testInfo.attach("delegation-evidence", { path: finalEvidencePath, contentType: "application/json" });
    console.log(`Live delegation: catalog model=${model}, parent-turn policy inherited, exact receipt/output/ledger survive restart.`);
  } finally {
    if (stave) {
      await testInfo.attach("final-ui", { body: await stave.page.locator("body").innerText().catch(() => "unavailable"), contentType: "text/plain" });
      await stave.page.screenshot({ path: testInfo.outputPath("final-ui.png") }).catch(() => {});
      await stave.close();
    }
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
});
