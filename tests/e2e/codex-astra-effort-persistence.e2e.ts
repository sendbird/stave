import { expect, test } from "@playwright/test";

/**
 * Regression: switching between Codex GPT models resets effort to low.
 *
 * Boots a pre-migration snapshot (no `settingsModelMigrationVersion`) that is
 * already pinned to `gpt-6-astra` at a deliberately chosen effort, with an App
 * Server catalog that recommends "low" for Astra — the exact combination that
 * made the one-time model-default migration overwrite the user's choice.
 */
const CODEX_MODELS = [
  {
    id: "gpt-6-astra",
    model: "gpt-6-astra",
    displayName: "GPT-6-Astra",
    description: "",
    hidden: false,
    isDefault: true,
    // The installed binary recommending "low" is what the migration used to
    // adopt on behalf of the user.
    defaultReasoningEffort: "low",
    supportedReasoningEfforts: [
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra",
    ].map((reasoningEffort) => ({ reasoningEffort, description: "" })),
  },
  {
    id: "gpt-5.6-sol",
    model: "gpt-5.6-sol",
    displayName: "GPT-5.6-Sol",
    description: "",
    hidden: false,
    isDefault: false,
    defaultReasoningEffort: "high",
    supportedReasoningEfforts: [
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra",
    ].map((reasoningEffort) => ({ reasoningEffort, description: "" })),
  },
];

function seedPreMigrationAstra(page: import("@playwright/test").Page) {
  return page.addInitScript((models) => {
    const toSupportedEfforts = (entries: readonly unknown[]) =>
      entries
        .map((entry: any) =>
          typeof entry === "string"
            ? entry
            : typeof entry?.reasoningEffort === "string"
              ? entry.reasoningEffort
              : "",
        )
        .filter(Boolean);

    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: {
        streamTurn: async () => [],
        getCodexModelCatalog: async () => ({
          ok: true,
          detail: "fixture",
          models,
        }),
        getModelCatalog: async ({ providerId }: { providerId: string }) => ({
          providerId,
          ok: true,
          detail: "fixture",
          models:
            providerId === "codex"
              ? models.map((entry) => ({
                  model: entry.model,
                  displayName: entry.displayName,
                  description: "",
                  hidden: false,
                  isDefault: entry.isDefault,
                  defaultEffort: entry.defaultReasoningEffort,
                  supportedEfforts: toSupportedEfforts(
                    entry.supportedReasoningEfforts,
                  ),
                }))
              : [],
        }),
      },
    };

    const snapshot = {
      activeTaskId: "task-astra",
      openTaskTabIds: ["task-astra"],
      activeSurface: { kind: "task", taskId: "task-astra" },
      tasks: [
        {
          id: "task-astra",
          title: "Astra effort",
          provider: "codex",
          updatedAt: "2026-09-07T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { "task-astra": [] },
    };

    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: "ws-main",
          name: "main",
          updatedAt: "2026-09-07T00:00:00.000Z",
          snapshot,
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
            { id: "ws-main", name: "main", updatedAt: "2026-09-07T00:00:00.000Z" },
          ],
          activeWorkspaceId: "ws-main",
          workspaceBranchById: { "ws-main": "main" },
          workspacePathById: { "ws-main": "/tmp/stave-project" },
          workspaceDefaultById: { "ws-main": true },
          draftProvider: "codex",
          settings: {
            autoRoutingEnabled: false,
            modelCodex: "gpt-6-astra",
            codexReasoningEffort: "medium",
            // Deliberately absent: this is a snapshot written before the
            // one-time model-default migration existed.
          },
          ...snapshot,
        },
        version: 0,
      }),
    );
  }, CODEX_MODELS);
}

test("keeps a chosen Astra effort across a restart", async ({ page }) => {
  await seedPreMigrationAstra(page);
  await page.setViewportSize({ width: 1500, height: 950 });
  await page.goto("/");

  const trigger = page.getByRole("button", { name: /^Model:/ });
  await expect(trigger).toHaveAttribute(
    "aria-label",
    /GPT-6-Astra\. Effort: Medium/,
  );

  // The migration only ever runs against a pre-migration snapshot, so the
  // reload is what proves the stored choice survived it.
  await page.reload();
  await expect(page.getByRole("button", { name: /^Model:/ })).toHaveAttribute(
    "aria-label",
    /GPT-6-Astra\. Effort: Medium/,
  );
});

test("Astra offers every effort the catalog reports", async ({ page }) => {
  await seedPreMigrationAstra(page);
  await page.setViewportSize({ width: 1500, height: 950 });
  await page.goto("/");

  const trigger = page.getByRole("button", { name: /^Model:/ });
  await expect(trigger).toBeVisible();
  await trigger.click();

  const selector = page.getByRole("dialog", {
    name: "Model and effort selector",
  });
  await expect(selector).toBeVisible();

  // Ultra is the tier the dropped `supportedReasoningEfforts` mapping used to
  // make unverifiable; it must be a real, selectable cell.
  const ultra = page.getByRole("gridcell", {
    name: /GPT-6-Astra, Ultra effort/i,
  });
  await expect(ultra).toBeVisible();
  await ultra.click();

  await expect(selector).toBeHidden();
  await expect(trigger).toHaveAttribute(
    "aria-label",
    /GPT-6-Astra\. Effort: Ultra/,
  );
});

/**
 * The live symptom: reaching Astra by a path that carries no explicit effort
 * and has no stored per-model preference. The seeded Alt+1..0 slots have no
 * effort configured, so `updateModelRuntimePreference` is never called and the
 * composer falls through to the derived value on every render. That fallback
 * used to adopt Astra's runtime default ("low" here), discarding the tuned
 * effort the user was carrying.
 */
test("switching between Codex GPT models keeps a tuned effort", async ({
  page,
}) => {
  await seedPreMigrationAstra(page);
  // Start on Sol at a deliberately tuned effort, with no Astra preference
  // stored, then reach Astra through the effort-less Alt+4 shortcut.
  await page.addInitScript(() => {
    const raw = window.localStorage.getItem("stave-store");
    if (!raw) return;
    const parsed = JSON.parse(raw);
    parsed.state.settings.modelCodex = "gpt-5.6-sol";
    parsed.state.settings.codexReasoningEffort = "ultra";
    parsed.state.settings.modelRuntimePreferences = {};
    window.localStorage.setItem("stave-store", JSON.stringify(parsed));
  });
  await page.setViewportSize({ width: 1500, height: 950 });
  await page.goto("/");

  const trigger = page.getByRole("button", { name: /^Model:/ });
  await expect(trigger).toHaveAttribute(
    "aria-label",
    /GPT-5\.6-Sol\. Effort: Ultra/,
  );

  await page.keyboard.press("Alt+4");
  await expect(trigger).toHaveAttribute("aria-label", /GPT-6-Astra/);
  await expect(trigger).toHaveAttribute(
    "aria-label",
    /GPT-6-Astra\. Effort: Ultra/,
  );
});
