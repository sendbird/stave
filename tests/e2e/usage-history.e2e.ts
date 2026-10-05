import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"]) {
  test(`usage history fits a narrow surface and exposes details by keyboard in ${theme} mode`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/?stavePreview=usage&theme=${theme}&width=384`);
    await page.getByRole("tab", { name: "History", exact: true }).click();
    const history = page.getByRole("region", { name: "Turn usage history" });
    const rows = history.locator("details");
    await expect(rows).toHaveCount(20);
    await expect(history.getByRole("heading", { level: 3 })).toHaveCount(4);
    const first = rows.first();
    await expect(first.locator("summary")).toContainText("Not reported");
    expect(await first.locator("summary > span").first().evaluate((element) => element.clientWidth)).toBeGreaterThan(150);
    await expect(first.locator("dl")).not.toBeVisible();
    await first.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(first).toHaveAttribute("open", "");
    await expect(first.locator("dl")).toContainText("Claude · System default");
    await expect(first.locator("dd").nth(2)).toHaveText("Not reported");
    const bounds = await history.evaluate((element) => ({ width: element.clientWidth, content: element.scrollWidth }));
    expect(bounds.content).toBeLessThanOrEqual(bounds.width);
    await page.keyboard.press("Space");
    await expect(first).not.toHaveAttribute("open");
    await rows.nth(6).locator("summary").click();
    await expect(rows.nth(6).locator("summary")).toContainText("69,418");
    await expect(rows.nth(6).locator("dl")).toContainText("30,500 / 0");
  });
}

for (const theme of ["light", "dark"]) {
  test(`usage history scrolls within the app surface in ${theme} mode`, async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 720 });
    // The preview uses the same block container as AppShell. A flex parent
    // would hide a missing height on UsageView's scroll container.
    await page.goto(`/?stavePreview=usage&theme=${theme}`);
    await page.getByRole("tab", { name: "History", exact: true }).click();
    const history = page.getByRole("region", { name: "Turn usage history" });
    await expect(history.locator("details")).toHaveCount(20);
    const scroll = page.getByRole("main", { name: "AI usage statistics" }).locator("..");
    await expect.poll(() => scroll.evaluate((element) => element.clientHeight)).toBeLessThan(720);
    const size = await scroll.evaluate((element) => ({
      height: element.clientHeight,
      parentHeight: element.parentElement!.clientHeight,
      contentHeight: element.scrollHeight,
    }));
    expect(size.height).toBe(size.parentHeight);
    expect(size.contentHeight).toBeGreaterThan(size.height);

    await scroll.hover();
    await page.mouse.wheel(0, 600);
    await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await history.getByRole("button", { name: "Next turns" }).scrollIntoViewIfNeeded();
    await expect(history.getByRole("button", { name: "Next turns" })).toBeInViewport();
    await expect(page.getByRole("button", { name: "Previous turns" })).toBeDisabled();
    await expect(history.getByText("1–20 of 180 turns", { exact: true })).toBeVisible();
  });
}

test("usage history pages by 20, handles the last partial page and resets after filtering", async ({ page }) => {
  await page.goto("/?stavePreview=usage");
  await page.getByRole("tab", { name: "History", exact: true }).click();
  const history = page.getByRole("region", { name: "Turn usage history" });
  const rows = history.locator("details");
  const next = history.getByRole("button", { name: "Next turns" });
  const previous = history.getByRole("button", { name: "Previous turns" });
  await expect(rows).toHaveCount(20);
  const firstPage = await rows.allTextContents();
  const starts = await rows.locator("summary time").evaluateAll((times) => times.map((time) => time.getAttribute("datetime")!));
  expect(starts).toEqual([...starts].sort().reverse());

  await next.click();
  await expect(history.getByText("21–40 of 180 turns", { exact: true })).toBeVisible();
  await expect(rows).toHaveCount(20);
  const secondPage = await rows.allTextContents();
  expect(secondPage.some((row) => firstPage.includes(row))).toBe(false);
  await previous.click();
  await expect(history.getByText("1–20 of 180 turns", { exact: true })).toBeVisible();
  expect(await rows.allTextContents()).toEqual(firstPage);

  await page.getByRole("combobox", { name: "Provider", exact: true }).click();
  await page.getByRole("option", { name: "Claude", exact: true }).click();
  await expect(history.getByText("1–20 of 90 turns", { exact: true })).toBeVisible();
  for (const start of [21, 41, 61, 81]) {
    await next.click();
    await expect(history.getByText(`${start}–${Math.min(start + 19, 90)} of 90 turns`, { exact: true })).toBeVisible();
  }
  await expect(rows).toHaveCount(10);
  await expect(next).toBeDisabled();
  await expect(previous).toBeEnabled();

  await page.getByRole("combobox", { name: "Period", exact: true }).click();
  await page.getByRole("option", { name: "Today", exact: true }).click();
  await expect(history.getByText("1–3 of 3 turns", { exact: true })).toBeVisible();
  await expect(rows).toHaveCount(3);
  await expect(previous).toBeDisabled();
  await expect(next).toBeDisabled();
});
