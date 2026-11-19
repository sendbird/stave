import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * A Tars work card reads in three lines on the real components in the Tars
 * preview: its title, one sentence, then its state with one action. Everything
 * else is the card's detail, which the title opens. The same work's progress
 * is not repeated in the conversation or above the composer.
 */

const POPOVER_BELOW = 1088;

/** The cases, by fixture: `work` has a decision to confirm, running, queued and user-held work; `outputs` blocked work; `gallery` work finished with a pull request. */
const CASES = [
  { fixture: "tray=true&live=true&queued=true", id: "release", state: "waiting", primary: "confirm" },
  { fixture: "tray=true&live=true&queued=true", id: "billing", state: "working", primary: "openTask" },
  { fixture: "tray=true&live=true&queued=true", id: "search-index", state: "working", primary: "startNow" },
  { fixture: "outputs=true", id: "search", state: "blocked", primary: "openReport" },
  { fixture: "gallery=true", id: "docs", state: "finished", primary: "openPullRequest" },
] as const;

async function openTray(page: Page, query: string, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/?stavePreview=tars&${query}`);
  const view = page.getByTestId("tars-view");
  await expect(view.locator("[data-tars-tray-indicator]")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  if (width < POPOVER_BELOW) await view.locator("[data-tars-tray-indicator]").click();
  await expect(page.locator("[data-tars-tray]")).toBeVisible();
  // Finished work sits in the folded Done lane.
  const done = page.locator('[data-tars-lane-head="done"]');
  if (await done.locator('[data-tars-lane-chevron="closed"]').count()) await done.locator("button[aria-expanded]").click();
  return view;
}

/** What a folded card shows: its visible rows from top to bottom, and its visible controls. */
async function measure(card: Locator) {
  await card.scrollIntoViewIfNeeded();
  return card.evaluate((node) => {
    const visible = (element: Element) => element.checkVisibility() && element.getBoundingClientRect().height > 0;
    const box = (element: Element) => element.getBoundingClientRect();
    const rows = [...node.children].filter(visible).map((child) => ({ top: box(child).top, bottom: box(child).bottom }));
    const title = node.querySelector("[data-tars-card-title]");
    const sentence = node.querySelector("[data-tars-card-sentence]");
    const state = node.querySelector("[data-tars-card-state]");
    const primary = node.querySelector("[data-tars-card-primary]");
    const controls = [...node.querySelectorAll("button, a")].filter(visible);
    return {
      rows: rows.length,
      ordered: rows.every((row, index) => index === 0 || row.top >= rows[index - 1]!.bottom - 0.5),
      controls: controls.map((control) => control.hasAttribute("data-tars-card-title") ? "title" : control.getAttribute("data-tars-card-primary") ?? control.getAttribute("data-tars-queue-grip") ?? "other"),
      titleText: title?.textContent?.trim() ?? "",
      sentenceText: sentence?.textContent?.trim() ?? "",
      sentenceLines: sentence ? Math.round(box(sentence).height / Number.parseFloat(getComputedStyle(sentence.firstElementChild ?? sentence).lineHeight)) : 0,
      stateText: state?.textContent?.trim() ?? "",
      // The state and the one action share the third line.
      sameLine: Boolean(state && primary) && Math.abs((box(state!).top + box(state!).bottom) / 2 - (box(primary!).top + box(primary!).bottom) / 2) <= 1.5,
      contained: controls.every((control) => box(control).right <= box(node).right + 0.5 && box(control).left >= box(node).left - 0.5),
      height: box(node).height,
    };
  });
}

for (const lang of ["en", "ko"] as const) for (const theme of ["light", "dark"] as const) for (const density of ["regular", "compact"] as const) for (const width of [1440, 390] as const) {
  test(`every case reads in three lines · ${lang} · ${theme} · ${density} · ${width}px`, async ({ page }) => {
    test.setTimeout(90_000);
    let fixture = "";
    for (const entry of CASES) {
      // The gallery is checked once per language and width; its other switches change nothing a card reads.
      if (entry.fixture === "gallery=true" && (theme === "dark" || density === "compact")) continue;
      if (entry.fixture !== fixture) { fixture = entry.fixture; await openTray(page, `${fixture}&lang=${lang}&theme=${theme}&density=${density}`, width); }
      const card = page.locator(`[data-tars-card="${entry.id}"]`);
      await expect(card, entry.id).toBeVisible();
      await expect(card, entry.id).toHaveAttribute("data-task-user-state", entry.state);
      await expect(card.locator("[data-tars-card-detail]"), entry.id).toBeHidden();
      const shown = await measure(card);
      expect(shown.rows, entry.id).toBe(3);
      expect(shown.ordered, entry.id).toBe(true);
      // Exactly two controls: the title, which opens the detail, and the one action that fits the state.
      expect(shown.controls, entry.id).toEqual(["title", entry.primary]);
      expect(shown.titleText.length, entry.id).toBeGreaterThan(0);
      expect(shown.sentenceText.length, entry.id).toBeGreaterThan(0);
      expect(shown.sentenceLines, entry.id).toBeLessThanOrEqual(2);
      expect(shown.stateText.length, entry.id).toBeGreaterThan(0);
      expect(shown.sameLine, entry.id).toBe(true);
      expect(shown.contained, entry.id).toBe(true);
    }
  });
}

/** The narrowest width the Tars e2e suite covers (the app declares no minimum window width); the popover tray takes the view's width less its gutters there. */
const NARROWEST = 360;

/** Every card in the tray against the lane it sits in: nothing a card draws may pass the card's edge, and no card may pass its lane's. */
async function overflow(page: Page) {
  return page.evaluate(() => {
    const box = (element: Element) => element.getBoundingClientRect();
    const visible = (element: Element) => element.checkVisibility() && box(element).width > 0 && box(element).height > 0;
    const tray = document.querySelector("[data-tars-tray]")!;
    // The tray's scroll container: the pinned column's body or the popover's.
    let scroller: Element = tray;
    while (scroller.parentElement && getComputedStyle(scroller).overflowY !== "auto") scroller = scroller.parentElement;
    const faults: string[] = [];
    if (scroller.scrollWidth > scroller.clientWidth) faults.push(`tray scrolls sideways by ${scroller.scrollWidth - scroller.clientWidth}px`);
    const cards = [...tray.querySelectorAll("[data-tars-card]")].filter(visible);
    for (const card of cards) {
      const id = card.getAttribute("data-tars-card")!;
      const lane = card.closest("ul")!;
      const inner = Number.parseFloat(getComputedStyle(lane).paddingInlineEnd);
      if (box(card).right > box(lane).right - inner + 0.5 || box(card).left < box(lane).left - 0.5) faults.push(`${id}: the card passes its lane by ${Math.round(box(card).right - (box(lane).right - inner))}px`);
      if (card.scrollWidth > card.clientWidth) faults.push(`${id}: content is ${card.scrollWidth - card.clientWidth}px wider than the card`);
      // The title row keeps its chevron inside, the sentence its text, the state row its action; open, the detail keeps every control.
      const parts: Array<[string, Element | null]> = [["chevron", card.querySelector("[data-tars-card-title] svg")], ["sentence", card.querySelector("[data-tars-card-sentence]")],
        ["state", card.querySelector("[data-tars-card-state]")], ["action", card.querySelector("[data-tars-card-primary]")],
        ...[...card.querySelectorAll("[data-tars-card-sentence] *, [data-tars-card-detail] button, [data-tars-card-detail] a, [data-tars-card-detail] p")].map((node): [string, Element] => ["part", node])];
      const edge = box(card).right - Number.parseFloat(getComputedStyle(card).paddingInlineEnd);
      for (const [name, part] of parts) {
        if (part && visible(part) && box(part).right > edge + 0.5) faults.push(`${id}: ${name} "${(part.textContent ?? "").trim().slice(0, 24)}" passes the card's edge by ${Math.round(box(part).right - edge)}px`);
      }
      const sentence = card.querySelector("[data-tars-card-sentence]")!;
      const lines = Math.round(box(sentence).height / Number.parseFloat(getComputedStyle(sentence.firstElementChild ?? sentence).lineHeight));
      if (lines > 2) faults.push(`${id}: the sentence takes ${lines} lines`);
    }
    return { cards: cards.length, faults };
  });
}

