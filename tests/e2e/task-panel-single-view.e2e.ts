import { expect, test, type Page } from "@playwright/test";

/**
 * The Task panel on the preview, at rail width: the state on one line (one
 * status function decides it), what the user must do only while something
 * waits, the result or why it stopped, the conditions still open, and the
 * record views one tab at a time, Activity first. A past turn picked under
 * Activity moves the state with it.
 */
const COPY = {
  en: {
    working: "Working",
    onHold: "Waiting",
    resumes: "Resumes on its own",
    reviewRequest: "Review request",
    waiting: "Waiting for you",
    finished: "Finished",
    stopped: "Stopped",
    needs: "What you need to do",
    result: "Result",
    remaining: "Still open",
    earlier: "Earlier turn",
    latest: "Back to latest",
    answer: "Answer",
    showAnswer: "Show answer",
    pr: "#128",
  },
  ko: {
    working: "작업 중",
    onHold: "대기 중",
    resumes: "자동으로 재개",
    reviewRequest: "요청 보기",
    waiting: "사용자 확인 대기 중",
    finished: "완료",
    stopped: "중지됨",
    needs: "해야 할 일",
    result: "결과",
    remaining: "남은 조건",
    earlier: "이전 턴",
    latest: "최신 턴으로",
    answer: "답변하기",
    showAnswer: "답변 보기",
    pr: "#128",
  },
} as const;

async function open(page: Page, query: string) {
  await page.setViewportSize({ width: 460, height: 960 });
  await page.goto(`/?stavePreview=task-panel&panelWidth=372&${query}`);
  const frame = page.getByTestId("task-panel-frame");
  await expect(frame).toBeVisible();
  return frame;
}

