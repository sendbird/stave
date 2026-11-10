import { expect, test, type Page } from "@playwright/test";

/**
 * One centre line across a record row's first line: the state mark, the
 * actor's glyph, what was done, every value chip (its text and its glyphs),
 * the outcome and the time. Chips of another kind (an outlined work chip, a
 * branch chip) and the smaller time must not move the line, and the mark
 * stays on the first line when the chips wrap under it.
 */
test.use({ timezoneId: "Asia/Seoul" });
// The gallery is the heaviest preview.
test.describe.configure({ timeout: 60_000 });
/** 16:00 in Seoul, as the transcript rail suite reads the gallery. */
const NOW = new Date("2026-11-10T07:00:00.000Z");
/** Sub-pixel layout rounds each box on its own; half a pixel is the most two centred boxes may differ by. */
const TOLERANCE = 0.5;

async function openGallery(page: Page, { width = 1440, theme = "light", lang = "en" } = {}) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width, height: 900 });
  await page.clock.setFixedTime(NOW);
  await page.goto(`/?stavePreview=tars&gallery=true&theme=${theme}&lang=${lang}`);
  await expect(page.locator('[data-tars-message="g-i"]')).toBeAttached({ timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
  // A shared worktree dependency must load as a real font, rather than silently testing a fallback.
  expect(await page.evaluate(async () => (await document.fonts.load('14px "Geist Variable"')).length)).toBeGreaterThan(0);
}

interface RowCentres { chips: number; firstLine: boolean; offsets: Record<string, number> }

/**
 * Each first-line part's vertical centre, as its distance from the state
 * mark's centre. Text is measured by its first line's own box, so a wrapped
 * sentence is read on the line the mark sits on.
 */
async function measure(page: Page, selector: string): Promise<RowCentres[]> {
  return page.locator(selector).evaluateAll((rows) => rows.map((row) => {
    const centre = (box: DOMRect) => (box.top + box.bottom) / 2;
    const firstLine = (node: Element) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return [...range.getClientRects()].find((box) => box.width > 0 && box.height > 0)!;
    };
    /** The first rendered text of a node that is its own (not a chip's, not a glyph's label). */
    const ownText = (node: Element) => {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        if (!text.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(text);
        return [...range.getClientRects()].find((box) => box.width > 0 && box.height > 0)!;
      }
      return null;
    };
    const mark = row.querySelector(":scope > span svg")!.getBoundingClientRect();
    const origin = centre(mark);
    const offsets: Record<string, number> = {};
    const put = (name: string, box: DOMRect | null | undefined) => { if (box) offsets[name] = Math.round((centre(box) - origin) * 100) / 100; };
    put("actor", row.querySelector("[data-tars-record-actor]")?.getBoundingClientRect());
    const lead = row.querySelector("[data-tars-record-lead], [data-tars-record-subject]");
    if (lead) put("lead", ownText(lead));
    const chips = [...row.querySelectorAll(".aui-badge, button[data-tars-record-open]")].filter((chip) => !chip.closest("p"));
    chips.forEach((chip, index) => {
      put(`chip${index + 1}`, chip.getBoundingClientRect());
      put(`chip${index + 1}Text`, firstLine(chip.querySelector("span") ?? chip));
      chip.querySelectorAll("svg").forEach((glyph, at) => put(`chip${index + 1}Icon${at ? at + 1 : ""}`, glyph.getBoundingClientRect()));
    });
    const status = row.querySelector("[data-tars-record-status]");
    if (status) put("status", firstLine(status));
    const time = row.querySelector("[data-tars-record-time]");
    if (time) put("time", firstLine(time));
    // Whether every chip sits on the mark's line; a wrapped chip is on a later line and is not part of this contract.
    const line = row.getBoundingClientRect().top + parseFloat(getComputedStyle(row).paddingTop) + parseFloat(getComputedStyle(row).lineHeight);
    return { chips: chips.length, firstLine: chips.every((chip) => centre(chip.getBoundingClientRect()) < line), offsets };
  }));
}

