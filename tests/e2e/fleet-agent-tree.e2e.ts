import { expect, test, type Locator, type Page } from "@playwright/test";

const REPOSITORY_PATH = "/tmp/stave-fleet-tree";

/**
 * Three workspaces: the open one runs "Ship the search fix" with an in-turn
 * subagent and three delegated tasks (one waits for an approval, one failed,
 * one is queued); the other two are stored task lists nobody opened.
 */
async function seed(page: Page) {
  await page.addInitScript((repositoryPath) => {
    const now = Date.now();
    const iso = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
    const workspaces = [0, 1, 2].map((index) => ({
      id: `ws-tree-${index}`,
      name: `tree-${index}`,
      updatedAt: iso(60),
    }));
    const task = (id: string, title: string, minutesAgo: number) => ({
      id, title, provider: "claude-code", updatedAt: iso(minutesAgo), unread: false, archivedAt: null,
    });
    const tasksByWorkspace: Record<string, ReturnType<typeof task>[]> = {
      "ws-tree-0": [task("task-0-0", "Ship the search fix", 1), task("task-0-1", "Write the release notes", 20)],
      "ws-tree-1": [task("task-1-0", "Review the API shape", 30)],
      "ws-tree-2": [task("child-review", "Review pass", 5)],
    };
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify(
        workspaces.map((workspace) => {
          const tasks = tasksByWorkspace[workspace.id]!;
          return {
            ...workspace,
            snapshot: {
              activeTaskId: tasks[0]!.id,
              tasks,
              messagesByTask: {},
              openTaskTabIds: tasks.map((entry) => entry.id),
            },
          };
        }),
      ),
    );
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          repositoryPath,
          repositoryName: "stave-fleet-tree",
          workspaces,
          activeWorkspaceId: "ws-tree-0",
          workspaceBranchById: Object.fromEntries(workspaces.map((workspace) => [workspace.id, workspace.name])),
          workspacePathById: Object.fromEntries(workspaces.map((workspace) => [workspace.id, repositoryPath])),
          workspaceDefaultById: { "ws-tree-0": true },
          activeTaskId: "task-0-0",
          tasks: tasksByWorkspace["ws-tree-0"],
          openTaskTabIds: ["task-0-0", "task-0-1"],
          messagesByTask: {},
          // A profile saved before the Tree layout: it opened on cards, the old default.
          settings: { fleetBoardLayout: "cards" },
        },
        version: 0,
      }),
    );
    // The delegated review waits for an approval.
    window.localStorage.setItem(
      "stave:notifications-fallback:v1",
      JSON.stringify([
        {
          id: "n-child-approval",
          kind: "task.approval_requested",
          title: "Approve the review command",
          body: "Allow the command.",
          repositoryPath,
          repositoryName: "stave-fleet-tree",
          workspaceId: "ws-tree-2",
          workspaceName: "tree-2",
          taskId: "child-review",
          taskTitle: "Review pass",
          turnId: "turn-child-review",
          providerId: "codex",
          action: { type: "approval", requestId: "approval-child", messageId: "m-child" },
          payload: {},
          createdAt: iso(3),
          readAt: null,
          resolvedAt: null,
          expiresAt: null,
        },
      ]),
    );
    const child = (delegationKey: string, phase: string, extra: Record<string, unknown> = {}) => ({
      runId: `run-${delegationKey}`,
      stepId: `step-${delegationKey}`,
      parentTaskId: "task-0-0",
      delegationKey,
      delegatedTaskId: delegationKey === "review-pass" ? "child-review" : `child-${delegationKey}`,
      delegatedWorkspaceId: "ws-tree-2",
      delegatedTurnId: null,
      providerId: "codex",
      requestedModel: "gpt-5.5",
      lifecycle: "one-turn",
      phase,
      reason: null,
      attempt: 1,
      createdAt: iso(6),
      updatedAt: iso(2),
      completedAt: null,
      ...extra,
    });
    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: { streamTurn: async () => [] },
      runs: {
        listDelegatedTasks: async (args: { parentTaskId: string }) =>
          args.parentTaskId === "task-0-0"
            ? [
                child("review-pass", "running"),
                child("fix-tests", "failed", { reason: "The focused tests failed.", completedAt: iso(1) }),
                child("docs-pass", "pending"),
              ]
            : [],
      },
      terminal: {
        runCommand: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }),
      },
      sourceControl: {
        getStatus: async () => ({ ok: true, branch: "main", items: [], hasConflicts: false, stderr: "" }),
        getHistory: async () => ({ ok: true, items: [], stderr: "" }),
      },
    };
  }, REPOSITORY_PATH);
}

