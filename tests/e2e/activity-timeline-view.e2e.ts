import { expect, test } from "@playwright/test";

/**
 * The Activity tab's List | Timeline switch in the Task panel preview: the
 * list is the default, Timeline replaces the steps with the turn timeline and
 * its legend, and List brings the steps back.
 */
for (const lang of ["en", "ko"] as const) {
  test(`the activity view switches between the list and the timeline (${lang})`, async ({ page }) => {
    await page.goto(`/?stavePreview=task-panel&tab=activity&panelWidth=560&lang=${lang}`);
    const frame = page.getByTestId("task-panel-frame");
    const view = frame.getByRole("radiogroup", { name: lang === "ko" ? "활동 보기 방식" : "Activity view" });
    await expect(view).toBeVisible();
    const list = view.getByRole("radio", { name: lang === "ko" ? "목록" : "List" });
    const timeline = view.getByRole("radio", { name: lang === "ko" ? "타임라인" : "Timeline" });
    await expect(list).toBeChecked();
    await expect(frame.getByTestId("turn-trace-timeline")).toHaveCount(0);

    await timeline.click();
    await expect(timeline).toBeChecked();
    await expect(frame.getByTestId("turn-trace-timeline")).toBeVisible();
    await expect(frame.getByTestId("turn-trace-legend")).toBeVisible();
    await expect(frame.getByRole("group", { name: lang === "ko" ? "턴 타임라인" : "Turn timeline" })).toBeVisible();

    await list.click();
    await expect(frame.getByTestId("turn-trace-timeline")).toHaveCount(0);
    await expect(frame.getByTestId("turn-trace-legend")).toHaveCount(0);
  });
}
