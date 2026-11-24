import { expect, test, type Page } from "@playwright/test";

const shots = process.env.USAGE_PROJECTS_SCREENSHOTS;
/** Optional review images: a viewport tall enough for the whole tab, since the page scrolls inside the app surface. */
const capture = async (page: Page, name: string) => {
  if (!shots) return;
  const width = page.viewportSize()?.width ?? 1280;
  await page.setViewportSize({ width, height: 2600 });
  await page.screenshot({ path: `${shots}/${name}.png` });
};

for (const theme of ["light", "dark"]) {
  test(`projects tab shows tokens, cost and disk by project in ${theme} mode`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/?stavePreview=usage&theme=${theme}&view=projects`);
    await expect(page.getByRole("tab", { name: "Projects", exact: true })).toHaveAttribute("aria-selected", "true");
    const projects = page.locator("[data-usage-projects]");
    await expect(projects.getByRole("heading", { name: "Tokens by project per day" })).toBeVisible();
    await expect(projects.locator("[data-usage-delta]").first()).toBeVisible();

    // One bar per day of the default 30-day period, each a stack of project segments.
    const bars = projects.locator("[data-usage-project-bar]");
    await expect(bars).toHaveCount(30);
    expect(await bars.first().getAttribute("aria-label")).toMatch(/^2026-09-05: /);

    const table = projects.locator("[data-usage-project-table]");
    const projectRows = table.locator("[data-usage-project-row]");
    await expect(projectRows.last()).toContainText("Removed projects and tasks");
    // Codex-only work reports no cost: a dash, never $0.
    await expect(table.locator("tbody tr").filter({ hasText: "–" }).first()).toBeVisible();

    await projects.getByRole("combobox", { name: "Sort by" }).click();
    await page.getByRole("option", { name: "Recent" }).click();
    await expect(projectRows.last()).toContainText("Removed projects and tasks");

    const disk = projects.locator("[data-usage-disk]");
    await expect(disk.locator("[data-usage-disk-total]")).toHaveText(/^≥ \d/);
    await expect(disk.locator("[data-usage-disk-table] tbody tr")).toHaveCount(4);
    // A project whose only folder timed out has no size to show, not "≥ 0 MB".
    await expect(disk.locator("[data-usage-disk-table] tbody tr").filter({ hasText: "design-system" })).toContainText("Not measured");
    const free = projects.locator("[data-usage-free-space]");
    // Blocked workspaces (current, changed files, running turn) are not offered.
    await expect(free.locator("[data-usage-reclaimable-row]")).toHaveCount(5);
    await expect(free.locator("[data-usage-reclaimable-row]").first()).toContainText("feat/push-settings");
    // An unblocked sub-agent worktree is offered in size order with its label; one with changes is not.
    await expect(free.locator("[data-usage-reclaimable-row]").nth(1)).toContainText("agent-a5f2c91");
    await expect(free.locator("[data-usage-reclaimable-row]").nth(1)).toContainText("Left by sub-agents · web-dashboard");
    await expect(free).not.toContainText("agent-b81d0e4");
    await expect(free).toContainText("1 more in workspace cleanup");
    // The disk card counts sub-agent worktrees per project, apart from workspaces.
    const dashboard = disk.locator("[data-usage-disk-table] tbody tr").filter({ hasText: "web-dashboard" });
    await expect(dashboard.locator("[data-usage-disk-subagents]")).toHaveText("Includes 1 worktree left by sub-agents");
    await expect(dashboard.locator("td").nth(1)).toHaveText("3");
    await expect(free.getByRole("button", { name: "Review in cleanup" })).toBeEnabled();

    await disk.getByRole("button", { name: "Measure again" }).click();
    await expect(disk.getByRole("status")).toHaveText("Measuring workspace folders…");
    await expect(disk.getByRole("status")).toHaveCount(0, { timeout: 5_000 });

    const main = page.getByRole("main");
    const overflow = await main.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await capture(page, `projects-${theme}`);
  });
}

test("projects tab fits a narrow surface in Korean", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?stavePreview=usage&lang=ko&theme=dark&width=420&view=projects");
  await expect(page.getByRole("tab", { name: "프로젝트", exact: true })).toHaveAttribute("aria-selected", "true");
  const projects = page.locator("[data-usage-projects]");
  await expect(projects.getByRole("heading", { name: "프로젝트별 일일 토큰" })).toBeVisible();
  await expect(projects.getByRole("heading", { name: "워크스페이스 디스크 사용량" })).toBeVisible();
  await expect(projects.getByRole("button", { name: "정리에서 검토" })).toBeVisible();
  await expect(projects.locator("[data-usage-reclaimable-row]").nth(1)).toContainText("하위 에이전트가 남김 · web-dashboard");
  await expect(projects.locator("[data-usage-disk-subagents]").first()).toHaveText("하위 에이전트가 남긴 워크트리 1개 포함");
  const main = page.getByRole("main");
  const overflow = await main.evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const diskTable = projects.locator("[data-usage-disk-table]");
  const diskOverflow = await diskTable.evaluate((table) => table.scrollWidth - table.parentElement!.clientWidth);
  expect(diskOverflow).toBeLessThanOrEqual(0);
  for (const row of await projects.locator("[data-usage-reclaimable-row]").all()) {
    const box = await row.boundingBox();
    const parent = await projects.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(parent!.x + parent!.width + 0.5);
  }
  await capture(page, "projects-ko-narrow");
});

test("projects tab without turns still shows disk and free space", async ({ page }) => {
  await page.goto("/?stavePreview=usage&state=empty&view=projects");
  const projects = page.locator("[data-usage-projects]");
  await expect(projects.getByText("No completed turns in this selection")).toBeVisible();
  await expect(projects.locator("[data-usage-disk-table]")).toBeVisible();
});
