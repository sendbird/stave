import { expect, test } from "@playwright/test";

for (const locale of ["en", "ko"] as const) {
  for (const mode of ["light", "dark"] as const) {
    for (const density of ["regular", "compact"] as const) {
      test(`inline results stay readable: ${locale}/${mode}/${density}`, async ({ page }) => {
        await page.goto("/?stavePreview=agent-messages");
        await page.getByRole("button", { name: "Streaming", exact: true }).click();
        if (mode === "light") await page.getByRole("button", { name: "Dark", exact: true }).click();
        await page.evaluate(async ({ locale, density }) => {
          const { applyAppLocale } = await import("/src/i18n/index.ts");
          applyAppLocale(locale);
          document.documentElement.dataset.uiDensity = density;
          await document.fonts.ready;
        }, { locale, density });
        const region = page.getByTestId("message-subagents");
        const row = region.getByTestId("exchange-row").first();
        await expect(region).toBeVisible();
        await expect(row).toContainText("4 call sites across 2 files.");
        const history = page.getByRole("button", { name: locale === "ko" ? "작업 이력 12초" : "Work history 12s", exact: true });
        await expect(history).toHaveAttribute("aria-expanded", "false");
        for (const width of [1100, 390]) {
          await page.setViewportSize({ width, height: 900 });
          const box = await row.boundingBox();
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width).toBeLessThanOrEqual(width);
          // The preview wraps in its text column; neither text nor identity escapes its row.
          const overflow = await row.evaluate((element) => {
            const box = element.getBoundingClientRect();
            return Math.max(0, ...Array.from(element.querySelectorAll("button, span, svg")).map((child) => {
              const rect = child.getBoundingClientRect();
              return rect.width > 0 ? rect.right - box.right : 0;
            }));
          });
          expect(overflow).toBeLessThanOrEqual(1);
          const geometry = await row.evaluate(async (element) => {
            const { vars } = await import("/src/components/ads/tokens/tokens.stylex.ts");
            const button = element.querySelector("button")!;
            const head = button.firstElementChild!;
            const probe = document.createElement("div");
            probe.style.paddingLeft = vars["--ads-space-12"];
            probe.style.gap = vars["--ads-space-8"];
            button.append(probe);
            const expectedPadding = parseFloat(getComputedStyle(probe).paddingLeft);
            const expectedGap = parseFloat(getComputedStyle(probe).gap);
            probe.remove();
            const mark = head.children[0].getBoundingClientRect();
            const identity = head.children[1].getBoundingClientRect();
            return Math.max(Math.abs(parseFloat(getComputedStyle(button).paddingLeft) - expectedPadding),
              Math.abs(identity.left - mark.right - expectedGap));
          });
          expect(geometry).toBeLessThanOrEqual(0.5);
          const trigger = row.getByRole("button").first();
          await trigger.focus();
          await page.keyboard.press("Enter");
          await expect(trigger).toHaveAttribute("aria-expanded", "true");
          await expect(row.getByTestId("exchange-detail")).toBeVisible();
          await page.keyboard.press("Enter");
          await expect(trigger).toHaveAttribute("aria-expanded", "false");
        }
        expect(await page.evaluate(() => [...document.fonts].filter((font) => font.status === "error").map((font) => font.family))).toEqual([]);
      });
    }
  }
}

