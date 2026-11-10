import { expect, test, type Page } from "@playwright/test";

/**
 * Schedules set up by talking to Tars, on the preview with the page's clock
 * under the test's control: Tuesday 10 November 2026, 08:00 in Seoul. The
 * preview's stand-in for the Schedules service uses the service's own rule
 * and next-run math and fires due schedules from a timer, so moving the clock
 * fires one.
 */
test.use({ viewport: { width: 1440, height: 1000 }, timezoneId: "Asia/Seoul" });

const START = new Date("2026-11-10T08:00:00+09:00");
const composer = (page: Page) => page.locator("[data-tars-composer]");
const editor = (page: Page) => composer(page).getByRole("textbox");
const view = (page: Page) => page.getByTestId("tars-view");
const card = (page: Page) => view(page).locator("[data-tars-schedule-card]");
const section = (page: Page) => view(page).locator("[data-tars-schedules]");
const rowText = (page: Page, key: string) => card(page).locator(`[data-tars-schedule-row="${key}"] dd`);

async function open(page: Page, query = "schedules=true") {
  await page.clock.install({ time: START });
  await page.goto(`/?stavePreview=tars&${query}`);
  await expect(editor(page)).toBeVisible();
}
async function send(page: Page, text: string) {
  await editor(page).fill(text);
  await editor(page).press("Enter");
}

