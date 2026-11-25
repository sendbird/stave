import { expect, test, type Page } from "@playwright/test";

/**
 * The Welcome back summary in the real transcript. The task's conversation has
 * an approval you gave three hours ago, your last message two hours ago, and a
 * long reply that finished after it. Opening the app is a return (after a
 * restart, your last message stands in for the visit): the summary is drawn
 * right after your last message, above the reply, and the conversation moves
 * to it. Its rows lead to the reply and to the approval; Got it and Esc fold it
 * into a one-line divider at the same place, which opens it again.
 */

const TASK_ID = "task-return-summary";
const REQUEST_ID = "seed-approval";

async function seedConversation(page: Page, withTarsQuestion = false) {
  await page.addInitScript(
    ({ taskId, requestId, withTarsQuestion }) => {
      const workspaceId = "ws-main";
      const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
      const paragraph = "The export keeps every column and its order, and the header row names each one. ".repeat(withTarsQuestion ? 3 : 40);
      const messages = [
        { id: "u1", role: "user", model: "", providerId: "user", content: "Add the CSV export.", startedAt: at(180), parts: [{ type: "text", text: "Add the CSV export." }] },
        {
          id: "a1", role: "assistant", model: "claude-sonnet-4-5", providerId: "claude-code", content: "", turnId: "turn-a1",
          startedAt: at(179), completedAt: at(178), terminalStopReason: "end_turn",
          parts: [
            { type: "approval", toolName: "Bash", requestId, description: "Run the migration", state: "approval-responded" },
            { type: "text", text: `Migrated the export table. ${paragraph}` },
          ],
        },
        { id: "u2", role: "user", model: "", providerId: "user", content: "Keep the column order.", startedAt: at(120), parts: [{ type: "text", text: "Keep the column order." }] },
        {
          id: "a2", role: "assistant", model: "claude-sonnet-4-5", providerId: "claude-code", content: "", turnId: "turn-a2",
          startedAt: at(119), completedAt: at(110), terminalStopReason: "end_turn",
          parts: [
            { type: "code_diff", filePath: "src/export.ts", oldContent: "a", newContent: "b", status: "accepted" },
            { type: "text", text: `Kept the column order. ${paragraph}` },
          ],
        },
      ];
      const snapshot = {
        activeTaskId: taskId,
        openTaskTabIds: [taskId],
        activeSurface: { kind: "task", taskId },
        tasks: [{ id: taskId, title: "Return summary", provider: "claude-code", updatedAt: at(110), unread: false, archivedAt: null }],
        messagesByTask: { [taskId]: messages },
      };
      const questionPreview = {
        question: "What should happen to the release?",
        options: [{ label: "Wait for staging", rationale: "The release check queries the deployment." },
          { label: "Keep working", rationale: "Documentation can proceed now." }],
        recommended: 0,
        priorEvidence: "The deployment log shows staging is still running.",
      };
      const action = {
        kind: "ask", ...questionPreview,
        options: questionPreview.options.map((option, index) => ({ ...option, effect: index === 0
          ? { kind: "control", responsibilityId: "work-release", expectedRevision: 3, operation: "resume" }
          : { kind: "reply" } })),
      };
      const settings = { providerId: "codex", model: "test-model", maxTurns: 5, autonomy: "careful" };
      const decision = { reply: "Choose what to do next.", actions: [action] };
      const readOnly = async () => { throw new Error("Opening a decision must not write to Tars"); };
      (window as unknown as { api?: Record<string, unknown> }).api = {
        provider: { streamTurn: async () => [], getCodexModelCatalog: async () => ({ ok: true, models: [], detail: "" }) },
        terminal: { runCommand: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }) },
        ...(withTarsQuestion ? { tars: {
          sendMessage: readOnly, cancelMessage: readOnly, configureConversation: readOnly, answer: readOnly,
          getConversation: async () => ({
            settings, activity: [], records: [],
            messages: [{ ...settings, id: "message-release", requestId: "release-question", text: "Check staging.",
              state: "answered", revision: 3, reply: decision.reply, error: null, decision, createdAt: at(110), updatedAt: at(110) }],
            receipts: [{ messageId: "message-release", actionIndex: 0, requestHash: "a".repeat(64), action,
              status: "proposed", responsibilityId: null, error: null, reason: null, revision: 1, createdAt: at(110), updatedAt: at(110) }],
          }),
          get: async () => ({
            runtime: "desktop", identity: { id: "personal", name: "Tars", instructions: "", updatedAt: at(110) },
            responsibilities: [{
              id: "work-release", requestId: "work-request", title: "Return summary", instruction: "Check the release.",
              acceptanceCriteria: ["Verify the release"], repositoryPath: "/tmp/stave-project",
              workspaceId, executionWorkspaceId: null, providerId: "codex", model: null, agentId: null, priority: 50,
              maxTurns: 5, revision: 3, state: "paused", detail: null, taskId, agentRunId: null,
              reverifyAfter: null, createdAt: at(120), updatedAt: at(110),
            }],
            pendingDecisions: [{
              kind: "ask", responsibilityId: "work-release", messageId: "message-release", actionIndex: 0,
              operation: null, expectedRevision: 3, proposedAt: at(110), question: questionPreview.question,
              questionPreview,
            }],
            followUps: [], activity: [], records: [],
          }),
        } } : {}),
      };
      window.localStorage.setItem(
        "stave:workspace-fallback:v1",
        JSON.stringify([{ id: workspaceId, name: "main", updatedAt: at(110), snapshot }]),
      );
      window.localStorage.setItem(
        "stave-store",
        JSON.stringify({
          state: {
            repositoryPath: "/tmp/stave-project",
            repositoryName: "stave-project",
            workspaces: [{ id: workspaceId, name: "main", updatedAt: at(110) }],
            activeWorkspaceId: workspaceId,
            workspaceBranchById: { [workspaceId]: "main" },
            workspacePathById: { [workspaceId]: "/tmp/stave-project" },
            workspaceDefaultById: { [workspaceId]: true },
            settings: { reasoningExpansionMode: "manual" },
            ...snapshot,
          },
          version: 0,
        }),
      );
    },
    { taskId: TASK_ID, requestId: REQUEST_ID, withTarsQuestion },
  );
}

