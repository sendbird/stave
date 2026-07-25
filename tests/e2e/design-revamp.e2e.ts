import { expect, test, type Page } from "@playwright/test";

type SeedOptions = {
  compareRun?: boolean;
  compareHistory?: boolean;
};

async function seedDesignShell(page: Page, options: SeedOptions = {}) {
  await page.addInitScript(
    ({ compareRun, compareHistory }) => {
      const compareRunId = "compare-design";
      const includeCompareRun = compareRun || compareHistory;
      const workspaceSnapshot = {
        activeTaskId: "task-design",
        openTaskTabIds: ["task-design"],
        activeSurface: compareRun
          ? { kind: "compare-run", compareRunId }
          : { kind: "task", taskId: "task-design" },
        activeCompareRunId: compareRun ? compareRunId : null,
        compareRunsById: includeCompareRun
          ? {
              [compareRunId]: {
                id: compareRunId,
                seedPrompt:
                  "Audit the navigation hierarchy and propose the strongest implementation.",
                baseWorkspaceId: "ws-main",
                baseBranch: "main",
                createdAt: "2026-07-24T00:00:00.000Z",
                updatedAt: "2026-07-24T00:03:00.000Z",
                status: "completed",
                reviewCriteria: [
                  "Correctness",
                  "Tests and verification",
                  "Maintainability",
                ],
                judge: {
                  provider: "codex",
                  model: "gpt-5.6-sol",
                  status: "completed",
                  attempt: 1,
                  completedAt: "2026-07-24T00:03:00.000Z",
                  judgment: {
                    recommendedVariantId: "variant-codex",
                    confidence: "high",
                    rationale:
                      "Codex preserves the navigation contract and adds focused regression coverage.",
                    provenance: {
                      rubricVersion: "1",
                      judgeProvider: "codex",
                      judgeModel: "gpt-5.6-sol",
                      attempt: 1,
                    },
                    candidateScores: [
                      {
                        variantId: "variant-claude",
                        score: 7.8,
                        summary: "Clear implementation with lighter coverage.",
                        strengths: ["Focused diff"],
                        risks: ["Missing one navigation regression"],
                        criteria: [
                          {
                            criterion: "Correctness",
                            score: 8.2,
                            rationale: "The primary navigation path works.",
                          },
                          {
                            criterion: "Tests and verification",
                            score: 7.1,
                            rationale: "Coverage misses one edge case.",
                          },
                          {
                            criterion: "Maintainability",
                            score: 8.1,
                            rationale: "The change remains localized.",
                          },
                        ],
                      },
                      {
                        variantId: "variant-codex",
                        score: 9.1,
                        summary:
                          "Preserves behavior and verifies the navigation edge case.",
                        strengths: ["Regression coverage"],
                        risks: [],
                        criteria: [
                          {
                            criterion: "Correctness",
                            score: 9.2,
                            rationale: "All navigation paths are preserved.",
                          },
                          {
                            criterion: "Tests and verification",
                            score: 9.3,
                            rationale:
                              "Focused regression tests cover the edge.",
                          },
                          {
                            criterion: "Maintainability",
                            score: 8.8,
                            rationale: "The structure stays easy to extend.",
                          },
                        ],
                      },
                    ],
                  },
                },
                variants: [
                  {
                    id: "variant-claude",
                    provider: "claude-code",
                    model: "claude-sonnet-5",
                    label: "Claude",
                    status: "completed",
                    workspaceId: "ws-claude",
                    workspaceName: "compare-claude",
                    workspacePath: "/tmp/compare-claude",
                    branchName: "compare/claude",
                    taskId: "task-claude",
                  },
                  {
                    id: "variant-codex",
                    provider: "codex",
                    model: "gpt-5.6-codex",
                    label: "Codex",
                    status: "completed",
                    workspaceId: "ws-codex",
                    workspaceName: "compare-codex",
                    workspacePath: "/tmp/compare-codex",
                    branchName: "compare/codex",
                    taskId: "task-codex",
                  },
                ],
              },
            }
          : {},
        tasks: [
          {
            id: "task-design",
            title: "Design quality audit",
            provider: "claude-code",
            updatedAt: "2026-07-24T00:00:00.000Z",
            unread: false,
            archivedAt: null,
          },
        ],
        messagesByTask: { "task-design": [] },
      };

      if (compareHistory) {
        const historyRuns = workspaceSnapshot.compareRunsById as Record<
          string,
          unknown
        >;
        for (let index = 1; index <= 9; index += 1) {
          const id = `compare-history-${index}`;
          const failed = index === 9;
          const timestamp = `2026-07-${String(24 - index).padStart(2, "0")}T00:00:00.000Z`;
          historyRuns[id] = {
            id,
            seedPrompt: failed
              ? "Investigate legacy settings migration"
              : `Improve design system surface ${index}`,
            baseWorkspaceId: "ws-main",
            baseBranch: "main",
            createdAt: timestamp,
            updatedAt: timestamp,
            status: failed ? "failed" : "completed",
            judge: {
              provider: "codex",
              status: failed ? "failed" : "completed",
              attempt: 1,
            },
            variants: [
              {
                id: `${id}:variant-1`,
                provider: "claude-code",
                label: "Candidate A",
                status: failed ? "failed" : "completed",
              },
              {
                id: `${id}:variant-2`,
                provider: "codex",
                label: "Candidate B",
                status: failed ? "failed" : "completed",
              },
            ],
          };
        }
      }

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
            settings: { autoRoutingEnabled: true },
            ...workspaceSnapshot,
          },
          version: 0,
        }),
      );

      (
        window as unknown as {
          api?: Record<string, unknown>;
        }
      ).api = {
        provider: {
          streamTurn: async () => [],
          getCodexModelCatalog: async () => ({
            ok: true,
            models: [],
            detail: "",
          }),
        },
        terminal: {
          runCommand: async () => ({
            ok: true,
            code: 0,
            stdout: "",
            stderr: "",
          }),
        },
        sourceControl: {
          getStatus: async ({ cwd }: { cwd: string }) => ({
            ok: true,
            branch: cwd.endsWith("claude") ? "compare/claude" : "compare/codex",
            items: [
              {
                code: " M",
                path: "src/components/layout/AppShell.tsx",
              },
              {
                code: "??",
                path: "src/components/layout/navigation-clarity.ts",
              },
            ],
            hasConflicts: false,
            stderr: "",
          }),
        },
      };
    },
    {
      compareRun: options.compareRun ?? false,
      compareHistory: options.compareHistory ?? false,
    },
  );
}

