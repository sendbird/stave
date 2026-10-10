import { expect, test } from "@playwright/test";

for (const dark of [false, true]) {
  test(`answered questions keep their selected choices and focus (${dark ? "dark" : "light"})`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto("/?stavePreview=turn-events", {
      waitUntil: "domcontentloaded",
    });
    if (dark)
      await page.getByRole("button", { name: "Light", exact: true }).click();

    const pending = page.locator("#event-17");
    await pending
      .getByRole("radio", { name: "Regular Keep more space between events." })
      .check();
    await pending.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(pending.getByRole("status")).toBeFocused();
    await expect(pending.getByRole("radio", { name: /Regular/ })).toBeChecked();
    await expect(
      pending.getByRole("radio", { name: /Compact/ }),
    ).not.toBeChecked();
    await expect(
      pending.getByRole("radio", { name: /Regular/ }),
    ).toBeDisabled();
    await expect(
      pending.getByRole("radio", { name: /Compact/ }),
    ).toBeDisabled();
    await expect(
      pending.getByText("Which spacing should this view use?", { exact: true }),
    ).toBeVisible();
    await expect(
      pending.getByRole("button", { name: "Submit", exact: true }),
    ).toHaveCount(0);

    // Existing history reconstructs its marked choices from the persisted part.
    await page.reload({ waitUntil: "domcontentloaded" });
    const recorded = page.locator("#event-18");
    await expect(
      recorded.getByRole("radio", { name: /Compact/ }),
    ).toBeChecked();
    await expect(
      recorded.getByRole("radio", { name: /Regular/ }),
    ).not.toBeChecked();
  });
}
