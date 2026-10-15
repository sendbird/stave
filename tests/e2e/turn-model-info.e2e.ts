import { expect, test } from "@playwright/test";

test("shows each turn's model, effort, context, and fast mode", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: {
        streamTurn: async () => [],
        getCodexModelCatalog: async () => ({
          ok: true,
          models: [],
          detail: "",
        }),
      },
    };
    const workspaceSnapshot = {
      activeTaskId: "task-turn-model-info",
      openTaskTabIds: ["task-turn-model-info"],
      activeSurface: { kind: "task", taskId: "task-turn-model-info" },
      tasks: [
        {
          id: "task-turn-model-info",
          title: "Turn model info",
          provider: "codex",
          updatedAt: "2026-07-24T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: {
        "task-turn-model-info": [
          {
            id: "task-turn-model-info-m-1",
            role: "assistant",
            providerId: "claude-code",
            model: "claude-opus-4-8[1m]",
            modelInfo: {
              effort: "xhigh",
              fastMode: false,
            },
            content: "Claude response",
            completedAt: "2026-07-24T00:00:01.000Z",
            parts: [{ type: "text", text: "Claude response" }],
          },
          {
            id: "task-turn-model-info-m-2",
            role: "assistant",
            providerId: "codex",
            model: "gpt-5.6-terra",
            modelInfo: {
              effort: "ultra",
              fastMode: true,
            },
            usage: {
              inputTokens: 120,
              outputTokens: 18,
              cacheReadTokens: 90,
              totalCostUsd: 0.012,
            },
            delegatedUsage: [
              {
                executionId: "advisor-1",
                role: "advisor",
                providerId: "codex",
                model: "gpt-5.6-terra",
                inputTokens: 80,
                outputTokens: 12,
                cacheReadTokens: 64,
                sessionReused: true,
              },
              {
                executionId: "worker-1",
                role: "worker",
                providerId: "cursor",
                model: "cursor-fixture-model",
                sessionReused: false,
              },
            ],
            content: "Codex response",
            completedAt: "2026-07-24T00:00:02.000Z",
            parts: [{ type: "text", text: "Codex response" }],
          },
          {
            id: "task-turn-model-info-m-3",
            role: "assistant",
            providerId: "cursor",
            model: "cursor-fixture-model",
            usage: {
              inputTokens: 34,
              outputTokens: 21,
              cacheReadTokens: 13,
              cacheCreationTokens: 5,
              thoughtTokens: 7,
              contextUsedTokens: 233,
              contextWindowTokens: 2048,
              contextCostAmount: 0.003,
              contextCostCurrency: "USD",
            },
            content: "Cursor response",
            completedAt: "2026-07-24T00:00:03.000Z",
            parts: [{ type: "text", text: "Cursor response" }],
          },
          {
            id: "task-turn-model-info-m-4",
            role: "assistant",
            providerId: "kiro",
            model: "kiro-fixture-model",
            usage: {
              inputTokens: 21,
              outputTokens: 13,
              cacheReadTokens: 8,
              cacheCreationTokens: 3,
              thoughtTokens: 5,
              contextUsedTokens: 144,
              contextWindowTokens: 1024,
              contextCostAmount: 0.002,
              contextCostCurrency: "USD",
            },
            content: "Kiro response",
            completedAt: "2026-07-24T00:00:04.000Z",
            parts: [{ type: "text", text: "Kiro response" }],
          },
          {
            // Real Cursor model ids carry their configuration in brackets, and
            // this catalog is not primed, so the chip must humanize the base id
            // rather than print the raw notation.
            id: "task-turn-model-info-m-5",
            role: "assistant",
            providerId: "cursor",
            model: "auto-smart[optimize_for=balanced]",
            content: "Cursor auto response",
            completedAt: "2026-07-24T00:00:05.000Z",
            parts: [{ type: "text", text: "Cursor auto response" }],
          },
          {
            id: "task-turn-model-info-m-6",
            role: "assistant",
            providerId: "cursor",
            model:
              "claude-opus-5[thinking=true,context=300k,effort=high,fast=false]",
            content: "Cursor opus response",
            completedAt: "2026-07-24T00:00:06.000Z",
            parts: [{ type: "text", text: "Cursor opus response" }],
          },
        ],
      },
    };
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: "ws-main",
          name: "main",
          updatedAt: "2026-07-24T00:00:00.000Z",
          snapshot: workspaceSnapshot,
        },
      ]),
    );
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          repositoryPath: "/tmp/stave-project",
          repositoryName: "stave-project",
          workspaces: [
            {
              id: "ws-main",
              name: "main",
              updatedAt: "2026-07-24T00:00:00.000Z",
            },
          ],
          activeWorkspaceId: "ws-main",
          workspaceBranchById: { "ws-main": "main" },
          workspacePathById: { "ws-main": "/tmp/stave-project" },
          workspaceDefaultById: { "ws-main": true },
          settings: {
            claudeEffort: "low",
            codexReasoningEffort: "medium",
            codexFastMode: false,
          },
          ...workspaceSnapshot,
        },
        version: 0,
      }),
    );
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(
    page.getByRole("button", {
      name: "Claude Opus 4.8 · 1M · X-High",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "GPT-5.6 Terra · Ultra · Fast",
    }),
  ).toBeVisible();

  // Bracket notation must never reach the screen, and each parameter becomes
  // its own mark beside the model name.
  const autoChip = page
    .locator('[data-turn-model-chip="true"]')
    .filter({ hasText: "Auto Smart" });
  await expect(autoChip).toBeVisible();
  await expect(autoChip).toContainText("Balanced");
  await expect(autoChip).not.toContainText("[");
  await expect(autoChip).not.toContainText("optimize_for");

  const opusChip = page
    .locator('[data-turn-model-chip="true"]')
    .filter({ hasText: "Claude Opus 5" })
    .first();
  await expect(opusChip.locator("[data-turn-model-detail]")).toHaveText([
    "300K",
    "Thinking",
    "High",
  ]);
  await expect(opusChip).not.toContainText("fast=false");

  const usageDetails = page.getByRole("button", {
    name: "Turn usage details for Codex · gpt-5.6-terra: 120 input tokens, 18 output tokens, 2 delegated executions",
  });
  await usageDetails.focus();
  const tooltip = page.getByRole("tooltip", { name: /Turn total Codex/ });
  await expect(tooltip).toContainText("Turn total");
  await expect(tooltip).toContainText("Delegated breakdown");
  await expect(tooltip).toContainText("Included in the turn total above.");
  await expect(tooltip).toContainText(/Cache read\s*64 tokens/);
  await expect(tooltip).toContainText("Session resumed");
  await expect(tooltip).toContainText(
    "This provider did not report delegated token usage.",
  );

  const cursorUsageDetails = page.getByRole("button", {
    name: "Turn usage details for Cursor · cursor-fixture-model: 34 input tokens, 21 output tokens",
  });
  await expect(cursorUsageDetails).toContainText("$0.0030");
  await cursorUsageDetails.focus();
  const cursorTooltip = page.getByRole("tooltip", {
    name: /Turn total Cursor/,
  });
  await expect(cursorTooltip).toContainText("Cursor · cursor-fixture-model");
  await expect(cursorTooltip).toContainText(/Cache write\s*5 tokens/);
  await expect(cursorTooltip).toContainText(/Context\s*233 \/ 2,048/);
  await expect(cursorTooltip).toContainText(/Session cost\s*\$0\.0030/);

  const kiroUsageDetails = page.getByRole("button", {
    name: "Turn usage details for Kiro · kiro-fixture-model: 21 input tokens, 13 output tokens",
  });
  await expect(kiroUsageDetails).toContainText("$0.0020");
  await kiroUsageDetails.focus();
  const kiroTooltip = page.getByRole("tooltip", { name: /Turn total Kiro/ });
  await expect(kiroTooltip).toContainText("Kiro · kiro-fixture-model");
  await expect(kiroTooltip).toContainText(/Cache read\s*8 tokens/);
  await expect(kiroTooltip).toContainText(/Context\s*144 \/ 1,024/);
  await expect(kiroTooltip).toContainText(/Session cost\s*\$0\.0020/);

  await page.setViewportSize({ width: 390, height: 844 });
  await kiroUsageDetails.focus();
  await expect(kiroTooltip).not.toHaveAttribute("data-starting-style", "");
  await expect
    .poll(() => kiroTooltip.evaluate((element) => getComputedStyle(element).opacity))
    .toBe("1");
  const tooltipBox = await kiroTooltip.boundingBox();
  expect(tooltipBox).not.toBeNull();
  expect(tooltipBox?.x).toBeGreaterThanOrEqual(0);
  expect((tooltipBox?.x ?? 0) + (tooltipBox?.width ?? 0)).toBeLessThanOrEqual(
    390,
  );

  await page.screenshot({
    path: testInfo.outputPath("turn-model-info.png"),
  });
});

