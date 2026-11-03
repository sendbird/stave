import { expect, test, type Page } from "@playwright/test";

/**
 * Mounts the real SegmentedControl (stateful, inside the design provider) on
 * an otherwise empty preview page, so keyboard behavior is tested without a
 * surface's own focus handling in the way.
 */
async function mountSegmented(page: Page, args: { density: "regular" | "compact"; count?: boolean }) {
  await page.goto("/?stavePreview=ads-regressions");
  await expect(page.locator("main svg").first()).toBeVisible();
  await page.evaluate(async ({ density, count }) => {
    const resources = performance.getEntriesByType("resource");
    const moduleUrl = (name: string) => resources.find((entry) => new URL(entry.name).pathname.endsWith(`/deps/${name}.js`))!.name;
    const React = (await import(moduleUrl("react"))).default;
    const { createRoot } = (await import(moduleUrl("react-dom_client"))).default;
    const { SegmentedControl } = await import("/src/components/system/SegmentedControl.tsx");
    const { StaveDesignProvider } = await import("/src/components/system/StaveDesignProvider.tsx");
    document.getElementById("root")!.style.display = "none";
    document.documentElement.dataset.uiDensity = density;
    const host = document.createElement("div");
    host.id = "segmented-host";
    host.style.cssText = "padding:24px;width:640px";
    document.body.append(host);
    function Harness() {
      const [value, setValue] = React.useState("board");
      return React.createElement("div", null,
        React.createElement("button", { id: "before" }, "before"),
        React.createElement(SegmentedControl, {
          "aria-label": "Layout",
          value,
          onValueChange: setValue,
          options: [
            { value: "list", label: "List", count: count ? 7 : undefined },
            { value: "board", label: "Board", count: count ? 12 : undefined },
            { value: "table", label: "Table", disabled: true },
            { value: "timeline", label: "Timeline" },
          ],
        }),
        React.createElement("output", { id: "value" }, value),
        React.createElement("button", { id: "after" }, "after"),
      );
    }
    createRoot(host).render(React.createElement(StaveDesignProvider, null, React.createElement(Harness)));
    await document.fonts.ready;
  }, args);
  await expect(page.getByRole("radiogroup", { name: "Layout" })).toBeVisible();
}

test("one Tab stop; arrows move and select, wrap and skip disabled; Home and End; never empty", async ({ page }) => {
  await mountSegmented(page, { density: "compact" });
  const group = page.getByRole("radiogroup", { name: "Layout" });
  const value = page.locator("#value");
  await page.locator("#before").focus();
  await page.keyboard.press("Tab");
  // The checked segment takes the group's single Tab stop.
  await expect(group.getByRole("radio", { name: "Board" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  // Table is disabled: the arrow skips it.
  await expect(value).toHaveText("timeline");
  await expect(group.getByRole("radio", { name: "Timeline" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("ArrowRight");
  await expect(value).toHaveText("list");
  await page.keyboard.press("ArrowLeft");
  await expect(value).toHaveText("timeline");
  await page.keyboard.press("Home");
  await expect(value).toHaveText("list");
  await expect(group.getByRole("radio", { name: "List" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(value).toHaveText("timeline");
  // Tab leaves the group in one step.
  await page.keyboard.press("Tab");
  await expect(page.locator("#after")).toBeFocused();
  // Pressing the checked segment again keeps it: there is no empty state.
  await group.getByRole("radio", { name: "Timeline" }).click();
  await expect(value).toHaveText("timeline");
  await expect(group.getByRole("radio", { checked: true })).toHaveCount(1);
});

for (const density of ["regular", "compact"] as const) {
  test(`segments share the xs control height with centered label and count: ${density}`, async ({ page }) => {
    await mountSegmented(page, { density, count: true });
    // The item is the xs control rung: 28px at regular density, one rung
    // lower when the whole interface is compact.
    const expected = await page.evaluate(async () => {
      const { vars } = await import("/src/components/ads/tokens/tokens.stylex.ts");
      const probe = document.createElement("div");
      probe.style.blockSize = vars["--ads-control-height-xs"];
      document.getElementById("segmented-host")!.append(probe);
      const height = probe.getBoundingClientRect().height;
      probe.remove();
      return height;
    });
    if (density === "regular") expect(expected).toBe(28);
    const metrics = await page.getByRole("radiogroup", { name: "Layout" }).evaluate((group) => {
      return [...group.querySelectorAll<HTMLElement>('[role="radio"]')].map((radio) => {
        const box = radio.getBoundingClientRect();
        const spans = radio.querySelectorAll("span");
        const label = [...spans].find((span) => span.textContent && !span.querySelector("span"))!;
        const labelBox = label.getBoundingClientRect();
        const labelCenter = labelBox.y + labelBox.height / 2;
        const badge = [...spans].find((span) => /^\d+$/.test(span.textContent ?? "") && span !== label);
        const badgeBox = badge?.getBoundingClientRect();
        return {
          height: box.height,
          labelOffset: Math.abs(labelCenter - (box.y + box.height / 2)),
          badgeOffset: badgeBox ? Math.abs(badgeBox.y + badgeBox.height / 2 - labelCenter) : 0,
          badgeInside: badgeBox ? badgeBox.right <= box.right + 0.5 : true,
        };
      });
    });
    for (const metric of metrics) {
      expect(metric.height).toBeCloseTo(expected, 0);
      expect(metric.labelOffset).toBeLessThanOrEqual(1);
      expect(metric.badgeOffset).toBeLessThanOrEqual(1);
      expect(metric.badgeInside).toBe(true);
    }
  });
}

test("migrated rows share the 28px segment: command palette scope and Fleet board", async ({ page }) => {
  await page.goto("/?stavePreview=command-palette");
  const scope = page.getByRole("radiogroup", { name: /Tasks in/ });
  await expect(scope).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const scopeHeights = await scope.getByRole("radio").evaluateAll((radios) => radios.map((radio) => radio.getBoundingClientRect().height));
  expect(scopeHeights.length).toBe(2);
  for (const height of scopeHeights) expect(height).toBeCloseTo(28, 0);
  // One Tab stop: only the checked scope is tabbable.
  const tabbable = await scope.getByRole("radio").evaluateAll((radios) => radios.filter((radio) => radio.tabIndex === 0).length);
  expect(tabbable).toBe(1);
});
