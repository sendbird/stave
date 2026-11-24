import { expect, test, type Page } from "@playwright/test";
import { PASTED_TEXT_COLLAPSE_MIN_LINES } from "../../src/lib/pasted-text-blocks";

const editor = (page: Page) => page.locator("[data-prompt-lexical-editor]");
const chip = (page: Page) => page.locator("[data-pasted-text-chip]");
const inlineBlock = (page: Page) => editor(page).locator("[data-pasted-text-block]");
const lastSubmit = (page: Page) => page.evaluate(() => document.documentElement.dataset.previewLastSubmit);
const log = ["Worker started", "Reading records", "Writing output", "Finished " + "한".repeat(2100)].join("\n");

async function openComposer(page: Page, paste = "1", options = "") {
  await page.goto("/?stavePreview=composer-frame&case=idle&draft=empty&paste=" + paste + options, { waitUntil: "domcontentloaded" });
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

test("keeps short pastes as text and collapses longer inline pastes into one chip", async ({ page }) => {
  const short = "x\n".repeat(PASTED_TEXT_COLLAPSE_MIN_LINES - 1).trimEnd();
  await openComposer(page);
  await paste(page, short);
  await expect(editor(page)).toHaveText(short, { useInnerText: true });
  await expect(inlineBlock(page)).toHaveCount(0);
  await editor(page).fill("");

  for (const inline of ["x".repeat(2000), "x".repeat(2001), "x\n".repeat(40), "x\n".repeat(41)]) {
    await paste(page, inline);
    await expect(inlineBlock(page)).toHaveCount(1);
    await expect(chip(page)).toHaveCount(0);
    await editor(page).press("Backspace");
    await expect(editor(page)).toHaveText("");
  }
});

async function attachAsFile(page: Page) {
  await inlineBlock(page).and(page.getByRole("button")).click();
  await page.getByRole("menuitem", { name: "Attach as file" }).click();
}

test("attaches a chip by keyboard and keeps the complete text as a chip again", async ({ page }) => {
  await openComposer(page);
  const original = "  " + log.replaceAll("\n", "\r\n") + "\r\n";
  await paste(page, original, true);
  await expect(page.getByRole("img", { name: "after.png" })).toBeVisible();
  const trigger = page.getByRole("button", { name: "Pasted text #1 · 4 lines" });
  await expect(trigger).toBeVisible();
  await editor(page).press("Tab");
  await expect(trigger).toBeFocused();
  await trigger.press("Enter");
  const action = page.getByRole("menuitem", { name: "Attach as file" });
  await expect(action).toBeFocused();
  await action.press("Enter");
  await expect(chip(page)).toContainText("Pasted text · 6.2 KB");
  await expect(chip(page).locator("pre")).toHaveText("Worker started Reading records Writing output");
  await expect(inlineBlock(page)).toHaveCount(0);
  await chip(page).getByRole("button", { name: "Keep as text" }).click();
  await expect(chip(page)).toHaveCount(0);
  await expect(inlineBlock(page)).toHaveText("Pasted text #1 · 4 lines");
  await expect(page.getByRole("img", { name: "before.png" })).toBeVisible();
  await page.keyboard.type("done");
  await editor(page).press("Enter");
  expect(await lastSubmit(page)).toBe(original.trimStart() + "done");
});

test("leaves the chip and its original text in the draft when a save fails", async ({ page }) => {
  await openComposer(page, "fail");
  await paste(page, log);
  await attachAsFile(page);
  await expect(page.getByText("Pasted text could not be saved as a file. It was kept in the draft.")).toBeVisible();
  await expect(inlineBlock(page)).toHaveCount(1);
  await expect(chip(page)).toHaveCount(0);
  await editor(page).press("Enter");
  expect(await lastSubmit(page)).toBe(log);
});

test("blocks send while saving or reading a pasted text file", async ({ page }) => {
  await openComposer(page, "pending");
  await editor(page).fill("Read this log ");
  await paste(page, log);
  await attachAsFile(page);
  await expect(page.getByText("Preparing attachments…")).toBeVisible();
  await editor(page).press("Enter");
  await expect(page.getByText("Attachments are still being prepared. Try again when they’re ready.")).toBeVisible();
  await expect(chip(page)).toHaveCount(1);
  await expect(editor(page)).toHaveText("Read this log ");
  await chip(page).getByRole("button", { name: "Keep as text" }).click();
  await expect(page.getByText("Preparing attachments…")).toBeVisible();
  await editor(page).press("Enter");
  await expect(inlineBlock(page)).toHaveCount(1);
  await expect(chip(page)).toHaveCount(0);
  expect(await lastSubmit(page)).toBeUndefined();
});

test("hides the file action when the workspace is unavailable", async ({ page }) => {
  await openComposer(page, "");
  await paste(page, log);
  await expect(inlineBlock(page)).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Pasted text #1 · 4 lines" })).toHaveCount(0);
  await expect(chip(page)).toHaveCount(0);
});

test("a collapsed paste shows a numbered chip and still sends the original text", async ({ page }) => {
  await openComposer(page);
  const lines = Array.from({ length: 33 }, (_, index) => `line ${index + 1}`).join("\n");
  await editor(page).focus();
  await page.keyboard.type("Read this ");
  await paste(page, lines);
  await expect(inlineBlock(page)).toHaveCount(1);
  await expect(inlineBlock(page)).toContainText("Pasted text #1 · 33 lines");
  await expect(editor(page)).not.toContainText("line 2");
  await page.keyboard.type(" please");
  await paste(page, "second\n".repeat(6));
  await expect(inlineBlock(page)).toHaveCount(2);
  await expect(inlineBlock(page).nth(1)).toContainText("Pasted text #2 · 6 lines");
  await editor(page).press("Enter");
  await expect(editor(page)).toHaveText("");
  expect(await lastSubmit(page)).toBe(`Read this ${lines} please${"second\n".repeat(6).trimEnd()}`);
});

test("backspace removes a collapsed paste as one unit", async ({ page }) => {
  await openComposer(page);
  await paste(page, "row\n".repeat(10));
  await expect(inlineBlock(page)).toHaveCount(1);
  await editor(page).press("Backspace");
  await expect(inlineBlock(page)).toHaveCount(0);
  await expect(editor(page)).toHaveText("");
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
    await expect(inlineBlock(page)).toBeVisible();
    const chipGeometry = await inlineBlock(page).evaluate((node) => {
      const box = node.getBoundingClientRect();
      const { right } = node.closest("[data-prompt-lexical-editor]")!.getBoundingClientRect();
      const [icon, label] = Array.from(node.children).map((item) => item.getBoundingClientRect());
      const center = (rect: DOMRect) => rect.top + rect.height / 2;
      return { rightOverflow: box.right - right, centerDelta: Math.abs(center(icon!) - center(label!)) };
    });
    expect(chipGeometry.rightOverflow).toBeLessThanOrEqual(1);
    expect(chipGeometry.centerDelta).toBeLessThanOrEqual(1);
    await inlineBlock(page).click();
    await page.getByRole("menuitem", { name: sample.locale === "en" ? "Attach as file" : "파일로 첨부" }).click();
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
