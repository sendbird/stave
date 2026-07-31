import { expect, test, type Locator, type Page } from "@playwright/test";

const BOTTOM_THRESHOLD_PX = 32;

interface ChatScrollHarness {
  providerTurnPrompts: string[];
}

async function installChatScrollHarness(
  page: Page,
  options: { alphaTotalMessageCount?: number } = {},
): Promise<ChatScrollHarness> {
  const providerTurnPrompts: string[] = [];
  await page.route("http://127.0.0.1:3001/api/provider/turn", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-headers": "content-type",
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-origin": "*",
        },
      });
      return;
    }

    const payload = request.postDataJSON() as { prompt?: unknown };
    if (typeof payload.prompt === "string") {
      providerTurnPrompts.push(payload.prompt);
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "access-control-allow-origin": "*",
      },
      body: JSON.stringify({ events: [] }),
    });
  });

  await page.addInitScript(
    ({ alphaTotalMessageCount }) => {
      const buildMessages = (taskId: string, count: number) =>
        Array.from({ length: count }, (_, index) => {
          const role = index % 2 === 0 ? "user" : "assistant";
          const content = [
            `${taskId} message ${index + 1}`,
            "This deliberately long paragraph wraps across several lines when another panel narrows the conversation surface.",
            "The latest message must remain visible after task tab activation and workspace layout changes.",
          ].join(" ");
          return {
            id: `${taskId}-message-${index + 1}`,
            role,
            model: role === "assistant" ? "claude-sonnet-4-5" : "",
            providerId: role === "assistant" ? "claude-code" : "user",
            content,
            parts: [{ type: "text", text: content }],
          };
        });
      const tasks = [
        {
          id: "task-alpha",
          title: "Alpha Task",
          provider: "claude-code",
          updatedAt: "2026-07-24T08:00:00.000Z",
          unread: false,
        },
        {
          id: "task-beta",
          title: "Beta Task",
          provider: "codex",
          updatedAt: "2026-07-24T08:01:00.000Z",
          unread: false,
        },
      ];
      const messagesByTask = {
        "task-alpha": buildMessages("task-alpha", 36),
        "task-beta": buildMessages("task-beta", 44),
      };
      const secondaryMessagesByTask = {
        "task-gamma": buildMessages("task-gamma", 40),
      };
      const paneState = {
        activeTaskId: "task-alpha",
        tasks,
        messagesByTask,
        messageCountByTask: {
          "task-alpha": alphaTotalMessageCount,
          "task-beta": messagesByTask["task-beta"].length,
        },
        openTaskTabIds: ["task-alpha", "task-beta"],
        activeSurface: { kind: "task", taskId: "task-alpha" },
      };
      const secondaryPaneState = {
        activeTaskId: "task-gamma",
        tasks: [
          {
            id: "task-gamma",
            title: "Gamma Task",
            provider: "codex",
            updatedAt: "2026-07-24T08:02:00.000Z",
            unread: false,
          },
        ],
        messagesByTask: secondaryMessagesByTask,
        messageCountByTask: {
          "task-gamma": secondaryMessagesByTask["task-gamma"].length,
        },
        openTaskTabIds: ["task-gamma"],
        activeSurface: { kind: "task", taskId: "task-gamma" },
      };

      window.localStorage.setItem(
        "stave:workspace-fallback:v1",
        JSON.stringify([
          {
            id: "ws-main",
            name: "main",
            updatedAt: "2026-07-24T08:01:00.000Z",
            snapshot: paneState,
          },
          {
            id: "ws-secondary",
            name: "secondary",
            updatedAt: "2026-07-24T08:02:00.000Z",
            snapshot: secondaryPaneState,
          },
        ]),
      );
      window.localStorage.setItem(
        "stave-store",
        JSON.stringify({
          state: {
            projectPath: "/tmp/stave-project",
            projectName: "stave-project",
            workspaces: [
              {
                id: "ws-main",
                name: "main",
                updatedAt: "2026-07-24T08:01:00.000Z",
              },
              {
                id: "ws-secondary",
                name: "secondary",
                updatedAt: "2026-07-24T08:02:00.000Z",
              },
            ],
            activeWorkspaceId: "ws-main",
            workspaceBranchById: {
              "ws-main": "main",
              "ws-secondary": "secondary",
            },
            workspacePathById: {
              "ws-main": "/tmp/stave-project",
              "ws-secondary": "/tmp/stave-project/.stave/workspaces/secondary",
            },
            workspaceDefaultById: {
              "ws-main": true,
              "ws-secondary": false,
            },
            ...paneState,
          },
          version: 0,
        }),
      );
    },
    {
      alphaTotalMessageCount: options.alphaTotalMessageCount ?? 36,
    },
  );

  return { providerTurnPrompts };
}

