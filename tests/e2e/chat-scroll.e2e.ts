import { expect, test, type Locator, type Page } from "@playwright/test";

const BOTTOM_THRESHOLD_PX = 32;

async function installChatScrollHarness(page: Page) {
  await page.addInitScript(() => {
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
        "task-alpha": messagesByTask["task-alpha"].length,
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
  });
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

test("workspace and task switches preserve conversation scroll intent through right-panel reflow", async ({
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

  await expect(alphaTaskTab).toBeVisible();
  await expect(betaTaskTab).toBeVisible();
  await expect(primaryWorkspaceButton).toBeVisible();
  await expect(secondaryWorkspaceButton).toBeVisible();
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

  const alphaScrollContainer = page.getByTestId(
    "conversation-scroll-task-alpha",
  );
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
});
