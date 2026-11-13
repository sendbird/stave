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
  const cardGap = await tokenPx(page, "--aui-space-12");
  const secondaryHeight = await tokenPx(page, "--aui-control-height-xs");
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
        cardGap: parseFloat(getComputedStyle(node.closest('ul')!).rowGap),
        titleRight: box(title).right, tagLeft: box(tag).left,
        rows, listPad: list ? Number.parseFloat(getComputedStyle(list).paddingLeft) : null,
        branch: branch && facts ? { mono: getComputedStyle(branch.lastElementChild!).fontFamily.toLowerCase().includes("mono"),
          size: Number.parseFloat(getComputedStyle(branch.lastElementChild!).fontSize), factsSize: Number.parseFloat(getComputedStyle(facts).fontSize),
          right: box(branch).right, columnRight: box(title.parentElement!).right } : null,
        views: views ? { right: box(views).right, footRight: box(views.parentElement!).right - Number.parseFloat(getComputedStyle(views.parentElement!).paddingRight),
          heights: [...views.querySelectorAll('button')].map((button) => button.getBoundingClientRect().height) } : null,
      };
    });
    expect(Math.abs(geometry.cardGap - cardGap)).toBeLessThanOrEqual(0.5);
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
    if (geometry.views) {
      expect(Math.abs(geometry.views.right - geometry.views.footRight)).toBeLessThanOrEqual(0.5);
      for (const height of geometry.views.heights) expect(Math.abs(height - secondaryHeight)).toBeLessThanOrEqual(0.5);
    }
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

    // Retired proposals no longer move their work into Needs you. Lane counts follow Fleet's live attention.
    const lanes = await readHeads();
    const expected = await page.evaluate(async () => {
      const { useTarsSnapshotStore } = await import("/src/store/tars-snapshot-store.ts");
      const { useFleetAttentionStore } = await import("/src/store/fleet-attention-store.ts");
      const rows = useTarsSnapshotStore.getState().snapshot!.responsibilities;
      const live = rows.filter((row) => row.state !== "completed" && row.state !== "cancelled");
      const byTask = new Map([
        ...live.flatMap((row) => row.state === "waiting" && row.waitingTaskId ? [[row.waitingTaskId, row.id] as const] : []),
        ...live.flatMap((row) => row.taskId ? [[row.taskId, row.id] as const] : []),
      ]);
      const attention = useFleetAttentionStore.getState().snapshot.items.flatMap((item) => {
        const id = item.tarsResponsibilityId ?? (item.taskId ? byTask.get(item.taskId) : undefined);
        return id ? [id] : [];
      });
      return { needsYou: attention.length, running: live.filter((row) => !attention.includes(row.id)).length };
    });
    expect(lanes.find((head) => head.lane === "needsYou")!.count).toBe(expected.needsYou);
    expect(lanes.find((head) => head.lane === "running")!.count).toBe(expected.running);
    expect(expected.running).toBeGreaterThan(0);
    await expect(page.locator('[data-tars-tray-lane="running"] [data-tars-card]')).toHaveCount(expected.running);

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

    // The title-row grouping control stays above the scroll area; lane titles pin to its content edge.
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
    await expect(page.locator('[data-tars-group-projects]')).toBeVisible();
    expect(sticky.inHead).toBe(true);
    expect(sticky.background).toBe(sticky.surface);
    // Clear stays in the Outputs header row.
    await expect(page.locator('[data-tars-lane-head="outputs"] [data-tars-lane-clear="outputs"]')).toHaveCount(1);

    // A profile with no waiting work supplies a genuinely empty lane, independently of the gallery's cases.
    await page.goto(`/?stavePreview=tars&lang=${lang}&theme=${theme}`);
    await expect(view.locator("[data-tars-tray-indicator]")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    if (width < POPOVER_BELOW) await view.locator("[data-tars-tray-indicator]").click();
    const empty = (await readHeads()).find((head) => head.lane === "needsYou")!;
    expect(empty.count).toBe(0);
    expect(empty.expanded).toBe("false");
    expect(Math.abs(empty.itemHeight - empty.height)).toBeLessThanOrEqual(0.5);
    expect(empty.titleColor).not.toBe((await readHeads()).find((head) => head.lane === "running")!.titleColor);
    const emptyTrigger = page.locator('[data-tars-lane-head="needsYou"] button[aria-expanded]');
    await emptyTrigger.click();
    await expect(emptyTrigger).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator('[data-tars-tray-lane="needsYou"] p').first()).toBeVisible();
    await emptyTrigger.click();
    await expect(emptyTrigger).toHaveAttribute("aria-expanded", "false");
  });
}

