import { expect, test } from "@playwright/test";

const fixture = "/tests/e2e/fixtures/conversation-time.html";
test.describe.configure({ mode: "serial" });
test.use({ timezoneId: "Asia/Seoul" });

test("keeps dates in the transcript and opens exact message times with the keyboard", async ({
  page,
}) => {
  await page.goto(fixture, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-conversation-date]")).toHaveText([
    "January 2, 2026",
    "January 3, 2026",
  ]);
  await expect(page.getByText(/Last updated|Responded|Sent Jan/)).toHaveCount(
    0,
  );
  await expect(page.locator("article time")).toHaveCount(0);
  await page.getByRole("button", { name: "Copy", exact: true }).first().focus();
  await page.keyboard.press("Tab");
  const trigger = page
    .getByRole("button", { name: "Message details", exact: true })
    .first();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveCSS("opacity", "1");
  await expect(page.getByRole("tooltip")).toContainText("9:00:00 AM GMT+9");
  await expect(trigger).toHaveAttribute(
    "aria-describedby",
    await page.getByRole("tooltip").getAttribute("id"),
  );
  await page.keyboard.press("Enter");
  const popup = page.getByRole("dialog", { name: "Message details" });
  await expect(popup).toBeVisible();
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(popup.locator("time")).toHaveAttribute(
    "datetime",
    "2026-01-02T00:00:00.000Z",
  );
  await expect(popup).toContainText("9:00:00 AM GMT+9");
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(trigger).toBeFocused();
  const response = page.locator('[data-message-id="assistant-first"]');
  await response.hover();
  await response
    .getByRole("button", { name: "Message details", exact: true })
    .click();
  await expect(popup.locator("time")).toHaveCount(2);
  await expect(popup).toContainText("Response started");
  await expect(popup).toContainText("Response completed");
  await page.keyboard.press("Escape");
  await expect(
    response.getByRole("button", { name: "Elapsed time", exact: true }),
  ).toHaveText("12s");
});

test("shows exact times on hover without a click and closes when the pointer leaves", async ({
  page,
}) => {
  await page.goto(fixture, { waitUntil: "domcontentloaded" });
  const response = page.locator('[data-message-id="assistant-first"]');
  await response.hover();
  await response
    .getByRole("button", { name: "Message details", exact: true })
    .hover();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("Response started");
  await expect(tooltip).toContainText("9:00:01 AM GMT+9");
  await expect(tooltip).toContainText("Response completed");
  await expect(tooltip).toContainText("9:00:13 AM GMT+9");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await tooltip.hover();
  await expect(tooltip).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(tooltip).toHaveCount(0);
});

