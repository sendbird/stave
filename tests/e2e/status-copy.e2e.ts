import { expect, test } from "@playwright/test";

test("workspace row names include the same state as their icon tooltip", async ({ page }) => {
  await page.goto("/?stavePreview=sidebar-run-states&theme=dark");
  for (const [id, label] of [
    ["working-claude", /^Working$/],
    ["waiting-claude", /Waiting on 2 helpers/],
    ["stalled", /No output · \d+m/],
    ["needs-you", /Needs you/],
    ["pr", /Ready to merge/],
    ["busy", /Creating/],
    ["opening", /Opening workspace/],
  ] as const) {
    const row = page.locator(`[data-preview-workspace="${id}"]`).getByRole("button", { name: /^Open workspace/ });
    const tooltip = row.locator("span[title]").filter({ has: page.locator("[id$='-status']") });
    await expect(tooltip).toHaveAttribute("title", label);
    await expect(row).toHaveAccessibleName(new RegExp(`^Open workspace .+ ${label.source.replace(/^\^/, "")}`));
  }
  await expect(page.getByRole("button", { name: "Open workspace Docs touch-ups", exact: true })).toBeVisible();
});

for (const { width, lang, theme, exit, copy, unknown } of [
  { width: 360, lang: "ko", theme: "dark", exit: "종료 코드", copy: "출력 복사", unknown: "종료 코드 알 수 없음" },
  { width: 1200, lang: "en", theme: "light", exit: "Exit", copy: "Copy output", unknown: "Exit unknown" },
]) {
  test(`command status and output controls fit the transcript in ${lang} at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/?stavePreview=turn-events&lang=${lang}&theme=${theme}`);
    for (const [state, code] of [["output-available", 0], ["output-error", 2]] as const) {
      const section = page.locator("section").filter({ has: page.getByRole("heading", { name: `Tool · ${state}` }) });
      const status = section.getByText(`${exit} ${code}`, { exact: true });
      const button = section.getByRole("button", { name: copy, exact: true });
      await expect(status).toBeVisible();
      await expect(button).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      // Preview disclosures can expand and shift the page between browser calls.
      const { centerOffset, rightOverflow } = await status.or(button).evaluateAll(([status, button]) => {
        const statusBox = status.getBoundingClientRect();
        const buttonBox = button.getBoundingClientRect();
        const sectionBox = button.closest("section")!.getBoundingClientRect();
        return {
          centerOffset: Math.abs((statusBox.y + statusBox.height / 2) - (buttonBox.y + buttonBox.height / 2)),
          rightOverflow: buttonBox.right - sectionBox.right,
        };
      });
      expect(centerOffset).toBeLessThanOrEqual(1);
      expect(rightOverflow).toBeLessThanOrEqual(1);
    }
    const unreported = page.locator("section").filter({ has: page.getByRole("heading", { name: "셸 명령 강조 · 위험 플래그" }) });
    await expect(unreported.getByText(unknown, { exact: true })).toBeVisible();
  });
}

test("changed-file review controls point to the turn's restore action", async ({ page }) => {
  await page.goto("/?stavePreview=turn-events");
  const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "File diff · pending" }) });
  const row = section.getByRole("button", { name: /message-renderer\.ts.*Pending/ }).first();
  await row.click();
  for (const label of ["Mark as accepted", "Mark as rejected"]) {
    const button = section.getByRole("button", { name: label, exact: true }).first();
    await expect(button).toHaveAccessibleDescription(/Record your review decision.*Restore files/);
  }
});

test("Copy output copies the command result to the clipboard", async ({ context, page }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/?stavePreview=turn-events");
  const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "Tool · output-available" }) });
  await section.getByRole("button", { name: "Copy output", exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("12 pass\n0 fail\nCompleted in 2.8s");
});
