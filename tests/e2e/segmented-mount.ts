import { expect, type Page } from "@playwright/test";

/**
 * Mounts the real SegmentedControl (stateful, inside the design provider) on
 * an otherwise empty preview page, so its keyboard and geometry are measured
 * without a surface's own layout or focus handling in the way.
 */
export async function mountSegmented(
  page: Page,
  args: {
    density: "regular" | "compact";
    count?: boolean;
    icons?: boolean;
    locale?: "en" | "ko";
    theme?: "light" | "dark";
  },
) {
  await page.goto(`/?stavePreview=ads-regressions${args.theme ? `&theme=${args.theme}` : ""}`);
  await expect(page.locator("main svg").first()).toBeVisible();
  await page.evaluate(async ({ density, count, icons, locale }) => {
    const { React, createRoot, LayoutGrid } = await import("/tests/e2e/segmented-runtime.ts");
    const { SegmentedControl } = await import("/src/components/system/SegmentedControl.tsx");
    const { StaveDesignProvider } = await import("/src/components/system/StaveDesignProvider.tsx");
    document.getElementById("root")!.style.display = "none";
    document.documentElement.dataset.uiDensity = density;
    const host = document.createElement("div");
    host.id = "segmented-host";
    host.style.cssText = "padding:24px;width:640px";
    document.body.append(host);
    const ko = locale === "ko";
    const icon = icons ? React.createElement(LayoutGrid, { "aria-hidden": true }) : undefined;
    function Harness() {
      const [value, setValue] = React.useState("board");
      return React.createElement("div", null,
        React.createElement("button", { id: "before" }, "before"),
        React.createElement(SegmentedControl, {
          "aria-label": "Layout",
          value,
          onValueChange: setValue,
          options: [
            { value: "list", label: ko ? "목록" : "List", icon, count: count ? 7 : undefined },
            { value: "board", label: ko ? "보드" : "Board", icon, count: count ? 12 : undefined },
            { value: "table", label: ko ? "표" : "Table", disabled: true },
            { value: "timeline", label: ko ? "타임라인" : "Timeline" },
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

/** Per segment: height, and how far label, count and icon sit from the shared centre line. */
export async function segmentGeometry(page: Page) {
  return page.getByRole("radiogroup", { name: "Layout" }).evaluate(async (group) => {
    const { vars } = await import("/src/components/ads/tokens/tokens.stylex.ts");
    const probe = document.createElement("div");
    probe.style.blockSize = vars["--ads-control-height-xs"];
    probe.style.columnGap = vars["--ads-space-4"];
    group.append(probe);
    const expectedHeight = probe.getBoundingClientRect().height;
    const expectedGap = Number.parseFloat(getComputedStyle(probe).columnGap);
    probe.remove();
    return {
      expectedHeight,
      segments: [...group.querySelectorAll<HTMLElement>('[role="radio"]')].map((radio) => {
        const box = radio.getBoundingClientRect();
        const spans = [...radio.querySelectorAll("span")];
        const label = spans.find((span) => span.textContent && !span.querySelector("span") && !/^\d+$/.test(span.textContent))!;
        const labelBox = label.getBoundingClientRect();
        const labelCenter = labelBox.y + labelBox.height / 2;
        const badge = spans.find((span) => /^\d+$/.test(span.textContent ?? "") && !span.querySelector("span"));
        const badgeBox = badge?.getBoundingClientRect();
        const icon = radio.querySelector("svg")?.getBoundingClientRect();
        return {
          height: box.height,
          labelOffset: Math.abs(labelCenter - (box.y + box.height / 2)),
          badgeOffset: badgeBox ? Math.abs(badgeBox.y + badgeBox.height / 2 - labelCenter) : 0,
          badgeGapDelta: badgeBox ? Math.abs(badgeBox.left - labelBox.right - expectedGap) : 0,
          badgeInside: badgeBox ? badgeBox.right <= box.right + 0.5 : true,
          iconOffset: icon ? Math.abs(icon.y + icon.height / 2 - labelCenter) : 0,
        };
      }),
    };
  });
}