test("shows localized details in a narrow dark conversation without overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 460, height: 800 });
  await page.goto(`${fixture}?lang=ko&theme=dark`, {
    waitUntil: "domcontentloaded",
  });
  const background = await page.locator("main").evaluate((element) => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d")!;
    context.fillStyle = getComputedStyle(element).backgroundColor;
    context.fillRect(0, 0, 1, 1);
    return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
  });
  expect(Math.max(...background)).toBeLessThan(100);
  await expect(page.locator("[data-conversation-date]")).toHaveText([
    "2026년 1월 2일",
    "2026년 1월 3일",
  ]);
  const response = page.locator('[data-message-id="assistant-second"]');
  await response.hover();
  await response
    .getByRole("button", { name: "메시지 상세", exact: true })
    .hover();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toContainText("응답 시작");
  await expect(tooltip).toContainText("응답 완료");
  const tooltipBox = await tooltip.boundingBox();
  expect(tooltipBox!.x).toBeGreaterThanOrEqual(0);
  expect(tooltipBox!.x + tooltipBox!.width).toBeLessThanOrEqual(460);
  await response
    .getByRole("button", { name: "메시지 상세", exact: true })
    .click();
  const popup = page.getByRole("dialog", { name: "메시지 상세" });
  await expect(popup).toBeVisible();
  await expect(popup).toContainText("응답 시작");
  await expect(popup).toContainText("응답 완료");
  const box = await popup.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(460);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("updates an open timing detail when a running response completes", async ({
  page,
}) => {
  await page.goto(fixture, { waitUntil: "domcontentloaded" });
  await page.clock.install();
  await page.evaluate(async () => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    const state = useAppStore.getState();
    useAppStore.setState({
      activeTurnIdsByTask: { "conversation-time": "running-turn" },
      messagesByTask: {
        ...state.messagesByTask,
        "conversation-time": state.messagesByTask["conversation-time"].map(
          (message) =>
            message.id === "assistant-second"
              ? {
                  ...message,
                  isStreaming: true,
                  startedAt: new Date(Date.now() - 5_000).toISOString(),
                  completedAt: undefined,
                }
              : message,
        ),
      },
    });
  });
  const response = page.locator('[data-message-id="assistant-second"]');
  const elapsed = response.getByRole("button", {
    name: "Elapsed time",
    exact: true,
  });
  const initial = await elapsed.textContent();
  await page.clock.fastForward(1_100);
  await expect(elapsed).not.toHaveText(initial!);
  await response.hover();
  await response
    .getByRole("button", { name: "Message details", exact: true })
    .click();
  const popup = page.getByRole("dialog", { name: "Message details" });
  await expect(popup.locator("time")).toHaveCount(1);
  await page.evaluate(async () => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    const state = useAppStore.getState();
    useAppStore.setState({
      activeTurnIdsByTask: {},
      messagesByTask: {
        ...state.messagesByTask,
        "conversation-time": state.messagesByTask["conversation-time"].map(
          (message) =>
            message.id === "assistant-second"
              ? {
                  ...message,
                  isStreaming: false,
                  completedAt: new Date(
                    Date.parse(message.startedAt!) + 8_000,
                  ).toISOString(),
                }
              : message,
        ),
      },
    });
  });
  await expect(popup.locator("time")).toHaveCount(2);
  await expect(popup).toContainText("Response completed");
  await page.keyboard.press("Escape");
  await expect(elapsed).toHaveText("8s");
  await page.clock.fastForward(5_000);
  await expect(elapsed).toHaveText("8s");
});

test("uses the same timing details across every provider", async ({ page }) => {
  await page.goto(fixture, { waitUntil: "domcontentloaded" });
  for (const provider of [
    "claude-code",
    "codex",
    "cursor",
    "kiro",
    "opencode",
  ]) {
    await page.evaluate(async (providerId) => {
      const { useAppStore } = await import("/src/store/app.store.ts");
      const state = useAppStore.getState();
      useAppStore.setState({
        messagesByTask: {
          ...state.messagesByTask,
          "conversation-time": state.messagesByTask["conversation-time"].map(
            (message) =>
              message.id === "assistant-first"
                ? { ...message, providerId }
                : message,
          ),
        },
      });
    }, provider);
    const response = page.locator('[data-message-id="assistant-first"]');
    await response.hover();
    await response
      .getByRole("button", { name: "Message details", exact: true })
      .click();
    const popup = page.getByRole("dialog", { name: "Message details" });
    await expect(popup.locator("time")).toHaveCount(2);
    await page.keyboard.press("Escape");
  }
});

test.describe("touch timing access", () => {
  test.use({ hasTouch: true, isMobile: true });
  test("keeps the details control available without hover", async ({
    page,
  }) => {
    await page.goto(fixture, { waitUntil: "domcontentloaded" });
    expect(await page.evaluate(() => matchMedia("(hover: none)").matches)).toBe(
      true,
    );
    const trigger = page
      .getByRole("button", { name: "Message details", exact: true })
      .first();
    await expect(trigger).toHaveCSS("opacity", "1");
    await trigger.tap();
    await expect(
      page.getByRole("dialog", { name: "Message details" }),
    ).toBeVisible();
  });
});
