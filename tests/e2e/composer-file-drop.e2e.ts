import { expect, test, type JSHandle, type Page } from "@playwright/test";

/*
 * Files dragged from the system onto the real composer
 * (`?stavePreview=composer-frame`). A real OS drag cannot be scripted, so the
 * test dispatches the drag events with a DataTransfer that carries a file,
 * which is what the browser hands the page.
 */

async function imageTransfer(page: Page) {
  return page.evaluateHandle(() => {
    const data = new DataTransfer();
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
    data.items.add(new File([png], "screenshot.png", { type: "image/png" }));
    return data;
  });
}

const controlBoxes = (page: Page) => page.locator("form[data-prompt-input-root] button").evaluateAll((buttons) =>
  buttons.filter((button) => (button as HTMLElement).offsetParent !== null).map((button) => {
    const box = button.getBoundingClientRect();
    return [Math.round(box.left), Math.round(box.top), Math.round(box.width), Math.round(box.height)].join(",");
  }));

for (const locale of ["en", "ko"] as const) {
  for (const mode of ["light", "dark"] as const) {
    for (const density of ["regular", "compact"] as const) {
      test(`dragging files over the composer outlines it and says what a drop does: ${locale}/${mode}/${density}`, async ({ page }) => {
        await page.setViewportSize({ width: 1100, height: 760 });
        await page.goto(`/?stavePreview=composer-frame&theme=${mode}&lang=${locale}`);
        const form = page.locator("form[data-prompt-input-root]").first();
        await expect(form).toBeVisible();
        await page.evaluate(async (density) => {
          document.documentElement.dataset.uiDensity = density;
          await document.fonts.ready;
        }, density);
        const before = await controlBoxes(page);
        const formBefore = await form.boundingBox();
        const transfer: JSHandle<DataTransfer> = await imageTransfer(page);
        await form.dispatchEvent("dragenter", { dataTransfer: transfer });
        await form.dispatchEvent("dragover", { dataTransfer: transfer });
        await expect(form).toHaveAttribute("data-file-drop", "");
        const overlay = page.locator("[data-composer-file-drop]");
        await expect(overlay).toBeVisible();
        await expect(overlay).toContainText(locale === "en" ? "Drop to attach" : "놓아서 첨부");
        const geometry = await overlay.evaluate((element) => {
          const style = getComputedStyle(element);
          const box = element.getBoundingClientRect();
          const parent = element.parentElement!.getBoundingClientRect();
          return { outline: style.outlineStyle, outlineWidth: style.outlineWidth, pointer: style.pointerEvents,
            box: [box.left, box.top, box.width, box.height], parent: [parent.left, parent.top, parent.width, parent.height] };
        });
        // A dashed outline over exactly the input card, which lets the drop through to the form.
        expect(geometry.outline).toBe("dashed");
        expect(geometry.outlineWidth).toBe("2px");
        expect(geometry.pointer).toBe("none");
        geometry.box.forEach((value, index) => expect(Math.abs(value - geometry.parent[index]!)).toBeLessThanOrEqual(1));
        // No control moved, and the card kept its size.
        expect(await controlBoxes(page)).toEqual(before);
        expect(await form.boundingBox()).toEqual(formBefore);

        await form.dispatchEvent("drop", { dataTransfer: transfer });
        await expect(overlay).toHaveCount(0);
        await expect(form).not.toHaveAttribute("data-file-drop", "");
        // The image attaches the way a paste would.
        await expect(form).toContainText(locale === "en" ? "1 attached" : "1");
      });
    }
  }
}

test("a drag that leaves the composer clears the drop state; a text drag never shows it", async ({ page }) => {
  await page.goto("/?stavePreview=composer-frame&theme=light");
  const form = page.locator("form[data-prompt-input-root]").first();
  await expect(form).toBeVisible();
  const transfer = await imageTransfer(page);
  await form.dispatchEvent("dragover", { dataTransfer: transfer });
  await expect(form).toHaveAttribute("data-file-drop", "");
  await form.dispatchEvent("dragleave", { dataTransfer: transfer, relatedTarget: null } as never);
  await expect(form).not.toHaveAttribute("data-file-drop", "");
  const text = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.setData("text/plain", "hello");
    return data;
  });
  await form.dispatchEvent("dragover", { dataTransfer: text });
  await expect(page.locator("[data-composer-file-drop]")).toHaveCount(0);
});