const TRANSCRIPT = "[data-testid='tars-transcript'] ";

for (const [theme, lang] of [["light", "en"], ["dark", "ko"]] as const) {
  test(`a record row's first line shares one centre line (${theme} ${lang})`, async ({ page }) => {
    await openGallery(page, { theme, lang });
    // One chip: an action on a piece of work (actor, lead, the work chip with its open glyph, the outcome, the time).
    const oneChip = (await measure(page, `${TRANSCRIPT}[data-tars-action-record]`)).filter((row) => row.chips === 1 && row.firstLine && "status" in row.offsets);
    // Two chips, one of them a branch chip: a publish record (the pull request or the work, then the branch).
    const withBranch = (await measure(page, `${TRANSCRIPT}[data-tars-record-state]:has([data-tars-publish-branch])`)).filter((row) => row.chips >= 2 && row.firstLine);
    // Two chips with a priority: a reprioritize record.
    const withPriority = (await measure(page, `${TRANSCRIPT}[data-tars-record-state]:has([data-tars-record-priority-value])`)).filter((row) => row.chips >= 2 && row.firstLine);
    expect(oneChip.length, "one-chip rows").toBeGreaterThan(0);
    expect(withBranch.length, "rows with a branch chip").toBeGreaterThan(0);
    expect(withPriority.length, "rows with a priority chip").toBeGreaterThan(0);
    for (const [kind, rows] of [["one chip", oneChip], ["branch chip", withBranch], ["priority chip", withPriority]] as const) {
      for (const row of rows) {
        for (const [part, offset] of Object.entries(row.offsets)) expect(Math.abs(offset), `${kind}: ${part} ${JSON.stringify(row.offsets)}`).toBeLessThanOrEqual(TOLERANCE);
      }
    }
  });
}

test("the mark stays centred on the first line when the chips wrap under it", async ({ page }) => {
  await openGallery(page, { width: 390 });
  const rows = (await measure(page, `${TRANSCRIPT}[data-tars-record-state]:has([data-tars-publish-branch]), ${TRANSCRIPT}[data-tars-action-record]`))
    .filter((row) => row.chips >= 1 && !row.firstLine);
  expect(rows.length, "rows whose chips wrapped").toBeGreaterThan(0);
  for (const row of rows) {
    // What was done, the outcome and the time are the first line; the wrapped chips are below it.
    for (const part of ["actor", "lead", "status", "time"]) {
      if (part in row.offsets) expect(Math.abs(row.offsets[part]!), `${part} ${JSON.stringify(row.offsets)}`).toBeLessThanOrEqual(TOLERANCE);
    }
    const wrapped = Object.entries(row.offsets).filter(([part]) => /^chip\d+$/.test(part));
    expect(wrapped.some(([, offset]) => offset > TOLERANCE)).toBe(true);
  }
});

for (const [theme, lang] of [["light", "en"], ["dark", "ko"]] as const) {
  for (const density of ["regular", "compact"]) for (const width of [390, 1440]) {
    test(`retry shares the record's first-line centre (${theme} ${lang} ${density} ${width})`, async ({ page }) => {
      await openGallery(page, { width, theme, lang });
      await page.evaluate((value) => { document.documentElement.dataset.uiDensity = value; }, density);
      const retry = page.locator('[data-tars-publish-retry]').first();
      await retry.scrollIntoViewIfNeeded();
      const offsets = await retry.evaluate((button) => {
        const row = button.closest('[data-tars-record-state]')!;
        const centre = (node: Element) => { const r = node.getBoundingClientRect(); return (r.top + r.bottom) / 2; };
        const origin = centre(row.querySelector(':scope > span svg')!);
        return [button, row.querySelector('[data-tars-record-lead]')!, row.querySelector('time')!].map((node) => centre(node) - origin);
      });
      for (const offset of offsets) expect(Math.abs(offset)).toBeLessThanOrEqual(TOLERANCE);
      // The control keeps its normal hit area even though the text line is shorter.
      expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(24);
    });
  }
}