for (const [lang, theme] of [["en", "light"], ["ko", "dark"]] as const) for (const width of [1440, 390]) {
  test(`tray cards: one primary action, secondary actions on one rung, named menus and counters (${lang}/${theme}/${width})`, async ({ page }) => {
    test.setTimeout(60_000);
    await openGallery(page, { lang, theme, width });
    const [decision, secondary] = [await tokenPx(page, "--aui-control-height-sm"), await tokenPx(page, "--aui-control-height-xs")];
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
      // Scrolling can place the next row under the pointer left on the previous one.
      // Start outside the row and wait for its hover-out transition before comparing colors.
      await page.mouse.move(0, 0);
      await expect.poll(() => opener.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
      const before = await opener.evaluate((node) => getComputedStyle(node).backgroundColor);
      await opener.hover();
      await expect.poll(() => opener.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe(before);
      await page.mouse.move(0, 0);
      await expect.poll(() => opener.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(before);
      expect((await opener.boundingBox())!.height).toBeGreaterThanOrEqual(secondary);
    }
  });
}

test("the tray keeps its own type sizes whatever the conversation's text size", async ({ page }) => {
  const view = await openGallery(page, { lang: "en", theme: "light", width: 1440 });
  const sizes = () => page.locator("[data-tars-tray]").evaluate((tray) => [...tray.querySelectorAll("h3, p, span, button")].slice(0, 200)
    .map((node) => getComputedStyle(node).fontSize).join(","));
  const before = await sizes();
  // The conversation's type scale (`chat-type.stylex.ts`), which its column sets from the chat font size.
  await view.evaluate((node) => {
    for (const step of ["body", "secondary", "meta"]) (node as HTMLElement).style.setProperty(`--chat-type-${step}`, "40px");
  });
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

for (const lang of ["en", "ko"]) for (const theme of ["light", "dark"]) for (const width of [1440, 390]) {
  test(`project groups preserve rows, queue and lane controls (${lang}/${theme}/${width})`, async ({ page }) => {
    test.setTimeout(60_000);
    await openTray(page, { fixture: "tray", lang, theme, width });
    await page.evaluate((width) => { document.documentElement.dataset.uiDensity = width < 1088 ? "compact" : "regular"; }, width);
    const toggle = page.locator("[data-tars-group-projects]");
    await expect(page.locator('[data-tars-tray-toolbar]')).toHaveCount(0);
    const title = page.getByRole('heading', { name: lang === 'ko' ? '맡긴 일' : 'Work', exact: true });
    const toolGeometry = await toggle.evaluate((node, title) => {
      const icon = node.querySelector('svg')!.getBoundingClientRect();
      const control = node.getBoundingClientRect();
      const heading = (title as HTMLElement).getBoundingClientRect();
      const text = [...node.querySelectorAll('span')].filter((span) => span.textContent?.trim()).map((span) => span.getBoundingClientRect());
      return { height: control.height, width: control.width, iconWidth: icon.width, iconHeight: icon.height, center: (icon.top + icon.bottom - control.top - control.bottom) / 2,
        titleCenter: (heading.top + heading.bottom - control.top - control.bottom) / 2, afterTitle: control.left >= heading.right,
        visibleText: text.some((box) => box.width > 1 && box.height > 1) };
    }, await title.elementHandle());
    expect(Math.abs(toolGeometry.height - await tokenPx(page, '--aui-control-height-sm'))).toBeLessThanOrEqual(0.5);
    expect(Math.abs(toolGeometry.width - toolGeometry.height)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(toolGeometry.iconWidth - await tokenPx(page, '--aui-control-icon-size-md'))).toBeLessThanOrEqual(0.5);
    expect(Math.abs(toolGeometry.iconHeight - toolGeometry.iconWidth)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(toolGeometry.center)).toBeLessThanOrEqual(1);
    expect(Math.abs(toolGeometry.titleCenter)).toBeLessThanOrEqual(1);
    expect(toolGeometry.afterTitle).toBe(true);
    expect(toolGeometry.visibleText).toBe(false);
    const idle = await toggle.evaluate((node) => getComputedStyle(node).backgroundColor);
    const before = await page.locator("[data-tars-card]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-tars-card")).sort());
    await toggle.focus();
    // A popover can initially autofocus this control without keyboard modality.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(toggle).toBeFocused();
    await expect(page.getByRole('tooltip')).toHaveCount(1);
    await expect(page.getByRole('tooltip')).toContainText(lang === 'ko' ? '프로젝트별로 묶기' : 'Group by project');
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => toggle.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe(idle);
    await page.keyboard.press('Tab');
    await expect(toggle).not.toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(toggle).toBeFocused();
    const group = page.locator('[data-tars-tray-lane="needsYou"] [data-tars-project]').first();
    await expect(group).toBeVisible();
    const trigger = group.locator(':scope > button');
    const geometry = await trigger.evaluate((node) => {
      const [icon, label, count] = [...node.children];
      const box = (element: Element) => element.getBoundingClientRect();
      return { gap: box(label!).left - box(icon!).right, center: (box(icon!).top + box(icon!).bottom - box(label!).top - box(label!).bottom) / 2,
        right: box(count!).right, container: box(node).right, shrink: getComputedStyle(icon!).flexShrink };
    });
    expect(Math.abs(geometry.gap - await tokenPx(page, "--aui-space-8"))).toBeLessThanOrEqual(0.5);
    expect(Math.abs(geometry.center)).toBeLessThanOrEqual(1);
    expect(geometry.shrink).toBe("0");
    expect(geometry.right).toBeLessThanOrEqual(geometry.container);
    const after = await page.locator("[data-tars-card]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-tars-card")).sort());
    expect(after).toEqual(before);
    await trigger.click();
    await expect(group.locator('[data-tars-card]').first()).toBeHidden();
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(group.locator('[data-tars-card]').first()).toBeVisible();
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => toggle.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(idle);
    await expect(page.locator('[data-tars-project]')).toHaveCount(0);
    expect(await page.locator("[data-tars-card]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-tars-card")).sort())).toEqual(before);
    // Closing and reopening starts the tray's view option fresh, as before the control moved.
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-tars-tray-indicator]').click();
    await expect(toggle).toHaveCount(0);
    await page.locator('[data-tars-tray-indicator]').click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });
}

