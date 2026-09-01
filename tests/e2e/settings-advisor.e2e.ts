import { expect, test, type Page } from "@playwright/test";

const SEED_KEY = "stave:e2e:advisor-settings-seeded";

function seedAdvisorSettings(page: Page) {
  return page.addInitScript((seedKey) => {
    if (!window.sessionStorage.getItem(seedKey)) {
      const workspaceSnapshot = {
        activeTaskId: "task-advisor",
        openTaskTabIds: ["task-advisor"],
        activeSurface: { kind: "task", taskId: "task-advisor" },
        tasks: [
          {
            id: "task-advisor",
            title: "Advisor settings",
            provider: "codex",
            updatedAt: "2026-07-26T00:00:00.000Z",
            unread: false,
            archivedAt: null,
          },
        ],
        messagesByTask: { "task-advisor": [] },
      };
      window.localStorage.setItem(
        "stave:workspace-fallback:v1",
        JSON.stringify([
          {
            id: "ws-main",
            name: "main",
            updatedAt: "2026-07-26T00:00:00.000Z",
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
                updatedAt: "2026-07-26T00:00:00.000Z",
              },
            ],
            activeWorkspaceId: "ws-main",
            workspaceBranchById: { "ws-main": "main" },
            workspacePathById: { "ws-main": "/tmp/stave-project" },
            workspaceDefaultById: { "ws-main": true },
            settings: {
              autoRoutingEnabled: true,
              advisorEnabled: false,
              advisorTarget: null,
            },
            ...workspaceSnapshot,
          },
          version: 0,
        }),
      );
      window.sessionStorage.setItem(seedKey, "true");
    }

    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: {
        streamTurn: async () => [],
        getCodexModelCatalog: async () => ({
          ok: true,
          detail: "Loaded test Codex catalog.",
          models: [
            {
              id: "gpt-6-preview",
              model: "gpt-6-preview",
              displayName: "GPT-6 Preview",
              description: "Dynamic test model",
              hidden: false,
              isDefault: false,
              supportsPersonality: false,
              defaultReasoningEffort: "high",
              supportedReasoningEfforts: ["medium", "high"],
              inputModalities: ["text"],
              additionalSpeedTiers: [],
              upgrade: null,
              upgradeInfo: null,
              availabilityNux: null,
            },
          ],
        }),
      },
    };
  }, SEED_KEY);
}