for (const lang of ["en", "ko"] as const) {
  const copy = COPY[lang];
  for (const theme of ["light", "dark"] as const) {
    test(`a failed last turn reads Stopped with its reason and opens on that failure (${lang}, ${theme})`, async ({ page }) => {
      const frame = await open(page, `task=plain&lang=${lang}&theme=${theme}`);
      await expect(frame.getByRole("tablist")).toHaveCount(1);
      await expect(frame.getByRole("tab")).toHaveCount(5);
      await expect(frame.locator("details[data-testid='task-details']")).toHaveCount(0);
      const state = frame.getByTestId("task-state");
      await expect(state).toContainText(copy.stopped);
      // One status: the run header's "Completed" no longer sits beside the failed turn.
      await expect(frame.getByText(lang === "en" ? "Last run" : "최근 실행", { exact: true })).toHaveCount(0);
      await expect(state).not.toContainText(copy.finished);
      const result = frame.getByRole("region", { name: copy.result });
      await expect(result).toContainText("Stream closed before the turn finished.");
      // Opened on that failure: Activity is selected, on the failed turn's record.
      await expect(frame.getByTestId("task-section-activity")).toHaveAttribute("aria-selected", "true");
      await expect(frame.getByTestId("turn-record")).toBeVisible();
      // Removed: the list/timeline switch, the approval tallies and the record's internal notes.
      await expect(frame.getByTestId("turn-activity-view")).toHaveCount(0);
      await expect(frame.getByTestId("turn-approval-record")).toHaveCount(0);
      await expect(frame.getByText(/keep the record small|기록을 작게/)).toHaveCount(0);
      // Nothing waits on the user, so that section is absent.
      await expect(frame.getByRole("region", { name: copy.needs })).toHaveCount(0);
    });
  }

  test(`a finished task leads with its pull request and answer (${lang})`, async ({ page }) => {
    const frame = await open(page, `task=plain&outcome=completed&lang=${lang}`);
    await expect(frame.getByTestId("task-state")).toContainText(copy.finished);
    const result = frame.getByRole("region", { name: copy.result });
    await expect(result.getByRole("link", { name: new RegExp(copy.pr) })).toBeVisible();
    await expect(result.getByRole("button", { name: copy.showAnswer })).toBeVisible();
    await expect(frame.getByTestId("task-section-activity")).toHaveAttribute("aria-selected", "true");
  });

  test(`a running agent run lists only open conditions and shows its steps under Steps (${lang})`, async ({ page }) => {
    const frame = await open(page, `task=agent-run&lang=${lang}`);
    await expect(frame.getByTestId("task-state")).toContainText(copy.working);
    const remaining = frame.getByRole("region", { name: copy.remaining });
    await expect(remaining).toContainText("The default page size is documented");
    await expect(remaining).not.toContainText("/users accepts limit and offset");
    await expect(frame.getByRole("region", { name: copy.result })).toHaveCount(0);
    // The live turn's steps are on screen without opening anything.
    await expect(frame.getByRole("tabpanel").getByText("bun test tests/users", { exact: false }).first()).toBeVisible();
    await expect(frame.getByTestId("agent-run-panel")).toHaveCount(0);
    await frame.getByTestId("task-section-steps").click();
    await expect(frame.getByTestId("agent-run-panel")).toBeVisible();
    // The run's stages are listed once: no badge row or stage track repeats the state.
    await expect(frame.getByTestId("agent-run-panel").locator("[data-stage-track]")).toHaveCount(0);
  });

  test(`a pending question puts the answer first (${lang})`, async ({ page }) => {
    const frame = await open(page, `task=agent-run&pending=user_input&lang=${lang}`);
    await expect(frame.getByTestId("task-state")).toContainText(copy.waiting);
    const needs = frame.getByRole("region", { name: copy.needs });
    await expect(needs.getByRole("button", { name: copy.answer })).toBeVisible();
  });

  test(`picking an earlier turn moves the title and state to that turn (${lang})`, async ({ page }) => {
    const frame = await open(page, `task=plain&lang=${lang}`);
    await expect(frame.getByTestId("task-state")).toContainText(copy.stopped);
    await frame.getByTestId("turn-history-bar").getByRole("combobox").click();
    await page.getByRole("option", { name: /Look at the settings sidebar spacing/ }).click();
    await expect(frame.getByTestId("task-state-title")).toContainText(copy.earlier);
    await expect(frame.getByTestId("task-state")).toContainText(copy.finished);
    await frame.getByRole("button", { name: copy.latest }).click();
    await expect(frame.getByTestId("task-state-title")).toHaveCount(0);
    await expect(frame.getByTestId("task-state")).toContainText(copy.stopped);
  });

  test(`Working says on its line what the live turn runs now, cut to the rail (${lang})`, async ({ page }) => {
    const frame = await open(page, `task=agent-run&lang=${lang}`);
    const state = frame.getByTestId("task-state");
    await expect(state).toContainText(copy.working);
    await expect(state.getByTestId("task-state-activity")).toHaveText("Run command · bun test tests/users");
    // One line: the words never wrap and never widen the rail.
    const box = await state.boundingBox();
    expect(box!.height).toBeLessThan(32);
    expect(await frame.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  });

  test(`a run waiting for its usage reset waits on nobody and says when it resumes (${lang})`, async ({ page }) => {
    const frame = await open(page, `task=agent-run&run=usage-wait&lang=${lang}`);
    const state = frame.getByTestId("task-state");
    await expect(state).toHaveAttribute("data-task-state", "on-hold");
    await expect(state).toContainText(copy.onHold);
    await expect(state).not.toContainText(copy.working);
    await expect(frame.getByRole("region", { name: copy.needs })).toHaveCount(0);
    await expect(frame.getByRole("region", { name: copy.resumes })).toContainText(lang === "en" ? "Waiting for usage reset at" : "사용량 초기화를 기다립니다");
  });

  test(`an approval under an older open question shows and jumps to that approval (${lang})`, async ({ page }) => {
    const frame = await open(page, `task=agent-run&older=question&lang=${lang}`);
    const needs = frame.getByRole("region", { name: copy.needs });
    await expect(needs).toContainText("Run the database migration");
    await expect(needs).not.toContainText("Should /users keep returning every row");
    await needs.getByRole("button", { name: copy.reviewRequest }).click();
    const target = await page.evaluate(async () => {
      const { useAppStore } = await import("/src/store/app.store.ts");
      return useAppStore.getState().focusTranscriptToolRequest?.decision ?? null;
    });
    expect(target).toEqual({ messageId: "ma1", requestId: "preview-live-approval" });
  });

  test(`restored messages that stop before the newest saved failure read Stopped (${lang})`, async ({ page }) => {
    const frame = await open(page, `task=plain&restored=1&lang=${lang}`);
    await expect(frame.getByTestId("task-state")).toContainText(copy.stopped);
    const result = frame.getByRole("region", { name: copy.result });
    await expect(result).toContainText("Stream closed before the turn finished.");
    await expect(result.getByRole("button", { name: copy.showAnswer })).toHaveCount(0);
  });
}

for (const [lang, theme, panelWidth, density] of [["en", "light", 420, "regular"], ["ko", "dark", 270, "compact"]] as const) {
  test(`background work fits the task rail and follows available output (${lang}, ${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 1000 });
    await page.goto(`/?stavePreview=task-panel&task=agent-run&background=1&panelWidth=${panelWidth}&lang=${lang}&theme=${theme}&density=${density}`);
    const frame = page.getByTestId("task-panel-frame");
    await frame.getByTestId("task-section-background").click();
    const section = frame.getByRole("tabpanel", { name: lang === "en" ? "Background" : "백그라운드", exact: true });
    const rows = section.getByTestId("background-task-row");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText(lang === "en" ? "Provider confirmed" : "프로바이더 확인");
    await expect(rows.nth(2)).toContainText(lang === "en" ? "Inferred" : "추정");
    const stop = lang === "en" ? "Stop" : "중지";
    await expect(rows.nth(0).getByRole("button", { name: stop, exact: true })).toBeVisible();
    await expect(rows.nth(1).getByRole("button", { name: stop, exact: true })).toHaveCount(0);
    await expect(rows.nth(2).getByRole("button", { name: stop, exact: true })).toHaveCount(0);
    const log = lang === "en" ? "Recent output" : "최근 출력";
    await rows.nth(0).getByText(log, { exact: true }).click();
    const tail = rows.nth(0).locator("pre");
    await expect(tail).toContainText(/Batch [1-9]/);
    const initialTail = await tail.textContent();
    await expect(tail).not.toHaveText(initialTail!);
    await page.evaluate(() => document.fonts.ready);
    expect(await tail.evaluate((node) => node.scrollWidth <= node.clientWidth + 1 && node.scrollHeight > node.clientHeight)).toBe(true);
    expect(await tail.evaluate((node) => Math.abs(node.scrollHeight - node.clientHeight - node.scrollTop))).toBeLessThanOrEqual(1);
    expect((await frame.boundingBox())?.width).toBe(panelWidth);
    expect(await frame.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  });
}