test("one ledger subscription links a child question to its task and updates its result", async ({ page }) => {
  await page.goto("/?stavePreview=agent-messages");
  await expect(page.getByRole("heading", { name: "Agent trace preview" })).toBeVisible();
  await page.evaluate(async () => {
    const resources = performance.getEntriesByType("resource");
    const moduleUrl = (name: string) => resources.find((entry) => new URL(entry.name).pathname.endsWith(`/deps/${name}.js`))!.name;
    const React = (await import(moduleUrl("react"))).default;
    const { createRoot } = (await import(moduleUrl("react-dom_client"))).default;
    const { AssistantMessageBody } = await import("/src/components/session/message/assistant-trace.tsx");
    const { TranscriptDelegationsProvider } = await import("/src/components/session/message/transcript-delegations-context.tsx");
    const { StaveDesignProvider } = await import("/src/components/system/StaveDesignProvider.tsx");
    const { useAppStore } = await import("/src/store/app.store.ts");
    const child = {
      runId: "run-1", stepId: "step-1", parentTaskId: "parent", delegationKey: "review",
      delegatedTaskId: "child", delegatedWorkspaceId: "workspace", delegatedTurnId: "child-turn",
      providerId: "codex", requestedModel: "gpt-6.1-sol", requestedEffort: "high", lifecycle: "one-turn",
      phase: "running", reason: null, attempt: 0, createdAt: new Date(Date.now() - 84_000).toISOString(),
      updatedAt: "2026-01-01T00:00:00.000Z", completedAt: null,
    };
    let calls = 0;
    let change: (event: { parentTaskId: string }) => void;
    window.api.runs = {
      listDelegatedTasks: async () => { document.body.dataset.listCalls = String(++calls); return [child]; },
      onDelegatedTasksChanged: (callback: typeof change) => { change = callback; return () => {}; },
    } as typeof window.api.runs;
    useAppStore.setState({
      notifications: [{ id: "question", kind: "task.user_input_requested", taskId: "child", resolvedAt: null }] as never,
      focusTaskAttention: async (args) => { document.body.dataset.openedChild = args.taskId; },
      tasks: [{ id: "child" }] as never,
    });
    document.getElementById("root")!.style.display = "none";
    const host = document.createElement("div");
    host.id = "results-harness";
    host.style.cssText = "max-width:760px;padding:24px";
    document.body.append(host);
    const message = {
      role: "assistant", providerId: "codex", turnId: "parent-turn", content: "", parts: [{
        type: "tool_use", toolName: "stave_delegate_task", toolUseId: "call", state: "output-available",
        input: JSON.stringify({ title: "Security review", prompt: "Review the redirect guard" }),
        output: JSON.stringify({ delegation: { accepted: true, child } }),
      }],
    };
    createRoot(host).render(React.createElement(StaveDesignProvider, null,
      React.createElement(TranscriptDelegationsProvider, { taskId: "parent" },
        React.createElement(AssistantMessageBody, { message, taskId: "parent", messageId: "m1", streamingEnabled: false }),
        React.createElement(AssistantMessageBody, { message: { ...message, parts: [{ type: "text", text: "Another message" }] }, taskId: "parent", messageId: "m2", streamingEnabled: false }),
      )));
    const settle = document.createElement("button");
    settle.textContent = "Fixture: return result";
    settle.onclick = () => {
      Object.assign(child, { phase: "completed", result: "The redirect needs a guard.", completedAt: "2026-01-01T00:01:00.000Z" });
      change({ parentTaskId: "parent" });
    };
    document.body.append(settle);
    const fail = document.createElement("button");
    fail.textContent = "Fixture: fail child";
    fail.onclick = () => {
      Object.assign(child, { phase: "failed", reason: "Permission check failed", completedAt: new Date().toISOString() });
      change({ parentTaskId: "parent" });
    };
    document.body.append(fail);
  });
  const region = page.locator("#results-harness").getByTestId("message-subagents");
  await expect(region).toHaveCount(1);
  await expect(region).toContainText(/needs you/i);
  const liveRow = region.getByTestId("exchange-row");
  await expect(liveRow.locator('[data-motion="moving"]')).toHaveCount(0);
  for (const width of [360, 1200]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => document.fonts.ready);
    expect(await liveRow.evaluate((el) => el.getBoundingClientRect().right <= innerWidth)).toBe(true);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("body")).toHaveAttribute("data-list-calls", "1");
  await region.getByRole("button", { name: "Answer in the subagent task" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-opened-child", "child");
  await page.getByRole("button", { name: "Fixture: return result" }).click();
  await expect(region).toContainText("The redirect needs a guard.");
  await expect(region.getByRole("button", { name: "Answer in the subagent task" })).toHaveCount(0);
  await expect(liveRow.locator('[data-motion="moving"]')).toHaveCount(0);
  await liveRow.getByRole("button").first().click();
  await expect(liveRow.getByTestId("exchange-detail")).toBeVisible();
  await page.getByRole("button", { name: "Fixture: fail child" }).click();
  await expect(liveRow).toHaveAttribute("data-exchange-status", "failed");
  await expect(liveRow).toContainText("Permission check failed");
  await expect(liveRow).not.toContainText("Result returned by the subagent");
});