test("names the account each turn ran on", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const workId = "0b4f7b52-5d0f-4a51-9c39-6d2f0b9e4a11";
    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: {
        streamTurn: async () => [],
        getCodexModelCatalog: async () => ({ ok: true, models: [], detail: "" }),
      },
      providerAccounts: {
        list: async () => ({
          ok: true,
          profiles: [
            { id: "system-default", providerId: "claude-code", label: "System default", kind: "system" },
            { id: workId, providerId: "claude-code", label: "Work", kind: "managed" },
            { id: "system-default", providerId: "codex", label: "System default", kind: "system" },
          ],
        }),
        identity: async (args: { providerId: string; profileId: string }) => ({
          ok: true,
          identity:
            args.profileId === workId
              ? { state: "signed-in", email: "work@example.com", plan: "Max", checkedAt: 1 }
              : { state: "signed-in", email: "me@example.com", plan: "Plus", checkedAt: 1 },
        }),
      },
    };
    const message = (id: string, extra: Record<string, unknown>) => ({
      id,
      role: "assistant",
      content: id,
      completedAt: "2026-07-24T00:00:01.000Z",
      parts: [{ type: "text", text: id }],
      ...extra,
    });
    const workspaceSnapshot = {
      activeTaskId: "task-turn-account",
      openTaskTabIds: ["task-turn-account"],
      activeSurface: { kind: "task", taskId: "task-turn-account" },
      tasks: [
        {
          id: "task-turn-account",
          title: "Turn account",
          provider: "claude-code",
          updatedAt: "2026-07-24T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: {
        "task-turn-account": [
          message("Work account response", {
            providerId: "claude-code",
            model: "claude-opus-4-8[1m]",
            modelInfo: { effort: "xhigh", fastMode: false },
            nativeAccountProfileId: workId,
            nativeProviderSessionId: "claude-session-1",
            nativeProviderTurnId: "claude-turn-1",
          }),
          message("System account response", {
            providerId: "claude-code",
            model: "claude-opus-4-8[1m]",
            modelInfo: { effort: "high", fastMode: false },
            nativeProviderSessionId: "claude-session-2",
            nativeProviderTurnId: "claude-turn-2",
          }),
          message("Codex single account response", {
            providerId: "codex",
            model: "gpt-5.6-terra",
            modelInfo: { effort: "medium", fastMode: false },
            nativeProviderSessionId: "codex-thread-1",
            nativeProviderTurnId: "codex-turn-1",
          }),
        ],
      },
    };
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        { id: "ws-main", name: "main", updatedAt: "2026-07-24T00:00:00.000Z", snapshot: workspaceSnapshot },
      ]),
    );
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          repositoryPath: "/tmp/stave-project",
          repositoryName: "stave-project",
          workspaces: [{ id: "ws-main", name: "main", updatedAt: "2026-07-24T00:00:00.000Z" }],
          activeWorkspaceId: "ws-main",
          workspaceBranchById: { "ws-main": "main" },
          workspacePathById: { "ws-main": "/tmp/stave-project" },
          workspaceDefaultById: { "ws-main": true },
          ...workspaceSnapshot,
        },
        version: 0,
      }),
    );
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  // Claude has two accounts, so each turn names its account inline.
  const workTurn = page.getByRole("button", {
    name: "Claude Opus 4.8 · 1M · X-High · Account: Work",
  });
  await expect(workTurn).toBeVisible();
  await expect(workTurn.locator("[data-turn-model-account]")).toHaveText("Work");
  const systemTurn = page.getByRole("button", {
    name: "Claude Opus 4.8 · 1M · High · Account: System default",
  });
  await expect(systemTurn.locator("[data-turn-model-account]")).toHaveText(
    "System default",
  );

  // Codex has one account: the row stays quiet and the tooltip names it.
  const codexTurn = page.getByRole("button", {
    name: "GPT-5.6 Terra · Medium · Account: System default",
  });
  await expect(codexTurn).toBeVisible();
  await expect(codexTurn.locator("[data-turn-model-account]")).toHaveCount(0);

  await workTurn.hover();
  const workTooltip = page
    .locator('[data-slot="tooltip-content"]')
    .filter({ hasText: "Account: Work" });
  await expect(workTooltip).toContainText("Claude Opus 4.8 · 1M · X-High");
  await expect(workTooltip).toContainText("work@example.com · Max");
  await page.screenshot({ path: testInfo.outputPath("turn-account-work.png") });

  await codexTurn.hover();
  const codexTooltip = page
    .locator('[data-slot="tooltip-content"]')
    .filter({ hasText: "GPT-5.6 Terra · Medium" });
  await expect(codexTooltip).toContainText("Account: System default");
  await expect(codexTooltip).toContainText("me@example.com · Plus");
  await page.screenshot({ path: testInfo.outputPath("turn-account-codex.png") });
});