for (const lang of ["en", "ko"] as const) for (const density of ["regular", "compact"] as const) for (const width of [390, NARROWEST] as const) {
  test(`every card stays inside its lane, folded and open · ${lang} · ${density} · ${width}px`, async ({ page }) => {
    test.setTimeout(90_000);
    // Every lane and every state rule at once; the running work under review rows carries the stale-progress line, the longest live sentence.
    await openTray(page, `tray=true&live=true&queue=true&cardStates=true&lang=${lang}&density=${density}`, width);
    await expect(page.locator('[data-tars-card="card-signals"] [data-tars-live-freshness="stale"]')).toBeVisible();
    const folded = await overflow(page);
    expect(folded.cards).toBeGreaterThanOrEqual(12);
    expect(folded.faults).toEqual([]);
    for (const title of await page.locator("[data-tars-card] [data-tars-card-title]").all()) await title.click();
    await expect(page.locator('[data-tars-card-open="false"]')).toHaveCount(0);
    // A chevron's box is wider than itself while it turns.
    await page.waitForFunction(() => [...document.querySelectorAll("[data-tars-card-title] svg")].every((node) => node.getAnimations().every((animation) => animation.playState !== "running")));
    expect((await overflow(page)).faults).toEqual([]);
  });
}

test("the state is one of the task's words, in both languages, and only running work moves", async ({ page }) => {
  for (const [lang, words] of [["en", { release: "Waiting for you", billing: "Working", "search-index": "Working", migration: "Blocked", docs: "Finished" }],
    ["ko", { release: "사용자 확인 대기 중", billing: "작업 중", "search-index": "작업 중", migration: "막힘", docs: "완료" }]] as const) {
    await openTray(page, `tray=true&live=true&queued=true&lang=${lang}`, 1440);
    for (const [id, word] of Object.entries(words)) await expect(page.locator(`[data-tars-card="${id}"] [data-tars-card-state]`), id).toHaveText(word);
    // Tars's own state words are not on a folded card.
    for (const id of Object.keys(words)) await expect(page.locator(`[data-tars-card="${id}"] [data-tars-state]`), id).toHaveCount(0);
  }
  await expect(page.locator('[data-tars-card="billing"] [data-tars-card-state] [data-motion="moving"]')).toHaveCount(1);
  await expect(page.locator('[data-tars-card="search-index"] [data-tars-card-state] [data-motion="moving"]')).toHaveCount(0);
});

