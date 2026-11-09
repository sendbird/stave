import { expect, test, type Page } from "@playwright/test";

const FIXTURE = "/tests/e2e/fixtures/agent-motion.html";

type FixtureState = { label?: string; glyph?: "running" | "done"; highlight?: number };

async function update(page: Page, next: FixtureState) {
  await page.evaluate((value) => (window as unknown as { agentMotionFixture: { update: (v: FixtureState) => void } }).agentMotionFixture.update(value), next);
}

/** Visible copies of a swap: the leaving copy is aria-hidden, the current one is not. */
async function copies(page: Page, selector: string) {
  return page.locator(selector).evaluate((root) => {
    const cells = [...root.querySelectorAll(":scope > span > span")] as HTMLElement[];
    return cells.map((cell) => ({
      text: cell.textContent,
      hidden: cell.getAttribute("aria-hidden") === "true",
      animation: getComputedStyle(cell).animationName,
    }));
  });
}

test.describe("agent motion (host-authored swaps and highlight)", () => {
  test("a label change keeps one readable copy and drops the leaving copy after its fade", async ({ page }) => {
    await page.goto(FIXTURE);
    await expect(page.locator('[data-fixture="text"]')).toHaveText("Running");
    expect(await copies(page, '[data-fixture="text"]')).toEqual([{ text: "Running", hidden: false, animation: "none" }]);

    await update(page, { label: "Completed" });
    const during = await copies(page, '[data-fixture="text"]');
    expect(during).toHaveLength(2);
    expect(during[0]).toMatchObject({ text: "Running", hidden: true });
    expect(during[0]!.animation).not.toBe("none");
    expect(during[1]).toMatchObject({ text: "Completed", hidden: false });
    expect(during[1]!.animation).not.toBe("none");
    // The accessibility tree reads the new label only.
    const aria = await page.locator('[data-fixture="text"]').ariaSnapshot();
    expect(aria).toContain("Completed");
    expect(aria).not.toContain("Running");

    await expect.poll(async () => (await copies(page, '[data-fixture="text"]')).length).toBe(1);
    expect((await copies(page, '[data-fixture="text"]'))[0]).toMatchObject({ text: "Completed", hidden: false });
  });

  test("a glyph change cross-scales and the old glyph leaves", async ({ page }) => {
    await page.goto(FIXTURE);
    await update(page, { glyph: "done" });
    const during = await copies(page, '[data-fixture="glyph"]');
    expect(during).toHaveLength(2);
    expect(during[0]).toMatchObject({ hidden: true });
    expect(during[1]!.animation).not.toBe("none");
    await expect.poll(async () => (await copies(page, '[data-fixture="glyph"]')).length).toBe(1);
    await expect(page.locator('[data-fixture="glyph"] [data-glyph="done"]')).toBeVisible();
  });

  test("a new highlight key replays the one-shot tint, which settles invisible", async ({ page }) => {
    await page.goto(FIXTURE);
    const layer = page.locator('[data-fixture="highlight"] > span[aria-hidden="true"]');
    const opacity = () => layer.evaluate((el) => Number(getComputedStyle(el).opacity));
    // The mount plays once and settles.
    await expect.poll(opacity, { timeout: 4000 }).toBe(0);
    // A new key remounts the layer: the tint shows again, then fades to nothing.
    await update(page, { highlight: 1 });
    expect(await opacity()).toBeGreaterThan(0.5);
    await expect.poll(opacity, { timeout: 4000 }).toBe(0);
  });

  test("under Reduce Motion a change swaps in place with no leaving copy and no tint", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(FIXTURE);
    await update(page, { label: "Completed", glyph: "done", highlight: 1 });
    expect(await copies(page, '[data-fixture="text"]')).toEqual([{ text: "Completed", hidden: false, animation: "none" }]);
    const glyph = await copies(page, '[data-fixture="glyph"]');
    expect(glyph).toHaveLength(1);
    expect(glyph[0]!.animation).toBe("none");
    const layer = page.locator('[data-fixture="highlight"] > span[aria-hidden="true"]');
    expect(await layer.evaluate((el) => [getComputedStyle(el).animationName, getComputedStyle(el).opacity])).toEqual(["none", "0"]);
  });

  test("the palette closes the way an item was chosen: Enter at once, a click with the fade", async ({ page }) => {
    await page.goto(FIXTURE);
    // Record the popup's exit: whether it is instant and the transition it runs.
    const watchExit = () => page.evaluate(() => {
      const exits: { instant: boolean; duration: string }[] = [];
      const observer = new MutationObserver(() => {
        const popup = document.querySelector('[role="dialog"][data-ending-style]');
        if (!popup || exits.length) return;
        exits.push({ instant: popup.hasAttribute("data-instant"), duration: getComputedStyle(popup).transitionDuration });
      });
      observer.observe(document.body, { attributes: true, childList: true, subtree: true });
      Object.assign(window, { paletteExits: exits });
    });
    const exit = () => page.evaluate(() => (window as unknown as { paletteExits: { instant: boolean; duration: string }[] }).paletteExits[0]);
    const animated = (duration: string) => duration.split(",").some((value) => Number.parseFloat(value) > 0);
    const trigger = page.getByRole("button", { name: "Open palette" });

    // Pointer open, keyboard choice: closes at once.
    await trigger.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await watchExit();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const keyboardExit = await exit();
    expect(keyboardExit?.instant).toBe(true);
    expect(animated(keyboardExit!.duration)).toBe(false);

    // Keyboard open, pointer choice: keeps the exit fade.
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await watchExit();
    await page.getByRole("option", { name: "Second command" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const pointerExit = await exit();
    expect(pointerExit?.instant).toBe(false);
    expect(animated(pointerExit!.duration)).toBe(true);
  });
});
