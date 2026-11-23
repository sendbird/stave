import { expect, test, type Page } from "@playwright/test";
import { PASTED_TEXT_MAX_INLINE_CHARACTERS, PASTED_TEXT_MAX_INLINE_LINES } from "../../src/lib/fs/pasted-text";

const editor = (page: Page) => page.locator("[data-prompt-lexical-editor]");
const chip = (page: Page) => page.locator("[data-pasted-text-chip]");
const log = ["Worker started", "Reading records", "Writing output", "Finished " + "한".repeat(2100)].join("\n");

async function openComposer(page: Page, paste = "1", options = "") {
  await page.goto("/?stavePreview=composer-frame&case=idle&draft=empty&paste=" + paste + options);
  await expect(editor(page)).toBeVisible();
}

async function paste(page: Page, text: string, images = false) {
  await editor(page).focus();
  await editor(page).evaluate((element, { text, images }) => {
    const data = new DataTransfer();
    if (images) data.items.add(new File(["a"], "before.png", { type: "image/png" }));
    data.items.add(text, "text/plain");
    if (images) data.items.add(new File(["b"], "after.png", { type: "image/png" }));
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, { text, images });
}

test("pastes up to either boundary inline and attaches text above either boundary", async ({ page }) => {
  const chars = "x".repeat(PASTED_TEXT_MAX_INLINE_CHARACTERS);
  const lines = "x\n".repeat(PASTED_TEXT_MAX_INLINE_LINES);
  for (const inline of [chars, lines]) {
    await openComposer(page);
    await paste(page, inline);
    await expect(editor(page)).toHaveText(inline.trimEnd(), { useInnerText: true });
    await expect(chip(page)).toHaveCount(0);
  }
  await openComposer(page);
  await paste(page, chars + "x");
  await paste(page, lines + "x");
  await expect(chip(page)).toHaveCount(2);
  await expect(editor(page)).toHaveText("");
});

test("keeps image and text chip order, and restores all text with one action", async ({ page }) => {
  await openComposer(page);
  await paste(page, log, true);
  await expect(chip(page)).toContainText("Pasted text · 6.2 KB");
  await expect(chip(page).locator("pre")).toHaveText("Worker started Reading records Writing output");
  const group = page.locator("[data-pasted-text-chip], img[alt='before.png'], img[alt='after.png']");
  expect(await group.evaluateAll((items) => items.map((node) => node.getAttribute("alt") ?? "text")))
    .toEqual(["before.png", "text", "after.png"]);
  await expect(editor(page)).toHaveText("");
  await chip(page).getByRole("button", { name: "Keep as text" }).click();
  await expect(chip(page)).toHaveCount(0);
  await expect(editor(page)).toHaveText(log, { useInnerText: true });
  await expect(group).toHaveCount(2);
});

test("a failed save puts the original text inline and preserves the images", async ({ page }) => {
  await openComposer(page, "fail");
  await paste(page, log, true);
  await expect(page.getByText("Pasted text could not be saved as a file. It was kept in the draft.")).toBeVisible();
  await expect(editor(page)).toHaveText(log, { useInnerText: true });
  await expect(chip(page)).toHaveCount(0);
  await expect(page.getByRole("img", { name: "after.png" })).toBeVisible();
});

test("an attempt to send while saving keeps the draft and the finished attachment", async ({ page }) => {
  await openComposer(page, "pending");
  await editor(page).fill("Read this log");
  await paste(page, log);
  await expect(page.getByText("Preparing attachments…")).toBeVisible();
  await editor(page).press("Enter");
  await expect(page.getByText("Attachments are still being prepared. Try again when they’re ready.")).toBeVisible();
  await expect(chip(page)).toHaveCount(1);
  await expect(editor(page)).toHaveText("Read this log");
  await editor(page).press("Enter");
  await expect(editor(page)).toHaveText("");
  await expect(chip(page)).toHaveCount(0);
});

for (const sample of [
  { locale: "en", theme: "light", density: "regular", width: 1250 },
  { locale: "ko", theme: "dark", density: "compact", width: 570 },
]) {
  test(`pasted text chip stays inside the composer at ${sample.width}px (${sample.locale})`, async ({ page }) => {
    await page.setViewportSize({ width: sample.width, height: 800 });
    await openComposer(page, "1", `&lang=${sample.locale}&theme=${sample.theme}`);
    await page.evaluate(async (density) => {
      document.documentElement.dataset.uiDensity = density;
      await document.fonts.ready;
    }, sample.density);
    await paste(page, "로그 내용 ".repeat(500));
    await expect(chip(page)).toBeVisible();
    const geometry = await chip(page).evaluate((node) => {
      const box = node.getBoundingClientRect();
      const row = node.parentElement!.getBoundingClientRect();
      const header = node.firstElementChild!;
      const [icon, label] = Array.from(header.children).map((item) => item.getBoundingClientRect());
      const center = (rect: DOMRect) => rect.top + rect.height / 2;
      return {
        contained: box.left >= row.left - 1 && box.right <= row.right + 1,
        centerDelta: Math.abs(center(icon!) - center(label!)),
        overflow: node.scrollWidth - node.clientWidth,
      };
    });
    expect(geometry.contained).toBe(true);
    expect(geometry.centerDelta).toBeLessThanOrEqual(1);
    expect(geometry.overflow).toBeLessThanOrEqual(1);
  });
}