/** The running turn: tool work, a reported cost and an in-turn subagent with steps. */
async function startTurn(page: Page) {
  await page.evaluate(async (repositoryPath) => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    const turnStatus = await import("/src/lib/providers/turn-status.ts");
    const now = Date.now();
    const turnId = "turn-task-0-0";
    let activity = turnStatus.startProviderTurnActivity({
      activityByTask: useAppStore.getState().providerTurnActivityByTask,
      taskId: "task-0-0",
      turnId,
      providerId: "claude-code",
      now,
      startedAt: now - 95_000,
    });
    const current = activity["task-0-0"]!;
    const tool = (id: string, toolName: string, secondsAgo: number) => ({
      id, kind: "tool" as const, status: "completed" as const, title: toolName, toolName, detail: "src/search.ts",
      progressMessages: [], startedAt: now - secondsAgo * 1000, updatedAt: now - secondsAgo * 1000,
    });
    const items = [tool("w1", "Read", 50), tool("w2", "Grep", 40), tool("w3", "Edit", 20), tool("w4", "Bash", 10)];
    const graph = current.workGraph;
    activity = {
      ...activity,
      "task-0-0": {
        ...current,
        workItemsById: Object.fromEntries(items.map((item) => [item.id, item])),
        orderedWorkItemIds: items.map((item) => item.id),
        workGraph: {
          ...graph,
          nodesByKey: {
            ...graph.nodesByKey,
            "agent:explore": {
              key: "agent:explore", identitySource: "provider", parentKey: null, label: "Explore the search index",
              badge: "Explore", status: "running", startedAt: now - 60_000, updatedAt: now - 5_000,
              progress: ["Read src/search.ts", "Grep for tokenize"],
            },
          },
          orderedNodeKeys: [...graph.orderedNodeKeys, "agent:explore"],
        },
      },
    };
    const workspaces = [0, 1, 2].map((index) => ({
      id: `ws-tree-${index}`,
      name: `tree-${index}`,
      updatedAt: new Date(now - 60 * 60_000).toISOString(),
    }));
    useAppStore.setState({
      workspaces,
      workspacePathById: Object.fromEntries(workspaces.map((workspace) => [workspace.id, repositoryPath])),
      workspaceBranchById: Object.fromEntries(workspaces.map((workspace) => [workspace.id, workspace.name])),
      activeTurnIdsByTask: { "task-0-0": turnId },
      providerTurnActivityByTask: activity,
      taskWorkspaceIdById: { "task-0-0": "ws-tree-0", "task-0-1": "ws-tree-0" },
      messagesByTask: {
        "task-0-0": [
          {
            id: "m-0", role: "assistant", model: "claude-opus-4-7", providerId: "claude-code", content: "Looking at the index.",
            turnId: "turn-earlier", parts: [], usage: { inputTokens: 10, outputTokens: 10, totalCostUsd: 0.42 },
          },
        ],
      },
    } as never);
  }, REPOSITORY_PATH);
}

/** Fleet opens on the Tree layout: the default, and where a saved `cards` moved once. */
async function openFleet(page: Page) {
  await page.getByTestId("top-bar").getByRole("button", { name: "Open Fleet View" }).click();
  const layout = page.getByRole("group", { name: "Board layout" });
  await expect(layout.getByRole("button", { name: "Tree" })).toHaveAttribute("aria-pressed", "true");
  return layout;
}

async function box(locator: Locator) {
  const value = await locator.boundingBox();
  if (!value) throw new Error("no box");
  return value;
}

async function remPx(page: Page, rem: number) {
  return page.evaluate((value) => value * Number.parseFloat(getComputedStyle(document.documentElement).fontSize), rem);
}