test("project grouping keeps global queue moves, output ownership and clearing through filtering", async ({ page }) => {
  await openTray(page, { fixture: "tray", lang: "en", theme: "light", width: 1440 });
  // Mount the real tray with controlled snapshots to exercise ownership and refresh boundaries without a provider.
  await page.evaluate(async () => {
    // @ts-expect-error browser imports use Vite optimized dependencies
    const reactModule = await import("/node_modules/.vite/deps/react.js");
    const { createElement, Fragment } = reactModule.default ?? reactModule;
    // @ts-expect-error browser imports use Vite optimized dependencies
    const clientModule = await import("/node_modules/.vite/deps/react-dom_client.js");
    const { createRoot } = clientModule.default ?? clientModule;
    // @ts-expect-error browser imports use Vite's served source URLs
    const { TarsTray, TarsTrayGroupingButton } = await import("/src/components/tars/TarsTray.tsx");
    // @ts-expect-error browser imports use Vite's served source URLs
    const { buildTarsTray } = await import("/src/lib/tars/tray-model.ts");
    // @ts-expect-error browser imports use Vite's served source URLs
    const { buildTarsTrayFixtures } = await import("/src/dev/tars-preview/tars-fixtures.ts");
    // @ts-expect-error browser imports use Vite's served source URLs
    const { useAppStore } = await import("/src/store/app.store.ts");
    const f = buildTarsTrayFixtures(new Date());
    const base = f.responsibilities[0];
    const rows = [
      { ...base, id: "a", state: "running", repositoryPath: "/tmp/alpha" },
      { ...base, id: "b", state: "running", repositoryPath: "/tmp/beta" },
      { ...base, id: "q1", state: "queued", priority: 90, repositoryPath: "/tmp/beta" },
      { ...base, id: "q2", state: "queued", priority: 50, repositoryPath: "/tmp/alpha" },
      { ...base, id: "done", state: "completed", repositoryPath: "/tmp/alpha" },
    ];
    useAppStore.setState({ recentRepositories: [{ repositoryPath: "/tmp/alpha", repositoryName: "Known project", lastOpenedAt: new Date().toISOString(), defaultBranch: "main", workspaces: [], activeWorkspaceId: "", workspaceBranchById: {}, workspacePathById: {}, workspaceDefaultById: {} }] });
    document.querySelector('[data-testid="tars-view"]')?.remove();
    const host = document.createElement("div");
    host.style.width = "390px";
    document.body.append(host);
    const root = createRoot(host);
    let filtered = false;
    let cleared = false;
    let grouped = false;
    const log = (value: string) => { host.dataset.action = value; };
    const renderTray = (grouped: boolean) => createElement(TarsTray, { grouped,
      model: buildTarsTray({ responsibilities: rows.filter((row) => (!filtered || row.id !== "a") && (!cleared || row.id !== "done")), attentionItems: [], runs: {} }),
      outputs: [{ kind: "changes", responsibilityId: "a", title: "Owned output", files: 1 }, { kind: "changes", responsibilityId: "missing", title: "Unknown output", files: 2 }],
      actions: { busy: false, onAct: (_row: unknown, op: string) => log(op), onMove: (row: { id: string }, move: { direction: string }) => log(`${row.id}:${move.direction}`),
        onConfirm: () => {}, onOpenTask: () => {}, onShowInFleet: () => {}, onOpenSide: (target: { responsibilityId: string }) => log(target.responsibilityId) },
      clearing: { busy: false, done: { clearable: cleared ? 0 : 1, hidden: cleared ? 1 : 0, onUndo: cleared ? () => { cleared = false; render(); } : null }, outputs: { clearable: 0, hidden: 0, onUndo: null },
        onClear: () => { cleared = true; render(); } },
    });
    const render = () => root.render(createElement(Fragment, null,
      createElement(TarsTrayGroupingButton, { grouped, onChange: (next: boolean) => { grouped = next; render(); } }), renderTray(grouped)));
    const filter = document.createElement("button");
    filter.textContent = "Apply fixture filter";
    filter.onclick = () => { filtered = !filtered; render(); };
    document.body.append(filter);
    render();
  });
  await page.locator('[data-tars-group-projects]').click();
  const running = page.locator('[data-tars-tray-lane="running"]');
  await expect(running.locator('[data-tars-project]')).toHaveCount(2);
  await expect(running.locator('[data-tars-project]').first().locator(':scope > button')).toContainText("Known project");
  expect(await page.locator('[data-tars-queue-item]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-tars-queue-item')))).toEqual(["q1", "q2"]);
  await expect(page.locator('[data-tars-project] [data-tars-queue-item]')).toHaveCount(0);
  await page.locator('[data-tars-queue-grip="q2"]').focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect(page.locator('[data-action]')).toHaveAttribute("data-action", "q2:earlier");
  await page.locator('[data-tars-output]').first().locator('button').click();
  await expect(page.locator('[data-action]')).toHaveAttribute("data-action", "a");
  await expect(page.locator('[data-tars-tray-lane="outputs"] [data-tars-project="unknown"]')).toContainText('Unknown project');
  await page.locator('[data-tars-lane-head="done"] button[aria-expanded]').click();
  await expect(page.locator('[data-tars-card="done"]')).toBeVisible();
  await page.locator('[data-tars-lane-clear="done"]').click();
  await expect(page.locator('[data-tars-card="done"]')).toHaveCount(0);
  await page.locator('[data-tars-lane-undo="done"]').click();
  await expect(page.locator('[data-tars-card="done"]')).toBeVisible();
  await page.getByRole('button', { name: 'Apply fixture filter' }).click();
  await expect(page.locator('[data-tars-card="a"]')).toHaveCount(0);
  await expect(running.locator('[data-tars-card]')).toHaveCount(3);
  await page.getByRole('button', { name: 'Apply fixture filter' }).click();
  await expect(running.locator('[data-tars-card]')).toHaveCount(4);
});