test.describe("Tars schedules", () => {
  test("propose, read the card, confirm, see it listed, let it fire and find the run recorded as the schedule's", async ({ page }) => {
    await open(page);
    await expect(section(page).locator("[data-tars-schedules-count]")).toHaveText("0");

    await send(page, "Every weekday at 9, check the release branch.");
    await expect(card(page)).toContainText("Create this schedule?");
    await expect(card(page)).toContainText("Nothing is created until you confirm.");
    // Exactly what will run, where, and when: the next two runs in local time with the zone.
    await expect(rowText(page, "name")).toHaveText("Check the release branch");
    await expect(rowText(page, "what")).toContainText("Check the release branch for new commits and failing checks");
    await expect(rowText(page, "where")).toHaveText("Release check (main) · preview");
    await expect(rowText(page, "when")).toHaveText("Every weekday at 09:00");
    await expect(rowText(page, "next")).toHaveText("Tue, Nov 10, 9:00 AM and Wed, Nov 11, 9:00 AM (Asia/Seoul)");
    await expect(card(page).locator("[data-tars-schedule-paused-note]")).toContainText("saved paused");
    // Nothing exists before the confirmation.
    await expect(section(page).locator("[data-tars-schedules-count]")).toHaveText("0");

    await card(page).locator('[data-tars-schedule-confirm="enabled"]').click();
    const created = view(page).locator('[data-tars-schedule-record="applied"][data-tars-schedule-operation="create"]');
    await expect(created).toContainText("Schedule created and turned on");
    await expect(created).toContainText("Next runs: Tue, Nov 10, 9:00 AM and Wed, Nov 11, 9:00 AM (Asia/Seoul)");
    await expect(created.locator('[data-tars-record-actor="you"]')).toBeVisible();
    await expect(card(page)).toHaveCount(0);

    // Listed under the tray's lanes with its next run, last outcome and a switch that is on.
    const row = section(page).locator("[data-tars-schedule]");
    await expect(section(page).locator("[data-tars-schedules-count]")).toHaveText("1");
    await expect(row.locator("[data-tars-schedule-name]")).toHaveText("Check the release branch");
    await expect(row.locator("[data-tars-schedule-next]")).toHaveText("Next: Tue, Nov 10, 9:00 AM");
    await expect(row.locator("[data-tars-schedule-last]")).toHaveText("Not run yet");
    await expect(row.getByRole("switch")).toBeChecked();
    await expect(section(page).locator("[data-tars-schedules-timezone]")).toHaveText("Times are in Asia/Seoul.");
    await expect(view(page).locator("[data-tars-schedule-run]")).toHaveCount(0);

    // 09:00 arrives: the schedule fires and its run is in the conversation with the schedule as its actor, not the user.
    await page.clock.fastForward("01:00:05");
    const run = view(page).locator("[data-tars-schedule-run]");
    await expect(run).toHaveCount(1);
    await expect(run).toHaveAttribute("data-tars-schedule-run", "running");
    await expect(run).toContainText("Scheduled run started");
    await expect(run).toContainText("Check the release branch");
    await expect(run.locator('[data-tars-record-actor="schedule"]')).toBeVisible();
    await expect(run.locator('[data-tars-record-actor="you"]')).toHaveCount(0);
    await expect(row.locator("[data-tars-schedule-next]")).toHaveText("Next: Wed, Nov 11, 9:00 AM");
    await expect(row.locator("[data-tars-schedule-last]")).toHaveText("Last run: running");

    // The run ends; the same record follows it.
    await page.clock.fastForward("06:00");
    await expect(run).toHaveAttribute("data-tars-schedule-run", "completed");
    await expect(run).toContainText("Scheduled run finished");

    // The switch pauses it: the user's own click, recorded, and nothing fires the next morning.
    await row.getByRole("switch").click();
    await expect(view(page).locator('[data-tars-schedule-record="applied"][data-tars-schedule-operation="pause"]')).toContainText("Schedule paused");
    await expect(row.locator("[data-tars-schedule-next]")).toHaveText("Paused");
    await expect(row.getByRole("switch")).not.toBeChecked();
    await page.clock.fastForward("24:00:00");
    await expect(view(page).locator("[data-tars-schedule-run]")).toHaveCount(1);

    // A reload is a restart: the schedule, its records and its run are still there.
    await page.reload();
    await expect(section(page).locator("[data-tars-schedule-name]")).toHaveText("Check the release branch");
    await expect(view(page).locator("[data-tars-schedule-run]")).toHaveCount(1);
    await expect(view(page).locator('[data-tars-schedule-operation="create"]')).toContainText("Schedule created and turned on");
  });

  test("Esc declines and creates nothing; Enter creates it paused; the link opens Schedules", async ({ page }) => {
    await open(page);
    await send(page, "Every weekday at 9, check the release branch.");
    await card(page).focus();
    await page.keyboard.press("Escape");
    await expect(view(page).locator('[data-tars-schedule-proposal="declined"]')).toContainText("Declined. No schedule was changed.");
    await expect(section(page).locator("[data-tars-schedules-count]")).toHaveText("0");
    await expect(view(page).locator("[data-tars-schedule-record]")).toHaveCount(0);

    await send(page, "Every weekday at 9, check the release branch please.");
    await card(page).focus();
    await page.keyboard.press("Enter");
    await expect(view(page).locator('[data-tars-schedule-operation="create"]')).toContainText("Schedule created, paused");
    const row = section(page).locator("[data-tars-schedule]");
    await expect(row.locator("[data-tars-schedule-next]")).toHaveText("Paused");
    await expect(row.getByRole("switch")).not.toBeChecked();
    // Paused, it does not fire.
    await page.clock.fastForward("02:00:00");
    await expect(view(page).locator("[data-tars-schedule-run]")).toHaveCount(0);
    // Turning it on from the list is recorded too, and it then has a next run.
    await row.getByRole("switch").click();
    await expect(view(page).locator('[data-tars-schedule-operation="resume"]')).toContainText("Schedule turned on");
    await expect(row.locator("[data-tars-schedule-next]")).toHaveText("Next: Wed, Nov 11, 9:00 AM");

    await section(page).locator("[data-tars-schedules-open]").click();
    await expect(page.locator("html")).toHaveAttribute("data-preview-surface", "automation-center");
  });

  test("a one-time schedule in Korean: the card says once, with the local time and zone, and fires once", async ({ page }) => {
    await open(page, "schedules=true&lang=ko");
    await send(page, "내일 3시에 이거 다시 확인해줘");
    await expect(card(page)).toContainText("이 일정을 만드시겠습니까?");
    await expect(rowText(page, "when")).toContainText("한 번,");
    await expect(rowText(page, "next")).toContainText("(Asia/Seoul)");
    await expect(rowText(page, "next")).toContainText("11월 11일");
    await card(page).locator('[data-tars-schedule-confirm="enabled"]').click();
    await expect(view(page).locator('[data-tars-schedule-operation="create"]')).toContainText("일정을 만들고 켰습니다");
    await page.clock.fastForward("31:00:05");
    await expect(view(page).locator("[data-tars-schedule-run]")).toContainText("일정 실행이 시작되었습니다");
    const row = section(page).locator("[data-tars-schedule]");
    await expect(row.getByRole("switch")).not.toBeChecked();
    // It ran once and turned itself off; a day later nothing more has run.
    await page.clock.fastForward("48:00:00");
    await expect(view(page).locator("[data-tars-schedule-run]")).toHaveCount(1);
    await expect(row.locator("[data-tars-schedule-next]")).toHaveText("완료됨");
  });

  test("a time that passed and an interval under the minimum are refused with their reasons, with no card", async ({ page }) => {
    await open(page);
    await send(page, "Check it yesterday at 3.");
    const past = view(page).locator('[data-tars-receipt="rejected"][data-tars-receipt-kind="schedule"]').first();
    await expect(past).toContainText("That time has already passed.");
    await send(page, "Check the release branch every 20 seconds.");
    await expect(view(page).locator('[data-tars-reason="tooFrequent"]')).toContainText("The shortest interval is 1 minute.");
    await expect(card(page)).toHaveCount(0);
    await expect(section(page).locator("[data-tars-schedules-count]")).toHaveText("0");
  });

  test("changing and removing a schedule Tars created each wait for their own card; removing has no Enter", async ({ page }) => {
    await open(page);
    await send(page, "Every weekday at 9, check the release branch.");
    await card(page).locator('[data-tars-schedule-confirm="enabled"]').click();
    await expect(section(page).locator("[data-tars-schedules-count]")).toHaveText("1");

    await send(page, "Change that schedule to every day at 10:30.");
    await expect(card(page)).toContainText("Change this schedule?");
    await expect(rowText(page, "when")).toContainText("Every day at 10:30");
    await expect(card(page).locator('[data-tars-schedule-was="rule"]')).toContainText("Now: Every weekday at 09:00");
    await expect(rowText(page, "next")).toHaveText("Tue, Nov 10, 10:30 AM and Wed, Nov 11, 10:30 AM (Asia/Seoul)");
    // Not changed until confirmed.
    await expect(section(page).locator("[data-tars-schedule-name]")).toHaveText("Check the release branch");
    await card(page).locator('[data-tars-schedule-confirm="update"]').click();
    await expect(view(page).locator('[data-tars-schedule-operation="update"]')).toContainText("Schedule changed");
    await expect(section(page).locator("[data-tars-schedule-name]")).toHaveText("Check the release branch daily");

    await send(page, "Remove that schedule.");
    await expect(card(page)).toContainText("Remove this schedule?");
    await expect(card(page)).toContainText("Can't be undone");
    await card(page).focus();
    await page.keyboard.press("Enter");
    // Enter does nothing on a removal.
    await expect(card(page)).toBeVisible();
    await expect(section(page).locator("[data-tars-schedules-count]")).toHaveText("1");
    await card(page).locator('[data-tars-schedule-confirm="remove"]').click();
    await expect(view(page).locator('[data-tars-schedule-operation="remove"]')).toContainText("Schedule removed");
    await expect(section(page).locator("[data-tars-schedules-count]")).toHaveText("0");
  });

  test("a schedule the user made in Schedules is refused, with the reason, and is not listed as Tars's", async ({ page }) => {
    await open(page, "schedules=mine");
    await expect(section(page).locator("[data-tars-schedules-count]")).toHaveText("0");
    await send(page, "Pause the nightly schedule.");
    const refused = view(page).locator('[data-tars-receipt="rejected"][data-tars-receipt-kind="schedule"]');
    await expect(refused).toContainText("Tars did not create this schedule");
    await expect(card(page)).toHaveCount(0);
  });

  test("asking to see the schedules unfolds the list", async ({ page }) => {
    await open(page);
    const trigger = section(page).getByRole("button", { name: /^Schedules/ });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await send(page, "Show my schedules.");
    await expect(view(page).locator('[data-tars-receipt="applied"][data-tars-receipt-kind="schedule"]')).toContainText("List opened");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(section(page).locator("[data-tars-schedules-empty]")).toContainText("Nothing is scheduled yet.");
  });
});
