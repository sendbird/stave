import { expect, test, type Page } from "@playwright/test";

async function openWorkspaces(page: Page, locale: "en" | "ko") {
  await page.addInitScript((locale) => {
    const repositoryPath = "/tmp/stave-project";
    const updatedAt = "2026-11-22T00:00:00.000Z";
    const workspaces = [
      { id: "ws-alpha", name: "alpha", updatedAt },
      { id: "ws-beta", name: "beta", updatedAt },
    ];
    const tasks = workspaces.map(({ name }) => ({
      id: `${name}-task`,
      title: `${name} task`,
      provider: "claude-code",
      updatedAt,
      unread: false,
    }));
    const question = {
      id: "question-message",
      role: "assistant",
      model: "claude-sonnet-4-5",
      providerId: "claude-code",
      content: "",
      turnId: "turn-question",
      isStreaming: true,
      parts: [{
        type: "user_input",
        requestId: "layout-question",
        toolName: "AskUserQuestion",
        state: "input-requested",
        questions: [1, 2, 3, 4].map((step) => ({
          key: `step-${step}`,
          header: `Step ${step}`,
          question: locale === "ko" ? "복원한 작업의 설정을 어떻게 적용할까요?" : "How should the settings be applied to the restored task?",
          options: ["keep", "change", "review"].map((label) => ({
            label,
            description: (locale === "ko" ? "세부 설정은 사용자가 확인한 뒤 적용합니다. " : "Apply the detailed settings after the user confirms the selected settings. ").repeat(2),
          })),
        })),
      }],
    };
    const alphaPanel = "task:alpha-task";
    const lensPanel = "lens:default";
    const dockLayout = {
      grid: {
        width: 1200,
        height: 800,
        orientation: "HORIZONTAL",
        root: {
          type: "branch",
          size: 800,
          data: [{
            type: "leaf",
            size: 1200,
            data: { id: "1", views: [alphaPanel, lensPanel], activeView: alphaPanel },
          }],
        },
      },
      panels: {
        [alphaPanel]: { id: alphaPanel, contentComponent: "task", title: "alpha task" },
        [lensPanel]: { id: lensPanel, contentComponent: "lens", title: "about:blank", renderer: "always" },
      },
      activeGroup: "1",
    };
    localStorage.setItem("stave:workspace-fallback:v1", JSON.stringify(workspaces.map((workspace, index) => ({
      ...workspace,
      snapshot: {
        activeTaskId: tasks[index]!.id,
        tasks: [tasks[index]],
        ...(index === 0 ? { dockLayout, lensTabs: [{ id: "default", createdAt: 0 }] } : {}),
        messagesByTask: { [tasks[index]!.id]: index === 0 ? [
          ...Array.from({ length: 12 }, (_, index) => ({
            id: `history-${index}`,
            role: "assistant",
            model: question.model,
            providerId: question.providerId,
            content: `Earlier status ${index}`,
            parts: [{ type: "text", text: `Earlier status ${index}. `.repeat(24) }],
          })),
          question,
        ] : [] },
      },
    }))));
    localStorage.setItem("stave-store", JSON.stringify({
      state: {
        repositoryPath,
        repositoryName: "stave-project",
        workspaces,
        activeWorkspaceId: "ws-alpha",
        settings: { language: locale, themeMode: locale === "en" ? "light" : "dark", uiDensity: locale === "en" ? "regular" : "compact" },
        workspaceBranchById: { "ws-alpha": "main", "ws-beta": "beta" },
        workspacePathById: { "ws-alpha": repositoryPath, "ws-beta": `${repositoryPath}/.stave/workspaces/beta` },
        workspaceDefaultById: { "ws-alpha": true, "ws-beta": false },
      },
      version: 0,
    }));
  }, locale);
  await page.goto("/");
  await expect(page.getByTestId("user-input-composer")).toBeVisible();
}

for (const locale of ["en", "ko"] as const) {
  test(`returning to a workspace keeps the clarification dock at the bottom (${locale})`, async ({ page }) => {
    await page.setViewportSize({ width: locale === "en" ? 1440 : 1050, height: locale === "en" ? 900 : 500 });
    await openWorkspaces(page, locale);
    const alpha = page.getByRole("button", { name: /Open workspace Default|워크스페이스 (기본|alpha) 열기/ });
    const beta = page.getByRole("button", { name: /Open workspace beta|beta.*워크스페이스|워크스페이스.*beta/ });
    const card = page.getByTestId("user-input-composer");
    const pane = page.getByTestId("workspace-pane-host");
    const transcript = page.getByTestId("conversation-scroll-alpha-task");
    await page.evaluate(() => document.fonts.ready);

    const expectDockAtBottom = async (bottomInset: number) => {
      // The main column stays put when its inner wrapper scrolls the entire
      // pane. Compare against that fixed edge, not another element in the pane.
      await expect.poll(() => card.evaluate((node, inset) => {
        const host = node.closest<HTMLElement>('[data-testid="workspace-pane-host"]')!;
        const main = host.closest("main")!;
        const mainBox = main.getBoundingClientRect();
        const hostBox = host.getBoundingClientRect();
        return Math.max(
          Math.abs(hostBox.top - mainBox.top),
          Math.abs(hostBox.bottom - mainBox.bottom),
          Math.abs(mainBox.bottom - node.getBoundingClientRect().bottom - inset),
          // Unpositioned, hidden keep-alive content must not extend the
          // scroll range of the app shell that contains the pane.
          main.firstElementChild!.scrollHeight - main.firstElementChild!.clientHeight,
        );
      }, bottomInset)).toBeLessThanOrEqual(1);
    };
    const bottomInset = await card.evaluate((node) => {
      const dock = node.closest<HTMLElement>("[data-toast-avoid]")!.parentElement!;
      return Number.parseFloat(getComputedStyle(dock).paddingBottom);
    });

    await beta.click();
    await expect(card).toHaveCount(0);
    // This is the same workspace transition used by a "Respond in
    // conversation" action. It focuses the pending request after restoration.
    await page.evaluate(async () => {
      const { useAppStore } = await import("/src/store/app.store.ts");
      await useAppStore.getState().focusTaskAttention({ taskId: "alpha-task", workspaceId: "ws-alpha" });
    });
    await expect(card).toBeVisible();
    await expect(pane.locator('[data-pane-tab-chip="lens:default"]')).toBeVisible();
    await expectDockAtBottom(bottomInset);

    // A regular sidebar round trip must also leave scrolling with the
    // transcript. The question stays visible while reading older messages.
    await beta.click();
    await expect(card).toHaveCount(0);
    await alpha.click();
    await expect(card).toBeVisible();
    await expectDockAtBottom(bottomInset);
    await expect.poll(() => transcript.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    // The floating jump-to-latest control can cover the transcript center in
    // a short pane. Wheel over the upper-left portion of the message viewport.
    const scrollBox = (await transcript.boundingBox())!;
    await page.mouse.move(scrollBox.x + scrollBox.width / 4, scrollBox.y + scrollBox.height / 4);
    await page.mouse.wheel(0, -100_000);
    await expect.poll(() => transcript.evaluate((node) => node.scrollTop)).toBe(0);
    await expectDockAtBottom(bottomInset);
  });
}