test("cases beyond the lanes read right: on hold, a helper's request, review-only rows, a question about a ready result, work being prepared", async ({ page }) => {
  test.setTimeout(90_000);
  const cases = [
    { id: "card-hold", state: "on-hold", word: { en: "Waiting", ko: "대기 중" }, controls: ["title"] },
    { id: "card-helper", state: "waiting", word: { en: "Waiting for you", ko: "사용자 확인 대기 중" }, controls: ["title", "openTask"] },
    // A pull request ready to merge and a quiet turn are Fleet's review rows: the work still runs.
    { id: "card-signals", state: "working", word: { en: "Working", ko: "작업 중" }, controls: ["title", "openTask"] },
    { id: "card-question", state: "waiting", word: { en: "Waiting for you", ko: "사용자 확인 대기 중" }, controls: ["title", "answer"] },
    { id: "card-preparing", state: "working", word: { en: "Working", ko: "작업 중" }, controls: ["title"] },
  ] as const;
  for (const lang of ["en", "ko"] as const) for (const width of [1440, 390] as const) {
    await openTray(page, `tray=true&cardStates=true&lang=${lang}`, width);
    for (const entry of cases) {
      const card = page.locator(`[data-tars-card="${entry.id}"]`);
      await expect(card, entry.id).toHaveAttribute("data-task-user-state", entry.state);
      await expect(card.locator("[data-tars-card-state]"), entry.id).toHaveText(entry.word[lang]);
      const shown = await measure(card);
      expect(shown.rows, entry.id).toBe(3);
      expect(shown.controls, entry.id).toEqual([...entry.controls]);
      expect(shown.sentenceText.length, entry.id).toBeGreaterThan(0);
      expect(shown.sentenceLines, entry.id).toBeLessThanOrEqual(2);
      expect(shown.contained, entry.id).toBe(true);
    }
    if (lang !== "en") continue;
    // On hold says when it resumes; a request and a question say themselves.
    await expect(page.locator('[data-tars-card="card-hold"] [data-tars-card-sentence]')).toContainText("Waiting for usage reset at");
    await expect(page.locator('[data-tars-card="card-helper"] [data-tars-card-sentence]')).toHaveText("Bash: bun run db:migrate --target invoices");
    await expect(page.locator('[data-tars-card="card-question"] [data-tars-card-sentence]')).toHaveText("Tars asks: Should the saved card stay first on mobile too?");
  }
});

