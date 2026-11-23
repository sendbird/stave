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
  const history = message.getByRole("button", { name: /Finished with 1 failed step 22 steps · / });
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

test("late completion and history toggles preserve the surviving reading row", async ({ page }) => {
  const message = await openTranscript(page);
  const failed = message.locator('[data-tool-use-id="failed"]');
  const scroller = page.getByTestId(scrollId);
  await expect(failed).toBeVisible();
  await scroller.hover();
  await page.mouse.wheel(0, -4000);
  await expect.poll(() => scroller.evaluate((node) => node.scrollTop)).toBe(0);
  const relativeTop = () => failed.evaluate((node) =>
    node.getBoundingClientRect().top - node.closest("[data-transcript-scroller]")!.getBoundingClientRect().top,
  );
  await failed.evaluate((node) => {
    const scroller = node.closest("[data-transcript-scroller]")!;
    scroller.scrollTop += node.getBoundingClientRect().top - scroller.getBoundingClientRect().top + 5;
  });
  await expect.poll(relativeTop).toBeCloseTo(-5, 0);
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
  await expect(message.locator('[data-tool-use-id="late"]')).toHaveCount(0);
  await expect.poll(relativeTop).toBeCloseTo(-5, 0);
  const history = message.getByRole("button", { name: /Finished with 1 failed step 23 steps · / });
  const original = await scroller.evaluate((node) => node.scrollTop);
  await history.evaluate((button: HTMLButtonElement) => button.click());
  await expect(history).toHaveAttribute("aria-expanded", "true");
  await expect.poll(() => scroller.evaluate((node) => node.scrollTop)).toBeCloseTo(original, 0);
  await history.evaluate((button: HTMLButtonElement) => button.click());
  await expect(history).toHaveAttribute("aria-expanded", "false");
  await expect.poll(relativeTop).toBeCloseTo(-5, 0);
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
    const header = running.getByRole("button", { name: /test:ui-layout.*24/ });
    await expect(header).toHaveAttribute("aria-expanded", "false");
    const geometry = await header.evaluate((node) => {
      const [mark, label, summary, chevron] = Array.from(node.children, (child) => child.getBoundingClientRect());
      const centers = [mark, label, summary, chevron].map((box) => box.y + box.height / 2);
      return {
        drift: Math.max(...centers) - Math.min(...centers),
        contained: chevron.right <= node.getBoundingClientRect().right + 0.5,
        gap: getComputedStyle(node).columnGap,
        tokenGap: `${parseFloat(getComputedStyle(node).getPropertyValue("--aui-space-8")) *
          parseFloat(getComputedStyle(document.documentElement).fontSize)}px`,
      };
    });
    expect(geometry.drift).toBeLessThanOrEqual(1);
    expect(geometry.contained).toBe(true);
    expect(geometry.gap).toBe(geometry.tokenGap);
    await header.focus();
    await page.keyboard.press("Enter");
    await expect(header).toHaveAttribute("aria-expanded", "true");
    await expect(running.locator('[data-tool-use-id="read-0"]')).toBeVisible();
    await expect(page.locator("#short").locator("..").locator("[data-folded-trace-history]")).toHaveCount(0);
  });
}
