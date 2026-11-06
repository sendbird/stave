import { expect, test } from "@playwright/test";

const OPEN = { name: "Find in conversation", exact: true } as const;
const FIELD = { name: "Search loaded messages" } as const;

for (const theme of ["light", "dark"]) {
  test(`conversation find floats over the transcript, steps and wraps in ${theme}`, async ({ page }) => {
    await page.goto(`/tests/e2e/fixtures/conversation-time.html?theme=${theme}`);
    const firstMessage = page.getByText("Check the settings layout and keyboard navigation.", { exact: true });
    const before = await firstMessage.boundingBox();

    // The trigger is a floating icon in the transcript's top-end corner, revealed on hover.
    const open = page.getByRole("button", OPEN);
    await expect(open).toHaveCSS("opacity", "0");
    await page.getByText("Check the dark theme as well.", { exact: true }).hover();
    await expect(open).toHaveCSS("opacity", "1");
    await page.evaluate(() => document.fonts.ready);
    // Use the smallest ADS control; the glyph stays on its 14px token rung.
    await expect(open).toHaveAttribute("data-size", "xs");
    await expect(open.locator("svg")).toHaveCSS("width", "14px");
    await expect(open.locator("svg")).toHaveCSS("height", "14px");
    const triggerBox = await open.boundingBox();
    expect(triggerBox!.width).toBeLessThanOrEqual(28);
    expect(triggerBox!.height).toBeLessThanOrEqual(28);
    await open.click();

    const input = page.getByRole("textbox", FIELD);
    await expect(input).toBeFocused();
    await expect(open).toHaveCount(0);
    // Opening the widget takes no layout space: the transcript does not move.
    expect(await firstMessage.boundingBox()).toEqual(before);
    const widget = await page.getByRole("search").boundingBox();
    const viewport = page.viewportSize()!;
    expect(widget!.x + widget!.width).toBeGreaterThan(viewport.width / 2);
    expect(widget!.y).toBeLessThan(40);

    const status = page.getByRole("search").getByRole("status");
    await expect(status).toHaveText("");
    await expect(page.getByRole("button", { name: "Next match" })).toBeDisabled();
    await input.fill("Check");
    await expect(status).toHaveText("2 matches");
    await input.press("Enter");
    await expect(status).toHaveText("1 / 2");
    await input.press("Shift+Enter");
    await expect(status).toHaveText("2 / 2");
    await page.getByRole("button", { name: "Next match" }).click();
    await expect(status).toHaveText("1 / 2");
    await expect(page.getByText("Check the dark theme as well.", { exact: true })).toBeVisible();
    await input.fill("no such phrase");
    await expect(status).toHaveText("No matches");
    await expect(page.getByRole("button", { name: "Previous match" })).toBeDisabled();

    await input.press("Escape");
    await expect(input).toHaveCount(0);
    await expect(open).toBeFocused();
  });
}

test("Cmd/Ctrl+F again re-selects the query in the open widget", async ({ page }) => {
  await page.goto("/tests/e2e/fixtures/conversation-time.html");
  await page.getByRole("button", OPEN).focus();
  await page.keyboard.press("Control+f");
  const input = page.getByRole("textbox", FIELD);
  await input.fill("Check");
  await page.getByRole("button", { name: "Close", exact: true }).focus();
  await page.keyboard.press("Control+f");
  await expect(input).toBeFocused();
  await page.keyboard.type("dark");
  await expect(input).toHaveValue("dark");
});

test("Cmd/Ctrl+F from the composer opens find in the same chat area", async ({ page }) => {
  await page.goto("/tests/e2e/fixtures/conversation-time.html?composer=1");
  const composer = page.getByRole("textbox", { name: "Composer stand-in" });
  await composer.focus();
  await page.keyboard.press("Control+f");
  const input = page.getByRole("textbox", FIELD);
  await expect(input).toBeFocused();
  await input.press("Escape");
  await expect(input).toHaveCount(0);
  await expect(composer).toBeFocused();
});

test("find opens only in the focused conversation pane", async ({ page }) => {
  await page.goto("/tests/e2e/fixtures/conversation-time.html?split=1");
  const open = page.getByRole("button", OPEN);
  await expect(open).toHaveCount(2);
  await open.last().focus();
  await page.keyboard.press("Control+f");
  await expect(page.getByRole("textbox", FIELD)).toHaveCount(1);
  await expect(open).toHaveCount(1);
});
