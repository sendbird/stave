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

/**
 * The gallery's code blocks load the syntax highlighter's themes in a worker
 * after the first paint. On a cold dev server those are new dependencies, so
 * Vite optimizes them and reloads every open page once, possibly mid-test.
 * Each worker loads the gallery once first and waits for that to pass.
 */
test.beforeAll(async ({ browser }) => {
  test.setTimeout(60_000);
  const page = await browser.newPage();
  try {
    const themes = page.waitForResponse((response) => /github-(light|dark)/.test(response.url()), { timeout: 30_000 }).catch(() => null);
    await page.goto("/?stavePreview=tars&gallery=true");
    await themes;
    await page.waitForEvent("load", { timeout: 5_000 }).catch(() => null);
    await page.waitForLoadState("networkidle");
  } finally {
    await page.close();
  }
});

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
        // A Tars decision is one marked line: its mark on the text's first line, the text running to the row's end or its risk tag.
        const mark = row.querySelector("[data-tars-attention-mark]");
        const inline = mark ? (() => {
          const body = mark.parentElement!.nextElementSibling!;
          const lineHeight = Number.parseFloat(getComputedStyle(body).lineHeight);
          return { markCenter: (box(mark).top + box(mark).bottom) / 2, firstLineCenter: box(body).top + lineHeight / 2, labelShown: Boolean(row.textContent?.includes(mark.getAttribute("aria-label")!)) };
        })() : null;
        return { single: head === text, inline, rowLeft: box(row).left, rowRight: box(row).right, headLeft: box(head).left, headBottom: box(head).bottom,
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
      if (row.inline) {
        expect(Math.abs(row.inline.markCenter - row.inline.firstLineCenter)).toBeLessThanOrEqual(1);
        expect(row.inline.labelShown).toBe(false);
        continue;
      }
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

/** The tray's scroll container: the pinned panel's body, or the popover's body. */
async function trayScroller(page: Page) {
  return page.evaluateHandle(() => {
    let node = document.querySelector("[data-tars-tray]")?.parentElement ?? null;
    while (node && !/auto|scroll/.test(getComputedStyle(node).overflowY)) node = node.parentElement;
    return node!;
  });
}

async function openGallery(page: Page, { lang, theme, width }: { lang: string; theme: string; width: number }) {
  await page.setViewportSize({ width, height: 900 });
  // The gallery seeds code blocks, so a cold dev server may optimize a new dependency and reload the page once while
  // it settles (`openTray`'s fixtures avoid them for that reason); after that reload the page stays put.
  for (let attempt = 0; ; attempt += 1) {
    try { return await settleGallery(page, { lang, theme, width }); }
    catch (error) { if (attempt > 0 || !String(error).includes("Execution context was destroyed")) throw error; }
  }
}

async function settleGallery(page: Page, { lang, theme, width }: { lang: string; theme: string; width: number }) {
  await page.goto(`/?stavePreview=tars&gallery=true&lang=${lang}&theme=${theme}`);
  await page.waitForLoadState("networkidle");
  const view = page.getByTestId("tars-view");
  // A cold dev server takes longer to serve the gallery, as in the message-chrome suite.
  await expect(view.locator("[data-tars-tray-indicator]")).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
  // The composer takes focus once the view settles, which would close a popover opened before it.
  await expect(view.locator("[data-tars-composer]").getByRole("textbox")).toBeFocused({ timeout: 20_000 });
  if (width < POPOVER_BELOW) await view.locator("[data-tars-tray-indicator]").click();
  await expect(page.locator("[data-tars-tray]")).toBeVisible();
  // The popover scales in; measure and click once it has settled.
  await page.waitForFunction(() => {
    const popup = document.querySelector("[data-tars-tray]")?.closest(".atelier-motion-dropdown");
    return !popup || popup.getAnimations().every((animation) => animation.playState !== "running");
  });
  return view;
}

for (const [lang, theme] of [["en", "light"], ["ko", "dark"]] as const) for (const width of [1440, 390]) {
  test(`tray lanes: chevron state, sticky headers, empty lanes and one count rule (${lang}/${theme}/${width})`, async ({ page }) => {
    test.setTimeout(60_000);
    const view = await openGallery(page, { lang, theme, width });
    const gap = await tokenPx(page, "--aui-space-8");
    const heads = page.locator("[data-tars-lane-head]");
    // Every header: the chevron leads the label on the label's gap and turns with aria-expanded.
    const readHeads = () => heads.evaluateAll((nodes) => nodes.map((head) => {
      const trigger = head.querySelector("button[aria-expanded]")!;
      const chevron = head.querySelector("[data-tars-lane-chevron]")!;
      const title = head.querySelector("[data-tars-lane-count]")!.parentElement!;
      return { lane: head.getAttribute("data-tars-lane-head"), expanded: trigger.getAttribute("aria-expanded"), transform: getComputedStyle(chevron).transform,
        gap: title.getBoundingClientRect().left - chevron.getBoundingClientRect().right, count: Number(head.querySelector("[data-tars-lane-count]")!.textContent),
        titleColor: getComputedStyle(title).color, height: head.getBoundingClientRect().height,
        itemHeight: head.closest("[data-tars-tray-lane]")!.getBoundingClientRect().height };
    }));
    for (const head of await readHeads()) {
      expect(head.transform === "none" ? "false" : "true", head.lane!).toBe(head.expanded);
      expect(Math.abs(head.gap - gap)).toBeLessThanOrEqual(0.5);
    }
    // Opening the folded Done lane turns its chevron; folding it turns it back.
    const done = page.locator('[data-tars-lane-head="done"] button[aria-expanded]');
    await done.click();
    await expect(done).toHaveAttribute("aria-expanded", "true");
    await expect.poll(() => page.locator('[data-tars-lane-head="done"] [data-tars-lane-chevron]').evaluate((node) => getComputedStyle(node).transform)).not.toBe("none");
    await done.click();
    await expect(done).toHaveAttribute("aria-expanded", "false");

    // The empty lane is one muted header row with a zero count; its sentence is there once opened.
    const lanes = await readHeads();
    const running = lanes.find((head) => head.lane === "running")!;
    expect(running.count).toBe(0);
    expect(running.expanded).toBe("false");
    expect(Math.abs(running.itemHeight - running.height)).toBeLessThanOrEqual(0.5);
    expect(running.titleColor).not.toBe(lanes.find((head) => head.lane === "needsYou")!.titleColor);
    await page.locator('[data-tars-lane-head="running"] button[aria-expanded]').click();
    await expect(page.locator('[data-tars-tray-lane="running"] p').first()).toBeVisible();
    await page.locator('[data-tars-lane-head="running"] button[aria-expanded]').click();

    // The indicator says each lane's header number under the lane's own name, and nothing the lanes do not show.
    const chip = (await view.locator("[data-tars-tray-indicator]").textContent())!;
    const names = await page.evaluate(async () => {
      const { i18n } = await import("/src/i18n/index.ts");
      return Object.fromEntries(["needsYou", "running", "done", "outputs"].map((lane) => [lane, i18n.t(`shell:tars.tray.lanes.${lane}`)]));
    });
    const parts = chip.split(" · ");
    for (const head of lanes) {
      const part = parts.find((value) => lang === "ko" ? value.startsWith(`${names[head.lane!]} `) : value.includes(head.lane === "running" ? "in progress" : head.lane === "needsYou" ? "need" : head.lane!));
      if (head.count === 0) expect(part, head.lane!).toBeUndefined();
      else expect(part?.match(/\d+/)?.[0], head.lane!).toBe(String(head.count));
    }
    expect(parts.length).toBe(lanes.filter((head) => head.count > 0).length);

    // Scrolled into the long Needs you lane, its header stays at the top, opaque on the tray's surface, with cards passing under it.
    const scroller = await trayScroller(page);
    await scroller.evaluate((node: HTMLElement) => { node.scrollTop = 1200; });
    const sticky = await page.locator('[data-tars-lane-head="needsYou"]').evaluate((head, node) => {
      const box = head.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      let surface: Element | null = node;
      while (surface && getComputedStyle(surface).backgroundColor === "rgba(0, 0, 0, 0)") surface = surface.parentElement;
      return { top: box.top, scrollerTop: (node as HTMLElement).getBoundingClientRect().top, inHead: head.contains(hit), background: getComputedStyle(head).backgroundColor,
        surface: surface ? getComputedStyle(surface).backgroundColor : null };
    }, await scroller.asElement()!);
    expect(Math.abs(sticky.top - sticky.scrollerTop)).toBeLessThanOrEqual(1);
    expect(sticky.inHead).toBe(true);
    expect(sticky.background).toBe(sticky.surface);
    // Clear stays in the Outputs header row.
    await expect(page.locator('[data-tars-lane-head="outputs"] [data-tars-lane-clear="outputs"]')).toHaveCount(1);
  });
}

for (const [lang, theme] of [["en", "light"], ["ko", "dark"]] as const) for (const width of [1440, 390]) {
  test(`tray cards: one primary action, secondary actions on one rung, named menus and counters (${lang}/${theme}/${width})`, async ({ page }) => {
    test.setTimeout(60_000);
    await openGallery(page, { lang, theme, width });
    const [decision, secondary] = [await tokenPx(page, "--aui-control-height-xs"), await tokenPx(page, "--aui-control-height-2xs")];
    // Cards in a folded lane are out of layout; layout heights, so no entering transform skews them.
    const cards = await page.locator("[data-tars-card-actions]").evaluateAll((groups) => groups.filter((group) => group.checkVisibility()).map((group) => ({
      primaries: [...group.querySelectorAll<HTMLElement>("[data-tars-card-primary]")].map((node) => node.offsetHeight),
      others: [...group.querySelectorAll<HTMLElement>("button:not([data-tars-card-primary])")].map((node) => ({ height: node.offsetHeight, name: node.getAttribute("aria-label") ?? node.textContent ?? "" })),
    })));
    expect(cards.length).toBeGreaterThan(4);
    for (const card of cards) {
      expect(card.primaries.length).toBeLessThanOrEqual(1);
      for (const height of card.primaries) expect(Math.abs(height - decision)).toBeLessThanOrEqual(0.5);
      for (const other of card.others) {
        expect(Math.abs(other.height - secondary)).toBeLessThanOrEqual(0.5);
        expect(other.name.trim().length).toBeGreaterThan(0);
      }
    }
    // A bare "2/3" is read as the stage it counts.
    const count = page.locator("[data-tars-monitor-count]").first();
    await expect(count.locator("span").last()).toHaveText(/\d/);
    expect(await count.evaluate((node) => node.textContent!.length > node.getAttribute("data-tars-monitor-count")!.length)).toBe(true);
    // Hovering the menu trigger names it.
    const more = page.locator("[data-tars-more-actions]").first();
    await more.scrollIntoViewIfNeeded();
    await more.hover();
    await expect(page.getByRole("tooltip")).toBeVisible();
    await page.mouse.move(0, 0);
  });
}

for (const [lang, theme] of [["en", "light"], ["ko", "dark"]] as const) for (const width of [1440, 390]) {
  test(`tray outputs: every row says its kind and where it opens, and hovers as one opener (${lang}/${theme}/${width})`, async ({ page }) => {
    test.setTimeout(60_000);
    await openGallery(page, { lang, theme, width });
    const secondary = await tokenPx(page, "--aui-control-height-2xs");
    const rows = page.locator("[data-tars-output]");
    const rowsSeen = await rows.count();
    expect(rowsSeen).toBeGreaterThan(0);
    for (let index = 0; index < rowsSeen; index += 1) {
      const row = rows.nth(index);
      const opener = row.locator(":scope > a, :scope > button");
      await opener.scrollIntoViewIfNeeded();
      const kind = await row.getAttribute("data-tars-output-opens");
      expect(await opener.evaluate((node) => node.tagName)).toBe(kind === "external" ? "A" : "BUTTON");
      expect(await opener.locator("svg").count()).toBe(2);
      const before = await opener.evaluate((node) => getComputedStyle(node).backgroundColor);
      await opener.hover();
      await expect.poll(() => opener.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe(before);
      expect((await opener.boundingBox())!.height).toBeGreaterThanOrEqual(secondary);
    }
  });
}

test("the tray keeps its own type sizes whatever the conversation's text size", async ({ page }) => {
  const view = await openGallery(page, { lang: "en", theme: "light", width: 1440 });
  const sizes = () => page.locator("[data-tars-tray]").evaluate((tray) => [...tray.querySelectorAll("h3, p, span, button")].slice(0, 200)
    .map((node) => getComputedStyle(node).fontSize).join(","));
  const before = await sizes();
  await view.evaluate((node) => (node as HTMLElement).style.setProperty("--tars-text-size", "40px"));
  expect(await sizes()).toBe(before);
});

test("a lane header shows a hover wash and the keyboard focus ring", async ({ page }) => {
  await openGallery(page, { lang: "en", theme: "light", width: 1440 });
  const trigger = page.locator('[data-tars-lane-head="done"] button[aria-expanded]');
  const rest = await trigger.evaluate((node) => getComputedStyle(node).backgroundColor);
  await trigger.hover();
  await expect.poll(() => trigger.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe(rest);
  await page.mouse.move(0, 0);
  await page.locator('[data-tars-lane-head="needsYou"] button[aria-expanded]').focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect.poll(() => page.locator('[data-tars-lane-head="needsYou"] button[aria-expanded]').evaluate((node) => getComputedStyle(node).outlineStyle)).toBe("solid");
});
