import { expect, test } from "@playwright/test";

/**
 * Screenshots the assistant took are attached under its reply as small,
 * numbered thumbnails, and one click opens a screenshot at its original pixel
 * size in a scrolling frame. The Preview's completed turn carries two Lens
 * screenshot results (1280×800 and 900×1400).
 */
test("reply screenshots show as numbered thumbnails that open at original size", async ({ page }) => {
  await page.goto("/?stavePreview=agent-messages");
  await page.getByRole("button", { name: "Streaming" }).click();

  const strip = page.getByTestId("reply-tool-images");
  await expect(strip).toBeVisible();
  await expect(strip).toHaveAttribute("aria-label", "2 images attached to this reply");
  await expect(strip.locator("figcaption")).toHaveText(["Image 1", "Image 2"]);

  /* The strip follows the reply text it belongs to. */
  const reply = page.getByText("Capped the streaming trace at", { exact: false }).last();
  const [replyBox, stripBox] = await Promise.all([reply.boundingBox(), strip.boundingBox()]);
  expect(stripBox!.y).toBeGreaterThan(replyBox!.y + replyBox!.height - 1);

  /* Thumbnails stay small. */
  for (const thumb of await strip.locator("img").all()) {
    const box = await thumb.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(112.5);
    expect(box!.height).toBeLessThanOrEqual(72.5);
  }

  await strip.getByRole("button", { name: "Open Image 2 at original size" }).click();
  const dialog = page.getByRole("dialog", { name: "Image 2" });
  await expect(dialog).toBeVisible();
  const full = page.getByTestId("tool-image-full-frame").locator("img");
  /* Wait for the open animation to settle before measuring. */
  await expect
    .poll(async () => (await full.boundingBox())?.width)
    .toBeCloseTo(900, 0);
  expect((await full.boundingBox())!.height).toBeCloseTo(1400, 0);
  const scrolls = await page
    .getByTestId("tool-image-full-frame")
    .evaluate((frame) => frame.scrollHeight > frame.clientHeight);
  expect(scrolls).toBe(true);
});
