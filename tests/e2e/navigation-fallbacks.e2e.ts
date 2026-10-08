import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"] as const) {
  test(`hidden sidebar screens remain accessible from the Stave menu and palette in ${theme}`, async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Open Stave menu", exact: true })).toBeVisible();
    await page.evaluate(async (theme) => {
      const { useAppStore } = await import("/src/store/app.store.ts");
      const { applyAppLocale } = await import("/src/i18n/index.ts");
      applyAppLocale("en");
      const store = useAppStore.getState();
      store.updateSettings({ patch: {
        sidebarShowFleetView: false, sidebarShowAgents: false, sidebarShowAiUsage: false,
      } });
      store.setDarkMode({ enabled: theme === "dark" });
    }, theme);
    for (const [label, kind, agentsTab] of [
      ["Fleet View", "fleet-view", "agents"],
      ["Agents", "agents", "agents"],
      // Agent performance is the Agents view's Performance tab.
      ["Agent performance", "agents", "performance"],
      ["AI usage", "usage", "performance"],
    ] as const) {
      await page.getByRole("button", { name: "Open Stave menu", exact: true }).click();
      await page.getByRole("menuitem", { name: label, exact: true }).click();
      await expect.poll(() => page.evaluate(async () => {
        const { useAppStore } = await import("/src/store/app.store.ts");
        const { useAgentsViewStore } = await import("/src/store/agents-view-store.ts");
        return [useAppStore.getState().activeAppSurface.kind, useAgentsViewStore.getState().activeTab];
      })).toEqual([kind, agentsTab]);
    }
    await page.getByRole("button", { name: "Open Stave menu", exact: true }).click();
    await page.getByRole("menuitem", { name: /Command Palette/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox").fill("quota");
    await dialog.getByText("Open AI usage", { exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.evaluate(async () => {
      const { useAppStore } = await import("/src/store/app.store.ts");
      useAppStore.setState((state) => ({
        providerAvailability: { ...state.providerAvailability, "claude-code": true },
        refreshProviderAvailability: async () => {},
        refreshRateLimits: async () => {},
      }));
    });
    await page.getByRole("button", { name: "Claude usage", exact: true }).click();
    const statistics = page.getByRole("button", { name: "View usage statistics", exact: true });
    await expect(statistics).toBeVisible();
    await statistics.click();
    await expect.poll(() => page.evaluate(async () => {
      const { useAppStore } = await import("/src/store/app.store.ts");
      return useAppStore.getState().activeAppSurface;
    })).toEqual({ kind: "usage", providerId: "claude-code", accountProfileId: "system-default" });
  });
}
