import { expect, test } from "@playwright/test";

/*
 * Fill from this task on a record whose Cautions is nearly full: the line it
 * could not fit stays listed under the section with Put back, instead of only
 * a passing toast. The preview's `record=full` seeds that record.
 */
for (const theme of ["light", "dark"]) {
  test(`a line Fill left out is listed and put back into the draft in ${theme} theme`, async ({ page }) => {
    // A panel as narrow as the side panel, so a long left-out line has to end in an ellipsis.
    await page.setViewportSize({ width: 420, height: 900 });
    await page.goto(`/?stavePreview=task-panel&tab=handoff&record=full&panelWidth=384&theme=${theme}`);
    const handoff = page.getByTestId("task-handoff");
    await handoff.getByRole("button", { name: "Fill from this task", exact: true }).click();
    const leftOut = handoff.locator('[data-handoff-left-out="cautions"]');
    await expect(leftOut).toBeVisible();
    await expect(leftOut).toContainText("1 line did not fit");
    await expect(leftOut).toContainText("Cautions holds 2,000 characters");
    const line = leftOut.locator("s");
    await expect(line).toContainText("lint: 1 warning");
    const text = (await line.textContent())!;

    // The mark sits on the heading's line, and a long line ends in an ellipsis inside the panel.
    await page.evaluate(() => document.fonts.ready);
    const geometry = await leftOut.evaluate((element) => {
      const head = element.querySelector("p")!;
      const icon = head.querySelector("svg")!.getBoundingClientRect();
      const title = head.querySelector("span")!;
      const titleBox = title.getBoundingClientRect();
      const row = element.querySelector("li")!;
      const struck = row.querySelector("span")!;
      return {
        iconDelta: icon.y + icon.height / 2 - (titleBox.y + Number.parseFloat(getComputedStyle(title).lineHeight) / 2),
        contained: element.scrollWidth <= element.clientWidth + 1,
        rowRight: row.getBoundingClientRect().right,
        boxRight: element.getBoundingClientRect().right,
        clipped: struck.scrollWidth > struck.clientWidth,
      };
    });
    expect(Math.abs(geometry.iconDelta)).toBeLessThanOrEqual(1);
    expect(geometry.contained).toBe(true);
    expect(geometry.rowRight).toBeLessThanOrEqual(geometry.boxRight + 0.5);
    expect(geometry.clipped).toBe(true);

    await leftOut.getByRole("button", { name: "Put back", exact: true }).click();
    await expect(leftOut).toHaveCount(0);
    const cautions = handoff.getByLabel("Cautions", { exact: true });
    await expect(cautions).toHaveValue(new RegExp(`${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
    // Past the limit now: the field says by how much and Save waits for a shorter text.
    await expect(handoff.getByText(/characters over the 2,000-character limit/)).toBeVisible();
    await expect(cautions).toHaveAttribute("aria-invalid", "true");
    const save = handoff.getByRole("button", { name: "Save", exact: true });
    await expect(save).toBeDisabled();
    const value = await cautions.inputValue();
    await cautions.fill(value.split("\n").filter((entry) => !/^- Sidebar row [12] /.test(entry)).join("\n"));
    await expect(handoff.getByText(/characters over the 2,000-character limit/)).toHaveCount(0);
    await expect(save).toBeEnabled();
    await save.click();
    await expect(handoff.getByText(text, { exact: false })).toBeVisible();
  });
}
