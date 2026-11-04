import { expect, test } from "@playwright/test";

for (const locale of ["en", "ko"] as const) {
  for (const dark of [false, true]) {
    test(`streaming header shows only work (${locale}, ${dark ? "dark" : "light"})`, async ({
      page,
    }) => {
      await page.goto("/?stavePreview=agent-messages");
      const label = page.locator("[data-trace-streaming-label]");
      await expect(label).toBeVisible({ timeout: 15_000 });
      if (!dark) await page.getByRole("button", { name: "Dark", exact: true }).click();
      await page.evaluate(async (language) => {
        const path = "/src/i18n/runtime.ts";
        const { i18n } = await import(path);
        await i18n.changeLanguage(language);
        await document.fonts.ready;
      }, locale);
      await expect(label).toHaveText(
        locale === "ko" ? "globals.css 수정 중" : "Editing globals.css",
      );
      await expect(
        label.locator(
          '[data-trace-streaming-part="phrase"], [data-trace-streaming-part="elapsed"]',
        ),
      ).toHaveCount(0);

      for (const width of [720, 240]) {
        await label.evaluate((element, value) => {
          const column = element.closest("section")!;
          column.style.width = `${value}px`;
          column.style.maxWidth = `${value}px`;
        }, width);
        const geometry = await label.evaluate((element) => {
          const activity = element.querySelector<HTMLElement>(
            '[data-trace-streaming-part="activity"]',
          )!;
          const button = element.closest("button")!;
          const icon = button.querySelector("svg")!;
          const a = activity.getBoundingClientRect();
          const i = icon.getBoundingClientRect();
          return {
            right: a.right,
            buttonRight: button.getBoundingClientRect().right,
            centreDifference: Math.abs(a.y + a.height / 2 - i.y - i.height / 2),
            ellipsis: getComputedStyle(activity).textOverflow,
            truncated: activity.scrollWidth > activity.clientWidth + 1,
          };
        });
        expect(geometry.right).toBeLessThanOrEqual(geometry.buttonRight + 0.5);
        expect(geometry.centreDifference).toBeLessThanOrEqual(1);
        expect(geometry.ellipsis).toBe("ellipsis");
        if (width === 720) expect(geometry.truncated).toBe(false);
      }

      const trigger = label.locator("..");
      await trigger.click();
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await expect(label).toHaveText(
        locale === "ko" ? "globals.css 수정 중" : "Editing globals.css",
      );
      await trigger.click();
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      await page.getByRole("button", { name: "Streaming", exact: true }).click();
      await expect(label).toHaveCount(0);
    });
  }
}

test("a turn without an active step has a readable fallback", async ({ page }) => {
  await page.goto("/?stavePreview=agent-messages");
  await expect(page.locator("[data-trace-streaming-label]")).toBeVisible();
  await page.evaluate(async () => {
    const path = "/tests/e2e/fixtures/trace-streaming-header.tsx";
    const { mountEmptyTrace } = await import(path);
    mountEmptyTrace();
  });
  const trigger = page.locator("[data-empty-trace] button");
  await expect(trigger).toHaveAccessibleName("Thinking");
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await page.evaluate(async () => {
    const path = "/src/i18n/runtime.ts";
    const { i18n } = await import(path);
    await i18n.changeLanguage("ko");
  });
  await expect(trigger).not.toHaveAccessibleName("Thinking");
  await expect(trigger).not.toHaveAccessibleName("");
});
