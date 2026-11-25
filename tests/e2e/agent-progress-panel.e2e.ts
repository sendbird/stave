import { expect, test, type Page } from "@playwright/test";

/**
 * The Agent panel: one agent's progress beside the conversation. The preview
 * (`?stavePreview=agent-progress`) renders the view for a running, a
 * finished, a failed and a nested agent built through the real adapters; the
 * fixture renders the real panel container reading the real stores.
 */

// The first page of a run waits on the dev server's cold compile.
test.describe.configure({ timeout: 90_000 });

async function openPreview(page: Page, query: Record<string, string> = {}) {
  const params = new URLSearchParams({ stavePreview: "agent-progress", ...query });
  await page.setViewportSize({ width: 1660, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/?${params}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("agent-progress-panel").first()).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
}

const scenario = (page: Page, id: string) => page.locator(`[data-scenario="${id}"]`);

test("steps fold into quiet blocks and running and failed rows stay visible", async ({ page }) => {
  await openPreview(page);
  const running = scenario(page, "running");
  await expect(running.getByTestId("agent-progress-now")).toContainText("Reading");
  // The first block folds six calls and a thought; its failed call stays out.
  const group = running.getByTestId("agent-step-group").first();
  await expect(group.getByRole("button", { name: /6 steps/ })).toHaveAttribute("aria-expanded", "false");
  const pinned = group.getByTestId("agent-step-pinned");
  await expect(pinned.locator("[data-step-status]")).toHaveCount(1);
  await expect(pinned.locator('[data-step-status="error"]')).toContainText('Ran rg -n "maxAge" src/auth');
  // No tool names or JSON in the rows.
  await expect(running.getByTestId("agent-step-list")).not.toContainText("Grep");
  await expect(running.getByTestId("agent-step-list")).not.toContainText("{");
  // Opening the block shows every step in order; opening a row its detail.
  await group.getByRole("button", { name: /6 steps/ }).click();
  await expect(group.locator("[data-step-id]")).toHaveCount(6);
  const read = group.locator("[data-step-id]").filter({ hasText: "Read src/auth/cookies.ts" });
  await read.getByRole("button").first().click();
  await expect(read).toContainText("SESSION_MAX_AGE");
});

test("the fact row keeps one order and the answer comes last", async ({ page }) => {
  await openPreview(page);
  const finished = scenario(page, "finished");
  const facts = finished.getByTestId("agent-progress-facts").locator("[data-fact]");
  await expect(facts).toHaveText(["Ready", "Delegated task", "GPT-6.1 Sol", "high", "6m", "3 steps", "$0.42"]);
  await expect(finished.getByTestId("agent-progress-now")).toHaveCount(0);
  await expect(finished.getByTestId("agent-progress-answer")).toContainText("Expired sessions now clear the cookie");
  const failed = scenario(page, "failed");
  await expect(failed).toContainText("Ended without an answer");
  await expect(failed.locator('[data-step-status="error"]')).toHaveCount(2);
});

test("follows new steps only while the reader is at the bottom", async ({ page }) => {
  await openPreview(page, { scenario: "running" });
  const scroll = page.getByTestId("agent-progress-scroll");
  const distanceFromEnd = () => scroll.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight);
  await expect.poll(distanceFromEnd).toBeLessThan(2);
  // At the bottom, new steps are followed, past the panel's height.
  await page.evaluate(() => window.agentProgressPreview?.addSteps(8));
  await expect.poll(() => scroll.evaluate((node) => node.scrollHeight - node.clientHeight)).toBeGreaterThan(200);
  await expect.poll(distanceFromEnd).toBeLessThan(2);
  await expect(page.getByTestId("agent-progress-new-steps")).toHaveCount(0);
  // Scrolled up, they are counted instead.
  await scroll.evaluate((node) => node.scrollTo({ top: 0 }));
  await expect(scroll).toHaveAttribute("data-following", "false");
  await page.evaluate(() => window.agentProgressPreview?.addSteps(3));
  const jump = page.getByTestId("agent-progress-new-steps");
  await expect(jump).toHaveText("3 new steps");
  expect(await scroll.evaluate((node) => node.scrollTop)).toBe(0);
  await jump.click();
  await expect.poll(distanceFromEnd).toBeLessThan(2);
  await expect(jump).toHaveCount(0);
});

