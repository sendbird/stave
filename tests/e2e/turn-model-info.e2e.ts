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
          projectPath: "/tmp/stave-project",
          projectName: "stave-project",
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
      name: "Claude Opus 4.8 (1M) · X-High",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "GPT-5.6 Terra · Ultra · Fast",
    }),
  ).toBeVisible();

  const usageDetails = page.getByRole("button", {
    name: "Turn usage details: 120 input tokens, 18 output tokens, 2 delegated executions",
  });
  await usageDetails.focus();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toContainText("Turn total");
  await expect(tooltip).toContainText("Delegated breakdown");
  await expect(tooltip).toContainText("Included in the turn total above.");
  await expect(tooltip).toContainText(/Cache read\s*64 tokens/);
  await expect(tooltip).toContainText("Session resumed");
  await expect(tooltip).toContainText(
    "This provider did not report delegated token usage.",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await usageDetails.focus();
  const tooltipBox = await tooltip.boundingBox();
  expect(tooltipBox).not.toBeNull();
  expect(tooltipBox?.x).toBeGreaterThanOrEqual(0);
  expect((tooltipBox?.x ?? 0) + (tooltipBox?.width ?? 0)).toBeLessThanOrEqual(
    390,
  );

  await page.screenshot({
    path: testInfo.outputPath("turn-model-info.png"),
    fullPage: true,
  });
});
