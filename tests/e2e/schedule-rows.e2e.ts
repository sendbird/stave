import { expect, test, type Locator } from "@playwright/test";

/** The result mark against its single-line label: centers, in px. */
async function markLabelDelta(result: Locator) {
  return result.evaluate((element) => {
    const mark = element.querySelector("[data-state]")!.getBoundingClientRect();
    const label = element.querySelector("span:not([data-state])")!.getBoundingClientRect();
    return mark.y + mark.height / 2 - (label.y + label.height / 2);
  });
}

for (const lang of ["en", "ko"] as const) {
  test(`schedule results wear state marks centered on their label (${lang})`, async ({ page }) => {
    await page.goto(`/?stavePreview=schedules&lang=${lang}`);
    const list = page.getByRole("list", { name: lang === "ko" ? "일정" : "Schedules" });
    await expect(list.locator("li").first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const results = list.locator("li span:has(> [data-state])");
    expect(await results.count()).toBeGreaterThan(2);
    // A failed run, a schedule that has not run and a woken check-back each
    // draw their own state, not one dot color.
    const states = await results.evaluateAll((nodes) =>
      nodes.map((node) => node.querySelector("[data-state]")!.getAttribute("data-state")),
    );
    expect(states).toContain("failed");
    expect(states).toContain("idle");
    for (const result of await results.all()) {
      expect(Math.abs(await markLabelDelta(result))).toBeLessThanOrEqual(1);
    }
  });
}

test("a turned-off schedule reads Off next to Turn on, in the list and the detail (ko)", async ({ page }) => {
  await page.goto("/?stavePreview=schedules&lang=ko");
  const nav = page.getByRole("navigation", { name: /일정/ });
  await expect(nav.getByRole("button").first()).toHaveText(/^일정 · \d+$/);
  await expect(nav.getByRole("button").nth(1)).toHaveText(/^실행 기록( · \d+)?$/);
  const row = page.locator("li", { hasText: "Weekly dependency check" });
  await expect(row.getByText("꺼짐", { exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: "Weekly dependency check 켜기" })).toBeVisible();
  await row.getByText("Weekly dependency check", { exact: true }).click();
  await expect(page.getByText("꺼짐 · 수동으로만 실행", { exact: true })).toBeVisible();
  await expect(page.getByText("Manual only")).toHaveCount(0);
});