async function getDistanceFromBottom(message: Locator) {
  return message.evaluate((node) => {
    let parent = node.parentElement;
    while (parent) {
      const overflowY = window.getComputedStyle(parent).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") {
        return parent.scrollHeight - parent.scrollTop - parent.clientHeight;
      }
      parent = parent.parentElement;
    }
    throw new Error("Unable to find the conversation scroll container.");
  });
}

async function expectLatestMessageAtBottom(
  page: Page,
  taskId: string,
  messageCount: number,
) {
  const latestMessage = page.locator(
    `[data-message-id="${taskId}-message-${messageCount}"]`,
  );
  await expect(latestMessage).toBeVisible();
  await expect
    .poll(() => getDistanceFromBottom(latestMessage))
    .toBeLessThanOrEqual(BOTTOM_THRESHOLD_PX);
}

interface ScrollAnchorSnapshot {
  messageId: string;
  offset: number;
}

async function getScrollAnchor(
  scrollContainer: Locator,
): Promise<ScrollAnchorSnapshot | null> {
  return scrollContainer.evaluate((container) => {
    const containerTop = container.getBoundingClientRect().top;
    const anchor = Array.from(
      container.querySelectorAll<HTMLElement>("[data-message-id]"),
    ).find((node) => node.getBoundingClientRect().bottom > containerTop);
    const messageId = anchor?.dataset.messageId;
    if (!anchor || !messageId) {
      return null;
    }
    return {
      messageId,
      offset: Math.round(containerTop - anchor.getBoundingClientRect().top),
    };
  });
}

async function expectScrollAnchor(
  scrollContainer: Locator,
  expected: ScrollAnchorSnapshot,
) {
  await expect
    .poll(
      async () => (await getScrollAnchor(scrollContainer))?.messageId ?? null,
    )
    .toBe(expected.messageId);
  await expect
    .poll(async () => {
      const current = await getScrollAnchor(scrollContainer);
      if (!current) {
        return Number.POSITIVE_INFINITY;
      }
      return Math.abs(current.offset - expected.offset);
    })
    .toBeLessThanOrEqual(4);
}

