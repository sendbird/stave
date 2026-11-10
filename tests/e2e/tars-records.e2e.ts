import { expect, test, type Locator, type Page } from "@playwright/test";

const composer = (page: Page) => page.locator("[data-tars-composer]");
const editor = (page: Page) => composer(page).getByRole("textbox");
async function send(page: Page, text: string) {
  await editor(page).fill(text);
  await editor(page).press("Enter");
}

/**
 * A record row's geometry: its mark sits in a slot one text line tall at the
 * row's top, so it is centred on the first line of the text however far that
 * wraps; the row has no inline pad of its own (the rail's mark slot is its
 * leading edge); detail lines start under the first line; nothing overflows the row.
 */
async function recordGeometry(row: Locator) {
  return row.evaluate((node) => {
    const [slot, body] = [...node.children] as HTMLElement[];
    const line = body!.firstElementChild as HTMLElement;
    const main = line.firstElementChild as HTMLElement;
    // The first words of the line, as line boxes, not the box that wraps them.
    const words = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, { acceptNode: (text) => text.textContent!.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP }).nextNode();
    const range = document.createRange();
    range.selectNodeContents(words ?? main);
    const first = range.getClientRects()[0]!;
    const mark = slot!.querySelector("svg")!.getBoundingClientRect();
    const detail = body!.children[1] as HTMLElement | undefined;
    const style = getComputedStyle(node);
    return {
      hasMark: Boolean(slot!.querySelector("svg")),
      markOffset: Math.abs((mark.top + mark.bottom) / 2 - (first.top + first.bottom) / 2),
      padInline: [parseFloat(style.paddingLeft), parseFloat(style.paddingRight)],
      detailBelow: detail ? detail.getBoundingClientRect().top >= line.getBoundingClientRect().bottom - 0.5 : true,
      overflow: node.scrollWidth - node.clientWidth,
    };
  });
}

for (const [theme, lang, density] of [["light", "en", "regular"], ["dark", "ko", "compact"]] as const) {
  for (const width of [390, 1440]) {
    test(`records and the question card keep their structure at ${width}px (${theme} ${lang} ${density})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/?stavePreview=tars&decision=ask&controlRefusal=true&theme=${theme}&lang=${lang}&density=${density}`);
      const view = page.getByTestId("tars-view");
      await send(page, lang === "ko" ? "릴리스 확인 어떻게 할까?" : "What should happen with the release check?");
      const card = view.locator('[data-tars-decision-state="waiting"]');
      await expect(card).toBeVisible();
      await page.evaluate(() => document.fonts.ready);

      // The question card: a radio group named by its question, one row per option with its label, why on the next line and its key on the first line.
      const group = card.getByRole("radiogroup");
      await expect(group).toHaveAccessibleName(/Should I pause the release check|릴리스 확인/);
      await expect(group.getByRole("radio")).toHaveCount(3);
      const options = await group.locator("label").evaluateAll((labels) => labels.map((label) => {
        // The real radio comes first, visually hidden; then the drawn mark, the text and the keycap.
        const [, mark, body, key] = [...label.children] as HTMLElement[];
        const labelRow = body!.firstElementChild!.getBoundingClientRect();
        const description = body!.children[1]?.getBoundingClientRect();
        const keycap = key?.getBoundingClientRect();
        const center = (box: DOMRect) => (box.top + box.bottom) / 2;
        return {
          descriptionBelow: description ? description.top >= labelRow.bottom - 0.5 : false,
          markOnFirstLine: Math.abs(center(mark!.getBoundingClientRect()) - center(labelRow)) <= 1.5,
          keyOnFirstLine: keycap ? Math.abs(center(keycap) - center(labelRow)) <= 2 : false,
        };
      }));
      expect(options).toEqual(Array(3).fill({ descriptionBelow: true, markOnFirstLine: true, keyOnFirstLine: true }));
      const fit = await card.evaluate((node) => ({ client: node.clientWidth, scroll: node.scrollWidth }));
      expect(fit.scroll).toBeLessThanOrEqual(fit.client + 1);
      // Answer is the trailing action, after Not now.
      const footer = await card.evaluate((node) => {
        const answer = node.querySelector("[data-tars-decision-submit]")!.getBoundingClientRect();
        const dismiss = node.querySelector("[data-tars-decision-dismiss]")!.getBoundingClientRect();
        const card = node.getBoundingClientRect();
        return { order: dismiss.right <= answer.left, trailing: card.right - answer.right };
      });
      expect(footer.order).toBe(true);
      expect(footer.trailing).toBeLessThanOrEqual(24);

      // A refused answer: an inline alert under the options (not a record band inside the card), saying what was not applied and why.
      await send(page, "1");
      const refused = card.locator('[data-tars-decision-attempt="rejected"]');
      await expect(refused).toBeVisible();
      await expect(refused).toHaveAttribute("role", "status");
      await expect(refused).not.toHaveAttribute("data-tars-record-state");
      await expect(refused.locator("strong")).toContainText(lang === "ko" ? "적용하지 않음:" : "Not applied:");
      const alert = await refused.evaluate((node) => {
        const options = node.parentElement!.querySelector("[data-tars-decision-options]")!.getBoundingClientRect();
        const box = node.getBoundingClientRect();
        return { below: box.top >= options.bottom - 0.5, overflow: node.scrollWidth - node.clientWidth };
      });
      expect(alert).toEqual({ below: true, overflow: 0 });

      // The recommended reply is chosen; Answer sends it and the card folds to its record on the rail, with no wash behind it.
      await editor(page).fill("");
      await card.getByRole("button", { name: lang === "ko" ? "답하기" : "Answer", exact: true }).click();
      const answered = view.locator('[data-tars-decision-state="answered"] [data-tars-record-state]');
      await expect(answered).toHaveAttribute("data-tars-record-state", "applied");
      const folded = await recordGeometry(answered);
      expect(folded).toMatchObject({ hasMark: true, padInline: [0, 0], overflow: 0 });
      expect(folded.markOffset).toBeLessThanOrEqual(1.5);
      const wash = await answered.evaluate((node) => getComputedStyle(node.closest("[data-tars-records]")!).backgroundColor);
      expect(wash).toBe("rgba(0, 0, 0, 0)");
      const viewFit = await view.evaluate((node) => ({ client: node.clientWidth, scroll: node.scrollWidth }));
      expect(viewFit.scroll).toBeLessThanOrEqual(viewFit.client + 1);
    });
  }
}

test("control records wear their mark and a run of them shares one list", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?stavePreview=tars");
  const view = page.getByTestId("tars-view");
  const panel = page.getByRole("complementary");
  await panel.getByRole("button", { name: "More actions for Verify the release candidate across two repositories", exact: true }).click();
  await page.getByRole("menuitem", { name: "Take over", exact: true }).click();
  const record = view.locator("[data-tars-action-record]");
  await expect(record).toContainText(/Take over.*Applied/);
  await expect(record.locator("[data-tars-record-actor]")).toHaveAccessibleName("You did this in Tars");
  await expect(record.locator("svg").first()).toBeVisible();
  // Consecutive records share one list: a run of them reads as one block, not separate lines.
  await panel.getByRole("button", { name: "Hand back", exact: true }).click();
  await expect(view.locator("[data-tars-records]").filter({ has: page.locator("[data-tars-action-record]") })).toHaveCount(1);
  await expect(view.locator("[data-tars-records] [data-tars-action-record]")).toHaveCount(2);
});
