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

async function seedConversation(page: Page) {
  await page.addInitScript(
    ({ taskId, requestId }) => {
      const workspaceId = "ws-main";
      const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
      const paragraph = "The export keeps every column and its order, and the header row names each one. ".repeat(40);
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
      (window as unknown as { api?: Record<string, unknown> }).api = {
        provider: { streamTurn: async () => [], getCodexModelCatalog: async () => ({ ok: true, models: [], detail: "" }) },
        terminal: { runCommand: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }) },
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
    { taskId: TASK_ID, requestId: REQUEST_ID },
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