test("submitting a new prompt restores the latest conversation position", async ({
  page,
}) => {
  const { providerTurnPrompts } = await installChatScrollHarness(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const scrollContainer = page.getByTestId("conversation-scroll-task-alpha");
  await expectLatestMessageAtBottom(page, "task-alpha", 36);

  await scrollContainer.hover();
  await page.mouse.wheel(0, -1_200);
  await expect
    .poll(() =>
      scrollContainer.evaluate(
        (node) => node.scrollHeight - node.scrollTop - node.clientHeight,
      ),
    )
    .toBeGreaterThan(BOTTOM_THRESHOLD_PX);

  const prompt = page.getByRole("textbox", { name: "Prompt" });
  await prompt.fill("Continue from the latest state");
  await page.getByRole("button", { name: "Send" }).click();

  await expect
    .poll(() => providerTurnPrompts.includes("Continue from the latest state"))
    .toBe(true);
  await expect
    .poll(() =>
      scrollContainer.evaluate(
        (node) => node.scrollHeight - node.scrollTop - node.clientHeight,
      ),
    )
    .toBeLessThanOrEqual(BOTTOM_THRESHOLD_PX);
});

test("inactive tabs use a borderless tint hover and compact top-bar controls stay aligned", async ({
  page,
}) => {
  await installChatScrollHarness(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const inactiveTab = page
    .locator('[data-pane-tab-chip="task:task-beta"]')
    .locator(
      "xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' dv-tab ')][1]",
    );
  await expect(inactiveTab).toHaveClass(/dv-inactive-tab/);
  await page.mouse.move(0, 0);
  const restingStyle = await inactiveTab.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderTopWidth: style.borderTopWidth,
      borderRightWidth: style.borderRightWidth,
      borderBottomWidth: style.borderBottomWidth,
      borderLeftWidth: style.borderLeftWidth,
    };
  });
  expect(restingStyle).toMatchObject({
    borderTopWidth: "0px",
    borderRightWidth: "0px",
    borderBottomWidth: "0px",
    borderLeftWidth: "0px",
  });

  await inactiveTab.hover();
  const hoverDiagnostics = await inactiveTab.evaluate((element) => ({
    matchesHover: element.matches(":hover"),
    hoverMedia: window.matchMedia("(hover: hover)").matches,
    pointerMedia: window.matchMedia("(pointer: fine)").matches,
  }));
  expect(hoverDiagnostics).toEqual({
    matchesHover: true,
    hoverMedia: true,
    pointerMedia: true,
  });
  await expect
    .poll(() =>
      inactiveTab.evaluate(
        (element) => window.getComputedStyle(element).backgroundColor,
      ),
    )
    .not.toBe(restingStyle.backgroundColor);
  const hoverStyle = await inactiveTab.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      borderTopWidth: style.borderTopWidth,
      borderRightWidth: style.borderRightWidth,
      borderBottomWidth: style.borderBottomWidth,
      borderLeftWidth: style.borderLeftWidth,
      boxShadow: style.boxShadow,
    };
  });
  expect(hoverStyle).toEqual({
    borderTopWidth: "0px",
    borderRightWidth: "0px",
    borderBottomWidth: "0px",
    borderLeftWidth: "0px",
    boxShadow: "none",
  });

  const fileSearchInput = page.locator("[data-file-search-input]");
  await expect(fileSearchInput).toBeVisible();
  await page.getByRole("textbox", { name: "Prompt" }).focus();
  const fileSearchChrome = await fileSearchInput.evaluate((element) => {
    const wrapper = element.closest<HTMLElement>(
      "[data-slot='command-input-wrapper']",
    );
    if (!wrapper) {
      return null;
    }
    const style = window.getComputedStyle(wrapper);
    const wrapperRect = wrapper.getBoundingClientRect();
    const topBarRect = document
      .querySelector<HTMLElement>("[data-testid='top-bar']")
      ?.getBoundingClientRect();
    const shadowColors = [...style.boxShadow.matchAll(/rgba?\(([^)]+)\)/g)].map(
      (match) => match[1].split(/[\s,/]+/).filter(Boolean),
    );
    const hasVisibleBoxShadow =
      style.boxShadow !== "none" &&
      (shadowColors.length === 0 ||
        shadowColors.some((components) => {
          const alpha = components.length >= 4 ? components.at(-1) : "1";
          return Number(alpha) > 0;
        }));
    return {
      height: style.height,
      borderTopWidth: style.borderTopWidth,
      borderRightWidth: style.borderRightWidth,
      borderBottomWidth: style.borderBottomWidth,
      borderLeftWidth: style.borderLeftWidth,
      hasVisibleBoxShadow,
      rect: {
        x: wrapperRect.x,
        y: wrapperRect.y,
        width: wrapperRect.width,
        height: wrapperRect.height,
      },
      isInsideTopBar: topBarRect
        ? wrapperRect.top >= topBarRect.top &&
          wrapperRect.bottom <= topBarRect.bottom
        : false,
    };
  });
  expect(fileSearchChrome).toMatchObject({
    height: "28px",
    borderTopWidth: "1px",
    borderRightWidth: "1px",
    borderBottomWidth: "1px",
    borderLeftWidth: "1px",
    hasVisibleBoxShadow: false,
    isInsideTopBar: true,
  });

  await fileSearchInput.focus();
  const focusedRect = await fileSearchInput.evaluate((element) => {
    const wrapper = element.closest<HTMLElement>(
      "[data-slot='command-input-wrapper']",
    );
    const rect = wrapper?.getBoundingClientRect();
    return rect
      ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      : null;
  });
  expect(focusedRect).toEqual(fileSearchChrome?.rect);

  await page.getByRole("button", { name: "Open workspace secondary" }).click();
  const createPrButton = page.getByRole("button", { name: "Create PR" });
  await expect(createPrButton).toBeVisible();

  const compactControlRects = await Promise.all([
    page
      .getByRole("button", { name: "open-workspace-path-actions" })
      .evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { height: rect.height, centerY: rect.y + rect.height / 2 };
      }),
    page
      .getByTestId("top-bar")
      .getByText("secondary", { exact: true })
      .locator("..")
      .evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { height: rect.height, centerY: rect.y + rect.height / 2 };
      }),
    createPrButton.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { height: rect.height, centerY: rect.y + rect.height / 2 };
    }),
    fileSearchInput.evaluate((element) => {
      const wrapper = element.closest<HTMLElement>(
        "[data-slot='command-input-wrapper']",
      );
      const rect = wrapper?.getBoundingClientRect();
      return rect
        ? { height: rect.height, centerY: rect.y + rect.height / 2 }
        : { height: 0, centerY: 0 };
    }),
  ]);
  expect(compactControlRects.map(({ height }) => height)).toEqual([
    28, 28, 28, 28,
  ]);
  const compactControlCenterYs = compactControlRects.map(
    ({ centerY }) => centerY,
  );
  expect(
    Math.max(...compactControlCenterYs) - Math.min(...compactControlCenterYs),
  ).toBeLessThanOrEqual(0.5);
});

