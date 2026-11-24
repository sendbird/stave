import { expect, test } from "@playwright/test";

const FIXTURE = "/tests/e2e/fixtures/workspace-scratch.html";

test("lists scratch files newest first and previews the newest until one is picked", async ({ page }) => {
  await page.goto(FIXTURE);
  const panel = page.getByTestId("workspace-scratch-panel");
  await expect(panel).toContainText("3 files");
  await expect(panel).toHaveAttribute("data-scratch-refresh", "watch");
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

  // A new file appears on the change notice, and the picked file stays selected.
  await page.evaluate(() => (window as any).scratchFixture.addFile(".stave/scratch/build.log", "built\n"));
  await expect(rows).toHaveCount(4, { timeout: 4_000 });
  await expect(rows.nth(0)).toContainText("build.log");
  await expect(page.getByRole("button", { name: /api\/response\.json/ })).toHaveAttribute("aria-current", "true");
});

test("while the folder is watched the panel lists only on change notices, and polls when it cannot watch", async ({ page }) => {
  await page.goto(FIXTURE);
  const panel = page.getByTestId("workspace-scratch-panel");
  await expect(panel).toHaveAttribute("data-scratch-refresh", "watch");
  const listCalls = () => page.evaluate(() => (window as any).scratchFixture.listCalls() as number);
  const settled = await listCalls();
  await page.waitForTimeout(3_500);
  // No 1.5 s timer while watching: nothing changed, nothing was listed.
  expect(await listCalls()).toBe(settled);
  await page.evaluate(() => (window as any).scratchFixture.addFile(".stave/scratch/notice.txt", "x"));
  await expect(page.getByRole("button", { name: /notice\.txt/ })).toBeVisible({ timeout: 1_000 });

  await page.goto(`${FIXTURE}?watch=0`);
  await expect(page.getByTestId("workspace-scratch-panel")).toHaveAttribute("data-scratch-refresh", "poll");
  const before = await listCalls();
  await page.waitForTimeout(3_500);
  expect(await listCalls()).toBeGreaterThanOrEqual(before + 2);
  await page.evaluate(() => (window as any).scratchFixture.addFile(".stave/scratch/polled.txt", "x"));
  await expect(page.getByRole("button", { name: /polled\.txt/ })).toBeVisible({ timeout: 4_000 });
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

test("a large log previews only its end, with a note", async ({ page }) => {
  await page.goto(`${FIXTURE}?agents=1`);
  await page.getByRole("button", { name: /^build\.log/ }).click();
  await expect(page.getByTestId("scratch-preview-tail-note")).toHaveText("Showing the last 256 KB of 3.0 MB.");
  await expect(page.getByTestId("scratch-preview-body")).toContainText("[build] step 1000 of 1000 done");
  // A small file has no note.
  await page.getByRole("button", { name: /tests\.log/ }).click();
  await expect(page.getByTestId("scratch-preview-tail-note")).toHaveCount(0);
  await page.goto(`${FIXTURE}?agents=1&locale=ko`);
  await page.getByRole("button", { name: /^build\.log/ }).click();
  await expect(page.getByTestId("scratch-preview-tail-note")).toHaveText("3.0 MB 중 마지막 256 KB만 표시합니다.");
});

test("sub-agents' files are grouped by agent", async ({ page }) => {
  await page.goto(`${FIXTURE}?agents=1`);
  const group = page.getByRole("list", { name: "Files from sub-agent run-ui-tests-1a2b3c" });
  await expect(group.getByRole("button")).toHaveCount(2);
  await expect(group.getByRole("button").nth(0)).toContainText("playwright.log");
  await expect(group.getByRole("button").nth(1)).toContainText("shots/login.png");
  await expect(page.getByText("Sub-agent run-ui-tests-1a2b3c")).toBeVisible();
  await expect(page.getByRole("list", { name: "Files from sub-agent review-api-9f8e7d" }).getByRole("button")).toHaveCount(1);
  // The group sits where its newest file falls: after the screenshot written 2 s ago.
  const all = page.getByRole("list", { name: "Scratch files" }).getByRole("button");
  await expect(all.nth(0)).toContainText("lens/20261124-153012-1.png");
  await expect(all.nth(1)).toContainText("playwright.log");
  await group.getByRole("button").nth(0).click();
  await expect(page.getByTestId("scratch-preview-body")).toContainText("✓ checkout");
});

test("attaches a scratch file to the task's message from the row menu or the preview", async ({ page }) => {
  await page.goto(FIXTURE);
  await page.getByRole("button", { name: /tests\.log/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Attach to message" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).scratchFixture.attachedFilePaths())).toEqual([
    ".stave/scratch/tests.log",
  ]);
  expect(await page.evaluate(() => (window as any).scratchFixture.attachCalls())).toEqual([
    { rootPath: "/tmp/scratch-fixture-workspace", entries: [{ absolutePath: "/tmp/scratch-fixture-workspace/.stave/scratch/tests.log" }] },
  ]);
  await expect(page.getByText("Attached to the message: tests.log")).toBeVisible();

  await page.getByRole("button", { name: /api\/response\.json/ }).click();
  await page.getByRole("button", { name: "Attach to message" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).scratchFixture.attachedFilePaths())).toEqual([
    ".stave/scratch/tests.log",
    ".stave/scratch/api/response.json",
  ]);
});

test("explains retention: 30 days in the main checkout, archiving in a worktree", async ({ page }) => {
  await page.goto(FIXTURE);
  await expect(page.getByTestId("workspace-scratch-footer")).toHaveText("Files older than 30 days are removed automatically.");
  await page.goto(`${FIXTURE}?worktree=1`);
  await expect(page.getByTestId("workspace-scratch-footer")).toHaveText("The files are removed when this workspace is archived.");
  await page.goto(`${FIXTURE}?locale=ko`);
  await expect(page.getByTestId("workspace-scratch-footer")).toHaveText("30일이 지난 파일은 자동으로 삭제됩니다.");
});

test("an empty folder explains what lands there, in both languages", async ({ page }) => {
  await page.goto(`${FIXTURE}?empty=1`);
  const empty = page.getByTestId("workspace-scratch-empty");
  await expect(empty).toContainText("No scratch files yet");
  await expect(empty).toContainText(".stave/scratch/");
  await expect(empty).toContainText("Files older than 30 days are removed automatically.");
  await page.goto(`${FIXTURE}?empty=1&locale=ko`);
  await expect(page.getByTestId("workspace-scratch-empty")).toContainText("아직 스크래치 파일이 없습니다");
  await expect(page.getByTestId("workspace-scratch-empty")).toContainText("30일이 지난 파일은 자동으로 삭제됩니다.");
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

test("a nested sub-agent row is indented, stays on one line and inside the rail", async ({ page }) => {
  for (const query of ["?agents=1", "?agents=1&theme=dark&locale=ko"]) {
    await page.goto(`${FIXTURE}${query}`);
    await page.evaluate(() => document.fonts.ready);
    const topLevel = await page.getByRole("button", { name: /tests\.log/ }).boundingBox();
    const nested = page.getByRole("button", { name: /playwright\.log/ });
    const nestedBox = await nested.boundingBox();
    const nestedIcon = await nested.locator("svg").first().boundingBox();
    const topIcon = await page.getByRole("button", { name: /tests\.log/ }).locator("svg").first().boundingBox();
    const panel = await page.getByTestId("scratch-rail-panel").boundingBox();
    // Same row box, icon indented by the nesting step.
    expect(Math.abs(nestedBox!.x - topLevel!.x)).toBeLessThanOrEqual(0.5);
    expect(nestedIcon!.x - topIcon!.x).toBeGreaterThanOrEqual(12);
    expect(nestedBox!.x + nestedBox!.width).toBeLessThanOrEqual(panel!.x + panel!.width + 0.5);
    expect(nestedBox!.height).toBeLessThanOrEqual(40);
    if (process.env.SCRATCH_SCREENSHOT_DIR) {
      await page.getByRole("button", { name: /^build\.log/ }).click();
      await expect(page.getByTestId("scratch-preview-tail-note")).toBeVisible();
      await page.screenshot({
        path: `${process.env.SCRATCH_SCREENSHOT_DIR}/scratch-agents${query.includes("dark") ? "-dark-ko" : "-light-en"}.png`,
      });
    }
  }
});
