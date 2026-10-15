import { expect, test, type Page, type TestInfo } from "@playwright/test";

/**
 * Accounts and API connections, rendered against a seeded bridge: Claude is
 * signed in, Codex is installed but signed out, one extra Claude account and
 * one Vercel AI Gateway connection exist. No key value is ever seeded; the
 * secret list carries metadata only.
 */
const SECRET_ID = "11111111-1111-4111-8111-111111111111";
const CONNECTION_ID = "33333333-3333-4333-8333-333333333333";

type Seed = {
  themeMode: "light" | "dark";
  withRepository: boolean;
  claudeSignedIn: boolean;
  codexInstalled: boolean;
  withConnection: boolean;
  /** Codex's account for new turns is the API connection, with a readable key. */
  codexUsesConnection?: boolean;
  checkStatus?: string;
  /** A built-in theme preset, such as `dracula`. */
  customThemeId?: string;
};

function screenshotPath(testInfo: TestInfo, name: string) {
  const dir = process.env.STAVE_ACCOUNTS_SCREENSHOT_DIR;
  return dir ? `${dir}/${name}.png` : testInfo.outputPath(`${name}.png`);
}

function seedAccounts(page: Page, seed: Seed) {
  page.on("pageerror", (error) => console.log("PAGEERROR", error.message));
  return page.addInitScript(
    (args) => {
      const now = () => new Date().toISOString();
      const connection = {
        id: args.connectionId,
        label: "Company gateway",
        kind: "vercel-ai-gateway",
        secretId: args.secretId,
        endpoints: {
          "claude-code": "https://ai-gateway.vercel.sh/claude-code",
          codex: "https://ai-gateway.vercel.sh/codex/v1",
        },
        models: [
          { id: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5", contextWindow: 1_000_000, inputPrice: "0.000002", outputPrice: "0.00001" },
          { id: "moonshotai/kimi-k3", name: "Kimi K3", contextWindow: 1_000_000, inputPrice: "0.000003", outputPrice: "0.000015" },
        ],
      };
      const connections = args.seed.withConnection ? [connection] : [];
      const savedSecrets: Array<Record<string, string>> = [];
      const tool = (id: "claude" | "codex") => {
        const installed = id === "claude" || args.seed.codexInstalled;
        const signedIn = id === "claude" ? args.seed.claudeSignedIn : false;
        return {
          id,
          label: id === "claude" ? "Claude Code" : "Codex",
          state: installed ? (signedIn ? "ready" : "warning") : "error",
          available: installed,
          version: installed ? "1.0.0" : null,
          executablePath: installed ? `/tmp/fixture/${id}` : null,
          authState: installed ? (signedIn ? "authenticated" : "unauthenticated") : "unknown",
          authDetail: null,
          summary: installed ? (signedIn ? "Ready." : "Not signed in.") : "Not found.",
          detail: "",
          checkedAt: now(),
        };
      };
      const profiles = [
        { id: "system-default", providerId: "claude-code", label: "System default", kind: "system" },
        { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", providerId: "claude-code", label: "Work", kind: "managed", configDirectory: "/tmp/fixture/claude-work" },
        { id: "system-default", providerId: "codex", label: "System default", kind: "system" },
        ...connections.flatMap((entry) =>
          (["claude-code", "codex"] as const).map((providerId) => ({
            id: entry.id,
            providerId,
            label: entry.label,
            kind: "managed",
            gateway: { baseUrl: entry.endpoints[providerId], secretId: entry.secretId, models: entry.models.map((model) => model.id) },
            apiConnection: { label: entry.label, kind: entry.kind, models: entry.models },
          })),
        ),
      ];
      const signedIn = (providerId: string, profileId: string) =>
        providerId === "claude-code" && profileId === "system-default" && args.seed.claudeSignedIn;
      (window as unknown as { api?: Record<string, unknown> }).api = {
        platform: "darwin",
        provider: {
          streamTurn: async () => [],
          checkAvailability: async ({ providerId }: { providerId: string }) => {
            if (providerId !== "claude-code" && providerId !== "codex") {
              // OpenCode is installed and manages its own sign-in; Cursor and Kiro are not installed.
              const installed = providerId === "opencode";
              const status = {
                id: providerId, label: providerId === "opencode" ? "OpenCode" : providerId === "cursor" ? "Cursor Agent" : "Kiro CLI",
                state: installed ? "ready" : "error", available: installed, version: installed ? "1.19.0" : null,
                executablePath: installed ? "/tmp/fixture/opencode" : null, authState: installed ? "not-required" : "unknown",
                authDetail: null, summary: installed ? "Ready." : "Not found.", detail: "", checkedAt: now(),
              };
              return { ok: true, providerId, available: installed, toolingStatus: status, detail: status.summary };
            }
            const status = tool(providerId === "claude-code" ? "claude" : "codex");
            const viaConnection = providerId === "codex" && args.seed.codexUsesConnection;
            return { ok: true, providerId, available: viaConnection ? status.available : status.authState === "authenticated", toolingStatus: status, detail: status.summary };
          },
          getCodexModelCatalog: async () => ({ ok: true, models: [], detail: "" }),
          getModelCatalog: async ({ providerId }: { providerId: string }) => ({ providerId, ok: true, detail: "fixture", models: [] }),
        },
        tooling: {
          getStatus: async () => ({ checkedAt: now(), workspace: null, tools: [tool("claude"), tool("codex")] }),
        },
        terminal: { runCommand: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
        providerAccounts: {
          list: async () => ({ ok: true, profiles }),
          identity: async ({ providerId, profileId }: { providerId: string; profileId: string }) => ({
            ok: true,
            identity: signedIn(providerId, profileId)
              ? { state: "signed-in", email: "dev@example.com", plan: "Max", checkedAt: Date.now() }
              : { state: "signed-out", checkedAt: Date.now() },
          }),
          create: async () => ({ ok: false, message: "Fixture: saving is disabled." }),
          rename: async () => ({ ok: false, message: "Fixture: saving is disabled." }),
          remove: async () => ({ ok: false, message: "Fixture: removing is disabled." }),
          login: async () => ({ ok: false, message: "Fixture: sign-in is disabled." }),
          checkGateway: async () => ({ ok: true, message: "Fixture." }),
          setupStatus: async () => ({ ok: true, setup: { enabled: true, settingsMode: "copy", entries: [{ name: "skills", label: "skills", action: "link", state: "shared" }] } }),
          shareSetup: async () => ({ ok: true, setup: { enabled: true, entries: [] } }),
        },
        apiConnections: {
          list: async () => ({ ok: true, connections }),
          create: async () => ({ ok: false, message: "Fixture: saving is disabled." }),
          update: async () => ({ ok: false, message: "Fixture: saving is disabled." }),
          remove: async () => ({ ok: false, message: "Fixture: removing is disabled." }),
          check: async () => ({ ok: false, status: args.seed.checkStatus ?? "certificate-untrusted", missingModels: [], message: "fixture main message" }),
          discoverModels: async () => ({
            ok: true,
            models: [
              { id: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5", contextWindow: 1_000_000, inputPrice: "0.000002", outputPrice: "0.00001", tags: ["tool-use"] },
              { id: "openai/gpt-6-astra", name: "GPT-6 Astra", contextWindow: 1_050_000, inputPrice: "0.00001", outputPrice: "0.00005", tags: ["tool-use"] },
              { id: "moonshotai/kimi-k3", name: "Kimi K3", contextWindow: 1_000_000, inputPrice: "0.000003", outputPrice: "0.000015", tags: ["tool-use"] },
              { id: "zai/glm-5.3", name: "GLM 5.3", contextWindow: 1_000_000, inputPrice: "0.0000014", outputPrice: "0.0000044", tags: ["tool-use"] },
            ],
          }),
        },
        secrets: {
          list: async () => ({
            ok: true,
            secrets: [{ id: args.secretId, name: "Vercel AI Gateway", description: "", valuePreview: "…f3a1", createdAt: now(), updatedAt: now() }, ...savedSecrets],
          }),
          // Records only that a save happened and the value's length, never the value.
          upsert: async (input: { name: string; value?: string }) => {
            const store = window as unknown as { __secretSaves?: Array<{ name: string; valueLength: number }> };
            store.__secretSaves = [...(store.__secretSaves ?? []), { name: input.name, valueLength: input.value?.length ?? 0 }];
            const secret = { id: "22222222-2222-4222-8222-222222222222", name: input.name, description: "", valuePreview: "…", createdAt: now(), updatedAt: now() };
            savedSecrets.push(secret);
            return { ok: true, secret };
          },
        },
      };
      const workspaceSnapshot = {
        activeTaskId: "task-accounts",
        openTaskTabIds: ["task-accounts"],
        activeSurface: { kind: "task", taskId: "task-accounts" },
        tasks: [
          { id: "task-accounts", title: "Accounts", provider: "claude-code", updatedAt: "2026-10-15T00:00:00.000Z", unread: false, archivedAt: null },
        ],
        messagesByTask: { "task-accounts": [] },
      };
      if (args.seed.withRepository) {
        window.localStorage.setItem(
          "stave:workspace-fallback:v1",
          JSON.stringify([{ id: "ws-main", name: "main", updatedAt: "2026-10-15T00:00:00.000Z", snapshot: workspaceSnapshot }]),
        );
      }
      window.localStorage.setItem(
        "stave-store",
        JSON.stringify({
          state: {
            ...(args.seed.withRepository
              ? {
                  repositoryPath: "/tmp/stave-project",
                  repositoryName: "stave-project",
                  workspaces: [{ id: "ws-main", name: "main", updatedAt: "2026-10-15T00:00:00.000Z" }],
                  activeWorkspaceId: "ws-main",
                  workspaceBranchById: { "ws-main": "main" },
                  workspacePathById: { "ws-main": "/tmp/stave-project" },
                  workspaceDefaultById: { "ws-main": true },
                  ...workspaceSnapshot,
                }
              : {}),
            providerAvailability: { "claude-code": args.seed.claudeSignedIn, codex: false, cursor: false, kiro: false, opencode: false },
            draftProvider: "claude-code",
            settings: {
              themeMode: args.seed.themeMode,
              language: "en",
              ...(args.seed.codexUsesConnection ? { codexAccountProfileId: args.connectionId } : {}),
              ...(args.seed.customThemeId ? { customThemeId: args.seed.customThemeId } : {}),
            },
          },
          version: 0,
        }),
      );
    },
    { seed, secretId: SECRET_ID, connectionId: CONNECTION_ID },
  );
}

async function openSettingsSection(page: Page, section: string) {
  await page.getByRole("button", { name: "Open settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("button", { name: section, exact: true }).click();
  return settings;
}

const READY: Omit<Seed, "themeMode"> = { withRepository: true, claudeSignedIn: true, codexInstalled: true, withConnection: true };

for (const themeMode of ["light", "dark"] as const) {
  test(`Settings > Accounts shows getting started, billing, accounts and connections (${themeMode})`, async ({ page }, testInfo) => {
    await seedAccounts(page, { themeMode, ...READY });
    await page.setViewportSize({ width: 1440, height: 3200 });
    await page.goto("/");
    await expect(page.getByRole("button", { name: /^Model:/ })).toBeVisible({ timeout: 20_000 });
    const settings = await openSettingsSection(page, "Accounts");
    await expect(settings.getByRole("heading", { name: "Getting started" })).toBeVisible();
    // Every step is done, so the checklist folds to one line until asked.
    await expect(settings.getByText("Setup is complete. Ready to take turns: Claude Code.")).toBeVisible();
    await settings.getByRole("button", { name: "Show steps" }).click();
    const steps = settings.getByRole("list", { name: "Getting started" });
    await expect(steps.locator('[data-step="install"]')).toHaveAttribute("data-status", "done");
    await expect(steps.locator('[data-step="signIn"]')).toHaveAttribute("data-status", "done");
    await expect(steps.locator('[data-step="accounts"]')).toHaveAttribute("data-status", "done");
    await expect(steps.locator('[data-step="gateway"]')).toHaveAttribute("data-status", "done");
    await expect(settings.getByRole("heading", { name: "Choose how you pay" })).toBeVisible();
    await expect(settings.getByRole("heading", { name: "Claude accounts" })).toBeVisible();
    await expect(settings.getByRole("heading", { name: "Codex accounts" })).toBeVisible();
    await expect(settings.getByRole("heading", { name: "API connections" })).toBeVisible();
    await expect(settings.getByText("Company gateway").first()).toBeVisible({ timeout: 20_000 });
    await expect(settings.locator('[data-cli-provider="opencode"]')).toContainText("Managed in CLI");
    await expect(settings.locator('[data-cli-provider="cursor"]')).toContainText("CLI not installed");
    await page.screenshot({ path: screenshotPath(testInfo, `settings-accounts-${themeMode}`) });

    await settings.getByRole("button", { name: "Tooling", exact: true }).click();
    await expect(settings.getByText("Accounts and API connections moved to Settings > Accounts.")).toBeVisible();
    await expect(settings.getByText("Company gateway")).toHaveCount(0);
    await page.screenshot({ path: screenshotPath(testInfo, `settings-tooling-${themeMode}`) });
    await settings.getByRole("button", { name: "Open Accounts" }).click();
    await expect(settings.getByRole("heading", { name: "Getting started" })).toBeVisible();
  });

  test(`the model selector links account setup and the composer says why it cannot send (${themeMode})`, async ({ page }, testInfo) => {
    await seedAccounts(page, { themeMode, ...READY, claudeSignedIn: false });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    const shelfLine = page.getByTestId("composer-shelf-account");
    await expect(shelfLine).toBeVisible({ timeout: 20_000 });
    await expect(shelfLine).toHaveAttribute("data-kind", "signed-out");
    await expect(shelfLine).toContainText("Claude Code is not signed in on System default.");
    await page.screenshot({ path: screenshotPath(testInfo, `composer-${themeMode}`) });

    await page.getByRole("button", { name: /^Model:/ }).click();
    const selector = page.getByRole("dialog", { name: "Model and effort selector" });
    await expect(selector).toBeVisible();
    const foot = selector.getByTestId("model-picker-accounts");
    await expect(foot.locator('[data-provider="codex"]')).toContainText("Codex is not signed in on System default.");
    await expect(foot.getByRole("button", { name: "Manage accounts and connections…" })).toBeVisible();
    await page.waitForTimeout(500);
    await page.screenshot({ path: screenshotPath(testInfo, `model-selector-${themeMode}`) });
    await foot.getByRole("button", { name: "Manage accounts and connections…" }).click();
    await expect(page.getByRole("dialog", { name: "Settings" }).getByRole("heading", { name: "Getting started" })).toBeVisible();
  });

  test(`welcome shows Getting started while no provider can take a turn (${themeMode})`, async ({ page }, testInfo) => {
    await seedAccounts(page, { themeMode, withRepository: false, claudeSignedIn: false, codexInstalled: false, withConnection: false });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const card = page.getByTestId("welcome-getting-started");
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card).toContainText("1. Install the Claude Code or Codex CLI");
    await expect(page.getByText("Stave uses the Claude and Codex sign-ins on this computer.")).toHaveCount(0);
    await page.screenshot({ path: screenshotPath(testInfo, `welcome-${themeMode}`) });
    await card.getByRole("button", { name: "Open Accounts" }).click();
    const settings = page.getByRole("dialog", { name: "Settings" });
    const steps = settings.getByRole("list", { name: "Getting started" });
    await expect(steps.locator('[data-step="install"]')).toHaveAttribute("data-status", "done");
    await expect(steps.locator('[data-step="signIn"]')).toHaveAttribute("data-status", "todo");
    await expect(steps.getByText("The sign-in terminal runs in a workspace. Open a repository first.")).toBeVisible();
    await page.screenshot({ path: screenshotPath(testInfo, `settings-getting-started-${themeMode}`) });
  });
}

test("a pasted key is saved to Secrets and chosen, and never stays in the page", async ({ page }) => {
  await seedAccounts(page, { themeMode: "light", ...READY });
  await page.setViewportSize({ width: 1440, height: 2400 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Model:/ })).toBeVisible({ timeout: 20_000 });
  const settings = await openSettingsSection(page, "Accounts");
  const form = settings.locator("#settings-field-api-connection-new");
  await form.getByRole("button", { name: "Paste a new key" }).click();
  await expect(form.getByLabel("Key name in Secrets")).toHaveValue("Vercel AI Gateway 2");
  const value = form.getByLabel("Key", { exact: true });
  await value.fill("fixture-gateway-key-value");
  await form.getByRole("button", { name: "Save key" }).click();
  await expect(form.getByRole("button", { name: "Save key" })).toHaveCount(0);
  await expect(form.getByRole("combobox", { name: "API key from Secrets" })).toContainText("Vercel AI Gateway 2");
  await expect(form.locator('[data-step="key"]')).toHaveAttribute("data-done", "true");
  const saves = await page.evaluate(() => (window as unknown as { __secretSaves?: unknown[] }).__secretSaves);
  expect(saves).toEqual([{ name: "Vercel AI Gateway 2", valueLength: "fixture-gateway-key-value".length }]);
  const html = await page.content();
  expect(html).not.toContain("fixture-gateway-key-value");
});

test("deep links land on their target: search, a connection's edit form, a failed check's cause", async ({ page }) => {
  await seedAccounts(page, { themeMode: "light", ...READY, checkStatus: "certificate-untrusted" });
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Model:/ })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Open settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("textbox", { name: "Search settings" }).first().fill("API connection");
  await settings.getByRole("button", { name: /API connections/ }).first().click();
  await expect(settings.locator("#settings-field-api-connections")).toBeFocused();
  await page.keyboard.press("Escape");

  await page.evaluate((id) => window.dispatchEvent(new CustomEvent("stave:open-settings", { detail: { section: "accounts", focus: `api-connection:${id}` } })), CONNECTION_ID);
  const row = page.getByRole("dialog", { name: "Settings" }).locator(`#settings-field-api-connection-${CONNECTION_ID}`);
  await expect(row.getByRole("button", { name: "Save changes" })).toBeVisible();
  await row.getByRole("button", { name: "Cancel" }).click();
  await row.getByRole("button", { name: "Check connection" }).click();
  await expect(row.getByRole("status")).toContainText("certificate is not trusted on this network");
  await expect(row.getByRole("status")).not.toContainText("fixture main message");
});

test("the command palette opens the new connection form", async ({ page }) => {
  await seedAccounts(page, { themeMode: "light", ...READY });
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Model:/ })).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press("Control+Shift+P");
  const palette = page.getByRole("dialog", { name: "Command Palette" });
  await palette.getByPlaceholder("Find a command, task, workspace, or setting…").fill("Add an API connection");
  await palette.getByText("Add an API connection", { exact: true }).click();
  const form = page.getByRole("dialog", { name: "Settings" }).locator("#settings-field-api-connection-new");
  await expect(form.getByRole("combobox", { name: "Gateway" })).toBeFocused();
});