test("Fleet View exposes its operating model at a glance", async ({
  page,
}, testInfo) => {
  await seedDesignShell(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.keyboard.press("Control+Shift+P");
  const commandPalette = page.getByRole("dialog", {
    name: "Command Palette",
  });
  await expect(commandPalette).toBeVisible();
  await commandPalette
    .getByPlaceholder("Find a command, task, workspace, or setting…")
    .fill("Open Fleet View");
  await commandPalette.getByText("Open Fleet View", { exact: true }).click();
  await expect(commandPalette).toBeHidden();

  await expect(page.getByRole("heading", { name: "Fleet View" })).toBeVisible();
  await expect(
    page.getByText(
      /Action inbox for blockers, active work, and review-ready results\./,
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Fleet summary" }),
  ).toContainText("Needs you");
  await expect(
    page.getByRole("region", { name: "Fleet summary" }),
  ).toContainText("In motion");

  await page.screenshot({
    path: testInfo.outputPath("fleet-view.png"),
    fullPage: true,
  });
});

test("Compare starts with a shared brief and review contract", async ({
  page,
}) => {
  await seedDesignShell(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page
    .getByRole("textbox", { name: "Prompt" })
    .fill("Refactor the navigation without changing behavior.");
  await page
    .getByRole("button", {
      name: "Prepare a comparison in isolated candidate workspaces",
    })
    .click();

  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Prepare comparison" }),
  ).toBeVisible();
  await expect(dialog).toContainText("Prepare → Run → Judge → Review → Keep");
  await expect(
    dialog.getByText("Isolated worktree", { exact: true }),
  ).toHaveCount(2);
  await expect(
    dialog.getByRole("textbox", { name: "Compare shared brief" }),
  ).toHaveValue("Refactor the navigation without changing behavior.");
  await expect(
    dialog.getByRole("textbox", { name: "Compare review criteria" }),
  ).toHaveValue(/Correctness/);
  await expect(
    dialog.getByRole("combobox", { name: "Candidate A model" }),
  ).toContainText("Claude Sonnet 5");
  await expect(
    dialog.getByRole("combobox", { name: "Independent judge model" }),
  ).toContainText("GPT-5.6 Terra");
  const candidateBModel = dialog.getByRole("combobox", {
    name: "Candidate B model",
  });
  await candidateBModel.click();
  await page.getByRole("option", { name: "GPT-5.6 Sol" }).click();
  await expect(candidateBModel).toContainText("GPT-5.6 Sol");
});

test("Compare preparation survives returning from Fleet View", async ({
  page,
}) => {
  await seedDesignShell(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.keyboard.press("Control+Shift+P");
  let commandPalette = page.getByRole("dialog", {
    name: "Command Palette",
  });
  await commandPalette
    .getByPlaceholder("Find a command, task, workspace, or setting…")
    .fill("Open Fleet View");
  await commandPalette.getByText("Open Fleet View", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fleet View" })).toBeVisible();

  await page.keyboard.press("Control+Shift+P");
  commandPalette = page.getByRole("dialog", {
    name: "Command Palette",
  });
  await commandPalette
    .getByPlaceholder("Find a command, task, workspace, or setting…")
    .fill("Compare Current Draft Across Providers");
  await commandPalette
    .getByText("Compare Current Draft Across Providers", { exact: true })
    .click();

  await expect(
    page.getByRole("heading", { name: "Prepare comparison" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fleet View" })).toBeHidden();
});

test("Compare owns its preparation action and recent run history", async ({
  page,
}) => {
  await seedDesignShell(page, { compareHistory: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page
    .getByRole("button", { name: "Compare options and recent runs" })
    .click();

  const compareMenu = page.getByRole("menu");
  await expect(compareMenu.getByText("Compare", { exact: true })).toBeVisible();
  await expect(
    compareMenu.getByText("Prepare new comparison", { exact: true }),
  ).toBeVisible();
  await expect(
    compareMenu.getByText("Recent runs", { exact: true }),
  ).toBeVisible();
  await expect(
    compareMenu.getByText(/Audit the navigation hierarchy/),
  ).toBeVisible();
  await expect(
    compareMenu.getByText("View all compare runs…", { exact: true }),
  ).toBeVisible();

  await compareMenu
    .getByText("View all compare runs…", { exact: true })
    .click();
  const historyDialog = page.getByRole("dialog", {
    name: "Compare history",
  });
  await expect(historyDialog).toBeVisible();
  await expect(historyDialog.getByText("10 of 10 saved runs")).toBeVisible();

  const search = historyDialog.getByRole("textbox", {
    name: "Search compare runs",
  });
  await search.fill("legacy settings migration");
  await expect(
    historyDialog.getByRole("button", {
      name: "Open compare run: Investigate legacy settings migration",
    }),
  ).toBeVisible();
  await expect(historyDialog.getByText("1 of 10 saved runs")).toBeVisible();

  await search.fill("");
  await historyDialog
    .getByRole("button", { name: "Failed 1", exact: true })
    .click();
  await expect(historyDialog.getByText("Run failed")).toBeVisible();
});

test("Compare Runs explains the prepare, run, judge, review, and keep decision", async ({
  page,
}, testInfo) => {
  await seedDesignShell(page, { compareRun: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Compare candidates" }),
  ).toBeVisible();
  const workflow = page.getByRole("list", { name: "Compare workflow" });
  await expect(workflow).toContainText("Prepare");
  await expect(workflow).toContainText("Run");
  await expect(workflow).toContainText("Judge");
  await expect(workflow).toContainText("Review");
  await expect(workflow).toContainText("Keep");
  await expect(
    page.getByRole("region", { name: "Fresh-context judge" }),
  ).toContainText("Recommended: Codex");
  await expect(
    page.getByRole("region", { name: "Fresh-context judge" }),
  ).toContainText("9.1 / 10");
  await expect(
    page.getByRole("region", { name: "Fresh-context judge" }),
  ).toContainText("Rubric v1 · Attempt 1");
  await expect(
    page.getByRole("region", { name: "Fresh-context judge" }),
  ).toContainText("Codex · GPT-5.6 Sol");
  await expect(
    page.getByRole("button", { name: "Open candidate" }),
  ).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Keep" })).toHaveCount(2);

  await page.screenshot({
    path: testInfo.outputPath("compare-candidates.png"),
    fullPage: true,
  });
});

test("Runtime profile exposes effective access, reasoning, and execution values", async ({
  page,
}, testInfo) => {
  await seedDesignShell(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const runtimeTrigger = page.getByRole("button", {
    name: "Runtime · Elevated",
  });
  await runtimeTrigger.focus();
  await runtimeTrigger.press("Enter");

  const runtimeProfile = page.locator('[data-slot="popover-content"]');
  await expect(runtimeProfile).toBeVisible();
  await expect(
    runtimeProfile.getByRole("heading", { name: "Runtime profile" }),
  ).toBeVisible();
  await expect(
    runtimeProfile.getByRole("heading", { name: "Access" }),
  ).toBeVisible();
  await expect(
    runtimeProfile.getByRole("heading", { name: "Reasoning" }),
  ).toBeVisible();
  await expect(
    runtimeProfile.getByRole("heading", { name: "Execution" }),
  ).toBeVisible();
  await expect(runtimeProfile).toContainText("Expanded access is active");

  await runtimeProfile.screenshot({
    path: testInfo.outputPath("runtime-profile.png"),
  });

  await page.keyboard.press("Escape");
  await expect(runtimeProfile).toBeHidden();
  await expect(runtimeTrigger).toBeFocused();
});

test("Settings search keeps section hierarchy and purpose visible", async ({
  page,
}, testInfo) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await seedDesignShell(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const settingsTrigger = page.locator('button[aria-label="open-settings"]');
  await settingsTrigger.click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  const settingsHeader = settings.locator("main > header");
  await expect(settings).toBeVisible();
  await expect(settings).toHaveAttribute("aria-modal", "true");
  await expect(settings.getByRole("switch", { name: "Sound" })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  const soundSource = settings.getByRole("radiogroup", { name: "Source" });
  const presetSource = soundSource.getByRole("radio", { name: "Preset" });
  const customSource = soundSource.getByRole("radio", { name: "Custom" });
  await expect(presetSource).toHaveAttribute("aria-checked", "true");
  await presetSource.focus();
  await presetSource.press("ArrowRight");
  await expect(customSource).toHaveAttribute("aria-checked", "true");
  await customSource.press("ArrowLeft");
  await expect(presetSource).toHaveAttribute("aria-checked", "true");

  await settingsTrigger.evaluate((element) =>
    (element as HTMLButtonElement).focus(),
  );
  await expect(settingsTrigger).not.toBeFocused();
  await expect(
    settingsHeader.getByRole("heading", { name: "General" }),
  ).toBeVisible();
  await expect(
    settingsHeader.getByText(
      "Workspace defaults, notifications, and app behavior.",
    ),
  ).toBeVisible();

  const volumeSlider = settings.getByRole("slider", {
    name: "Notification sound volume",
  });
  await expect(volumeSlider).toHaveCount(1);
  const initialVolume = Number(
    await volumeSlider.getAttribute("aria-valuenow"),
  );
  await volumeSlider.focus();
  await volumeSlider.press("ArrowRight");
  await expect(volumeSlider).toHaveAttribute(
    "aria-valuenow",
    String(initialVolume + 1),
  );
  const sliderTrack = volumeSlider.locator(
    "xpath=ancestor::*[@data-slot='slider-track']",
  );
  const trackBox = await sliderTrack.boundingBox();
  if (!trackBox) {
    throw new Error("Notification volume slider track is not measurable.");
  }
  await page.mouse.click(
    trackBox.x + trackBox.width * 0.8,
    trackBox.y + trackBox.height / 2,
  );
  await expect
    .poll(async () => Number(await volumeSlider.getAttribute("aria-valuenow")))
    .toBeGreaterThan(initialVolume + 1);

  await settings
    .getByRole("textbox", { name: "Search settings" })
    .fill("skills");
  await settings.getByRole("button", { name: "Skills" }).click();
  await expect(
    settingsHeader.getByRole("heading", { name: "Skills" }),
  ).toBeVisible();
  await expect(
    settingsHeader.getByText("Skill discovery and prompt input suggestions."),
  ).toBeVisible();

  await page.screenshot({
    path: testInfo.outputPath("settings-skills.png"),
    fullPage: true,
  });

  await settings.getByRole("textbox", { name: "Search settings" }).fill("");
  await settings
    .getByRole("button", { name: "Providers", exact: true })
    .click();
  const settingSources = settings.getByRole("group", {
    name: "Setting Sources",
  });
  const projectSource = settingSources.getByRole("button", {
    name: "Project",
  });
  const localSource = settingSources.getByRole("button", { name: "Local" });
  await expect(projectSource).toHaveAttribute("aria-pressed", "true");
  await projectSource.focus();
  await projectSource.press("ArrowRight");
  await expect(localSource).toBeFocused();
  await localSource.press("Space");
  await expect(localSource).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("Escape");
  await expect(settings).toBeHidden();
  await expect(settingsTrigger).toBeFocused();
  expect(pageErrors.map((error) => error.message)).toEqual([]);
});
