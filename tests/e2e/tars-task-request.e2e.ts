import { expect, test } from "@playwright/test";

for (const [language, width, theme] of [["en", 1440, "light"], ["ko", 390, "dark"]] as const) {
  test(`a task opens its saved request and report without leaving the task (${language})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/?stavePreview=tars&tray=true&queue=true&taskRequest=task-billing&lang=${language}&theme=${theme}`);
    const opener = page.locator('[data-tars-task-request="billing"]');
    await opener.click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.locator('[data-tars-brief-text="request"]')).toHaveText(
      language === "en" ? "Fix the billing export when the invoice list is empty." : "인보이스 목록이 비어 있을 때 결제 내보내기를 고쳐 줘.");
    await page.evaluate(() => document.fonts.ready);
    const section = sheet.locator('[data-tars-brief-text="request"]');
    const contained = await section.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= document.documentElement.clientWidth + 1;
    });
    expect(contained).toBe(true);
    await sheet.getByRole("button", { name: language === "en" ? "Result report" : "결과 보고서", exact: true }).click();
    await expect(sheet.locator("[data-tars-report]")).toBeVisible();
    await expect(page.getByTestId("tars-view")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(opener).toBeVisible();
    await page.reload();
    await opener.click();
    await expect(sheet.locator('[data-tars-brief-text="request"]')).toBeVisible();
  });
}

test("a task's pending decision opens the same live card without confirming it", async ({ page }) => {
  await page.goto("/?stavePreview=tars&decision=unverified&taskRequest=preview-task");
  await page.locator('[data-tars-task-request="preview-responsibility"]').click();
  await page.getByRole("dialog").getByRole("button", { name: "Review decision", exact: true }).click();
  const card = page.locator('[data-tars-dock-item="unverified:preview-responsibility:1"]:not([hidden])');
  await expect(card).toBeVisible();
  await expect(card.locator("[data-tars-decision]")).toBeFocused();
  await expect(card.locator("[data-tars-decision-state=waiting]")).toBeVisible();
});

test("opening a decision whose card disappeared gives a reason and takes no action", async ({ page }) => {
  await page.goto("/?stavePreview=tars&tray=true&taskRequest=task-release");
  await page.locator('[data-tars-task-request="release"]').click();
  await page.getByRole("dialog").getByRole("button", { name: "Review decision: Resume", exact: true }).click();
  await expect(page.getByText("This item has changed or is no longer available.")).toBeVisible();
  await expect(page.locator("[data-tars-dock-item]")).toHaveCount(0);
});

test("a refused request without a Task remains editable from activity", async ({ page }) => {
  await page.goto("/?stavePreview=tars&gallery=true");
  await page.locator("[data-tars-activity-button]").click();
  const pending = page.locator('[data-tars-activity-entry="receipt:g-d4:2"]');
  await expect(pending).toContainText("Tars is waiting to start this task.");
  await expect(pending.getByRole("button", { name: "Edit request text" })).toHaveCount(0);
  const refused = page.locator('[data-tars-activity-entry="receipt:g-d4:0"]');
  await expect(refused).toContainText("Draft the release notes");
  await refused.locator("summary").click();
  await expect(refused).toContainText("ship the release notes");
  await refused.getByRole("button", { name: "Edit request text" }).click();
  await expect(page.locator("[data-tars-composer] [contenteditable=true]")).toContainText("ship the release notes");
});

test("a delayed older run read cannot replace the newer result in an uncached task", async ({ page }) => {
  await page.goto("/?stavePreview=tars&outputs=true&taskRequest=task-checkout");
  await page.locator('[data-tars-task-request="checkout"]').click();
  const bridge = await page.evaluateHandle(async ({ fleet, tars }) => {
    // Vite can append a revision query to the loaded store; use the instance the preview mounts.
    const loaded = (path: string) => performance.getEntriesByType("resource").reverse().find(entry => new URL(entry.name).pathname === path)?.name ?? path;
    const { useFleetAgentRunsStore } = await import(loaded(fleet));
    const { useTarsSnapshotStore, publishTarsSnapshot } = await import(loaded(tars));
    const detail = useFleetAgentRunsStore.getState().details["run-checkout"];
    const reads: Array<(reason: string) => void> = [];
    useFleetAgentRunsStore.setState({ details: {} });
    Object.assign(window.api, { agentRuns: { get: () => new Promise(resolve => {
      reads.push(reason => resolve({ ok: true, agentRun: { ...detail, report: { ...detail.report, reason } } }));
    }) } });
    return {
      count: () => reads.length,
      finish: (index: number, reason: string) => reads[index]!(reason),
      advance: () => {
        const snapshot = structuredClone(useTarsSnapshotStore.getState().snapshot);
        snapshot.responsibilities.find((row: { id: string }) => row.id === "checkout").revision++;
        publishTarsSnapshot(snapshot);
      },
    };
  }, { fleet: "/src/store/fleet-agent-runs-store.ts", tars: "/src/store/tars-snapshot-store.ts" });
  await page.getByRole("dialog").getByRole("button", { name: "Result report", exact: true }).click();
  await expect.poll(() => bridge.evaluate(api => api.count())).toBe(1);
  await bridge.evaluate(api => api.advance());
  await expect.poll(() => bridge.evaluate(api => api.count())).toBe(2);
  await bridge.evaluate(api => api.finish(1, "Checked on the current revision"));
  await expect(page.locator("[data-tars-report-reason]")).toHaveText("Checked on the current revision");
  await bridge.evaluate(api => api.finish(0, "Superseded read"));
  await expect(page.locator("[data-tars-report-reason]")).toHaveText("Checked on the current revision");
});

test("related work resolves by original request identity across workspaces after restart", async ({ page }) => {
  await page.goto("/?stavePreview=tars&tray=true&queue=true&taskRequest=task-billing");
  await expect(page.locator('[data-tars-task-request="billing"]')).toBeVisible();
  await page.evaluate(async () => {
    const snapshot = await window.api.tars!.get();
    const billing = snapshot.responsibilities.find(row => row.id === "billing")!;
    const original = (await window.api.tars!.getBrief!({ responsibilityId: billing.id })).request!;
    Object.assign(billing, { requestId: `tars-message:${original.messageId}:0`, request: original });
    const docs = snapshot.responsibilities.find(row => row.id === "docs")!;
    Object.assign(docs, { requestId: `tars-message:${original.messageId}:1`, request: original, workspaceId: "docs-workspace" });
    sessionStorage.setItem("stave-preview-identity", JSON.stringify(snapshot));
  });
  await page.reload();
  await page.locator('[data-tars-task-request="billing"]').click();
  await page.getByRole("dialog").getByRole("button", { name: "Update the setup guide" }).click();
  const sibling = page.locator('[data-tars-side-view="brief"]');
  await expect(sibling.locator("[data-tars-side-subject]")).toHaveText("Update the setup guide");
  await expect(sibling.locator('[data-tars-brief-text="request"]')).toHaveText("Fix the billing export when the invoice list is empty.");
  await expect(sibling.getByRole("button", { name: "Fix the billing export on empty invoice lists" })).toBeVisible();
});
