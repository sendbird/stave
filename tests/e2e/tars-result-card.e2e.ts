import { expect, test, type Locator, type Page } from "@playwright/test";

// The gallery is the heaviest preview: it builds every conversation case at once.
test.describe.configure({ timeout: 90_000 });

const result = (page: Page, id: string) => page.locator(`[data-tars-result]:has([data-tars-result-card="${id}"])`);
const card = (page: Page, id: string) => page.locator(`[data-tars-result-card="${id}"]`);

async function open(page: Page, query: string, width: number) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/?stavePreview=tars&gallery=true${query}`);
  await expect(card(page, "result-verified")).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
}

/** A card and everything in it stay inside the transcript column: nothing is wider than its row, and nothing scrolls sideways. */
async function containment(page: Page, row: Locator) {
  const column = await page.getByTestId("tars-transcript").evaluate((node) => { const box = node.getBoundingClientRect(); return { left: box.left, right: box.right }; });
  const boxes = await row.evaluate((node) => {
    const own = node.getBoundingClientRect();
    const inner = [...node.querySelectorAll<HTMLElement>("[data-tars-result-card], [data-tars-result-card] *")].map((child) => child.getBoundingClientRect())
      .filter((box) => box.width > 0 && box.height > 0);
    return { left: own.left, right: own.right, overflow: node.scrollWidth - node.clientWidth,
      minLeft: Math.min(...inner.map((box) => box.left)), maxRight: Math.max(...inner.map((box) => box.right)) };
  });
  expect(boxes.overflow).toBeLessThanOrEqual(1);
  expect(boxes.left).toBeGreaterThanOrEqual(column.left - 1);
  expect(boxes.right).toBeLessThanOrEqual(column.right + 1);
  expect(boxes.minLeft).toBeGreaterThanOrEqual(boxes.left - 1);
  expect(boxes.maxRight).toBeLessThanOrEqual(boxes.right + 1);
  // Result surfaces share the transcript's outer edge; only their content is padded.
  const surface = await row.locator('[data-tars-result-card]').boundingBox();
  expect(Math.abs(surface!.x - boxes.left)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(surface!.x + surface!.width - boxes.right)).toBeLessThanOrEqual(0.5);
  const separation = await row.evaluate((node) => {
    const header = node.querySelector('[data-tars-record-header]')!;
    const card = node.querySelector('[data-tars-result-card]')!;
    return { gap: card.getBoundingClientRect().top - header.getBoundingClientRect().bottom, token: parseFloat(getComputedStyle(card).paddingTop) };
  });
  // The header and its surface are separated by the same 12-space token as the card's padding.
  expect(Math.abs(separation.gap - separation.token)).toBeLessThanOrEqual(0.5);
}

for (const { name, query, ko } of [
  { name: "light en", query: "", ko: false },
  { name: "dark ko", query: "&theme=dark&lang=ko", ko: true },
]) for (const width of [390, 1440]) {
  test(`result cards render each case and stay inside the conversation column: ${name} ${width}px`, async ({ page }) => {
    await open(page, query, width);
    const view = page.getByTestId("tars-view");
    expect(await view.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    for (const [id, outcome] of [["result-verified", "completed"], ["result-reported", "completed"], ["result-published", "completed"],
      ["result-stalled", "blocked"], ["result-failed", "failed"]] as const) {
      const row = result(page, id);
      await row.scrollIntoViewIfNeeded();
      await expect(row).toHaveAttribute("data-tars-result", outcome);
      await containment(page, row);
    }
    // Verified work says what confirmed each criterion; agent-reported work never borrows those words.
    const kinds = (id: string) => card(page, id).locator("[data-tars-result-criterion]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-tars-result-criterion")));
    expect(await kinds("result-verified")).toEqual(["verifiedReview", "verifiedCheck"]);
    expect(await kinds("result-reported")).toEqual(["reported", "reported"]);
    await expect(card(page, "result-verified")).toContainText(ko ? "검사 통과" : "Check passed");
    await expect(card(page, "result-reported")).toContainText(ko ? "보고됨" : "Reported");
    await expect(card(page, "result-reported")).not.toContainText(ko ? "검사 통과" : "Check passed");
    await expect(card(page, "result-verified").locator("[data-tars-result-count]")).toHaveText(ko ? "2/2 확인됨" : "2/2 confirmed");
    await expect(card(page, "result-reported").locator("[data-tars-result-count]")).toHaveText(ko ? "2/2 충족 보고" : "2/2 reported met");
    // The draft pull request is a link; a cancel stays one row with no card.
    await expect(card(page, "result-published").getByRole("link")).toHaveAttribute("href", "https://github.com/example/web/pull/57");
    await expect(page.locator('[data-tars-activity="cancelled"]').first()).not.toHaveAttribute("data-tars-result", /.*/);
    await expect(result(page, "result-failed")).toContainText(ko ? "실패" : "Failed");
    // The summary is cut to two lines; narrow, a criterion's status sits under its text instead of beside it.
    const summary = card(page, "result-verified").locator("[data-tars-result-summary]");
    expect(await summary.evaluate((node) => Math.round(node.getBoundingClientRect().height / parseFloat(getComputedStyle(node).lineHeight)))).toBeLessThanOrEqual(2);
    const criterion = await card(page, "result-verified").locator("[data-tars-result-criterion]").first().evaluate((node) => {
      const [, text, state] = [...node.children].map((child) => child.getBoundingClientRect());
      return { below: state!.top >= text!.bottom - 1, sameLine: Math.abs(state!.top - text!.top) <= 1 };
    });
    expect(width === 390 ? criterion.below : criterion.sameLine).toBe(true);
  });
}

test("the card's buttons open their views by keyboard, with a visible focus ring", async ({ page }) => {
  await open(page, "", 1440);
  const side = page.locator("[data-tars-side-view]");
  const press = async (id: string, view: "report" | "changes" | "timeline") => {
    const button = card(page, id).locator(`[data-tars-result-open="${view}"]`);
    await button.scrollIntoViewIfNeeded();
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(side).toHaveAttribute("data-tars-side-view", view);
    return button;
  };
  const report = await press("result-verified", "report");
  await expect(report).toHaveAccessibleName("Open report for Export invoices as CSV");
  await expect(page.locator("[data-tars-side-subject]")).toContainText("Export invoices as CSV");
  // Esc closes the side view and gives focus back to the button that opened it.
  await page.keyboard.press("Escape");
  await expect(side).toHaveCount(0);
  await expect(report).toBeFocused();
  // Tab reaches the next button in the card; keyboard focus draws a ring.
  await page.keyboard.press("Tab");
  const changes = card(page, "result-verified").locator('[data-tars-result-open="changes"]');
  await expect(changes).toBeFocused();
  expect(await changes.evaluate((node) => node.matches(":focus-visible") && (getComputedStyle(node).boxShadow !== "none" || getComputedStyle(node).outlineStyle !== "none"))).toBe(true);
  await page.keyboard.press("Space");
  await expect(side).toHaveAttribute("data-tars-side-view", "changes");
  await page.keyboard.press("Escape");
  // Blocked work: the timeline, and the report at what is still unmet.
  await press("result-stalled", "timeline");
  await page.keyboard.press("Escape");
  await press("result-stalled", "report");
  await expect(page.locator("[data-tars-report-unmet]").first()).toBeVisible();
  await page.keyboard.press("Escape");
  // The run's own words are one keypress away, and the state's next steps are the tray's controls.
  const stalled = card(page, "result-stalled");
  const disclosure = stalled.locator("[data-tars-diagnostic] button");
  await disclosure.focus();
  await page.keyboard.press("Enter");
  await expect(stalled).toContainText("The load test kept p95 at 840 ms");
  await expect(stalled.locator('[data-tars-action="resume"]')).toBeEnabled();
  // A run that never ended has no report to open.
  await expect(card(page, "result-failed").locator('[data-tars-result-open="report"]')).toHaveCount(0);
  await expect(card(page, "result-failed").locator('[data-tars-result-open="timeline"]')).toBeVisible();
});

test("the card's text follows the chat font size", async ({ page }) => {
  const size = async (query: string) => {
    await open(page, query, 1440);
    return card(page, "result-verified").locator("[data-tars-result-criterion]").first().evaluate((node) => {
      const font = parseFloat(getComputedStyle(node).fontSize);
      const badge = parseFloat(getComputedStyle(node.lastElementChild!).fontSize);
      if (font !== badge) throw new Error(`Criterion font ${font} differs from badge font ${badge}`);
      return font;
    });
  };
  const regular = await size("");
  const large = await size("&messageFontSize=20");
  expect(regular).toBe(14);
  // The conversation scale's secondary step, in whole pixels.
  expect(large).toBe(18);
});

for (const [theme, lang] of [["light", "en"], ["dark", "ko"]] as const) {
  for (const density of ["regular", "compact"]) for (const width of [390, 1440]) {
    test(`result surfaces interrupt connectors without inset or dangling lines: ${theme} ${lang} ${density} ${width}`, async ({ page }) => {
      await open(page, `&theme=${theme}&lang=${lang}&density=${density}`, width);
      // The same mixed run as the product: two result surfaces, then a plain cancellation.
      const list = page.locator('[data-tars-records]:has([data-tars-result-card="search"])');
      await list.scrollIntoViewIfNeeded();
      const geometry = await list.evaluate((node) => {
        const rect = (element: Element) => element.getBoundingClientRect();
        const cards = [...node.querySelectorAll('[data-tars-result-card]')].map(rect);
        const lines = [...node.children].flatMap((item) => [...item.querySelectorAll(':scope > span[aria-hidden="true"]')])
          .map(rect).filter((box) => box.width > 0 && box.height > 0);
        const edge = rect(node);
        return { cards: cards.length, lines: lines.length,
          insets: cards.map((box) => ({ left: box.left - edge.left, right: edge.right - box.right })),
          intersections: lines.filter((line) => cards.some((card) => line.left < card.right && line.right > card.left && line.top < card.bottom && line.bottom > card.top)).length };
      });
      expect(geometry.cards).toBe(2);
      expect(geometry.intersections).toBe(0);
      // Neither the card-to-card gap nor the cancellation gets a disconnected stub.
      expect(geometry.lines).toBe(0);
      // A result following another surface starts a fresh group: 4 + 16 + 4 AUI spacing.
      const gap = await list.evaluate((node) => {
        const rows = [...node.querySelectorAll('[data-tars-result]')];
        return rows[1]!.querySelector('[data-tars-record-header]')!.getBoundingClientRect().top
          - rows[0]!.querySelector('[data-tars-result-card]')!.getBoundingClientRect().bottom;
      });
      const token = await list.evaluate(async () => {
        const { vars } = await import("/src/components/aui/tokens/tokens.stylex.ts");
        const probe = document.createElement("div"); probe.style.height = vars["--aui-space-24"]; document.body.append(probe);
        const height = probe.getBoundingClientRect().height; probe.remove(); return height;
      });
      expect(Math.abs(gap - token)).toBeLessThanOrEqual(0.5);
      for (const inset of geometry.insets) {
        expect(Math.abs(inset.left)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(inset.right)).toBeLessThanOrEqual(0.5);
      }
      // A sibling run made only of text records still uses the timeline rail.
      const plain = page.locator('[data-tars-message="g-i"]').locator('xpath=following-sibling::ul[1]');
      await plain.scrollIntoViewIfNeeded();
      const joins = await plain.evaluate((node) => [...node.children].flatMap((item) => [...item.querySelectorAll(':scope > span[aria-hidden="true"]')])
        .filter((line) => line.getBoundingClientRect().width > 0 && line.getBoundingClientRect().height > 0).length);
      expect(joins).toBeGreaterThan(2);
    });

    test(`publish fields share control height and label alignment: ${theme} ${lang} ${density} ${width}`, async ({ page }) => {
      await open(page, `&theme=${theme}&lang=${lang}&density=${density}`, width);
      const publish = page.locator('[data-tars-publish-card]:has([data-tars-publish-type])').first();
      const id = await publish.getAttribute('data-tars-publish-card');
      await page.locator(`[data-tars-waiting-record="${id}"] button`).click();
      await expect(publish).toBeVisible();
      await publish.scrollIntoViewIfNeeded();
      const fields = await publish.evaluate((node) => {
        return ['[data-tars-publish-type]', '[data-tars-publish-message]', '[data-tars-publish-title]'].map((selector) => {
          const control = node.querySelector(selector)!;
          const label = control.closest('label')!;
          const rect = control.getBoundingClientRect();
          return { top: rect.top, left: rect.left, right: rect.right, height: rect.height,
            labelTop: label.firstElementChild!.getBoundingClientRect().top, font: getComputedStyle(control).fontSize };
        });
      });
      const [type, message, title] = fields;
      expect(Math.abs(type!.height - message!.height)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(title!.height - message!.height)).toBeLessThanOrEqual(0.5);
      expect(type!.font).toBe(message!.font);
      if (message!.left >= type!.right) {
        expect(Math.abs(type!.top - message!.top)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(type!.labelTop - message!.labelTop)).toBeLessThanOrEqual(0.5);
      }
      expect(await publish.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    });
  }
}


test("compact badges retain source details and review navigation behind a keyboard disclosure", async ({ page }) => {
  await open(page, "&lang=en", 390);
  const verified = card(page, "result-verified");
  const trigger = verified.locator("[data-tars-result-evidence] button[aria-expanded]");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(verified.locator("[data-tars-result-stave-checks]")).toHaveCount(0);
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(verified).toContainText("Met · confirmed by review");
  await expect(verified).toContainText("Met · confirmed by a check");
  await expect(verified.locator("[data-tars-result-stave-checks]")).toContainText("test");
  await containment(page, result(page, "result-verified"));
  await verified.locator('[data-tars-result-open="review"]').click();
  await expect(page.locator("[data-tars-side-view]")).toHaveAttribute("data-tars-side-view", "review");
});

// Exercise both an ended result and the same notice while its run details are still unread.
test("result group spacing moves absolute rails with their marks after a text record", async ({ page }) => {
  await open(page, "", 390);
  for (const loaded of [false, true]) {
    await page.evaluate(async (loaded) => {
      const reactPath = "/node_modules/.vite/deps/react.js";
      const clientPath = "/node_modules/.vite/deps/react-dom_client.js";
      const { default: { createElement: h } } = await import(reactPath);
      const { default: { createRoot } } = await import(clientPath);
      const { TarsRecordList, TarsRecordRow } = await import("/src/components/tars/TarsRecord.tsx");
      const { TarsResultProvider } = await import("/src/components/tars/TarsResultCard.tsx");
      const { TarsActivityNoticeLine } = await import("/src/components/tars/TarsFlowBlock.tsx");
      const { buildTarsResultFixtures } = await import("/src/dev/tars-preview/tars-result-fixtures.ts");
      const fixtures = buildTarsResultFixtures(new Date("2026-11-05T00:00:00Z"));
      const row = fixtures.responsibilities.find((r) => r.id === fixtures.ids.verified)!;
      const activity = { id: "rail-regression", responsibilityId: row.id, revision: row.revision, title: row.title, state: row.state,
        detail: null, createdAt: row.updatedAt };
      const host = document.createElement("div"); host.dataset.testid = "result-rail-regression"; host.style.width = "360px"; document.body.append(host);
      createRoot(host).render(h(TarsResultProvider, { responsibilities: [row], runs: loaded ? fixtures.runs : {}, activity: [activity], records: [],
        actions: { busy: false, onAct: () => undefined, onConfirm: () => undefined, onOpenTask: () => undefined, onShowInFleet: () => undefined },
        children: h(TarsRecordList, null, h(TarsRecordRow, { state: "applied", lead: "Previous record" }),
          h(TarsActivityNoticeLine, { notice: { activity, kind: "completed" } }), h(TarsRecordRow, { state: "applied", lead: "Next record" })) }));
    }, loaded);
    const host = page.getByTestId("result-rail-regression");
    await expect(host.locator("[data-tars-result]")).toHaveCount(1);
    await page.evaluate(() => document.fonts.ready);
    const rails = await host.locator("[data-tars-records] > li").nth(1).evaluate(async (item) => {
      const { vars } = await import("/src/components/aui/tokens/tokens.stylex.ts");
      const probe = document.createElement("div"); probe.style.height = `calc(${vars["--aui-space-8"]} + ${vars["--aui-space-2"]})`; document.body.append(probe);
      const clearance = probe.getBoundingClientRect().height; probe.remove();
      const mark = item.querySelector('[data-tars-result] > span')!.getBoundingClientRect();
      const lines = [...item.querySelectorAll(':scope > span[aria-hidden="true"]')].map(e => e.getBoundingClientRect()).filter(r => r.width && r.height);
      return { center: (mark.top + mark.bottom) / 2, clearance, lines: lines.map(r => ({ top:r.top, bottom:r.bottom })) };
    });
    expect(rails.lines.length).toBe(loaded ? 1 : 2);
    expect(Math.abs(rails.lines[0]!.bottom - (rails.center - rails.clearance))).toBeLessThanOrEqual(0.5);
    if (!loaded) expect(Math.abs(rails.lines[1]!.top - (rails.center + rails.clearance))).toBeLessThanOrEqual(0.5);
    await host.evaluate(node => node.remove());
  }
});
