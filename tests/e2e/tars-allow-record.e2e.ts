import { expect, test, type Page } from "@playwright/test";

const editor = (page: Page) => page.locator("[data-tars-composer]").getByRole("textbox");
async function send(page: Page, text: string) {
  await editor(page).fill(text);
  await editor(page).press("Enter");
}

// Reported: "Always allowed: …" stayed pinned under the last message forever. A rule saved from
// a card sits where it was saved and scrolls away with the conversation; Settings still lists it.
for (const [theme, lang] of [["light", "en"], ["dark", "ko"]] as const) {
  test(`an Always allowed record stays where it was saved, not under the newest message (${theme} ${lang})`, async ({ page }) => {
    await page.goto(`/?stavePreview=tars&theme=${theme}&lang=${lang}`);
    await send(page, "First request");
    await expect(page.locator("[data-tars-message]")).toHaveCount(1);
    // Save a rule just after the first exchange, as a card's Always allow does, plus one made in Settings.
    await page.evaluate(() => {
      const saved = JSON.parse(sessionStorage.getItem("stave-preview-conversation")!);
      const at = new Date(Date.parse(saved.messages[0].createdAt) + 1_000).toISOString();
      saved.settings.allowRules = [{ key: "extend", repositoryPath: "/tmp/billing", savedAt: at }, { key: "publish", repositoryPath: null }];
      sessionStorage.setItem("stave-preview-conversation", JSON.stringify(saved));
    });
    await page.reload();
    await send(page, "Second request");
    await expect(page.locator("[data-tars-message]")).toHaveCount(2);
    const records = page.getByTestId("tars-transcript").locator("[data-tars-allow-record]");
    // Only the card-saved rule has a transcript record.
    await expect(records).toHaveCount(1);
    await expect(records).toContainText(lang === "en" ? "Always allowed" : "항상 허용");
    const order = await page.getByTestId("tars-transcript").evaluate((root) => {
      const record = root.querySelector("[data-tars-allow-record]")!;
      const [first, second] = [...root.querySelectorAll("[data-tars-message]")];
      const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      return { afterFirst: follows(first!, record), beforeSecond: follows(record, second!) };
    });
    expect(order).toEqual({ afterFirst: true, beforeSecond: true });
  });
}
