import { expect, test } from "@playwright/test";

const fixture = "/tests/e2e/fixtures/task-message-restore.html";

async function settleRead(page: import("@playwright/test").Page, fail = false) {
  await page.evaluate((fail) => {
    const fixture = (window as unknown as {
      taskRestoreFixture: { complete(): void; fail(): void };
    }).taskRestoreFixture;
    if (fail) fixture.fail();
    else fixture.complete();
  }, fail);
}

async function readCount(page: import("@playwright/test").Page) {
  return page.evaluate(() => (window as unknown as {
    taskRestoreFixture: { reads: unknown[] };
  }).taskRestoreFixture.reads.length);
}

for (const theme of ["light", "dark"]) {
  test(`loads a restored pane without a focus change in ${theme}`, async ({ page }) => {
    await page.goto(`${fixture}?theme=${theme}`);
    await expect.poll(() => readCount(page)).toBe(1);
    await expect(page.getByTestId("conversation-loading-state")).toBeVisible();
    await expect(page.getByTestId("empty-splash")).toHaveCount(0);
    await settleRead(page);
    await expect(page.getByText("The saved conversation is restored.", { exact: true })).toBeVisible();
    expect(await readCount(page)).toBe(1);
  });
}

test("reopening an archived task with an empty window restores its conversation", async ({ page }) => {
  await page.goto(`${fixture}?kind=archived`);
  await page.getByRole("button", { name: "Reopen saved task" }).click();
  await expect.poll(() => readCount(page)).toBe(1);
  await settleRead(page);
  await expect(page.getByText("The saved conversation is restored.", { exact: true })).toBeVisible();
});

test("resident messages are visible even when the shell's count is stale", async ({ page }) => {
  await page.goto(`${fixture}?kind=resident`);
  await expect(page.getByText("The saved conversation is restored.", { exact: true })).toBeVisible();
  await expect(page.getByTestId("empty-splash")).toHaveCount(0);
  expect(await readCount(page)).toBe(0);
});

test("a genuinely empty task keeps its start screen without a history request", async ({ page }) => {
  await page.goto(`${fixture}?kind=empty`);
  await expect(page.getByTestId("empty-splash")).toBeVisible();
  expect(await readCount(page)).toBe(0);
});

test("loads history when shell metadata arrives after the pane is already open", async ({ page }) => {
  await page.goto(`${fixture}?kind=empty`);
  await expect(page.getByTestId("empty-splash")).toBeVisible();
  await page.evaluate(async () => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    useAppStore.setState({ messageCountByTask: { "restored-task": 1 } });
  });
  await expect.poll(() => readCount(page)).toBe(1);
  await expect(page.getByTestId("empty-splash")).toHaveCount(0);
  await settleRead(page);
  await expect(page.getByText("The saved conversation is restored.", { exact: true })).toBeVisible();
  expect(await page.evaluate(async () => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    return useAppStore.getState().activeTaskId;
  })).toBe("other-task");
});

test("a failed read allows an explicit retry without repeated background requests", async ({ page }) => {
  await page.goto(fixture);
  await expect.poll(() => readCount(page)).toBe(1);
  await settleRead(page, true);
  const retry = page.getByRole("button", { name: /retry/i });
  await expect(retry).toBeVisible();
  expect(await readCount(page)).toBe(1);
  await retry.click();
  await expect.poll(() => readCount(page)).toBe(2);
  await settleRead(page);
  await expect(page.getByText("The saved conversation is restored.", { exact: true })).toBeVisible();
});