test("Open task on a card that waits on a helper opens the helper's task in its workspace; the work's own task stays in the detail", async ({ page }) => {
  await openTray(page, "tray=true&cardStates=true&lang=en", 1440);
  await page.evaluate(async () => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    useAppStore.setState({ focusTaskAttention: async (target: unknown) => { (window as unknown as { tarsOpened: unknown }).tarsOpened = target; } });
  });
  const opened = () => page.evaluate(() => (window as unknown as { tarsOpened?: { taskId: string; workspaceId: string } }).tarsOpened ?? null);
  const card = page.locator('[data-tars-card="card-helper"]');
  await card.locator('[data-tars-card-primary="openTask"]').click();
  await expect.poll(opened).toMatchObject({ taskId: "task-card-helper-child", workspaceId: "exec-card-helper-child" });
  await card.locator("[data-tars-card-title]").click();
  await card.locator("[data-tars-card-detail]").getByRole("button", { name: "Open task", exact: true }).click();
  await expect.poll(opened).toMatchObject({ taskId: "task-card-helper", workspaceId: "exec-card-helper" });
});

test("the title opens the detail by click and by keyboard, and everything that left the card is there", async ({ page }) => {
  await openTray(page, "tray=true&live=true&queued=true&lang=en", 1440);
  const card = page.locator('[data-tars-card="billing"]');
  const title = card.locator("[data-tars-card-title]");
  const detail = card.locator("[data-tars-card-detail]");
  await expect(title).toHaveAttribute("aria-expanded", "false");
  await title.focus();
  await page.keyboard.press("Enter");
  await expect(title).toHaveAttribute("aria-expanded", "true");
  await expect(detail).toBeVisible();
  expect(await title.getAttribute("aria-controls")).toBe(await detail.getAttribute("id"));
  // Owner, helpers, branch, model, stages, the goal, recent progress and the secondary controls; no turns left.
  await expect(detail.locator("[data-tars-facts]")).toHaveText("Owner: Tars · 2 helpers working");
  await expect(detail.locator("[data-tars-branch]")).toBeVisible();
  await expect(detail.locator("[data-tars-model-selection]")).toBeVisible();
  await expect(detail.locator("[data-tars-monitor-step]")).toHaveText("Now: Cause, attempt 2");
  await expect(detail.locator("[data-run-segments]")).toBeVisible();
  await expect(detail.locator("[data-tars-monitor-count]")).toBeVisible();
  await expect(detail.locator("[data-tars-goal]")).toBeVisible();
  await expect(detail.locator("[data-tars-recent-progress]")).toBeVisible();
  await expect(detail.locator('[data-tars-action="pause"]')).toBeVisible();
  await expect(detail.locator("[data-tars-select-work]")).toBeVisible();
  await expect(detail.locator("[data-tars-monitor-brief]")).toBeVisible();
  await expect(detail.locator("[data-tars-monitor-timeline]")).toBeVisible();
  // Take over and Cancel work stay one menu away.
  await detail.locator("[data-tars-more-actions]").click();
  await expect(page.getByRole("menuitem", { name: "Take over" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Cancel work" })).toBeVisible();
  await page.keyboard.press("Escape");
  // The detail's controls stay inside the card, and the three lines stay on top.
  const geometry = await card.evaluate((node) => {
    const box = (element: Element) => element.getBoundingClientRect();
    const detail = node.querySelector("[data-tars-card-detail]")!;
    return { stateAbove: box(node.querySelector("[data-tars-card-state]")!).bottom <= box(detail).top + 0.5,
      inside: [...detail.querySelectorAll("button")].every((button) => box(button).right <= box(node).right + 0.5) };
  });
  expect(geometry).toEqual({ stateAbove: true, inside: true });
  await title.click();
  await expect(detail).toBeHidden();
  await expect(title).toHaveAttribute("aria-expanded", "false");
});

test("a queued card keeps its reorder grip on the state line and its queue moves in the detail", async ({ page }) => {
  await openTray(page, "tray=true&queue=true&lang=en", 1440);
  const card = page.locator('[data-tars-card="queue-search"]');
  await expect(card).toHaveAttribute("data-task-user-state", "working");
  const shown = await measure(card);
  expect(shown.rows).toBe(3);
  expect(shown.controls).toEqual(["title", "queue-search", "startNow"]);
  await card.locator("[data-tars-card-title]").click();
  await card.locator("[data-tars-more-actions]").click();
  await expect(page.getByRole("menuitem", { name: "Do first" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Do later" })).toBeVisible();
});

test("a card's progress is not repeated in the conversation or above the composer", async ({ page }) => {
  await openTray(page, "tray=true&live=true&lang=en", 1440);
  const view = page.getByTestId("tars-view");
  // The card is the one place that says what the running work is doing.
  await expect(page.locator('[data-tars-card="billing"] [data-tars-card-sentence]')).toContainText("Running the tests");
  // The conversation keeps the delegation as a record: its title, no state, stage count or live line.
  const flow = view.locator('[data-tars-flow="billing"]');
  await expect(flow).toBeVisible();
  await expect(flow).toHaveText("Fix the billing export on empty invoice lists");
  await expect(flow.locator("[data-tars-live-line], [data-state]")).toHaveCount(0);
  // Above the composer, one status line; it lists no work.
  const strip = view.locator("[data-tars-running-strip]");
  await expect(strip).toHaveText("1 running now");
  await expect(strip.locator("button")).toHaveCount(1);
  await expect(strip.locator("[data-tars-live-line]")).toHaveCount(0);
  expect(await view.getByText("Running the tests").count()).toBe(1);
});

test("the composer's status line opens the Work tray on the running card, by keyboard too", async ({ page }) => {
  await openTray(page, "tray=true&live=true&lang=en", 1440);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/?stavePreview=tars&tray=true&live=true&lang=en");
  const status = page.locator("[data-tars-running-status]");
  await expect(status).toBeVisible();
  await expect(page.locator("[data-tars-tray]")).toBeHidden();
  await status.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-tars-card="billing"]')).toBeVisible();
  await expect(page.locator('[data-tars-card="billing"] [data-tars-card-title]')).toBeFocused();
});

test("the status line reaches the running card inside a folded project group", async ({ page }) => {
  await openTray(page, "tray=true&live=true&lang=en", 1440);
  await page.locator("[data-tars-group-projects]").click();
  const group = page.locator('[data-tars-tray-lane="running"] [data-tars-project]').filter({ has: page.locator('[data-tars-card="billing"]') });
  const trigger = group.locator(":scope > button");
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  const title = page.locator('[data-tars-card="billing"] [data-tars-card-title]');
  await expect(title).toBeHidden();
  const status = page.locator("[data-tars-running-status]");
  await status.focus();
  await page.keyboard.press("Enter");
  // The group opens with the lane, and focus lands on the card's title, never on a control the user cannot see.
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(title).toBeVisible();
  await expect(title).toBeFocused();
});

for (const width of [1440, 390] as const) {
  test(`Answer on a card that waits on a question shows its decision card in the conversation · ${width}px`, async ({ page }) => {
    await openTray(page, "decision=unverified&lang=en", width);
    const card = page.locator('[data-tars-card="preview-responsibility"]');
    await expect(card).toHaveAttribute("data-task-user-state", "waiting");
    const answer = card.locator('[data-tars-card-primary="answer"]');
    await expect(answer).toHaveText("Answer");
    await answer.click();
    // Narrow, the tray's popover closes so the card it leads to is in view.
    if (width < POPOVER_BELOW) await expect(page.locator("[data-tars-tray]")).toBeHidden();
    const dock = page.locator("[data-tars-decision-dock]");
    await expect(dock).toBeVisible();
    await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest("[data-tars-decision-dock]")))).toBe(true);
  });
}
