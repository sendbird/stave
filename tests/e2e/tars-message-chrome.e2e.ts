import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ timeout: 60_000 });

const gallery = (query = "") => `/?stavePreview=tars&gallery=true${query}`;
const exchange = (page: Page, id: string) => page.locator(`[data-tars-message="${id}"]`);

/** Where each row of an exchange sits inside it: what showing the time must not change, wherever the view is scrolled. */
const layoutOf = (page: Page, id: string) => exchange(page, id).evaluate((node) => {
  const top = node.getBoundingClientRect().top;
  return [node.getBoundingClientRect().height, ...[...node.children].filter((child) => !child.hasAttribute("data-tars-message-time"))
    .map((child) => { const box = child.getBoundingClientRect(); return [box.top - top, box.left, box.width, box.height]; })];
});
const opacity = (page: Page, id: string) => exchange(page, id).locator("[data-tars-message-time]").evaluate((node) => parseFloat(getComputedStyle(node).opacity));

async function open(page: Page, query: string, width: number) {
  // The reveal fades over 150ms; without motion it is immediate, so each read sees the settled state.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width, height: 900 });
  await page.goto(gallery(query));
  // The gallery builds every case at once, so its first paint takes longer than one preview's.
  await expect(exchange(page, "g-a1")).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
}

for (const { name, query } of [
  { name: "light en regular", query: "" },
  { name: "dark ko compact", query: "&theme=dark&lang=ko&density=compact" },
]) for (const width of [390, 1440]) {
  test(`message chrome keeps to the column and moves nothing when its time shows: ${name} ${width}px`, async ({ page }) => {
    await open(page, query, width);
    const view = page.getByTestId("tars-view");
    expect(await view.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    // No name line over any reply.
    await expect(view.locator("[data-tars-reply] [data-tars-mark]")).toHaveCount(0);
    // A user message's time; an answer chosen on a card has none of its own (its record on the rail carries one).
    for (const id of ["g-a1", "g-a4"]) {
      const item = exchange(page, id);
      await item.scrollIntoViewIfNeeded();
      await page.mouse.move(0, 0);
      await expect.poll(() => opacity(page, id)).toBe(0);
      const before = await layoutOf(page, id);
      await item.locator("[data-tars-user-message], [data-tars-reply]").first().hover();
      await expect.poll(() => opacity(page, id)).toBe(1);
      expect(await layoutOf(page, id)).toEqual(before);
      const geometry = await item.evaluate((node) => {
        const box = node.getBoundingClientRect();
        const stamp = node.querySelector("[data-tars-message-time]")!.getBoundingClientRect();
        const bubble = node.querySelector("[data-tars-user-bubble]")!.getBoundingClientRect();
        return { left: box.left, right: box.right, stamp: { left: stamp.left, right: stamp.right, bottom: stamp.bottom }, bubble: { left: bubble.left, bottom: bubble.bottom } };
      });
      // Beside the bubble on its leading side, on its last line, never outside the column.
      expect(geometry.stamp.right).toBeLessThanOrEqual(geometry.bubble.left);
      expect(Math.abs(geometry.stamp.bottom - geometry.bubble.bottom)).toBeLessThanOrEqual(5);
      expect(geometry.stamp.left).toBeGreaterThanOrEqual(geometry.left - 1);
    }
    // Files sit above the bubble on the user's side, each chip inside the column.
    const files = exchange(page, "g-a4").locator("[data-tars-message-attachments]");
    const chips = await files.locator("li").evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().toJSON()));
    const bubble = await exchange(page, "g-a4").locator("[data-tars-user-bubble]").boundingBox();
    const column = await exchange(page, "g-a4").boundingBox();
    expect(chips).toHaveLength(2);
    for (const chip of chips) {
      expect(chip.bottom).toBeLessThanOrEqual(bubble!.y + 1);
      expect(chip.left).toBeGreaterThanOrEqual(column!.x - 1);
      expect(chip.right).toBeLessThanOrEqual(column!.x + column!.width + 1);
    }
    expect(Math.abs(Math.max(...chips.map((chip) => chip.right)) - (column!.x + column!.width))).toBeLessThanOrEqual(1);
  });
}

test("the time is reachable by keyboard and its card gives the full date", async ({ page }) => {
  await open(page, "", 1440);
  const stamp = exchange(page, "g-a1").locator("[data-tars-message-time] button");
  await stamp.focus();
  await expect.poll(() => opacity(page, "g-a1")).toBe(1);
  await expect(stamp).toHaveText(/^\d{1,2}:\d{2}\s[AP]M$/);
  await expect(page.getByText("UTC", { exact: true })).toBeVisible();
});

