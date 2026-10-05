import { expect, test, type Page } from "@playwright/test";

async function seedSkills(page: Page) {
  await page.evaluate(async () => {
    const storeModule = "/src/store/app.store.ts";
    const { useAppStore } = await import(/* @vite-ignore */ storeModule);
    const state = useAppStore.getState();
    const skills = [
      { slug: "team-review", name: "Team checklist", description: "Persistence and regression checks", provider: "shared" },
      { slug: "accessibility", name: "Inclusive UI", description: "Keyboard and screen reader checks", provider: "shared" },
      { slug: "codex-only", name: "Provider checklist", description: "Codex checks", provider: "codex" },
    ].map((skill) => ({
      ...skill,
      id: skill.slug,
      scope: "user",
      path: `/tmp/skills/${skill.slug}/SKILL.md`,
      realPath: `/tmp/skills/${skill.slug}/SKILL.md`,
      sourceRootPath: "/tmp/skills",
      sourceRootRealPath: "/tmp/skills",
      invocationToken: `$${skill.slug}`,
      instructions: "Review only.",
    }));
    useAppStore.setState({
      skillCatalog: { ...state.skillCatalog, skills },
      providerAvailability: { ...state.providerAvailability, "claude-code": true, codex: true },
      settings: { ...state.settings, reviewTask: { ...state.settings.reviewTask, reviewer: "claude-code" } },
    });
  });
}

test("settings searches review skills by name and description, clears, and resets the query", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "open-settings", exact: true }).click();
  await page.getByRole("button", { name: "Prompts", exact: true }).click();
  await seedSkills(page);
  await page.getByRole("combobox", { name: "Review prompt" }).click();
  await page.getByRole("option", { name: "Installed skill" }).click();
  const trigger = page.getByRole("button", { name: "Review skill", exact: true });
  await trigger.click();
  const search = page.getByRole("combobox", { name: "Search review skills" });
  await expect(search).toBeFocused();
  await search.fill("INCLUSIVE");
  await expect(page.getByRole("option")).toHaveCount(1);
  await expect(page.getByRole("option")).toContainText("$accessibility");
  await search.fill("persistence");
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(trigger).toContainText("$team-review");
  await trigger.click();
  await expect(search).toHaveValue("");
  await search.fill("no-such-skill");
  await expect(page.getByText("No skills found.", { exact: true })).toBeVisible();
  await search.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(trigger).toContainText("$team-review");
  await trigger.click();
  await search.fill("Choose a skill");
  await page.getByRole("option", { name: "Choose a skill", exact: true }).click();
  await expect(trigger).toContainText("Choose a skill");
});

test("review dialog searches compatible skills and supports no skill", async ({ page }) => {
  await page.addInitScript(() => {
    const workspace = { id: "ws-main", name: "main", updatedAt: "2026-10-05T00:00:00.000Z" };
    const task = { id: "review-search", title: "Review search", provider: "claude-code", updatedAt: workspace.updatedAt, unread: false, archivedAt: null };
    const snapshot = {
      activeTaskId: task.id,
      openTaskTabIds: [task.id],
      activeSurface: { kind: "task", taskId: task.id },
      tasks: [task],
      messagesByTask: { [task.id]: [] },
    };
    localStorage.setItem("stave:workspace-fallback:v1", JSON.stringify([{ ...workspace, snapshot }]));
    localStorage.setItem("stave-store", JSON.stringify({ state: {
      repositoryPath: "/tmp/stave-project",
      repositoryName: "stave-project",
      workspaces: [workspace],
      activeWorkspaceId: workspace.id,
      workspaceBranchById: { [workspace.id]: "main" },
      workspacePathById: { [workspace.id]: "/tmp/stave-project" },
      workspaceDefaultById: { [workspace.id]: true },
      settings: { darkMode: true },
      ...snapshot,
    }, version: 0 }));
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("textbox", { name: "Prompt" })).toBeVisible();
  await page.evaluate(() => {
    window.api = { ...window.api, runs: { ...window.api?.runs, delegateTask: async () => ({}) } } as typeof window.api;
  });
  await seedSkills(page);
  await page.getByRole("button", { name: "Review local changes", exact: true }).click();
  await page.getByRole("combobox", { name: "Review prompt" }).click();
  await page.getByRole("option", { name: "Installed skill" }).click();
  const trigger = page.getByRole("button", { name: "Review skill", exact: true });
  await trigger.click();
  const search = page.getByRole("combobox", { name: "Search review skills" });
  await search.fill("codex-only");
  await expect(page.getByText("No skills found.", { exact: true })).toBeVisible();
  await search.fill("TEAM-REVIEW");
  await page.getByRole("option", { name: /\$team-review/ }).click();
  await expect(trigger).toContainText("$team-review");
  await trigger.click();
  await expect(search).toHaveValue("");
  await page.getByRole("option", { name: "Choose a skill", exact: true }).click();
  await expect(trigger).toContainText("Choose a skill");
});