test("the return summary sits where you left off, leads to what it names, and folds into a divider", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await seedConversation(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const conversation = page.getByTestId(`conversation-scroll-${TASK_ID}`);
  await expect(conversation.locator('[data-message-id="a2"]')).toBeAttached({ timeout: 60_000 });
  const card = page.getByTestId("return-summary");
  await expect(card).toBeVisible({ timeout: 20_000 });

  // In the transcript, right after your last message and above the reply,
  // and the conversation has moved to it although the reply below is long.
  await expect(conversation.locator('[data-message-id="u2"] [data-testid="return-summary"]')).toHaveCount(1);
  await expect(card).toBeInViewport();
  await expect(card).toContainText("Welcome back");
  await expect(card).toContainText("since your last message at");
  const turn = card.locator('[data-return-line="turn:turn-a2"]');
  await expect(turn).toContainText("Keep the column order.");
  await expect(turn).toContainText("Finished · 1 file changed");
  const decision = card.locator('[data-return-line="decision"]');
  await expect(decision).toContainText("You allowed Run command: Run the migration");
  await page.screenshot({ path: testInfo.outputPath("summary-in-place.png") });

  // Esc folds it into a divider at the same place; the divider opens it again.
  await turn.getByRole("button", { name: "Show" }).focus();
  await page.keyboard.press("Escape");
  await expect(card).toHaveAttribute("data-collapsed", "true");
  const divider = card.getByRole("button", { expanded: false });
  await expect(divider).toBeFocused();
  await expect(divider).toContainText("Welcome back");
  await expect(divider).toContainText("1 turn finished");
  await expect(conversation.locator('[data-message-id="u2"] [data-testid="return-summary"]')).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("summary-folded.png") });
  await divider.click();
  await expect(card).toHaveAttribute("data-collapsed", "false");
  await expect(card.locator("[data-return-action]").first()).toBeFocused();

  // The turn's Show moves to the start of its reply.
  await turn.getByRole("button", { name: "Show" }).click();
  await expect.poll(async () => conversation.locator('[data-message-id="a2"]').evaluate((row) => {
    const container = row.closest('[data-testid^="conversation-scroll-"]')!;
    return Math.abs(row.getBoundingClientRect().top - container.getBoundingClientRect().top);
  }), { timeout: 10_000 }).toBeLessThanOrEqual(80);

  // The decision's Show reveals the approval you gave, and focuses it.
  await card.getByRole("button", { name: "Got it", exact: true }).click();
  await expect(card).toHaveAttribute("data-collapsed", "true");
  await card.getByRole("button", { expanded: false }).click();
  await card.locator('[data-return-line="decision"]').getByRole("button", { name: "Show" }).click();
  const approval = page.locator(`[data-approval-request-id="${REQUEST_ID}"]`);
  await expect(approval).toBeInViewport({ timeout: 20_000 });
  await expect(approval).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("decision-focused.png") });
});

test("Fleet and the real return summary show matching Tars question context", async ({ page }) => {
  test.setTimeout(90_000);
  await seedConversation(page, true);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const card = page.getByTestId("return-summary");
  const summary = card.locator("[data-tars-question-preview]");
  const evidence = "Prior evidence The deployment log shows staging is still running.";
  await expect(summary.locator("[data-tars-prior-evidence]")).toHaveText(evidence, { timeout: 30_000 });
  await expect(summary.getByText("What should happen to the release?", { exact: true })).toBeVisible();
  const openFromReturn = card.getByRole("button", { name: "Open in Tars" });
  await expect(openFromReturn).toHaveAttribute("data-return-action", "tars-decision");
  const choices = await summary.getByRole("listitem").allTextContents();
  expect(choices).toHaveLength(2);
  expect(choices[0]).toContain("Recommended");
  await openFromReturn.click();
  const decision = page.locator('[data-tars-decision="ask:message-release:0"]');
  await expect(decision.locator("[data-tars-prior-evidence]")).toHaveText(evidence);
  await expect(decision.getByRole("radio")).toHaveCount(2);
  await page.getByRole("button", { name: "Close Tars", exact: true }).click();
  await page.getByTestId("top-bar").getByRole("button", { name: "Open Fleet View" }).click();
  const fleet = page.locator("[data-fleet-view-root] [data-tars-question-preview]");
  await expect(fleet.locator("[data-tars-prior-evidence]")).toHaveText(evidence);
  await expect(fleet.getByText("What should happen to the release?", { exact: true })).toBeVisible();
  await expect(fleet.locator("xpath=ancestor::*[@data-inbox-entry]")).not.toContainText("Tars asks:");
  expect(await fleet.getByRole("listitem").allTextContents()).toEqual(choices);
  await expect(fleet.getByRole("radio")).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  for (const width of [820, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await expect.poll(() => fleet.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  }
  await fleet.locator("xpath=ancestor::*[@data-inbox-entry]").getByRole("button", { name: "Open Return summary in Tars" }).click();
  await expect(decision).toBeVisible();
});
