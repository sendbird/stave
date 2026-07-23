import { expect, test } from "@playwright/test";

function seedWorkspace(page: import("@playwright/test").Page) {
  return page.addInitScript(() => {
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
      activeTaskId: "task-model-effort",
      openTaskTabIds: ["task-model-effort"],
      activeSurface: { kind: "task", taskId: "task-model-effort" },
      tasks: [
        {
          id: "task-model-effort",
          title: "Model effort selector",
          provider: "claude-code",
          updatedAt: "2026-07-23T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { "task-model-effort": [] },
    };
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: "ws-main",
          name: "main",
          updatedAt: "2026-07-23T00:00:00.000Z",
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
              updatedAt: "2026-07-23T00:00:00.000Z",
            },
          ],
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
}

test("selects model and effort from the provider heatmaps", async ({
  page,
}, testInfo) => {
  await seedWorkspace(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const trigger = page.getByRole("button", { name: /Model and effort:/ });
  await expect(trigger).toBeVisible();

  await trigger.focus();
  await trigger.press("Enter");
  await expect(trigger).toBeFocused();
  await expect(
    page.getByRole("button", { name: "1M context" }),
  ).not.toBeFocused();
  await page.keyboard.press("Escape");

  await trigger.hover();

  const claudeGrid = page.getByRole("grid", {
    name: "Claude model effort matrix",
  });
  const codexGrid = page.getByRole("grid", {
    name: "Codex model effort matrix",
  });
  await expect(claudeGrid).toBeVisible();
  await expect(codexGrid).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Auto · Let Stave choose model and effort",
    }),
  ).toBeVisible();
  await expect(
    codexGrid.getByRole("gridcell", {
      name: "Luna does not support Ultra effort",
    }),
  ).toHaveAttribute("aria-disabled", "true");
  await expect(
    codexGrid.locator('[data-particles="apex"]').first(),
  ).toBeVisible();

  await page.screenshot({
    path: testInfo.outputPath("model-effort-selector.png"),
    fullPage: true,
  });

  await claudeGrid
    .getByRole("gridcell", {
      name: "Claude Opus 4.8, X-High effort",
    })
    .click();
  await expect(trigger).toHaveAccessibleName(/Claude Opus 4\.8 · X-High/);

  await trigger.click();
  await expect(claudeGrid.locator('[data-particles="selected"]')).toBeVisible();
  await page.getByRole("button", { name: "1M context" }).click();
  await expect(trigger).toHaveAccessibleName(
    /Claude Opus 4\.8 \(1M\) · X-High/,
  );

  await page.getByRole("button", { name: "Fast" }).click();
  await codexGrid
    .getByRole("gridcell", {
      name: "GPT-5.6 Sol, Ultra effort",
    })
    .click();
  await expect(trigger).toHaveAccessibleName(/GPT-5\.6 Sol · Ultra · Fast/);
});

test("stacks the provider heatmaps without viewport overflow", async ({
  page,
}) => {
  await seedWorkspace(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await page.getByRole("button", { name: /Model and effort:/ }).click();
  await expect(
    page.getByRole("grid", { name: "Claude model effort matrix" }),
  ).toBeVisible();
  await expect(
    page.getByRole("grid", { name: "Codex model effort matrix" }),
  ).toBeVisible();

  for (const grid of await page.getByRole("grid").all()) {
    expect(
      await grid.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
  }

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});
