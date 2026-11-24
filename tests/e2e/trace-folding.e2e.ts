import { expect, test, type Page } from "@playwright/test";
import type { ChatMessage, ToolUsePart } from "@/types/chat";

declare global {
  interface Window {
    __contentSearchFixtureStore: typeof import("@/store/app.store").useAppStore;
  }
}

const scrollId = "conversation-scroll-conversation-time";
const messageId = "trace-folding-turn";
const interim = "The index needs a fresh snapshot.";
const answer = "The snapshot is ready.";
const tool = (id: string, state: ToolUsePart["state"] = "output-available"): ToolUsePart => ({
  type: "tool_use",
  toolName: id === "late" ? "Bash" : "Read",
  toolUseId: id,
  state,
  input: id === "late"
    ? JSON.stringify({ command: "bun test" })
    : JSON.stringify({ file_path: `${id}.ts` }),
  output: id === "late" ? "Running checks\n".repeat(20) : undefined,
});

async function openTranscript(page: Page) {
  await page.setViewportSize({ width: 1000, height: 620 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/tests/e2e/fixtures/conversation-time.html");
  const message: ChatMessage = {
    id: messageId,
    role: "assistant",
    providerId: "codex",
    model: "gpt-6.2-sol",
    content: `${interim}\n${answer}`,
    startedAt: "2026-11-22T10:00:00Z",
    completedAt: "2026-11-22T10:01:30Z",
    parts: [
      { type: "text", text: interim },
      ...Array.from({ length: 22 }, (_, index) => tool(`read-${index}`)),
      tool("late", "input-available"),
      tool("failed", "output-error"),
      { type: "text", text: `${answer}\n\n${"Result detail. ".repeat(600)}` },
    ],
  };
  await page.evaluate((message) => {
    const store = window.__contentSearchFixtureStore;
    const { activeTaskId, messagesByTask } = store.getState();
    store.setState({ messagesByTask: { ...messagesByTask, [activeTaskId]: [...messagesByTask[activeTaskId], message] } });
  }, message);
  await page.evaluate(() => document.fonts.ready);
  return page.locator(`[data-message-id="${messageId}"]`);
}

test("Activity reveals and focuses the exact step inside collapsed history", async ({ page }) => {
  const message = await openTranscript(page);
  // A failed tool step does not turn the summary into a failure.
  const history = message.getByRole("button", { name: "Worked for 1m 30s 24 steps", exact: true });
  await expect(history).toHaveAttribute("aria-expanded", "false");
  const target = message.locator('[data-tool-use-id="read-11"]');
  await expect(target).toHaveCount(0);
  await page.evaluate(() => {
    const state = window.__contentSearchFixtureStore.getState();
    state.focusTranscriptTool({ taskId: state.activeTaskId, toolUseId: "read-11" });
  });
  await expect(history).toHaveAttribute("aria-expanded", "true");
  await expect(target).toBeFocused();
  await expect(target).toBeInViewport({ ratio: 1 });
  await expect(message.getByText(answer, { exact: false })).toHaveCount(1);
});

test("conversation find opens and lands on an interim message in history", async ({ page }) => {
  const message = await openTranscript(page);
  const target = message.locator('[data-folded-trace-history] [data-trace-anchor="assistant-text-0"]');
  await expect(target).toHaveCount(0);
  await page.getByRole("button", { name: "Find in conversation", exact: true }).click();
  const query = page.getByRole("textbox", { name: "Search all task messages" });
  await query.fill("fresh snapshot");
  await expect(page.getByRole("search").getByRole("status")).toHaveText("0 / 1");
  await query.press("Enter");
  await expect(target).toBeFocused();
  await expect(target).toBeInViewport({ ratio: 1 });
});

test("a finished turn keeps every step folded, and opening it keeps the reading position", async ({ page }) => {
  const message = await openTranscript(page);
  const history = message.getByRole("button", { name: "Worked for 1m 30s 24 steps", exact: true });
  const failed = message.locator('[data-tool-use-id="failed"]');
  const scroller = page.getByTestId(scrollId);
  await expect(history).toHaveAttribute("aria-expanded", "false");
  // A failed step folds with the rest; it is not pinned outside the history.
  await expect(failed).toHaveCount(0);
  await history.evaluate((node) => node.scrollIntoView({ block: "center" }));
  const headerTop = () => history.evaluate((node) =>
    node.getBoundingClientRect().top - node.closest("[data-transcript-scroller]")!.getBoundingClientRect().top,
  );
  const before = await headerTop();
  await history.evaluate((button: HTMLButtonElement) => button.click());
  await expect(history).toHaveAttribute("aria-expanded", "true");
  await expect.poll(headerTop).toBeCloseTo(before, 0);
  // Opened history reads in the order the work happened.
  const order = await message.locator("[data-folded-trace-history] [data-tool-use-id]").evaluateAll(
    (rows) => rows.map((row) => row.getAttribute("data-tool-use-id")),
  );
  expect(order.slice(-3)).toEqual(["read-21", "late", "failed"]);
  await expect(failed.locator('[data-tool-run-status="failed"]')).toHaveCount(1);
  // Let the header's disclosure hold finish before reading further down.
  await page.waitForTimeout(600);
  const relativeTop = () => failed.evaluate((node) =>
    node.getBoundingClientRect().top - node.closest("[data-transcript-scroller]")!.getBoundingClientRect().top,
  );
  await failed.evaluate((node) => {
    const scroller = node.closest("[data-transcript-scroller]")!;
    scroller.scrollTop += node.getBoundingClientRect().top - scroller.getBoundingClientRect().top + 5;
  });
  await expect.poll(relativeTop).toBeCloseTo(-5, 0);
  // A step above the reading row completes late; the reading row stays put.
  await page.evaluate(({ messageId, completed }) => {
    const store = window.__contentSearchFixtureStore;
    const { activeTaskId, messagesByTask } = store.getState();
    store.setState({
      messagesByTask: {
        ...messagesByTask,
        [activeTaskId]: messagesByTask[activeTaskId].map((message) => message.id === messageId
          ? { ...message, parts: message.parts.map((part) => part.type === "tool_use" && part.toolUseId === "late" ? completed : part) }
          : message),
      },
    });
  }, { messageId, completed: tool("late") });
  await expect(message.locator('[data-tool-use-id="late"] [data-tool-run-status="done"]')).toHaveCount(1);
  await expect.poll(relativeTop).toBeCloseTo(-5, 0);
  expect(await scroller.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
});

for (const { locale, theme, density, width } of [
  { locale: "en", theme: "light", density: "regular", width: 1200 },
  { locale: "en", theme: "dark", density: "compact", width: 400 },
  { locale: "ko", theme: "dark", density: "regular", width: 1200 },
  { locale: "ko", theme: "light", density: "compact", width: 400 },
]) {
  test(`trace header alignment at ${width}px in ${locale}/${theme}/${density}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`/?stavePreview=trace-folding&locale=${locale}&theme=${theme}&density=${density}`);
    await page.evaluate(() => document.fonts.ready);
    const running = page.locator("#running").locator("..");
    const header = running.locator('button[data-trace-anchor="header"]');
    await expect(header).toHaveAttribute("aria-expanded", "false");
    await expect(header.locator('[data-loader-variant="reason"]')).toHaveCount(1);
    const finished = page.locator("#finished-with-failure").locator("..").locator('button[data-trace-anchor="header"]');
    await expect(finished).toHaveAttribute("aria-expanded", "false");
    await expect(finished.locator(".lucide-brain")).toHaveCount(1);
    for (const node of [header, finished]) {
      const geometry = await node.evaluate((element) => {
        const boxes = Array.from(element.children, (child) => child.getBoundingClientRect());
        const centers = boxes.map((box) => box.y + box.height / 2);
        return {
          drift: Math.max(...centers) - Math.min(...centers),
          contained: boxes.at(-1)!.right <= element.getBoundingClientRect().right + 0.5,
        };
      });
      expect(geometry.drift).toBeLessThanOrEqual(1);
      expect(geometry.contained).toBe(true);
    }
    // While it runs, only the latest interim message shows below the header.
    await expect(running.locator('[data-tool-use-id="read-0"]')).toHaveCount(0);
    await header.focus();
    await page.keyboard.press("Enter");
    await expect(header).toHaveAttribute("aria-expanded", "true");
    await expect(running.locator('[data-tool-use-id="read-0"]')).toBeVisible();
    // Short finished traces fold as well.
    const short = page.locator("#short").locator("..");
    await expect(short.locator('button[data-trace-anchor="header"]')).toHaveAttribute("aria-expanded", "false");
    await expect(short.locator("[data-tool-use-id]")).toHaveCount(0);
  });
}
