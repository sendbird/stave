import { expect, test, type Page } from "@playwright/test";

const view = (page: Page) => page.getByTestId("tars-view");
const start = (page: Page) => view(page).locator("[data-tars-start]");
const composer = (page: Page) => page.locator("[data-tars-composer]");
const editor = (page: Page) => composer(page).getByRole("textbox");
const lane = (page: Page, name: string) => page.locator(`[data-tars-tray-lane="${name}"]`);
const count = (page: Page, kind: string) => start(page).locator(`[data-tars-start-count="${kind}"]`);
const example = (page: Page, id: string) => start(page).locator(`[data-tars-start-example="${id}"]`);
/** Whether focus is inside the element. */
const holdsFocus = (page: Page, selector: string) => page.evaluate((query) => Boolean(document.activeElement?.closest(query)), selector);

async function open(page: Page, query: string) {
  await page.goto(`/?stavePreview=tars&${query}`);
  await expect(start(page)).toBeVisible();
  await expect(editor(page)).toBeEditable();
  await page.evaluate(() => document.fonts.ready);
}

test.describe("Tars start screen", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("every item is reached by Tab in reading order, has a name and a visible focus ring", async ({ page }) => {
    await open(page, "start=true&tray=true");
    const controls = start(page).getByRole("button");
    const total = await controls.count();
    // Counts first, then the examples by group.
    expect(await controls.evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.tarsStartCount ? "count" : (node as HTMLElement).dataset.tarsStartExample ? "example" : "other")))
      .toEqual([...Array(await start(page).locator("[data-tars-start-count]").count()).fill("count"), ...Array(await start(page).locator("[data-tars-start-example]").count()).fill("example")]);
    expect(total).toBeGreaterThan(6);
    await controls.first().focus();
    for (let index = 0; index < total; index++) {
      const control = controls.nth(index);
      await expect(control).toBeFocused();
      expect((await control.innerText()).trim().length).toBeGreaterThan(0);
      if (index === 0 || index === total - 1) {
        // Keyboard focus shows the design system's ring.
        const ring = await control.evaluate((node) => { const style = getComputedStyle(node); return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) }; });
        expect(ring.style).not.toBe("none");
        expect(ring.width).toBeGreaterThan(0);
      }
      await page.keyboard.press("Tab");
    }
    // After the start screen comes the composer: its suggestion chips first.
    expect(await holdsFocus(page, "[data-tars-composer]")).toBe(true);
    // A count names what it opens.
    await expect(count(page, "needsYou")).toHaveAccessibleName("1 needs you");
    await expect(count(page, "needsYou")).toHaveAccessibleDescription("Opens Needs you in the work list.");
    await expect(start(page).getByRole("group", { name: "Check or steer work" })).toBeVisible();
  });

  test("Enter on an example fills the message box, focuses it and sends nothing", async ({ page }) => {
    await open(page, "start=true&tray=true");
    await example(page, "pause").focus();
    await page.keyboard.press("Enter");
    await expect(editor(page)).toHaveText("Pause the date-picker work.");
    await expect(editor(page)).toBeFocused();
    await expect(view(page).locator("[data-tars-message]")).toHaveCount(0);
    // The start screen stays until something is sent, and the chips leave while the box holds words.
    await expect(start(page)).toBeVisible();
    await expect(composer(page).locator("[data-tars-suggestion]")).toHaveCount(0);
    // A click does the same, after what is already there.
    await example(page, "changes").click();
    await expect(editor(page)).toContainText("Show me what changed in the date-picker work.");
    await expect(editor(page)).toBeFocused();
    await expect(view(page).locator("[data-tars-message]")).toHaveCount(0);
    // Sending is the user's own step; then the start screen gives way to the conversation.
    await editor(page).press("Enter");
    await expect(view(page).locator("[data-tars-message]")).not.toHaveCount(0);
    await expect(start(page)).toHaveCount(0);
  });

  test("an example and a chip never offer the same request", async ({ page }) => {
    await open(page, "start=true&tray=true");
    const chips = composer(page).locator("[data-tars-suggestion]");
    await expect(chips).not.toHaveCount(0);
    const kinds = await chips.evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.tarsSuggestion));
    expect(kinds).toContain("needsYou");
    // "What needs me?" is a chip, so the status example is left out.
    await expect(example(page, "status")).toHaveCount(0);
    const chipPrompts = await chips.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("title")));
    const examplePrompts = await start(page).locator("[data-tars-start-example]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("title")));
    expect(examplePrompts.filter((prompt) => chipPrompts.includes(prompt))).toEqual([]);
    // Without work there is no such chip and the example is back.
    await open(page, "start=true&noRepositories=true");
    await expect(example(page, "status")).toBeVisible();
  });

  test("each Right now count opens its lane in the work list", async ({ page }) => {
    await open(page, "start=true&tray=true");
    await expect(count(page, "needsYou")).toHaveText("1 needs you");
    await expect(count(page, "finishedToday")).toHaveText(/finished today/);
    await count(page, "needsYou").click();
    await expect.poll(() => holdsFocus(page, '[data-tars-tray-lane="needsYou"]')).toBe(true);
    await count(page, "running").click();
    await expect.poll(() => holdsFocus(page, '[data-tars-tray-lane="running"]')).toBe(true);
    // Done is folded until asked for: the count opens it at the work that finished.
    await expect(lane(page, "done").locator("button[aria-expanded]").first()).toHaveAttribute("aria-expanded", "false");
    await count(page, "finishedToday").click();
    await expect(lane(page, "done").locator("button[aria-expanded]").first()).toHaveAttribute("aria-expanded", "true");
    await expect.poll(() => holdsFocus(page, '[data-tars-tray-lane="done"] [data-tars-card]')).toBe(true);
    // Narrow, the work list is a popover: the count opens it on its lane.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.keyboard.press("Escape");
    await count(page, "running").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect.poll(() => holdsFocus(page, '[role="dialog"] [data-tars-tray-lane="running"]')).toBe(true);
  });

  test("lists the registered repositories, capped, or says how to add one", async ({ page }) => {
    await open(page, "start=true");
    await expect(start(page).locator("[data-tars-start-repository]")).toHaveCount(4);
    await expect(start(page).locator("[data-tars-start-repositories-more]")).toHaveText("+3 more");
    await expect(example(page, "delegate")).toBeVisible();
    await open(page, "start=true&noRepositories=true");
    await expect(start(page).locator("[data-tars-start-no-repositories]")).toContainText("Open repository");
    await expect(example(page, "delegate")).toHaveCount(0);
    await expect(start(page).locator("[data-tars-start-repository]")).toHaveCount(0);
  });

  test("a window too short for it shows it from its top, and the transcript follows again once it fits or a message is sent", async ({ page }) => {
    const transcript = page.getByTestId("tars-transcript");
    const toLatest = view(page).getByRole("button", { name: "Scroll to bottom" });
    await page.setViewportSize({ width: 390, height: 700 });
    await open(page, "start=true&tray=true");
    // More than fits: the greeting leads, the composer stays, and the rest scrolls under it.
    expect(await transcript.evaluate((node) => node.scrollHeight - node.clientHeight)).toBeGreaterThan(0);
    await expect.poll(() => transcript.evaluate((node) => node.scrollTop)).toBe(0);
    await expect(start(page).getByRole("heading", { level: 2 })).toBeInViewport();
    await expect(toLatest).toBeVisible();
    // Widened, everything fits: nothing is below, so nothing offers to scroll there.
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(toLatest).toHaveCount(0);
    // Narrow again, a sent message takes the start screen's place and the transcript holds to its end.
    await page.setViewportSize({ width: 390, height: 700 });
    await editor(page).fill("Keep an eye on the billing export.");
    await editor(page).press("Enter");
    await expect(view(page).locator("[data-tars-message]")).not.toHaveCount(0);
    await expect(start(page)).toHaveCount(0);
    await expect.poll(() => transcript.evaluate((node) => node.scrollHeight - node.clientHeight - node.scrollTop)).toBeLessThan(2);
    await expect(toLatest).toHaveCount(0);
  });

  for (const look of [{ lang: "en", theme: "light" }, { lang: "ko", theme: "dark" }]) {
    test(`fits its column, starts at its top and leaves the composer on screen: ${look.lang} ${look.theme}`, async ({ page }) => {
      for (const size of [{ width: 1440, height: 900 }, { width: 1440, height: 700 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(size);
        await open(page, `start=true&tray=true&lang=${look.lang}&theme=${look.theme}`);
        await expect.poll(() => page.getByTestId("tars-transcript").evaluate((node) => node.scrollTop)).toBe(0);
        const box = await page.evaluate(() => {
          const root = document.querySelector<HTMLElement>("[data-tars-start]")!;
          const transcript = document.querySelector<HTMLElement>("[data-testid='tars-transcript']")!;
          const composer = document.querySelector<HTMLElement>("[data-tars-composer]")!.getBoundingClientRect();
          const greeting = root.querySelector("h2")!.getBoundingClientRect();
          const column = root.getBoundingClientRect();
          const controls = [...root.querySelectorAll<HTMLElement>("button, [data-tars-start-repository]")].map((node) => node.getBoundingClientRect());
          return { composerBottom: composer.bottom, composerTop: composer.top, viewport: window.innerHeight, greetingTop: greeting.top, transcriptTop: transcript.getBoundingClientRect().top,
            overflowX: transcript.scrollWidth - transcript.clientWidth, overflowY: transcript.scrollHeight - transcript.clientHeight,
            outside: controls.filter((rect) => rect.left < column.left - 0.5 || rect.right > column.right + 0.5).length,
            text: parseFloat(getComputedStyle(root).fontSize), greeting: parseFloat(getComputedStyle(root.querySelector("h2")!).fontSize) };
        });
        expect(box.composerBottom).toBeLessThanOrEqual(box.viewport);
        expect(box.composerTop).toBeGreaterThan(box.transcriptTop);
        expect(box.greetingTop).toBeGreaterThanOrEqual(box.transcriptTop);
        expect(box.overflowX).toBeLessThanOrEqual(0);
        expect(box.outside).toBe(0);
        // Wide, the whole start screen fits a short window without scrolling.
        if (size.width === 1440) expect(box.overflowY).toBeLessThanOrEqual(0);
        // Text follows the chat font size: 14px controls and labels beside 16px messages, the greeting above them.
        expect(box.text).toBe(14);
        expect(box.greeting).toBe(20);
      }
      // A larger chat font size scales the start screen with it, on the type scale's whole-pixel secondary step.
      await open(page, `start=true&messageFontSize=20&lang=${look.lang}&theme=${look.theme}`);
      expect(await start(page).evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBe(18);
      expect(await example(page, "pause").evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBe(18);
    });
  }
});
