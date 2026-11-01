import { expect, test, type Page } from "@playwright/test";

const OPENCODE_TOOL = {
  id: "opencode",
  label: "OpenCode",
  state: "ready",
  available: true,
  version: "1.19.0",
  executablePath: "/tmp/fixture/opencode",
  authState: "not-required",
  authDetail:
    "OpenCode manages provider authentication. Connect a provider in OpenCode: run `opencode auth login`.",
  summary: "OpenCode is ready.",
  detail: "Resolved path: /tmp/fixture/opencode\nOpenCode is ready.",
};

const OPENCODE_MODELS = [
  ["opencode", "opencode/big-pickle", "Big Pickle", []],
  ["opencode", "opencode/cat-jam-free", "Cat Jam Free", ["low", "medium", "high", "xhigh", "max"]],
  ["vercel", "vercel/zai/glm-5.3", "GLM 5.3", ["high"]],
  ["vercel", "vercel/deepseek/deepseek-v4", "DeepSeek V4", []],
  ["vercel", "vercel/google/gemini-3-pro", "Gemini 3 Pro", ["low", "high"]],
] as const;

function seedOpenCodeWorkspace(page: Page, themeMode: "light" | "dark") {
  return page.addInitScript(
    (seed) => {
      const tool = seed.tool;
      const checkedAt = () => new Date().toISOString();
      (window as unknown as { api?: Record<string, unknown> }).api = {
        provider: {
          streamTurn: async () => [],
          checkAvailability: async ({ providerId }: { providerId: string }) =>
            providerId === "opencode"
              ? {
                  ok: true,
                  available: true,
                  detail: "Ready",
                  toolingStatus: { ...tool, checkedAt: checkedAt() },
                }
              : { ok: true, available: providerId === "claude-code" },
          getCodexModelCatalog: async () => ({ ok: true, models: [], detail: "" }),
          getModelCatalog: async ({ providerId }: { providerId: string }) => ({
            providerId,
            ok: true,
            detail: "fixture catalog",
            models:
              providerId === "opencode"
                ? seed.models.map(([group, model, displayName, efforts]) => ({
                    model,
                    displayName,
                    description: model,
                    hidden: false,
                    isDefault: false,
                    defaultEffort: null,
                    supportedEfforts: [...efforts],
                    group,
                  }))
                : [],
          }),
        },
        tooling: {
          getStatus: async () => ({
            checkedAt: checkedAt(),
            workspace: null,
            tools: [{ ...tool, checkedAt: checkedAt() }],
          }),
        },
        terminal: {
          runCommand: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
        },
      };
      const workspaceSnapshot = {
        activeTaskId: "task-opencode",
        openTaskTabIds: ["task-opencode"],
        activeSurface: { kind: "task", taskId: "task-opencode" },
        tasks: [
          {
            id: "task-opencode",
            title: "OpenCode provider",
            provider: "opencode",
            updatedAt: "2026-10-14T00:00:00.000Z",
            unread: false,
            archivedAt: null,
          },
        ],
        messagesByTask: { "task-opencode": [] },
      };
      window.localStorage.setItem(
        "stave:workspace-fallback:v1",
        JSON.stringify([
          {
            id: "ws-main",
            name: "main",
            updatedAt: "2026-10-14T00:00:00.000Z",
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
              { id: "ws-main", name: "main", updatedAt: "2026-10-14T00:00:00.000Z" },
            ],
            activeWorkspaceId: "ws-main",
            workspaceBranchById: { "ws-main": "main" },
            workspacePathById: { "ws-main": "/tmp/stave-project" },
            workspaceDefaultById: { "ws-main": true },
            providerAvailability: {
              "claude-code": true,
              codex: false,
              cursor: false,
              kiro: false,
              opencode: true,
            },
            draftProvider: "opencode",
            settings: { themeMode: seed.themeMode, language: "en" },
            ...workspaceSnapshot,
          },
          version: 0,
        }),
      );
    },
    { tool: OPENCODE_TOOL, models: OPENCODE_MODELS, themeMode },
  );
}

for (const themeMode of ["light", "dark"] as const) {
  test(`shows OpenCode models grouped by provider and searchable (${themeMode})`, async ({
    page,
  }, testInfo) => {
    await seedOpenCodeWorkspace(page, themeMode);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    await page.getByRole("button", { name: /^Model:/ }).click();
    const selector = page.getByRole("dialog", { name: "Model and effort selector" });
    await expect(selector).toBeVisible();
    const openCodeTab = selector
      .getByRole("tablist", { name: "Model provider" })
      .getByRole("tab", { name: /^OpenCode, \d+ models$/ });
    await expect(openCodeTab).toBeVisible({ timeout: 20_000 });
    await openCodeTab.click();
    await expect(openCodeTab).toHaveAttribute("aria-selected", "true");

    for (const name of ["Big Pickle", "GLM 5.3", "Gemini 3 Pro"]) {
      await expect(selector.getByText(name, { exact: true }).first()).toBeVisible();
    }
    // Only the levels a model's variants include are offered.
    await expect(
      selector.getByRole("gridcell", { name: "GLM 5.3, High effort" }),
    ).toBeVisible();
    await expect(
      selector.getByRole("gridcell", { name: "GLM 5.3, Low effort" }),
    ).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(`opencode-selector-${themeMode}.png`),
      fullPage: true,
    });

    const search = page.getByRole("textbox", { name: "Search models" });
    await search.hover();
    await search.fill("deepseek");
    await expect(selector.getByText("DeepSeek V4", { exact: true }).first()).toBeVisible();
    await expect(selector.getByText("Big Pickle", { exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(selector).toBeHidden();

    await page.getByRole("button", { name: "Open settings" }).click();
    const settings = page.getByRole("dialog", { name: "Settings" });
    await settings.getByRole("button", { name: "Providers" }).click();
    await settings
      .getByRole("tablist")
      .last()
      .getByRole("tab", { name: "OpenCode", exact: true })
      .click();
    await expect(
      settings.getByRole("heading", { name: "OpenCode Runtime Controls" }),
    ).toBeVisible();
    const approval = settings.getByRole("radiogroup", { name: /Approval Preset/ });
    await expect(approval.getByRole("radio", { name: /^Manual/ })).toBeVisible();
    await expect(approval.getByRole("radio", { name: /^Auto/ })).toBeVisible();
    await expect(approval.getByRole("radio", { name: /^Guided/ })).toHaveCount(0);
    await expect(settings.getByPlaceholder("opencode")).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`opencode-settings-provider-${themeMode}.png`),
      fullPage: true,
    });

    await settings.getByRole("button", { name: "Accounts", exact: true }).click();
    await settings.getByRole("tab", { name: "Tooling" }).click();
    await expect(settings.getByText("OpenCode is ready.").first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(settings.getByRole("button", { name: /Copy login command/i })).toBeVisible();
    await expect(settings.getByText("Managed in CLI").first()).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`opencode-settings-tooling-${themeMode}.png`),
      fullPage: true,
    });
  });
}
