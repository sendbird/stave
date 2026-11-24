import { expect, test } from "@playwright/test";

const FIXTURE = "/tests/e2e/fixtures/workspace-scratch.html";

test("lists scratch files newest first and previews the newest until one is picked", async ({ page }) => {
  await page.goto(FIXTURE);
  const panel = page.getByTestId("workspace-scratch-panel");
  await expect(panel).toContainText("3 files");
  const rows = page.getByRole("list", { name: "Scratch files" }).getByRole("button");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("lens/20261124-153012-1.png");
  await expect(rows.nth(0)).toContainText("New");
  await expect(rows.nth(1)).toContainText("tests.log");
  await expect(rows.nth(1)).not.toContainText("New");
  await expect(rows.nth(0)).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("img", { name: "lens/20261124-153012-1.png" })).toBeVisible();

  await rows.nth(2).click();
  await expect(rows.nth(2)).toHaveAttribute("aria-current", "true");
  await expect(page.getByTestId("scratch-preview-body")).toContainText('"name": "Ada"');

  // A new file appears on the next poll, and the picked file stays selected.
  await page.evaluate(() => (window as any).scratchFixture.addFile(".stave/scratch/build.log", "built\n"));
  await expect(rows).toHaveCount(4, { timeout: 4_000 });
  await expect(rows.nth(0)).toContainText("build.log");
  await expect(page.getByRole("button", { name: /api\/response\.json/ })).toHaveAttribute("aria-current", "true");
});

test("a log follows its end while the reader stays at the bottom", async ({ page }) => {
  await page.goto(FIXTURE);
  await page.getByRole("button", { name: /tests\.log/ }).click();
  const body = page.getByTestId("scratch-preview-body");
  await expect(body).toContainText("ok 80 - renders row 80");
  const distanceFromEnd = () =>
    body.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight);
  await expect.poll(distanceFromEnd).toBeLessThan(2);

  await page.evaluate(() => (window as any).scratchFixture.appendLog(40));
  await expect(body).toContainText("ok 120 - renders row 120", { timeout: 4_000 });
  await expect.poll(distanceFromEnd).toBeLessThan(2);

  // Scrolled up to read, it stays put when more lines arrive.
  await body.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event("scroll"));
  });
  await page.evaluate(() => (window as any).scratchFixture.appendLog(10));
  await expect(body).toContainText("ok 130 - renders row 130", { timeout: 4_000 });
  expect(await body.evaluate((element) => element.scrollTop)).toBe(0);
});

test("an empty folder explains what lands there, in both languages", async ({ page }) => {
  await page.goto(`${FIXTURE}?empty=1`);
  const empty = page.getByTestId("workspace-scratch-empty");
  await expect(empty).toContainText("No scratch files yet");
  await expect(empty).toContainText(".stave/scratch/");
  await page.goto(`${FIXTURE}?empty=1&locale=ko`);
  await expect(page.getByTestId("workspace-scratch-empty")).toContainText("아직 스크래치 파일이 없습니다");
});

test("rows keep their name, age and size on one line at rail width", async ({ page }) => {
  for (const query of ["", "?theme=dark&locale=ko"]) {
    await page.goto(`${FIXTURE}${query}`);
    await page.evaluate(() => document.fonts.ready);
    const row = page.getByRole("button", { name: /tests\.log/ });
    await expect(row).toBeVisible();
    const box = await row.boundingBox();
    const panel = await page.getByTestId("scratch-rail-panel").boundingBox();
    expect(box && panel && box.x + box.width <= panel.x + panel.width + 0.5).toBe(true);
    // The list's 8px gutter on both sides (the left one also clears the fixture's 1px border).
    const leftInset = box!.x - panel!.x;
    const rightInset = panel!.x + panel!.width - (box!.x + box!.width);
    expect(leftInset).toBeGreaterThanOrEqual(8);
    expect(leftInset).toBeLessThanOrEqual(9.5);
    expect(rightInset).toBeGreaterThanOrEqual(7.5);
    expect(rightInset).toBeLessThanOrEqual(8.5);
    // One line: the row is no taller than its minimum control height plus padding.
    expect(box!.height).toBeLessThanOrEqual(40);
    if (process.env.SCRATCH_SCREENSHOT_DIR) {
      await page.screenshot({
        path: `${process.env.SCRATCH_SCREENSHOT_DIR}/scratch${query ? "-dark-ko" : "-light-en"}.png`,
      });
    }
  }
});