for (const lang of ["en", "ko"] as const) {
  for (const theme of ["light", "dark"] as const) {
    test(`header geometry holds in ${lang} ${theme}`, async ({ page }) => {
      await openPreview(page, { lang, theme });
      for (const id of ["running", "finished", "failed", "nested"]) {
        const panel = scenario(page, id).getByTestId("agent-progress-panel");
        // Nothing runs past the rail's width.
        const overflow = await panel.evaluate((node) => {
          const scroll = node.querySelector('[data-testid="agent-progress-scroll"]') as HTMLElement;
          return { panel: node.scrollWidth - node.clientWidth, scroll: scroll.scrollWidth - scroll.clientWidth };
        });
        expect(overflow).toEqual({ panel: 0, scroll: 0 });
        // The state mark sits on the title's first line.
        const centers = await panel.evaluate((node) => {
          const title = node.querySelector("h3")!;
          const mark = title.parentElement!.querySelector("[data-state] svg")!.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(title);
          const firstLine = range.getClientRects()[0]!;
          return { mark: mark.top + mark.height / 2, line: firstLine.top + firstLine.height / 2 };
        });
        expect(Math.abs(centers.mark - centers.line)).toBeLessThanOrEqual(2);
      }
      if (lang === "ko") {
        await expect(scenario(page, "running")).toContainText("의 하위 에이전트");
        await expect(scenario(page, "running")).toContainText("받은 지시");
        await expect(scenario(page, "nested")).toContainText("뒤로:");
      }
    });
  }
}

test("the panel reads an in-turn subagent from the conversation and opens the agent it started", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 760 });
  await page.goto("/tests/e2e/fixtures/agent-progress-panel.html");
  await expect(page.getByTestId("agent-progress-panel-empty")).toContainText("No agent selected");
  await page.evaluate(() => window.agentPanelFixture.openSubagent());
  const panel = page.getByTestId("agent-progress-panel");
  await expect(panel.getByRole("heading", { level: 3 })).toHaveText("Map the auth flow");
  await expect(panel.getByTestId("agent-progress-parent")).toHaveText("Sub-agent of Fix login sessions");
  await expect(panel.getByTestId("agent-progress-facts").locator('[data-fact="kind"]')).toHaveText("Explore");
  await expect(panel).toContainText("Map how login works and where sessions expire.");
  expect(await page.evaluate(() => window.agentPanelFixture.layout())).toEqual({ sidebarOverlayVisible: true, sidebarOverlayTab: "agent" });
  // Its own calls, worded; the nested agent's call is not one of them.
  await expect(panel.getByTestId("agent-step-list")).toContainText("Check the cookie flags");
  await expect(panel.getByTestId("agent-step-list")).not.toContainText("Searching for SameSite");
  await panel.getByRole("button", { name: /2 steps/ }).click();
  await expect(panel.getByTestId("agent-step-list")).toContainText("Found src/auth/**");
  await expect(panel.getByTestId("agent-step-list")).toContainText("Read src/auth/session.ts");
  // The nested agent opens in place with a way back.
  await panel.getByRole("button", { name: "Open Check the cookie flags" }).click();
  await expect(panel.getByRole("heading", { level: 3 })).toHaveText("Check the cookie flags");
  await expect(panel.getByTestId("agent-progress-now")).toContainText("Searching for SameSite");
  await panel.getByTestId("agent-progress-back").click();
  await expect(panel.getByRole("heading", { level: 3 })).toHaveText("Map the auth flow");
  // Close returns to the panel that was open before.
  await panel.getByRole("button", { name: "Close" }).click();
  expect(await page.evaluate(() => window.agentPanelFixture.layout())).toEqual({ sidebarOverlayVisible: true, sidebarOverlayTab: "task" });
  expect(await page.evaluate(() => window.agentPanelFixture.stackSize())).toBe(0);
});