test("Fleet's Tree layout shows tasks as agents and opens their subagent trees from the keyboard", async ({ page }, testInfo) => {
  await seed(page);
  await page.setViewportSize({ width: 1600, height: 960 });
  await page.goto("/");
  await startTurn(page);
  await openFleet(page);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const fleet = page.locator('[data-agent-fleet="true"]');
  const cards = fleet.locator("[data-agent-fleet-card]");
  await expect(cards).toHaveCount(4);
  const lead = cards.filter({ hasText: "Ship the search fix" });
  await expect(lead).toContainText("Working");
  await expect(lead).toContainText("$0.42");
  await expect(fleet.locator('[data-agent-fleet-totals="true"]')).toContainText("4 agents");
  await expect(fleet.locator('[data-agent-fleet-totals="true"]')).toHaveAttribute("aria-live", "polite");
  // A task in a workspace nobody opened, with an approval pending, waits on the user.
  await expect(cards.filter({ hasText: "Review pass" })).toContainText("Needs you");

  // Tools are icons with their names, three at most and then "+N"; never letters.
  const tools = lead.getByRole("img", { name: "Tools: Bash, Edit, Grep, Read" });
  await expect(tools).toBeVisible();
  const tiles = tools.locator("[data-agent-fleet-tool]");
  await expect(tiles).toHaveCount(3);
  for (const [index, name] of ["Bash", "Edit", "Grep"].entries()) {
    await expect(tiles.nth(index)).toHaveAttribute("title", name);
    await expect(tiles.nth(index).locator("svg")).toHaveCount(1);
    await expect(tiles.nth(index)).toHaveText("");
  }
  await expect(tools).toContainText("+1");
  // Each icon fills its slot inside the tile, centered.
  for (let index = 0; index < 3; index += 1) {
    const tile = await box(tiles.nth(index));
    const icon = await box(tiles.nth(index).locator("svg"));
    expect(icon.width).toBeLessThan(tile.width);
    expect(Math.abs(icon.x + icon.width / 2 - (tile.x + tile.width / 2))).toBeLessThanOrEqual(1);
    expect(Math.abs(icon.y + icon.height / 2 - (tile.y + tile.height / 2))).toBeLessThanOrEqual(1);
  }

  // Two fixed card heights: three lines with numbers, two without (done, unknown, waiting).
  const leadBox = await box(lead);
  const compactHeights = [];
  for (const title of ["Review pass", "Write the release notes", "Review the API shape"]) {
    const card = cards.filter({ hasText: title });
    await expect(card).toHaveAttribute("data-size", "compact");
    compactHeights.push((await box(card)).height);
  }
  await expect(lead).toHaveAttribute("data-size", "full");
  expect(new Set(compactHeights.map((height) => Math.round(height))).size).toBe(1);
  expect(compactHeights[0]!).toBeLessThan(leadBox.height);

  // The first agent's tree is open, beside the list on a wide board.
  const tree = page.getByRole("region", { name: "Subagents of Ship the search fix" });
  await expect(tree).toBeVisible();
  await expect(lead).toHaveAttribute("aria-expanded", "true");
  const subagents = tree.locator("[data-agent-fleet-subagent]");
  await expect(subagents).toHaveCount(4);
  await expect(tree.locator('[data-agent-fleet-subagent="delegated-task:review-pass"]')).toContainText("Needs you");
  await expect(tree.getByRole("button", { name: "Answer" })).toHaveCount(1);
  await expect(tree.getByRole("button", { name: "Open", exact: true })).toHaveCount(1);
  await expect(tree.locator('[data-agent-fleet-subagent="delegated-task:docs-pass"] [data-status="queued"]')).toHaveCSS("opacity", "0.7");
  // A task line that only repeats the name is left out.
  await expect(tree).not.toContainText("Subagent docs-pass");
  await expect(tree).not.toContainText("Subagent fix-tests");
  const explore = tree.locator('[data-agent-fleet-subagent="subagent:agent:explore"]');
  expect(((await explore.innerText()).match(/Explore the search index/g) ?? []).length).toBe(1);
  for (const card of await tree.locator("[data-agent-fleet-subagent] > [data-size]").all()) {
    await expect(card).toHaveAttribute("data-size", "compact");
  }

  // The tree spans the list's rows, from the first card's top.
  const treeBox = await box(tree);
  expect(treeBox.x).toBeGreaterThanOrEqual(leadBox.x + leadBox.width);
  expect(Math.abs(treeBox.y - (await box(cards.first())).y)).toBeLessThanOrEqual(1);
  // The agents line up under the toolbar's inset (its filter group's start).
  const toolbarStart = await box(page.getByRole("button", { name: "Active", exact: true }).locator(".."));
  expect(Math.abs(leadBox.x - toolbarStart.x)).toBeLessThanOrEqual(1);
  // The tree stops at its reading width; the rest of the row stays empty.
  expect(treeBox.width).toBeLessThanOrEqual((await remPx(page, 42)) + 1);
  const fleetBox = await box(fleet);
  expect(fleetBox.x + fleetBox.width - (treeBox.x + treeBox.width)).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath("fleet-tree-wide.png") });

  // Rows keep the Work queue order: the waiting review leads, then the running lead.
  const first = cards.first();
  await expect(first).toContainText("Review pass");
  await expect(cards.nth(1)).toContainText("Ship the search fix");

  // ↓ moves focus, Enter opens the focused agent and folds the other.
  await first.focus();
  await page.keyboard.press("ArrowDown");
  await expect(lead).toBeFocused();
  await page.keyboard.press("End");
  await expect(cards.nth(3)).toBeFocused();
  await page.keyboard.press("Home");
  await expect(first).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(first).toHaveAttribute("aria-expanded", "true");
  await expect(lead).toHaveAttribute("aria-expanded", "false");
  await expect(tree).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Subagents of Review pass" })).toBeVisible();
  // Enter on the open card folds it; on the lead it reopens the lead's tree.
  await page.keyboard.press("Enter");
  await expect(first).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(tree).toBeVisible();
  await expect(lead).toBeFocused();

  // Tab goes on into the tree; Esc there returns to the card and keeps Fleet open.
  await page.keyboard.press("Tab");
  await expect(tree.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(lead).toBeFocused();
  await expect(fleet).toBeVisible();
  await expect(tree).toBeVisible();

  // An in-turn subagent opens its tasks; Esc closes them back to the subagent.
  const exploreButton = explore.getByRole("button", { name: /Explore/ }).first();
  await exploreButton.click();
  const steps = page.getByRole("dialog", { name: /Tasks of Explore/ });
  await expect(steps).toBeVisible();
  await expect(steps).toContainText("Read src/search.ts");
  await expect(steps).toContainText("Grep for tokenize");
  await page.keyboard.press("Escape");
  await expect(steps).toBeHidden();
  await expect(exploreButton).toBeFocused();
  await expect(fleet).toBeVisible();

  // A status change swaps words inside the card; heights hold and the cards below stay put.
  const secondTitle = "Write the release notes";
  const nextBefore = await box(cards.filter({ hasText: secondTitle }));
  const leadBefore = await box(lead);
  await page.evaluate(async () => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    useAppStore.setState({ activeTurnIdsByTask: {} } as never);
  });
  await expect(lead).toContainText("Done");
  const leadAfter = await box(lead);
  expect(Math.abs(leadAfter.height - leadBefore.height)).toBeLessThanOrEqual(0.5);
  const nextAfter = await box(cards.filter({ hasText: secondTitle }));
  expect(Math.abs(nextAfter.height - nextBefore.height)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(nextAfter.y - nextBefore.y)).toBeLessThanOrEqual(0.5);

  // Narrow: the tree opens under its card instead.
  await page.setViewportSize({ width: 760, height: 960 });
  const narrowLead = cards.filter({ hasText: "Ship the search fix" });
  await expect(tree).toBeVisible();
  const narrowLeadBox = await box(narrowLead);
  const narrowTreeBox = await box(tree);
  expect(narrowTreeBox.y).toBeGreaterThanOrEqual(narrowLeadBox.y + narrowLeadBox.height);
  expect(Math.abs(narrowTreeBox.x - narrowLeadBox.x)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("fleet-tree-narrow.png") });

  // The waiting review's shortcut opens its own task.
  await tree.getByRole("button", { name: "Answer" }).click();
  await expect(fleet).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { useAppStore } = await import("/src/store/app.store.ts");
        return useAppStore.getState().activeWorkspaceId;
      }),
    )
    .toBe("ws-tree-2");

  // Cards stays a choice, and the choice is kept: the old profile moved to the tree only once.
  const layout = await openFleet(page);
  await layout.getByRole("button", { name: "Cards" }).click();
  await expect(layout.getByRole("button", { name: "Cards" })).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("close-fleet-view").click();
  await page.getByTestId("top-bar").getByRole("button", { name: "Open Fleet View" }).click();
  await expect(layout.getByRole("button", { name: "Cards" })).toHaveAttribute("aria-pressed", "true");
  // The saved profile carries the choice and the one-time marker, so reading it
  // again (the next launch) keeps Cards. (A reload would rerun this test's seed.)
  const restored = await page.evaluate(async () => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    const { flushAppStorePersistence } = await import("/src/store/app-store-persistence.ts");
    // Writes are coalesced; write the pending snapshot as quitting would.
    flushAppStorePersistence();
    const saved = JSON.parse(window.localStorage.getItem("stave-store") ?? "{}").state?.settings ?? {};
    await useAppStore.persist.rehydrate();
    return [saved.fleetBoardLayout, saved.fleetTreeDefaultApplied, useAppStore.getState().settings.fleetBoardLayout];
  });
  expect(restored).toEqual(["cards", true, "cards"]);
});