for (const theme of ["light", "dark"]) for (const lang of ["en", "ko"]) for (const density of ["regular", "compact"]) {
  test(`Tars model selection stays below its branch and inside the card (${theme}/${lang}/${density})`, async ({ page }) => {
    for (const width of [560, 1600]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/?stavePreview=tars&tray=true&theme=${theme}&lang=${lang}&density=${density}`);
      await page.evaluate(() => document.fonts.ready);
      if (width < 1088) await page.locator("[data-tars-tray-indicator]").click();
      const card = page.locator('[data-tars-card="billing"]');
      const model = card.locator("[data-tars-model-selection]");
      await expect(model).toContainText("GPT-6.1 Sol");
      await expect(model).toContainText(" · ");
      await model.scrollIntoViewIfNeeded();
      const boxes = await card.evaluate((node) => {
        const line = node.querySelector("[data-tars-model-selection]")!;
        const branch = node.querySelector("[data-tars-branch]")!;
        const model = line.getBoundingClientRect(), source = branch.getBoundingClientRect(), card = node.getBoundingClientRect();
        return { left: model.left, right: model.right, top: model.top, branchLeft: source.left, branchBottom: source.bottom,
          cardLeft: card.left, cardRight: card.right, overflow: line.scrollWidth - line.clientWidth };
      });
      // Subpixel font/layout rounding is allowed; the line belongs to the same metadata column.
      expect(Math.abs(boxes.left - boxes.branchLeft)).toBeLessThanOrEqual(1);
      expect(boxes.top).toBeGreaterThanOrEqual(boxes.branchBottom - 1);
      expect(boxes.left).toBeGreaterThanOrEqual(boxes.cardLeft);
      expect(boxes.right).toBeLessThanOrEqual(boxes.cardRight + 1);
      expect(boxes.overflow).toBeLessThanOrEqual(1);
      await expect(page.locator('[data-tars-card="release"] [data-tars-model-selection]')).toHaveCount(0);
    }
  });
}
