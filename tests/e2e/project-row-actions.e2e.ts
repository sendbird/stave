import { expect, test } from "@playwright/test";
import { seedFleetScale } from "./fleet-scale.fixture";

for (const [locale, theme, density] of [
  ["en", "light", "regular"],
  ["ko", "dark", "compact"],
] as const) {
  test(`blocking project alert stays clear of row actions in ${locale}/${theme}/${density}`, async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("stave:notifications-fallback:v1", JSON.stringify([0, 1].map((index) => ({
        id: `blocking-${index}`,
        kind: "task.user_input_requested",
        title: "Waiting for an answer",
        body: "Which option should we use?",
        repositoryPath: "/tmp/fleet-scale/repository-0",
        repositoryName: "Repository 0",
        workspaceId: "scale-workspace-0",
        workspaceName: "Workspace 0",
        taskId: "scale-0000",
        taskTitle: "Scale task 0000",
        providerId: "codex",
        action: null,
        payload: { requestId: `question-${index}` },
        createdAt: new Date().toISOString(),
        readAt: null,
        resolvedAt: null,
        expiresAt: null,
      }))));
    });
    await seedFleetScale(page, { workspaces: 2, tasksPerWorkspace: 1 });
    const sidebar = page.getByTestId("project-workspace-sidebar");
    const toggle = sidebar.getByTestId("toggle-project-/tmp/fleet-scale/repository-0");
    const row = toggle.locator("..");
    const alert = row.getByTestId("project-attention-Repository 0");
    const settings = row.getByTestId("project-settings-/tmp/fleet-scale/repository-0");
    const actionGroup = settings.locator("..");
    const actions = actionGroup.getByRole("button", { includeHidden: true });
    const menu = actionGroup.locator('button[aria-haspopup="menu"]');
    const projectName = row.getByText("Repository 0", { exact: true });
    await expect(toggle).toBeVisible();

    await page.evaluate(async ({ locale, theme, density }) => {
      const { applyAppLocale } = await import("/src/i18n/index.ts");
      const { useAppStore } = await import("/src/store/app.store.ts");
      applyAppLocale(locale);
      useAppStore.getState().updateSettings({ patch: { themeMode: theme, uiDensity: density } });
      await document.fonts.ready;
    }, { locale, theme, density });
    const html = page.locator("html");
    await expect(html).toHaveAttribute("lang", locale === "ko" ? "ko-KR" : "en-US");
    if (theme === "dark") {
      await expect(html).toHaveClass(/\bdark\b/);
      await expect(html).toHaveAttribute("data-ui-density", "compact");
    } else {
      await expect(html).not.toHaveClass(/\bdark\b/);
      await expect(html).not.toHaveAttribute("data-ui-density", "compact");
    }

    for (const width of [220, 340]) {
      await page.evaluate(async (workspaceSidebarWidth) => {
        const { useAppStore } = await import("/src/store/app.store.ts");
        useAppStore.getState().setLayout({ patch: { workspaceSidebarWidth } });
      }, width);
      await expect(sidebar).toHaveCSS("width", `${width}px`);
      await expect(alert).toBeVisible();
      await expect(alert).toHaveText("2");

      const checkLayout = async () => {
        await expect(actionGroup).toHaveCSS("opacity", "1");
        await expect(alert).toBeVisible();
        await expect(projectName).toBeVisible();
        const alertBox = (await alert.boundingBox())!;
        const firstActionBox = (await actions.first().boundingBox())!;
        const lastActionBox = (await actions.last().boundingBox())!;
        const rowBox = (await row.boundingBox())!;
        expect(firstActionBox.x - alertBox.x - alertBox.width).toBeGreaterThan(0);
        expect(lastActionBox.x + lastActionBox.width).toBeLessThanOrEqual(rowBox.x + rowBox.width);
        expect(Math.abs(alertBox.y + alertBox.height / 2 - firstActionBox.y - firstActionBox.height / 2)).toBeLessThanOrEqual(0.5);
      };

      await toggle.hover();
      await checkLayout();
      await page.mouse.move(0, 0);
      await expect(actionGroup).toHaveCSS("opacity", "0");
      await toggle.focus();
      await checkLayout();
      await menu.press("Enter");
      await expect(page.getByRole("menu")).toBeVisible();
      await checkLayout();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("menu")).toBeHidden();
      await menu.blur();
    }
  });
}
