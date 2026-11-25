import { expect, test } from "@playwright/test";

for (const locale of ["en", "ko"] as const) {
  for (const dark of [false, true]) {
    test(`trace copy controls fit and copy raw content (${locale}, ${dark ? "dark" : "light"})`, async ({
      page,
    }) => {
      await page.goto(`/?stavePreview=turn-events&lang=${locale}&theme=${dark ? "dark" : "light"}`);
      await expect(page.locator("#event-9")).toBeVisible({ timeout: 15_000 });
      await page.evaluate(
        async () => {
          const path = "/tests/e2e/fixtures/trace-content.tsx";
          const { mountTraceContent } = await import(path);
          mountTraceContent();
          Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: {
              writeText: async (text: string) => {
                (window as any).copiedText = text;
              },
            },
          });
          await document.fonts.ready;
        },
      );
      const block = page.locator("[data-copy-fixture]");
      const button = block.getByRole("button");
      const label = locale === "ko" ? "복사" : "Copy";
      await expect(button).toHaveAccessibleName(label);
      await expect(button).toHaveText("");
      for (const width of [680, 240]) {
        await block.evaluate((element, width) => {
          element.style.width = `${width}px`;
        }, width);
        const geometry = await block.evaluate((element) => {
          const button = element.querySelector("button")!.getBoundingClientRect();
          const output = element
            .querySelector("[data-trace-output-capped]")!
            .getBoundingClientRect();
          return {
            buttonX: button.x,
            outputRight: output.right,
            buttonTop: button.top,
            outputTop: output.top,
            buttonWidth: button.width,
            buttonHeight: button.height,
            right: button.right,
            blockRight: element.getBoundingClientRect().right,
          };
        });
        expect(geometry.buttonX - geometry.outputRight).toBeGreaterThan(0);
        expect(Math.abs(geometry.buttonTop - geometry.outputTop)).toBeLessThanOrEqual(0.5);
        expect(geometry.buttonWidth).toBe(geometry.buttonHeight);
        expect(geometry.right).toBeLessThanOrEqual(geometry.blockRight + 0.5);
      }
      const before = await button.boundingBox();
      await button.click();
      await expect(button).toHaveAccessibleName(locale === "ko" ? "복사됨" : "Copied");
      expect(await page.evaluate(() => (window as any).copiedText)).toBe(
        Array.from({ length: 60 }, (_, index) => `line-${index}: **raw output**`).join("\n"),
      );
      expect((await button.boundingBox())!.width).toBe(before!.width);
      await expect(button.locator(".lucide-check")).toHaveCount(1);
      await expect(button).toHaveAccessibleName(label);
      const command = page.locator("[data-command-copy-fixture]").getByRole("button", { name: locale === "ko" ? "명령어 복사" : "Copy command", exact: true });
      await command.click();
      expect(await page.evaluate(() => (window as any).copiedText)).toBe(
        "bun test --timeout 30000",
      );
      const commandResult = page.locator("[data-command-copy-fixture]");
      expect(await commandResult.locator("pre").textContent()).toBe("done");
      await commandResult.getByRole("button", { name: locale === "ko" ? "출력 복사" : "Copy output", exact: true }).click();
      expect(await page.evaluate(() => (window as any).copiedText)).toBe("done\n");
      await page.locator("[data-short-copy-fixture]").getByRole("button").click();
      expect(await page.evaluate(() => (window as any).copiedText)).toBe("short output");
    });
  }
}

test("reasoning renders Markdown while streaming, after appending and after settling", async ({
  page,
}) => {
  await page.goto("/?stavePreview=turn-events");
  await expect(page.locator("#event-3")).toBeVisible({ timeout: 15_000 });
  await page.evaluate(async () => {
    const path = "/tests/e2e/fixtures/trace-content.tsx";
    const { mountTraceContent } = await import(path);
    (window as any).traceContent = mountTraceContent();
  });
  const reasoning = page.locator("[data-reasoning-fixture]");
  const matrix = reasoning.locator('[data-aui-loader-variant="matrix"] [data-aui-loader-mark]');
  await expect(matrix.locator(":scope > span")).toHaveCount(25);
  await reasoning.getByRole("button", { name: "Thinking", exact: true }).click();
  await expect(reasoning.locator("strong")).toHaveText("Important");
  await expect(reasoning.locator("li")).toHaveCount(2);
  await expect(reasoning.locator("code").first()).toHaveText("inlineCode");
  await expect(reasoning.locator("pre")).toContainText("const value = 1;");
  await expect(reasoning.locator("img, script, [href^='javascript:']")).toHaveCount(0);
  await expect(reasoning.locator('[aria-busy="true"]')).toBeVisible();
  await page.evaluate(() => (window as any).traceContent.append());
  await expect(reasoning.locator("strong").last()).toHaveText("Appended");
  await page.evaluate(() => (window as any).traceContent.settle());
  await expect(reasoning.locator("strong")).toHaveText("Important");
  await expect(reasoning.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(matrix).toHaveCount(0);
});

test("failed copy announces failure and can be retried", async ({ page }) => {
  await page.goto("/?stavePreview=turn-events");
  await expect(page.locator("#event-9")).toBeVisible({ timeout: 15_000 });
  await page.evaluate(async () => {
    const path = "/tests/e2e/fixtures/trace-content.tsx";
    const { mountTraceContent } = await import(path);
    mountTraceContent();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("denied");
        },
      },
    });
    document.execCommand = () => false;
  });
  const block = page.locator("[data-copy-fixture]");
  await block.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(block.getByRole("status")).toContainText("Couldn't copy to the clipboard");
  await expect(block.locator(".lucide-check")).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => {} },
    });
  });
  await block.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(block.getByRole("button")).toHaveAccessibleName("Copied");
});
