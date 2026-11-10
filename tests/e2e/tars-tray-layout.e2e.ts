import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Geometry of the Tars tray cards and side views, on the real components in
 * the Tars preview: what needs the user is a label line over text that runs
 * the card's full width, the branch is header metadata that never pushes the
 * title under the state tag, the footer's view links stay at its end, and each
 * side view's sections sit on the AUI section rhythm. Every expected size is
 * resolved from its AUI token in the page, never restated as a literal.
 */

const POPOVER_BELOW = 1088;

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

/**
 * `tray=true` brings a decision row and a long branch beside a running tag;
 * `outputs=true` a blocked card whose well lists the block, and reviewed work.
 * Neither seeds code blocks, so a cold dev server does not reload mid-test.
 */
async function openTray(page: Page, { fixture, lang, theme, width }: { fixture: "tray" | "outputs"; lang: string; theme: string; width: number }) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/?stavePreview=tars&${fixture}=true&lang=${lang}&theme=${theme}`);
  const view = page.getByTestId("tars-view");
  await expect(view.locator("[data-tars-tray-indicator]")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => [...document.fonts].filter((font) => font.status === "error").map((font) => font.family))).toEqual([]);
  if (width < POPOVER_BELOW) await view.locator("[data-tars-tray-indicator]").click();
  await expect(page.locator(`[data-tars-card="${fixture === "tray" ? "release" : "search"}"]`)).toBeVisible();
  return view;
}

/** Checks every visible card's header, attention well and footer; returns how many wells it measured. */
async function checkCards(page: Page) {
  const wellPad = await tokenPx(page, "--aui-space-12");
  const cards = page.locator("[data-tars-card]");
  let wells = 0;
  for (const card of await cards.all()) {
    if (!(await card.isVisible())) continue;
    await card.scrollIntoViewIfNeeded();
    const geometry = await card.evaluate((node) => {
      const box = (element: Element) => element.getBoundingClientRect();
      const title = node.querySelector("h3")!;
      const tag = node.querySelector("[data-tars-state]")!;
      const rows = [...node.querySelectorAll("[data-tars-attention]")].map((row) => {
        const [head, text] = [row.firstElementChild!, row.lastElementChild!];
        return { single: head === text, rowLeft: box(row).left, rowRight: box(row).right, headLeft: box(head).left, headBottom: box(head).bottom,
          textLeft: box(text).left, textRight: box(text).right, textTop: box(text).top };
      });
      const list = node.querySelector("[data-tars-attention-list]");
      const branch = node.querySelector("[data-tars-branch]");
      const facts = node.querySelector("[data-tars-facts]");
      const views = node.querySelector("[data-tars-monitor-views]");
      return {
        titleRight: box(title).right, tagLeft: box(tag).left,
        rows, listPad: list ? Number.parseFloat(getComputedStyle(list).paddingLeft) : null,
        branch: branch && facts ? { mono: getComputedStyle(branch.lastElementChild!).fontFamily.toLowerCase().includes("mono"),
          size: Number.parseFloat(getComputedStyle(branch.lastElementChild!).fontSize), factsSize: Number.parseFloat(getComputedStyle(facts).fontSize),
          right: box(branch).right, columnRight: box(title.parentElement!).right } : null,
        views: views ? { right: box(views).right, footRight: box(views.parentElement!).right - Number.parseFloat(getComputedStyle(views.parentElement!).paddingRight) } : null,
      };
    });
    // The title wraps beside the state tag; nothing in the header widens its column under the tag.
    expect(geometry.titleRight).toBeLessThanOrEqual(geometry.tagLeft + 0.5);
    if (geometry.branch) {
      expect(geometry.branch.mono).toBe(true);
      expect(geometry.branch.size).toBeLessThanOrEqual(geometry.branch.factsSize + 0.01);
      expect(geometry.branch.right).toBeLessThanOrEqual(geometry.branch.columnRight + 0.5);
    }
    if (geometry.listPad !== null) {
      wells += 1;
      expect(Math.abs(geometry.listPad - wellPad)).toBeLessThanOrEqual(0.5);
    }
    for (const row of geometry.rows) {
      if (row.single) continue;
      // Label line above, text below it, both from the row's start edge to its end.
      expect(row.textTop).toBeGreaterThanOrEqual(row.headBottom - 0.5);
      expect(Math.abs(row.textLeft - row.headLeft)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(row.textLeft - row.rowLeft)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(row.textRight - row.rowRight)).toBeLessThanOrEqual(0.5);
    }
    if (geometry.views) expect(Math.abs(geometry.views.right - geometry.views.footRight)).toBeLessThanOrEqual(0.5);
  }
  return wells;
}

for (const lang of ["en", "ko"]) for (const theme of ["light", "dark"]) for (const width of [1280, 390]) {
  test(`tray cards: full-width attention text, header branch and footer views (${lang}/${theme}/${width})`, async ({ page }) => {
    let wells = 0;
    for (const fixture of ["tray", "outputs"] as const) {
      await openTray(page, { fixture, lang, theme, width });
      wells += await checkCards(page);
    }
    // The decision row (tray) and the blocked row (outputs) were both measured.
    expect(wells).toBeGreaterThanOrEqual(2);
  });
}

const VIEW_ROOT = { brief: "[data-tars-brief]", report: "[data-tars-report]", changes: "[data-tars-changes]", timeline: "[data-tars-timeline]", review: "[data-tars-review]" } as const;

/** The vertical gaps between a view root's visible parts, once it has more than one. */
async function sectionGaps(root: Locator, kind: string) {
  await expect(root).toBeVisible();
  const measure = () => root.evaluate((node) => {
    const parts = [...node.children].filter((child) => child.getBoundingClientRect().height > 0);
    return parts.slice(1).map((part, at) => part.getBoundingClientRect().top - parts[at]!.getBoundingClientRect().bottom);
  });
  await expect.poll(async () => (await measure()).length, { message: `${kind} has several sections` }).toBeGreaterThan(0);
  return measure();
}

for (const lang of ["en", "ko"]) for (const width of [1280, 390]) {
  test(`side views put their sections on the section rhythm (${lang}/${width})`, async ({ page }) => {
    const view = await openTray(page, { fixture: "outputs", lang, theme: lang === "ko" ? "dark" : "light", width });
    const rhythm = await tokenPx(page, "--aui-space-24");
    // The blocked card opens its report on what is unmet, from its Blocked line.
    await page.locator('[data-tars-card="search"] [data-tars-attention="tars-blocked"] [data-tars-open-report="search"]').click();
    const side = view.locator("[data-tars-side-view]");
    await expect(side.locator(VIEW_ROOT.report)).toBeVisible();
    const switcher = side.locator("header button[aria-pressed]");
    for (const [index, kind] of [[1, "report"], [0, "brief"], [2, "changes"], [3, "timeline"]] as const) {
      if (kind !== "report") await switcher.nth(index).click();
      for (const gap of await sectionGaps(side.locator(VIEW_ROOT[kind]), kind)) expect(Math.abs(gap - rhythm), `${kind} section gap`).toBeLessThanOrEqual(0.5);
    }
    // The reviewed checkout work: verdict, findings and the evidence the reviewer cited, each its own part.
    await side.locator("[data-tars-side-bar] button").click();
    if (width < POPOVER_BELOW) await view.locator("[data-tars-tray-indicator]").click();
    await page.locator('[data-tars-output="review"] button').first().click();
    for (const gap of await sectionGaps(side.locator(VIEW_ROOT.review), "review")) expect(Math.abs(gap - rhythm), "review section gap").toBeLessThanOrEqual(0.5);
  });
}