test("split task panes keep both conversations visible across focus changes", async ({
  page,
}) => {
  await installChatScrollHarness(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const betaTaskTab = page
    .locator('[data-pane-tab-chip="task:task-beta"]')
    .filter({ hasText: "Beta Task" });
  await betaTaskTab.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Split Right" }).click();

  const alphaScrollContainer = page.getByTestId(
    "conversation-scroll-task-alpha",
  );
  const betaScrollContainer = page.getByTestId(
    "conversation-scroll-task-beta",
  );
  await expect(alphaScrollContainer).toBeVisible();
  await expect(betaScrollContainer).toBeVisible();
  await expectLatestMessageAtBottom(page, "task-alpha", 36);
  await expectLatestMessageAtBottom(page, "task-beta", 44);

  await betaScrollContainer.click({ position: { x: 12, y: 12 } });
  await page.waitForTimeout(1_500);
  await expectLatestMessageAtBottom(page, "task-alpha", 36);
  await expectLatestMessageAtBottom(page, "task-beta", 44);

  await alphaScrollContainer.click({ position: { x: 12, y: 12 } });
  await page.waitForTimeout(1_500);
  await expectLatestMessageAtBottom(page, "task-alpha", 36);
  await expectLatestMessageAtBottom(page, "task-beta", 44);
});

test("task, workspace, and panel changes preserve reading position while explicit latest intent restores bottom", async ({
  page,
}) => {
  await installChatScrollHarness(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const alphaTaskTab = page
    .locator('[data-pane-tab-chip="task:task-alpha"]')
    .filter({ hasText: "Alpha Task" });
  const betaTaskTab = page
    .locator('[data-pane-tab-chip="task:task-beta"]')
    .filter({ hasText: "Beta Task" });
  const primaryWorkspaceButton = page.getByRole("button", {
    name: "Open workspace Default",
  });
  const secondaryWorkspaceButton = page.getByRole("button", {
    name: "Open workspace secondary",
  });
  const alphaScrollContainer = page.getByTestId(
    "conversation-scroll-task-alpha",
  );

  await expect(alphaTaskTab).toBeVisible();
  await expect(betaTaskTab).toBeVisible();
  await expect(primaryWorkspaceButton).toBeVisible();
  await expect(secondaryWorkspaceButton).toBeVisible();
  await expectLatestMessageAtBottom(page, "task-alpha", 36);

  await secondaryWorkspaceButton.click();
  await expectLatestMessageAtBottom(page, "task-gamma", 40);

  await primaryWorkspaceButton.click();
  await expectLatestMessageAtBottom(page, "task-alpha", 36);

  // Explicit bottom intent must survive a full workspace round trip. In the
  // real app, late Virtuoso measurement used to turn that intent off and leave
  // the returning task above its latest message.
  await alphaScrollContainer.hover();
  await page.mouse.wheel(0, -1_200);
  await expect(
    page.getByRole("button", { name: "scroll-to-bottom" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "scroll-to-bottom" }).click();
  await expectLatestMessageAtBottom(page, "task-alpha", 36);
  await secondaryWorkspaceButton.click();
  await expectLatestMessageAtBottom(page, "task-gamma", 40);
  await primaryWorkspaceButton.click();
  await expectLatestMessageAtBottom(page, "task-alpha", 36);

  await page
    .getByTestId("workspace-bar")
    .getByRole("button", { name: "Information" })
    .click();
  await expect(
    page.getByTestId("editor-panel").getByRole("heading", {
      name: "Information",
    }),
  ).toBeVisible();
  await expectLatestMessageAtBottom(page, "task-alpha", 36);

  await betaTaskTab.click();
  await expectLatestMessageAtBottom(page, "task-beta", 44);

  await alphaTaskTab.click();
  await expectLatestMessageAtBottom(page, "task-alpha", 36);
  await page.waitForTimeout(250);

  await alphaScrollContainer.hover();
  await page.mouse.wheel(0, -1_200);
  await expect(
    page.getByRole("button", { name: "scroll-to-bottom" }),
  ).toBeVisible();
  const expectedAlphaAnchor = await getScrollAnchor(alphaScrollContainer);
  if (!expectedAlphaAnchor) {
    throw new Error("Unable to capture the scrolled Alpha task anchor.");
  }

  await betaTaskTab.click();
  await expectLatestMessageAtBottom(page, "task-beta", 44);

  await alphaTaskTab.click();
  await expectScrollAnchor(alphaScrollContainer, expectedAlphaAnchor);
  await expect(
    page.getByRole("button", { name: "scroll-to-bottom" }),
  ).toBeVisible();

  await secondaryWorkspaceButton.click();
  await expectLatestMessageAtBottom(page, "task-gamma", 40);

  await primaryWorkspaceButton.click();
  await expectScrollAnchor(alphaScrollContainer, expectedAlphaAnchor);
  await expect(
    page.getByRole("button", { name: "scroll-to-bottom" }),
  ).toBeVisible();

  await page
    .getByTestId("workspace-bar")
    .getByRole("button", { name: "Information" })
    .click();
  await expect(page.getByTestId("editor-panel")).toBeHidden();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      }),
  );
  await expect
    .poll(() =>
      alphaScrollContainer.evaluate(
        (node) => node.scrollHeight - node.scrollTop - node.clientHeight,
      ),
    )
    .toBeGreaterThan(BOTTOM_THRESHOLD_PX);
  await expect(
    page.getByRole("button", { name: "scroll-to-bottom" }),
  ).toBeVisible();

  await page.keyboard.press("Control+Shift+P");
  const commandPalette = page.getByRole("dialog", {
    name: "Command Palette",
  });
  await commandPalette
    .getByPlaceholder("Find a command, task, workspace, or setting…")
    .fill("Switch Task: Alpha Task");
  await commandPalette
    .getByText("Switch Task: Alpha Task", { exact: true })
    .click();
  await expect(commandPalette).toBeHidden();
  await expectLatestMessageAtBottom(page, "task-alpha", 36);
});

