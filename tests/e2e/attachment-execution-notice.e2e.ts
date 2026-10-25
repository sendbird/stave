import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark", "dracula"]) {
test(`an attached streaming reply stays partial until completion, with the run-start line (${theme})`, async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.goto(`/?stavePreview=composer-frame&case=idle&agent=implementer&partial=1&theme=${theme}&w=420`, { waitUntil: "domcontentloaded" });
  const prompt = page.getByRole("textbox", { name: "Prompt" });
  const notice = page.getByTestId("run-contract-notice");
  // The shelf line names the agent and says the run keeps the attached task.
  await expect(notice).toContainText("Send starts Implementer");
  await expect(notice).toContainText("Keeps 1 attachment");
  await expect(page.getByText("Partial reply", { exact: false })).toBeVisible();
  const chipSize = await page.locator("[data-task-context-chip]").evaluate((chip) => ({ width: chip.clientWidth, content: chip.scrollWidth }));
  expect(chipSize.content).toBeLessThanOrEqual(chipSize.width);
  await page.getByTestId("preview-composer-measure").screenshot({ path: testInfo.outputPath("composer.png") });
  await prompt.fill("Use the investigation to fix the login flow");
  await page.evaluate(async () => {
    const path = "/src/store/app.store.ts";
    const { useAppStore } = await import(path);
    const state = useAppStore.getState();
    useAppStore.setState({ messagesByTask: { ...state.messagesByTask,
      "t-research": state.messagesByTask["t-research"].map((message: { isStreaming: boolean }) => ({ ...message, isStreaming: false })),
    } });
  });
  await expect(page.getByText("Partial reply", { exact: false })).toHaveCount(0);
  await expect(prompt).toBeFocused();
  await expect(prompt).toHaveText("Use the investigation to fix the login flow");
  await expect(notice).toBeVisible();
  await page.getByRole("button", { name: "Remove attached task Research the login redirect bug" }).click();
  // The send still starts a run; only the attachment item leaves, and the turn cap takes its place.
  await expect(notice).not.toContainText("Keeps 1 attachment");
  await expect(notice).toContainText("Up to 30 turns");
});
}

test("Chat and an active run do not show an attachment-triggered new-run notice", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/?stavePreview=composer-frame&case=idle&partial=1&theme=dark", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Partial reply", { exact: false })).toBeVisible();
  await expect(page.getByTestId("run-contract-notice")).toHaveCount(0);
  await page.goto("/?stavePreview=composer-frame&case=agent-needs&agent=implementer&partial=1&theme=dark", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Partial reply", { exact: false })).toBeVisible();
  await expect(page.getByTestId("run-contract-notice")).toHaveCount(0);
});

test("a pending run suppresses the notice and changing back to Chat removes it", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/?stavePreview=composer-frame&case=idle&agent=implementer&partial=1&theme=dracula", { waitUntil: "domcontentloaded" });
  const notice = page.getByTestId("run-contract-notice");
  await expect(notice).toBeVisible();
  await page.evaluate(async () => {
    const path = "/src/store/pending-auto-routing-store.ts";
    const { usePendingAutoRoutingStore } = await import(path);
    usePendingAutoRoutingStore.setState({ byTaskId: { "preview-task": { agentRun: { agentRunId: null } } } });
  });
  await expect(notice).toHaveCount(0);
  await page.evaluate(async () => {
    const path = "/src/store/pending-auto-routing-store.ts";
    const { usePendingAutoRoutingStore } = await import(path);
    usePendingAutoRoutingStore.setState({ byTaskId: {} });
  });
  await expect(notice).toBeVisible();
  await page.evaluate(async () => {
    const path = "/src/store/agent-assignments-store.ts";
    const { useAgentAssignmentsStore } = await import(path);
    useAgentAssignmentsStore.setState({ byTaskId: {} });
  });
  await expect(notice).toHaveCount(0);
});
