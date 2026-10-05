import { expect, test } from "@playwright/test";

const summary = "Tightened the row gaps to 8px and kept the keyboard order; typecheck and the focused tests pass.";

for (const lang of ["en", "ko"] as const) {
  const ko = lang === "ko";
  test(`agent performance: period, refresh and report inspection (${lang})`, async ({ page }, testInfo) => {
    await page.goto(`/?stavePreview=results&lang=${lang}&delay=200`);
    const outcomes = page.getByRole("region", { name: ko ? "완료율" : "Completion rate" });
    await expect(outcomes).toContainText(ko ? "종료된 실행 22개 중 17개 완료" : "17 of 22 ended runs completed");
    await expect(page.getByText(ko ? "실행 22개 중 20개의 비용이 보고되었습니다." : "Cost reported for 20 of 22 runs.")).toBeVisible();
    await page.getByRole("radio", { name: ko ? "7일" : "7 days", exact: true }).click();
    await expect(outcomes).toContainText(ko ? "종료된 실행 14개 중 10개 완료" : "10 of 14 ended runs completed");
    const refresh = page.getByRole("button", { name: ko ? "에이전트 성과 새로고침" : "Refresh agent performance" });
    await refresh.click();
    await expect(refresh).toBeDisabled();
    await expect(refresh).toBeEnabled();
    await expect(outcomes).toContainText("71%");
    await page.getByRole("button", { name: /^Reviewer/ }).click();
    await page.getByRole("button", { name: ko ? /^Reviewer 보고서 열기/ : /^Open Reviewer report/ }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`agent-performance-${lang}.png`), fullPage: true, animations: "disabled" });
  });

  for (const theme of ["light", "dark"] as const) {
    test(`task outputs: check, undo and draft-only follow-up (${lang}, ${theme}, 320px)`, async ({ page }, testInfo) => {
      await page.goto(`/?stavePreview=task-panel&tab=results&panelWidth=320&lang=${lang}&theme=${theme}`);
      const outputs = page.getByRole("region", { name: ko ? "작업 산출물" : "Task outputs" });
      await expect(page.getByRole("tab", { name: ko ? /^산출물/ : /^Outputs/ })).toHaveAttribute("aria-selected", "true");
      await expect(outputs.getByRole("button", { name: ko ? "미확인" : "Unchecked", exact: true })).toHaveAttribute("aria-pressed", "true");
      const check = outputs.getByRole("button", { name: ko ? "확인 표시" : "Mark checked", exact: true });
      await expect(check).toBeHidden();
      await outputs.getByText(summary, { exact: true }).click();
      await expect(outputs.getByRole("button", { name: ko ? "실행 과정 보기" : "View execution", exact: true })).toBeVisible();
      await expect(outputs.getByRole("heading", { name: ko ? "최종 답변" : "Final answer", exact: true })).toBeVisible();
      await expect(outputs.getByText("Tightened the settings sidebar and kept the keyboard order.", { exact: true })).toBeVisible();
      await expect(outputs.getByText(ko ? "모델과 라우팅 정보" : "Model and routing details", { exact: true })).toBeVisible();
      await page.evaluate(async () => {
        const { useAppStore } = await import("/src/store/app.store.ts");
        const state = useAppStore.getState();
        state.updatePromptDraft({ taskId: state.activeTaskId!, patch: { text: "Keep my existing note." } });
      });
      await outputs.getByRole("button", { name: ko ? "후속 요청 초안" : "Draft follow-up", exact: true }).click();
      const state = await page.evaluate(async () => {
        const { useAppStore } = await import("/src/store/app.store.ts");
        const state = useAppStore.getState();
        return { draft: state.promptDraftByTask[state.activeTaskId!]?.text, active: state.activeTurnIdsByTask[state.activeTaskId!] };
      });
      expect(state.draft).toContain("Keep my existing note.");
      expect(state.draft).toContain("Requested changes:");
      expect(state.active).toBeFalsy();
      await expect(outputs.getByRole("status")).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`task-outputs-${lang}-${theme}.png`), fullPage: true, animations: "disabled" });
      await check.click();
      await expect(outputs.getByText(summary, { exact: true })).toHaveCount(0);
      await outputs.getByRole("button", { name: ko ? "전체 산출물" : "All outputs", exact: true }).click();
      await outputs.getByText(summary, { exact: true }).click();
      await outputs.getByRole("button", { name: ko ? "미확인 표시" : "Mark unchecked", exact: true }).click();
      await expect(check).toBeVisible();
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("stave:result-reviews:v1") ?? "[]"));
      expect(saved.find((row: { summary: string }) => row.summary === summary).reviewedAt).toBeNull();
      const frame = page.getByTestId("task-panel-frame");
      expect(await frame.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    });
  }
}

test("overview empty and failure states explain the next action", async ({ page }) => {
  await page.goto("/?stavePreview=results&state=empty");
  await expect(page.getByRole("heading", { name: "No ended agent runs in this sample" })).toBeVisible();
  await expect(page.getByText(/Ordinary chat answers are saved/)).toBeVisible();
  await page.goto("/?stavePreview=results&state=failed");
  await expect(page.getByRole("alert")).toContainText("The run database is locked.");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});

test("a finished agent report stays available behind its disclosure", async ({ page }) => {
  await page.goto("/?stavePreview=task-panel&task=agent-run&tab=results&panelWidth=384");
  await expect(page.getByRole("region", { name: "Task outputs" })).toBeVisible();
  await page.evaluate(async () => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    const { useAgentRunsStore, agentRunTaskKey } = await import("/src/store/agent-runs-store.ts");
    const { buildAgentRunFixtures } = await import("/src/dev/agent-run-preview/agent-run-fixtures.ts");
    const app = useAppStore.getState();
    const store = useAgentRunsStore.getState();
    const id = store.agentRunIdByTask[agentRunTaskKey(app.activeWorkspaceId!, app.activeTaskId!)]!;
    const detail = store.details[id]!;
    useAgentRunsStore.setState({ details: { ...store.details, [id]: { ...detail, report: buildAgentRunFixtures(new Date()).ready.report } } });
  });
  const disclosure = page.getByText("Agent run report and actions", { exact: true });
  await expect(disclosure).toBeVisible();
  const report = disclosure.locator("..");
  await expect(report).not.toHaveAttribute("open");
  await disclosure.click();
  await expect(report).toHaveAttribute("open");
  await expect(report.getByRole("button", { name: "Copy Markdown", exact: true })).toBeVisible();
  await expect(report).toContainText("Fix the billing table overflow on narrow screens.");
});
