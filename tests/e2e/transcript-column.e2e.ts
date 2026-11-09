import { expect, test, type Page } from "@playwright/test";

/**
 * The transcript, the user bubbles and the composer share one centred column,
 * a finished turn's header stays on one line, and opening a turn's trace keeps
 * its trigger where the reader clicked it.
 *
 * Measured in a real browser: each contract is resolved geometry composed from
 * several owners (the transcript rows, the composer measure, the trace panel's
 * motion and the conversation's follow-the-bottom logic), and the regressions
 * these guard against were all geometry agreeing in source and not on screen.
 */

const TASK_ID = "task-transcript-column";
const LONG_LIST = Array.from({ length: 18 }, (_, index) => `${index + 1}. Checked step ${index + 1} of the sidebar migration.`).join("\n");

async function seedConversation(page: Page) {
  await page.addInitScript(
    ({ taskId, longList }) => {
      const workspaceId = "ws-main";
      const toolParts = [
        { type: "tool_use", toolUseId: "t1", toolName: "Grep", input: JSON.stringify({ pattern: "sidebarOpen" }), output: "src/store/app.store.ts:812", state: "output-available" },
        { type: "tool_use", toolUseId: "t2", toolName: "Read", input: JSON.stringify({ file_path: "/tmp/stave-project/src/App.tsx" }), output: "export {}", state: "output-available" },
        { type: "tool_use", toolUseId: "t3", toolName: "Bash", input: JSON.stringify({ command: "bun test" }), output: "42 pass", exitCode: 0, state: "output-available" },
      ];
      const messages = [
        { id: "u1", role: "user", model: "", providerId: "user", content: "Move the sidebar flag into the store.", parts: [{ type: "text", text: "Move the sidebar flag into the store." }] },
        { id: "a1", role: "assistant", model: "claude-sonnet-4-5", providerId: "claude-code", content: "", parts: [...toolParts, { type: "text", text: `Moved the sidebar flag into the window store so it survives workspace switches.\n\n${longList}` }] },
        { id: "u2", role: "user", model: "", providerId: "user", content: "Great. Now run the full e2e suite for the shell and fix anything that breaks.", parts: [{ type: "text", text: "Great. Now run the full e2e suite for the shell and fix anything that breaks." }] },
        { id: "a2", role: "assistant", model: "claude-sonnet-4-5", providerId: "claude-code", content: "", parts: [toolParts[2], { type: "text", text: "One spec asserted the old 280px sidebar width, so I updated the expectation and re-ran the suite." }] },
      ];
      const snapshot = {
        activeTaskId: taskId,
        openTaskTabIds: [taskId],
        activeSurface: { kind: "task", taskId },
        tasks: [{ id: taskId, title: "Transcript column", provider: "claude-code", updatedAt: "2026-07-25T00:00:00.000Z", unread: false, archivedAt: null }],
        messagesByTask: { [taskId]: messages },
      };
      (window as unknown as { api?: Record<string, unknown> }).api = {
        provider: { streamTurn: async () => [], getCodexModelCatalog: async () => ({ ok: true, models: [], detail: "" }) },
        terminal: { runCommand: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }) },
      };
      window.localStorage.setItem(
        "stave:workspace-fallback:v1",
        JSON.stringify([{ id: workspaceId, name: "main", updatedAt: "2026-07-25T00:00:00.000Z", snapshot }]),
      );
      window.localStorage.setItem(
        "stave-store",
        JSON.stringify({
          state: {
            repositoryPath: "/tmp/stave-project",
            repositoryName: "stave-project",
            workspaces: [{ id: workspaceId, name: "main", updatedAt: "2026-07-25T00:00:00.000Z" }],
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
    { taskId: TASK_ID, longList: LONG_LIST },
  );
}

async function openConversation(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-message-id="a2"]')).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
}

test.describe("transcript column", () => {
  test.setTimeout(120_000);

  for (const width of [1440, 1024]) {
    test(`replies, user bubbles and the composer share one axis at ${width}px`, async ({ page }) => {
      await seedConversation(page);
      await openConversation(page, width);
      const geometry = await page.evaluate(() => {
        const box = (element: Element | null) => {
          const rect = element?.getBoundingClientRect();
          return rect ? { left: rect.left, right: rect.right, center: rect.left + rect.width / 2 } : null;
        };
        const reply = document.querySelector('[data-message-id="a2"] article > div');
        const bubble = Array.from(document.querySelectorAll('[data-message-id="u2"] article *')).find(
          (element) => getComputedStyle(element).backgroundColor !== "rgba(0, 0, 0, 0)" && (element.textContent ?? "").startsWith("Great"),
        );
        const frame = document.querySelector("[data-composer-frame]");
        const composerCard =
          frame?.querySelector(":scope > div:not([data-composer-frame-slot])") ?? document.querySelector(".prompt-input-shell");
        return { reply: box(reply), bubble: box(bubble ?? null), composer: box(composerCard) };
      });
      expect(geometry.reply).not.toBeNull();
      expect(geometry.bubble).not.toBeNull();
      expect(geometry.composer).not.toBeNull();
      // Two pixels: the composer's padding is 16px against the transcript's 20px,
      // so they can differ only by sub-pixel rounding of the shared centre.
      expect(Math.abs(geometry.reply!.center - geometry.composer!.center)).toBeLessThanOrEqual(2);
      expect(Math.abs(geometry.bubble!.right - geometry.reply!.right)).toBeLessThanOrEqual(2);
      expect(geometry.reply!.right - geometry.reply!.left).toBeLessThanOrEqual(760.5);
    });
  }

  test("a finished turn's summary and counts stay on one line", async ({ page }) => {
    await seedConversation(page);
    await openConversation(page, 1024);
    const trigger = page.locator('[data-message-id="a2"] button[aria-expanded]').first();
    await expect(trigger).toContainText("One spec asserted the old 280px sidebar width, so I updated the expectation and re-ran the suite");
    await expect(trigger).toContainText("1 tool call");
    const line = await trigger.evaluate((element) => {
      const own = element.getBoundingClientRect();
      const middle = own.top + own.height / 2;
      const offsets = Array.from(element.children).map((child) => {
        const rect = child.getBoundingClientRect();
        return Math.abs(rect.top + rect.height / 2 - middle);
      });
      return { height: own.height, maxOffset: Math.max(...offsets), parts: offsets.length };
    });
    // Glyph and history label sit on the trigger's own middle line.
    expect(line.parts).toBeGreaterThanOrEqual(2);
    expect(line.maxOffset).toBeLessThanOrEqual(2);
    expect(line.height).toBeLessThanOrEqual(36);
  });

  test("opening a trace keeps its trigger where it was clicked", async ({ page }) => {
    await seedConversation(page);
    await openConversation(page, 1440);
    const trigger = page.locator('[data-message-id="a1"] button[aria-expanded]').first();
    // A programmatic jump leaves the conversation following the bottom, the
    // state in which an opening trace used to be pulled down after.
    await page.locator('[data-message-id="a1"]').evaluate((element) => element.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(400);
    const before = (await trigger.boundingBox())!.y;
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const samples: number[] = [];
    for (let frame = 0; frame < 10; frame += 1) {
      await page.waitForTimeout(40);
      samples.push((await trigger.boundingBox())!.y);
    }
    for (const y of samples) expect(Math.abs(y - before)).toBeLessThanOrEqual(1);

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await page.waitForTimeout(450);
    expect(Math.abs((await trigger.boundingBox())!.y - before)).toBeLessThanOrEqual(1);
  });
});