for (const themeMode of ["light", "dark"] as const) {
  test(`an API connection's group in the model selector opens its edit form (${themeMode})`, async ({ page }, testInfo) => {
    await seedAccounts(page, { themeMode, ...READY, codexUsesConnection: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await page.getByRole("button", { name: /^Model:/ }).click();
    const selector = page.getByRole("dialog", { name: "Model and effort selector" });
    const codexTab = selector.getByRole("tablist", { name: "Model provider" }).getByRole("tab", { name: /^Codex, \d+ models?$/ });
    await expect(codexTab).toBeVisible({ timeout: 20_000 });
    await codexTab.click();
    await expect(selector.getByText("Company gateway · API billing")).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: screenshotPath(testInfo, `model-selector-connection-${themeMode}`) });
    await selector.getByRole("button", { name: "Edit models" }).click();
    const row = page.getByRole("dialog", { name: "Settings" }).locator(`#settings-field-api-connection-${CONNECTION_ID}`);
    await expect(row.getByRole("button", { name: "Save changes" })).toBeVisible();
    await expect(row.getByLabel("Name")).toBeFocused();
  });
}

test("Pick a model closes Settings and opens the composer's model selector", async ({ page }) => {
  await seedAccounts(page, { themeMode: "light", ...READY, withConnection: false });
  await page.setViewportSize({ width: 1440, height: 1600 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Model:/ })).toBeVisible({ timeout: 20_000 });
  const settings = await openSettingsSection(page, "Accounts");
  await expect(settings.locator('[data-billing-choice="subscription"]')).toContainText("In use");
  await expect(settings.locator('[data-billing-choice="gateway"]')).not.toContainText("In use");
  await settings.getByRole("button", { name: "Open the model selector" }).click();
  await expect(settings).toBeHidden();
  await expect(page.getByRole("dialog", { name: "Model and effort selector" })).toBeVisible();
});

for (const [customThemeId, themeMode] of [["dracula", "dark"], ["catppuccin-latte", "light"]] as const) {
  test(`built-in theme ${customThemeId}: Accounts and the composer line use theme tokens`, async ({ page }, testInfo) => {
    await seedAccounts(page, { themeMode, ...READY, claudeSignedIn: false, customThemeId });
    await page.setViewportSize({ width: 1440, height: 1800 });
    await page.goto("/");
    await expect(page.getByTestId("composer-shelf-account")).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: screenshotPath(testInfo, `composer-${customThemeId}`) });
    await openSettingsSection(page, "Accounts");
    await page.screenshot({ path: screenshotPath(testInfo, `settings-accounts-${customThemeId}`) });
  });
}