for (const locale of ["en", "ko"] as const) {
  for (const mode of ["light", "dark"] as const) {
    for (const density of ["regular", "compact"] as const) {
      test(`Fleet's Tree layout keeps its geometry: ${locale}/${mode}/${density}`, async ({ page }, testInfo) => {
        await seed(page);
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto("/");
        await startTurn(page);
        await openFleet(page);
        await page.evaluate(async ({ locale, mode, density }) => {
          const { applyAppLocale } = await import("/src/i18n/index.ts");
          const { useAppStore } = await import("/src/store/app.store.ts");
          applyAppLocale(locale);
          useAppStore.getState().setDarkMode({ enabled: mode === "dark" });
          document.documentElement.dataset.uiDensity = density;
          await document.fonts.ready;
        }, { locale, mode, density });
        await expect(page.locator("html")).toHaveAttribute("lang", locale === "ko" ? "ko-KR" : "en-US");
        const fleet = page.locator('[data-agent-fleet="true"]');
        await expect(fleet).toBeVisible();
        expect(await page.locator("html").evaluate((element) => element.classList.contains("dark"))).toBe(mode === "dark");
        const tree = fleet.locator("[data-agent-fleet-tree]");
        await expect(tree).toContainText(locale === "ko" ? "Ship the search fix의 하위 에이전트" : "Subagents of Ship the search fix");

        const cards = fleet.locator("[data-agent-fleet-card]");
        await expect(cards).toHaveCount(4);
        const heights = { compact: new Set<number>(), full: new Set<number>() };
        for (const card of await cards.all()) {
          const size = (await card.getAttribute("data-size")) as "compact" | "full";
          const cardBox = await box(card);
          heights[size].add(Math.round(cardBox.height));
          // Every line of the card fits inside it: nothing clips at either height.
          const contentBottom = await card.evaluate((element) =>
            Math.max(...[...element.children].map((child) => child.getBoundingClientRect().bottom)),
          );
          expect(contentBottom).toBeLessThanOrEqual(cardBox.y + cardBox.height);
          // The name line's avatar and name share a middle.
          const avatar = await box(card.locator("span[aria-hidden='true']").first());
          const name = await box(card.locator("[id$='-name']"));
          expect(Math.abs(avatar.y + avatar.height / 2 - (name.y + name.height / 2))).toBeLessThanOrEqual(1.5);
        }
        expect(heights.compact.size).toBe(1);
        expect(heights.full.size).toBe(1);
        expect([...heights.compact][0]!).toBeLessThan([...heights.full][0]!);

        for (const card of await tree.locator("[data-agent-fleet-subagent] > [data-size]").all()) {
          const cardBox = await box(card);
          const resolve = card.getByRole("button", { name: locale === "ko" ? /답변|열기/ : /Answer|Open/ });
          if ((await resolve.count()) > 0) {
            // The shortcut sits inside the card, centered on its height.
            const button = await box(resolve.first());
            expect(button.y).toBeGreaterThanOrEqual(cardBox.y);
            expect(button.y + button.height).toBeLessThanOrEqual(cardBox.y + cardBox.height);
            expect(Math.abs(button.y + button.height / 2 - (cardBox.y + cardBox.height / 2))).toBeLessThanOrEqual(1);
          }
        }
        await page.screenshot({ path: testInfo.outputPath(`fleet-tree-${locale}-${mode}-${density}.png`) });
      });
    }
  }
}
