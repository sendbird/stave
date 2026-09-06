import { expect, test } from "@playwright/test";

/**
 * Visual confirmation for the project-row attention alert in the LNB. The
 * project row is the only place a blocking need stays visible while the project
 * is collapsed, so this exercises both the expanded and collapsed states.
 */
test("LNB project row surfaces the rolled-up attention alert", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    const projectPath = "/tmp/stave-lnb-attention";
    const workspaceId = "ws-lnb-attention";
    const taskId = "task-lnb-attention";
    const workspaceSnapshot = {
      activeTaskId: taskId,
      openTaskTabIds: [taskId],
      activeSurface: { kind: "task", taskId },
      tasks: [
        {
          id: taskId,
          title: "Attention fixture",
          provider: "codex",
          updatedAt: "2026-07-26T01:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: {
        [taskId]: [
          {
            id: "message-approval",
            role: "assistant",
            model: "gpt-5",
            providerId: "codex",
            content: "",
            startedAt: "2026-07-26T01:09:00.000Z",
            parts: [
              {
                type: "approval",
                toolName: "Bash",
                description: "Run the production deployment.",
                requestId: "approval-deploy",
                state: "approval-requested",
              },
            ],
          },
        ],
      },
      activeTurnIdsByTask: { [taskId]: "turn-approval" },
    };

    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: workspaceId,
          name: "lnb-attention",
          updatedAt: "2026-07-26T01:00:00.000Z",
          snapshot: workspaceSnapshot,
        },
      ]),
    );
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          projectPath,
          projectName: "stave-lnb-attention",
          workspaces: [
            {
              id: workspaceId,
              name: "lnb-attention",
              updatedAt: "2026-07-26T01:00:00.000Z",
            },
          ],
          activeWorkspaceId: workspaceId,
          workspaceBranchById: { [workspaceId]: "main" },
          workspacePathById: { [workspaceId]: projectPath },
          workspaceDefaultById: { [workspaceId]: true },
          ...workspaceSnapshot,
        },
        version: 0,
      }),
    );
    window.localStorage.setItem(
      "stave:notifications-fallback:v1",
      JSON.stringify([
        {
          id: "notification-approval",
          kind: "task.approval_requested",
          title: "Approve deployment",
          body: "Allow the deployment command.",
          projectPath,
          projectName: "stave-lnb-attention",
          workspaceId,
          workspaceName: "lnb-attention",
          taskId,
          taskTitle: "Approve deployment",
          turnId: "turn-approval",
          providerId: "codex",
          action: {
            type: "approval",
            requestId: "approval-deploy",
            messageId: "message-approval",
          },
          payload: {},
          createdAt: "2026-07-26T01:10:00.000Z",
          readAt: null,
          resolvedAt: null,
          expiresAt: null,
        },
      ]),
    );

    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: { streamTurn: async () => [] },
      terminal: {
        runCommand: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }),
      },
      sourceControl: {
        getStatus: async () => ({
          ok: true,
          branch: "main",
          items: [],
          hasConflicts: false,
          stderr: "",
        }),
        getHistory: async () => ({ ok: true, items: [], stderr: "" }),
      },
    };
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const sidebar = page.getByTestId("project-workspace-sidebar");
  await expect(sidebar).toBeVisible();

  // The alert replaces the workspace-count badge in the project row, so the
  // count must be gone while a blocking need is pending.
  const alert = sidebar.getByRole("status", {
    name: "project-attention-stave-lnb-attention",
  });
  await expect(alert).toBeVisible();
  await expect(
    sidebar.getByLabel("1 workspaces", { exact: true }),
  ).toHaveCount(0);

  // An approval need must render the ShieldCheck glyph in the warning color,
  // matching the per-workspace icon vocabulary.
  const glyph = alert.locator("svg");
  await expect(glyph).toHaveCount(1);
  const rendered = await glyph.evaluate((element) => ({
    classes: element.getAttribute("class") ?? "",
    color: window.getComputedStyle(element).color,
    width: element.getBoundingClientRect().width,
  }));
  expect(rendered.classes).toContain("lucide-shield-check");
  expect(rendered.width).toBeGreaterThan(0);

  const warningColor = await sidebar.evaluate((element) => {
    // The glyph paints with the semantic warning token (`vars.colorWarning`
    // maps to `--warning`). Resolve that token the same way the icon does so
    // the assertion tracks the color contract rather than a utility class.
    const probe = document.createElement("span");
    probe.style.color = "var(--warning)";
    element.append(probe);
    const color = window.getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  expect(rendered.color).toBe(warningColor);

  await page.screenshot({
    path: testInfo.outputPath("lnb-project-alert-expanded.png"),
    fullPage: false,
  });

  // Hovering the row reveals the project actions, which fade out the decorative
  // workspace count. The alert must survive that fade: reaching for the row is
  // exactly when the blocked signal matters, and a faded slot also takes its
  // explanatory tooltip out of reach.
  const readSlot = () =>
    alert.evaluate((element) => {
      const slot = element.parentElement;
      if (!slot) {
        throw new Error("Alert slot was not found");
      }
      const slotStyle = window.getComputedStyle(slot);
      return {
        slotOpacity: Number(slotStyle.opacity),
        pointerEvents: slotStyle.pointerEvents,
      };
    });
  expect(await readSlot()).toEqual({ slotOpacity: 1, pointerEvents: "auto" });

  const projectLabel = sidebar
    .getByText("stave-lnb-attention", { exact: true })
    .first();
  await projectLabel.hover();
  // Let the 200ms opacity transition settle before sampling.
  await expect
    .poll(async () => (await readSlot()).slotOpacity)
    .toBeGreaterThan(0.99);
  expect((await readSlot()).pointerEvents).toBe("auto");
  await expect(alert).toBeVisible();
  // The reserved hover padding must keep the alert clear of the row actions.
  // The slot is reserved by a 200ms `transition-[padding]`, so poll the
  // measured gap itself rather than sampling mid-transition.
  const readOverlap = () =>
    alert.evaluate((element) => {
      // The row actions are the cluster anchored at the inline end of the
      // project row. Find them through the stable "Kick off workspace" action
      // label rather than a utility class string that the design system owns.
      const row = element.closest("li, [role='listitem'], div");
      const kickoff =
        row?.querySelector<HTMLElement>(
          'button[aria-label^="Kick off workspace"]',
        ) ??
        document.querySelector<HTMLElement>(
          'button[aria-label^="Kick off workspace"]',
        );
      const actions = kickoff?.parentElement;
      if (!actions) {
        throw new Error("Row actions were not found");
      }
      const alertRect = element.getBoundingClientRect();
      const actionsRect = actions.getBoundingClientRect();
      return alertRect.right - actionsRect.left;
    });
  await expect.poll(readOverlap).toBeLessThanOrEqual(1);

  // Hovering the alert opens its own tooltip. The bubble must not cover the
  // glyph it describes — the alert is pinned through hover precisely so it
  // stays readable while you reach for the row.
  const alertLabel = "1 item needs attention: approval needed";
  await alert.hover();
  // Match the alert's own tooltip by its text. Several tooltips share the
  // `tooltip-content` slot in this row, so selecting the first one in the DOM
  // would measure the collapse-toggle bubble and pass regardless of placement.
  const tooltip = page.getByText(alertLabel, { exact: true });
  await expect(tooltip).toBeVisible();
  const tooltipOverlapsIcon = await alert.evaluate((element, label) => {
    const popup = Array.from(
      document.querySelectorAll<HTMLElement>("[data-slot='tooltip-content']"),
    ).find((node) => node.textContent?.trim() === label);
    if (!popup) {
      throw new Error(`Tooltip for "${label}" was not found`);
    }
    const iconRect = element.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();
    return (
      popupRect.left < iconRect.right &&
      popupRect.right > iconRect.left &&
      popupRect.top < iconRect.bottom &&
      popupRect.bottom > iconRect.top
    );
  }, alertLabel);
  expect(tooltipOverlapsIcon).toBe(false);

  await page.screenshot({
    path: testInfo.outputPath("lnb-project-alert-hovered.png"),
    fullPage: false,
  });

  // The count badge keeps its original fade, so hover still hands the slot to
  // the row actions when nothing is blocked.
  await page.mouse.move(0, 0);

  // Collapsing the project hides the workspace rows; the project-row alert is
  // then the only remaining signal, so it must survive the collapse.
  await sidebar
    .getByRole("button", { name: "toggle-project-/tmp/stave-lnb-attention" })
    .click();
  await expect(alert).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("lnb-project-alert-collapsed.png"),
    fullPage: false,
  });

  // Answering the approval leaves the turn finished but unconfirmed. That is a
  // review-tier need: it must still mark the row, but as a muted dot rather
  // than a warning glyph, so "blocked" keeps its distinct meaning.
  await page.evaluate(async () => {
    const storeModule = await import("/src/store/app.store.ts");
    const store = storeModule.useAppStore;
    const state = store.getState();
    store.setState({
      messagesByTask: { ...state.messagesByTask, "task-lnb-attention": [] },
      activeTurnIdsByTask: {},
      providerTurnActivityByTask: {},
      notifications: [
        {
          id: "notification-result",
          kind: "task.turn_completed",
          title: "Turn finished",
          body: "The deployment run finished.",
          projectPath: "/tmp/stave-lnb-attention",
          projectName: "stave-lnb-attention",
          workspaceId: "ws-lnb-attention",
          workspaceName: "lnb-attention",
          taskId: "task-lnb-attention",
          taskTitle: "Attention fixture",
          turnId: "turn-approval",
          providerId: "codex",
          payload: {},
          createdAt: "2026-07-26T01:20:00.000Z",
          readAt: null,
          resolvedAt: null,
          expiresAt: null,
        },
      ],
    });
  });

  await expect(alert).toBeVisible();
  // No lucide glyph: the review tier renders a plain dot span.
  await expect(alert.locator("svg")).toHaveCount(0);
  const reviewDot = await alert.evaluate((element) => {
    const dot = element.querySelector<HTMLElement>("span[aria-hidden='true']");
    if (!dot) {
      throw new Error("Review dot was not found");
    }
    const rect = dot.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(reviewDot.width).toBeGreaterThan(0);
  // The dot must stay visibly smaller than the 14px blocking glyph.
  expect(reviewDot.width).toBeLessThan(10);
  expect(reviewDot.height).toBeLessThan(10);
  await page.screenshot({
    path: testInfo.outputPath("lnb-project-alert-review.png"),
    fullPage: false,
  });

  // Unlike a blocking alert, the review dot is decorative and yields the slot
  // to the row actions on hover.
  await projectLabel.hover();
  await expect
    .poll(async () => (await readSlot()).slotOpacity)
    .toBeLessThan(0.01);
  await page.mouse.move(0, 0);

  // Resolving the need must hand the slot back to the workspace-count badge.
  await page.evaluate(async () => {
    const storeModule = await import("/src/store/app.store.ts");
    const store = storeModule.useAppStore;
    const state = store.getState();
    store.setState({
      notifications: [],
      messagesByTask: { ...state.messagesByTask, "task-lnb-attention": [] },
      activeTurnIdsByTask: {},
      providerTurnActivityByTask: {},
    });
  });
  await expect(alert).toHaveCount(0);
  const countBadge = sidebar.getByLabel("1 workspaces", { exact: true });
  await expect(countBadge).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("lnb-project-alert-cleared.png"),
    fullPage: false,
  });

  // Regression guard on the other half of the fix: exempting the alert from the
  // hover fade must not exempt the decorative count too.
  await projectLabel.hover();
  await expect
    .poll(() =>
      countBadge.evaluate((element) =>
        Number(window.getComputedStyle(element.parentElement!).opacity),
      ),
    )
    .toBeLessThan(0.01);
});
