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
            settings: { autoRoutingEnabled: true, advisorTarget: null },
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

test("Advisor settings support search, provider models, and persistence", async ({
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

  // Exact: the card now also holds an "Advisor Effort" radiogroup, and
  // Playwright's accessible-name matching is a substring match by default.
  const advisorChoices = settings.getByRole("radiogroup", {
    name: "Advisor",
    exact: true,
  });
  const offChoice = advisorChoices.getByRole("radio", { name: /^Off/ });
  const claudeChoice = advisorChoices.getByRole("radio", { name: /^Claude/ });
  const codexChoice = advisorChoices.getByRole("radio", { name: /^Codex/ });
  await expect(offChoice).toHaveAttribute("aria-checked", "true");

  await offChoice.focus();
  await offChoice.press("ArrowRight");
  await expect(claudeChoice).toHaveAttribute("aria-checked", "true");

  let modelSelector = settings.getByRole("button", {
    name: /^Advisor model:/,
  });
  await expect(modelSelector).toHaveAccessibleName(
    "Advisor model: Claude Sonnet 5",
  );
  await modelSelector.click();
  let modelPicker = page.getByRole("dialog", { name: "Select model" });
  await modelPicker.getByPlaceholder("Search model").fill("Fable");
  await modelPicker.getByRole("option", { name: /Claude Fable 5/ }).click();
  await expect(advisorCard).toContainText("Claude Advisor · Claude Fable 5");

  await codexChoice.click();
  modelSelector = settings.getByRole("button", {
    name: /^Advisor model:/,
  });
  await modelSelector.click();
  modelPicker = page.getByRole("dialog", { name: "Select model" });
  await modelPicker.getByPlaceholder("Search model").fill("GPT-6 Preview");
  await modelPicker.getByRole("option", { name: /GPT-6 Preview/ }).click();
  await expect(modelPicker).toBeHidden();
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
              advisorTarget?: { providerId: string; model: string } | null;
            };
          };
        };
        return persisted.state?.settings?.advisorTarget;
      }),
    )
    .toEqual({ providerId: "codex", model: "gpt-6-preview" });

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
  expect(pageErrors.map((error) => error.message)).toEqual([]);
});