test("absolute top restores a signed message anchor below the load-older control", async ({
  page,
}) => {
  await installChatScrollHarness(page, { alphaTotalMessageCount: 40 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const alphaTaskTab = page
    .locator('[data-pane-tab-chip="task:task-alpha"]')
    .filter({ hasText: "Alpha Task" });
  const betaTaskTab = page
    .locator('[data-pane-tab-chip="task:task-beta"]')
    .filter({ hasText: "Beta Task" });
  const alphaScrollContainer = page.getByTestId(
    "conversation-scroll-task-alpha",
  );

  const loadOlderButton = page.getByRole("button", {
    name: /^Load older messages \(\d+ remaining\)$/,
  });
  await expect(loadOlderButton).toBeVisible();
  // Wait for the initial bottom restore to settle before sending a trusted
  // wheel gesture. On a warm Vite page, the header can render one frame before
  // the final scroll-to-bottom RAF and otherwise overwrite that gesture.
  await expectLatestMessageAtBottom(page, "task-alpha", 36);
  await alphaScrollContainer.hover();
  await page.mouse.wheel(0, -100_000);
  await expect
    .poll(() => alphaScrollContainer.evaluate((node) => node.scrollTop))
    .toBeLessThanOrEqual(1);

  const topAnchor = await getScrollAnchor(alphaScrollContainer);
  expect(topAnchor).not.toBeNull();
  expect(topAnchor!.offset).toBeLessThan(0);

  // Switch immediately after the wheel settles so pending scroll reports
  // cannot overwrite the signed top anchor with recycled Virtuoso rows.
  await betaTaskTab.click();
  await expectLatestMessageAtBottom(page, "task-beta", 44);
  await alphaTaskTab.click();
  await expectScrollAnchor(alphaScrollContainer, topAnchor!);
  await expect(loadOlderButton).toBeVisible();
});