test("Advisor settings configure per-provider defaults while off, then arm", async ({
  page,
}, testInfo) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await seedAdvisorSettings(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.getByRole("button", { name: "open-settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  const search = settings.getByRole("textbox", { name: "Search settings" });

  await search.fill("fable");
  await settings
    .getByRole("button", { name: "Advisor Providers", exact: true })
    .click();

  const advisorCard = settings.locator("#settings-field-advisor");
  await expect(advisorCard).toBeFocused();
  await expect(
    settings.locator("main > header").getByRole("heading", {
      name: "Providers",
    }),
  ).toBeVisible();

  // Off by default, and the provider/model/effort rows are still editable:
  // configuring the Advisor must not require paying for one first.
  const armSwitch = advisorCard.getByRole("switch", {
    name: "Arm an Advisor by default",
  });
  await expect(armSwitch).toHaveAttribute("aria-checked", "false");
  await expect(
    advisorCard.getByText("Default off", { exact: true }),
  ).toBeVisible();
  await expect(advisorCard).toContainText("Advisor off");

  const providerChoices = advisorCard.getByRole("radiogroup", {
    name: "Advisor Provider",
  });
  const claudeChoice = providerChoices.getByRole("radio", { name: /^Claude/ });
  const codexChoice = providerChoices.getByRole("radio", { name: /^Codex/ });
  // The turn runs on Codex, so the card opens on the provider that could
  // actually give a second opinion.
  await expect(claudeChoice).toHaveAttribute("aria-checked", "true");

  const modelSelector = () =>
    advisorCard.getByRole("button", { name: /^Advisor model:/ });
  await expect(modelSelector()).toHaveAccessibleName(
    "Advisor model: Claude Sonnet 5",
  );
  await modelSelector().click();
  let modelPicker = page.getByRole("dialog", { name: "Select model" });
  await modelPicker.getByPlaceholder("Search model").fill("Fable");
  await modelPicker.getByRole("option", { name: /Claude Fable 5/ }).click();
  await expect(modelSelector()).toHaveAccessibleName(
    "Advisor model: Claude Fable 5.1",
  );

  await codexChoice.click();
  await modelSelector().click();
  modelPicker = page.getByRole("dialog", { name: "Select model" });
  await modelPicker.getByPlaceholder("Search model").fill("GPT-6 Preview");
  await modelPicker.getByRole("option", { name: /GPT-6 Preview/ }).click();
  await expect(modelPicker).toBeHidden();
  await expect(modelSelector()).toHaveAccessibleName(
    "Advisor model: GPT-6 Preview",
  );

  // Switching back must restore Claude's own pick rather than the catalog
  // default: each provider remembers its own model and tier.
  await claudeChoice.click();
  await expect(modelSelector()).toHaveAccessibleName(
    "Advisor model: Claude Fable 5.1",
  );
  await codexChoice.click();

  await armSwitch.click();
  await expect(armSwitch).toHaveAttribute("aria-checked", "true");
  await expect(advisorCard).toContainText(
    "Active pair: Codex · GPT-5.6 Terra → Codex Advisor · GPT-6 Preview",
  );
  await expect(
    advisorCard.getByText("Default on", { exact: true }),
  ).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const persisted = JSON.parse(
          window.localStorage.getItem("stave-store") ?? "{}",
        ) as {
          state?: {
            settings?: {
              advisorEnabled?: boolean;
              advisorTarget?: { providerId: string; model: string } | null;
              advisorTargetByProvider?: Record<string, { model: string }>;
            };
          };
        };
        return {
          enabled: persisted.state?.settings?.advisorEnabled,
          target: persisted.state?.settings?.advisorTarget,
          byProvider: persisted.state?.settings?.advisorTargetByProvider,
        };
      }),
    )
    .toEqual({
      enabled: true,
      target: { providerId: "codex", model: "gpt-6-preview" },
      byProvider: {
        "claude-code": { model: "claude-fable-5-1" },
        codex: { model: "gpt-6-preview" },
      },
    });

  // Let the switch's colour transition settle so the capture shows the armed
  // state rather than a frame mid-animation.
  await page.waitForTimeout(400);
  await page.screenshot({
    path: testInfo.outputPath("settings-advisor.png"),
    fullPage: true,
  });

  await settings.getByRole("button", { name: "back-to-app" }).click();
  await page.reload();
  await page.getByRole("button", { name: "open-settings" }).click();

  const reloadedSettings = page.getByRole("dialog", { name: "Settings" });
  await reloadedSettings
    .getByRole("textbox", { name: "Search settings" })
    .fill("codex advisor");
  await reloadedSettings
    .getByRole("button", { name: "Advisor Providers", exact: true })
    .click();
  const reloadedAdvisorCard = reloadedSettings.locator(
    "#settings-field-advisor",
  );
  await expect(reloadedAdvisorCard).toContainText(
    "Codex Advisor · GPT-6 Preview",
  );
  await expect(
    reloadedAdvisorCard.getByText("Default on", { exact: true }),
  ).toBeVisible();
  // The other provider's default survives a reload too, so a pre-configured
  // Claude Advisor is still one click away.
  await reloadedAdvisorCard
    .getByRole("radiogroup", { name: "Advisor Provider" })
    .getByRole("radio", { name: /^Claude/ })
    .click();
  await expect(
    reloadedAdvisorCard.getByRole("button", { name: /^Advisor model:/ }),
  ).toHaveAccessibleName("Advisor model: Claude Fable 5.1");
  expect(pageErrors.map((error) => error.message)).toEqual([]);
});
