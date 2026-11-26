import { expect, test, type Page } from "@playwright/test";

/**
 * The Task panel's record tabs on the preview: the line strip has the
 * `space-8` air above it and none below (its baseline is the divider), and
 * every tab's view starts `space-12` under that baseline on the panel's
 * `space-12` inset, including the Activity note before any turn, which used
 * to sit flush under the strip and centred across the rail.
 */
const SECTIONS = ["activity", "steps", "subagents", "background", "outputs"] as const;

async function tokenPx(page: Page, token: string) {
  return page.evaluate(async (token) => {
    const { vars } = await import("/src/components/aui/tokens/tokens.stylex.ts");
    const probe = document.createElement("div");
    probe.style.rowGap = (vars as Record<string, string>)[token]!;
    document.body.append(probe);
    const value = Number.parseFloat(getComputedStyle(probe).rowGap);
    probe.remove();
    return value;
  }, token);
}

for (const task of ["new", "plain"] as const) for (const theme of ["light", "dark"] as const) for (const panelWidth of [320, 420]) {
  test(`task panel tabs keep the panel inset: ${task}/${theme}/${panelWidth}`, async ({ page }) => {
    await page.setViewportSize({ width: panelWidth + 80, height: 760 });
    await page.goto(`/?stavePreview=task-panel&task=${task}&theme=${theme}&panelWidth=${panelWidth}`);
    const strip = page.getByTestId("task-sections").getByRole("tablist");
    await expect(strip).toBeVisible();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const [air, inset] = [await tokenPx(page, "--aui-space-8"), await tokenPx(page, "--aui-space-12")];

    const geometry = await strip.evaluate((list) => {
      const style = getComputedStyle(list);
      const root = list.closest('[data-testid="task-sections"]')!;
      return {
        paddingTop: parseFloat(style.paddingTop),
        paddingBottom: parseFloat(style.paddingBottom),
        rootBorderTop: parseFloat(getComputedStyle(root).borderTopWidth),
        bottom: list.getBoundingClientRect().bottom,
        panelLeft: document.querySelector('[data-testid="task-panel-scroll"]')!.getBoundingClientRect().left,
      };
    });
    expect(geometry.paddingTop).toBeCloseTo(air, 0);
    expect(geometry.paddingBottom).toBe(0);
    // One rule between the summary and the view: the strip's own baseline.
    expect(geometry.rootBorderTop).toBe(0);
    const firstTab = (await page.getByTestId("task-section-activity").boundingBox())!;
    expect(Math.abs(firstTab.x - (geometry.panelLeft + inset))).toBeLessThanOrEqual(1);

    for (const section of SECTIONS) {
      await page.getByTestId(`task-section-${section}`).click();
      // The view being left stays mounted (inert) while it animates out.
      const panel = page.getByTestId("task-sections").locator('[role="tabpanel"]:not([hidden]):not([inert])');
      await expect(panel).toHaveCount(1);
      // Measure once the leaving view is gone: until then it still takes room above.
      await expect(page.getByTestId("task-sections").locator('[role="tabpanel"][inert]')).toHaveCount(0);
      await expect(panel).toBeVisible();
      // Measure at rest: selecting a tab may scroll the column under the sticky strip.
      await page.getByTestId("task-panel-scroll").evaluate((scroll) => { scroll.scrollTop = 0; });
      const view = await panel.evaluate((element) => {
        // The view's content box: the tab panel's own padding, or (Activity,
        // whose rows draw their own inset) the first row's.
        const owner = parseFloat(getComputedStyle(element).paddingLeft) ? element : element.firstElementChild!;
        const ownerStyle = getComputedStyle(owner);
        const ownerBox = owner.getBoundingClientRect();
        const content = { left: ownerBox.left + parseFloat(ownerStyle.paddingLeft), top: ownerBox.top + parseFloat(ownerStyle.paddingTop) };
        // The first painted line, and any mark (an element with no content of
        // its own, such as a status dot) that leads it on the same line.
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
          acceptNode: (node) => (node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
        });
        const text = walker.nextNode();
        if (!text) return { content, line: null };
        const range = document.createRange();
        range.selectNodeContents(text);
        const line = range.getClientRects()[0]!;
        let rowLeft = line.left;
        for (const mark of element.querySelectorAll("*")) {
          if (mark.children.length || mark.textContent?.trim()) continue;
          const box = mark.getBoundingClientRect();
          if (box.width && box.height && box.top < line.bottom && box.bottom > line.top) rowLeft = Math.min(rowLeft, box.left);
        }
        return { content, line: { top: line.top, rowLeft } };
      });
      expect(Math.abs(view.content.left - (geometry.panelLeft + inset)), `${section} content starts on the panel inset`).toBeLessThanOrEqual(1);
      // Activity's turn bar is a control row with its own (space-8) block
      // padding; every other view starts one inset under the strip.
      const top = view.content.top - geometry.bottom;
      expect(Math.abs(top - (section === "activity" && task === "plain" ? air : inset)), `${section} starts under the strip`).toBeLessThanOrEqual(1);
      if (task === "new") {
        // Before any turn each view is a note or a single row: it starts at
        // the content box, not centred across the rail.
        expect(view.line, `${section} renders text`).not.toBeNull();
        expect(Math.abs(view.line!.rowLeft - (geometry.panelLeft + inset)), `${section} note starts on the panel inset`).toBeLessThanOrEqual(1);
        expect(view.line!.top - geometry.bottom, `${section} note sits one inset under the strip`).toBeGreaterThanOrEqual(inset - 1);
      }
    }
  });
}