test("a message in progress shows its state in the reply's place with a named, square cancel control", async ({ page }) => {
  await open(page, "", 1440);
  const thinking = exchange(page, "g-c1").locator('[data-tars-message-state="reasoning"]');
  await thinking.scrollIntoViewIfNeeded();
  await expect(thinking.getByRole("status")).toHaveText("Thinking");
  const cancel = thinking.getByRole("button", { name: "Cancel message", exact: true });
  const box = await cancel.boundingBox();
  expect(Math.abs(box!.width - box!.height)).toBeLessThanOrEqual(1);
  // The control is centred on the status line.
  const line = await thinking.boundingBox();
  expect(Math.abs((box!.y + box!.height / 2) - (line!.y + line!.height / 2))).toBeLessThanOrEqual(1);
  await cancel.hover();
  await expect(page.getByRole("tooltip")).toHaveText("Cancel message");
  await expect(exchange(page, "g-c2").locator('[data-tars-message-state="queued"]').getByRole("button", { name: "Cancel message", exact: true })).toBeVisible();
  await expect(exchange(page, "g-c3").locator('[data-tars-message-state="cancelled"]').getByRole("button")).toHaveCount(0);
});

test("a failed message is a notice with Edit and resend, which puts its words back in the message box", async ({ page }) => {
  await open(page, "", 1440);
  const failed = exchange(page, "g-c4").locator('[data-tars-message-state="failed"]');
  await failed.scrollIntoViewIfNeeded();
  await expect(failed).toHaveAttribute("data-tone", "danger");
  await expect(failed).toContainText("Tars could not answer");
  await expect(exchange(page, "g-c5").locator('[data-tars-message-state="failed"]')).toHaveAttribute("data-tone", "warning");
  // Saved failures are not announced as new alerts when the conversation opens.
  await expect(page.getByRole("alert")).toHaveCount(0);
  await failed.getByRole("button", { name: "Edit and resend", exact: true }).click();
  const editor = page.locator("[data-tars-composer]").getByRole("textbox");
  await expect(editor).toBeFocused();
  await expect(editor).toContainText("summarize yesterday's runs.");
});

for (const theme of ["light", "dark"]) {
  test(`the composer's footer buttons are one borderless family beside one filled Send: ${theme}`, async ({ page }) => {
    await open(page, `&theme=${theme}`, 1440);
    const composer = page.locator("[data-tars-composer]");
    const style = (name: string) => composer.getByRole("button", { name, exact: true }).evaluate((node) => {
      const css = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      const visibleBorder = parseFloat(css.borderTopWidth) > 0 && !/rgba\(0, 0, 0, 0\)|transparent/.test(css.borderTopColor) && !/\/ 0\)$/.test(css.borderTopColor);
      return { visibleBorder, shadow: css.boxShadow, background: css.backgroundColor, height: box.height, center: box.top + box.height / 2 };
    });
    const toggle = await style("Include my working changes");
    const attach = await style("Attach files");
    const send = await style("Send");
    expect(toggle.visibleBorder).toBe(false);
    expect(attach.visibleBorder).toBe(false);
    expect(toggle.shadow).toBe("none");
    expect(toggle.background).toBe(attach.background);
    expect(send.background).not.toBe(attach.background);
    for (const control of [toggle, attach]) {
      expect(Math.abs(control.height - send.height)).toBeLessThanOrEqual(1);
      expect(Math.abs(control.center - send.center)).toBeLessThanOrEqual(1);
    }
    // On, the toggle takes a selected fill of its own: neither the quiet buttons' nor Send's.
    await composer.getByRole("button", { name: "Include my working changes", exact: true }).click();
    await page.mouse.move(0, 0);
    const on = await style("Include my working changes");
    expect(on.visibleBorder).toBe(false);
    expect(on.background).not.toBe(attach.background);
    expect(on.background).not.toBe(send.background);
  });
}

test("the conversation's text follows the chat font size, with secondary text scaled from it", async ({ page }) => {
  for (const size of [16, 20]) {
    await open(page, size === 16 ? "" : `&messageFontSize=${size}`, 1440);
    const sizes = await page.evaluate(() => {
      const font = (selector: string) => parseFloat(getComputedStyle(document.querySelector(selector)!).fontSize);
      return { user: font('[data-tars-message="g-a1"] [data-tars-user-bubble] p'), reply: font('[data-tars-message="g-a1"] [data-tars-reply] p'),
        status: font('[data-tars-message="g-c2"] [data-tars-message-state]'), time: font('[data-tars-message="g-a1"] [data-tars-message-time]'),
        notice: font('[data-tars-message="g-c4"] [data-aui-slot="description"]'),
        composer: font("[data-tars-composer] [contenteditable]") };
    });
    expect(sizes.user).toBe(size);
    expect(sizes.reply).toBe(size);
    expect(sizes.composer).toBe(size);
    expect(sizes.status).toBeCloseTo(size * 0.875, 1);
    expect(sizes.notice).toBeCloseTo(size * 0.875, 1);
    expect(sizes.time).toBeCloseTo(size * 0.75, 1);
  }
});
