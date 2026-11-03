import { expect, test, type Page } from "@playwright/test";

/**
 * A tool call card with arguments and a 42-line result, on the real
 * `TraceToolRun` inside the design provider: the arguments carry a Copy
 * action, the result stops at the 220px cap with a line count under it, and
 * the collapsed row keeps its height.
 */

async function mountToolCard(page: Page, locale: "en" | "ko") {
  await page.goto("/?stavePreview=ads-regressions");
  await expect(page.locator("main svg").first()).toBeVisible();
  await page.evaluate(async (language) => {
    const resources = performance.getEntriesByType("resource");
    const moduleUrl = (name: string) =>
      resources.find((entry) => new URL(entry.name).pathname.endsWith(`/deps/${name}.js`))!.name;
    const React = (await import(moduleUrl("react"))).default;
    const { createRoot } = (await import(moduleUrl("react-dom_client"))).default;
    const runtimePath = "/src/i18n/runtime.ts";
    const { i18n } = await import(runtimePath);
    await i18n.changeLanguage(language);
    const { TraceToolRun } = await import("/src/components/session/message/turn-event-tool-runs.tsx");
    const { StaveDesignProvider } = await import("/src/components/system/StaveDesignProvider.tsx");
    document.getElementById("root")!.style.display = "none";
    const host = document.createElement("div");
    host.id = "tool-card-host";
    host.style.cssText = "padding:24px;width:720px";
    document.body.append(host);
    const output = Array.from(
      { length: 42 },
      (_, index) => `src/components/session/file-${index}.tsx:${index + 1}:  animation: traceStepEnter var(--ads-motion-duration-fast) ease-out;`,
    ).join("\n");
    createRoot(host).render(
      React.createElement(
        StaveDesignProvider,
        null,
        React.createElement(TraceToolRun, {
          taskId: "e2e",
          part: {
            type: "tool_use",
            toolUseId: "toolu_grep",
            toolName: "Grep",
            input: JSON.stringify({ pattern: "traceStepEnter", path: "src", glob: "*.tsx" }),
            output,
            state: "output-available",
          },
        }),
      ),
    );
    await document.fonts.ready;
  }, locale);
  const host = page.locator("#tool-card-host");
  await expect(host.getByText("Grep", { exact: true })).toBeVisible();
  return host;
}

for (const locale of ["en", "ko"] as const) {
  test(`arguments copy, output stops at the cap with a line count, row height holds (${locale})`, async ({ page }) => {
    const host = await mountToolCard(page, locale);
    const trigger = host.getByRole("button", { expanded: false }).first();
    const collapsedHeight = (await trigger.boundingBox())!.height;

    await trigger.click();
    const capped = host.locator('[data-trace-output-capped="true"]');
    await expect(capped).toHaveCount(2);
    const copyLabel = locale === "ko" ? "복사" : "Copy";
    await expect(host.getByRole("button", { name: copyLabel, exact: true })).toHaveCount(2);

    const output = host.getByRole("log", { name: locale === "ko" ? "출력" : "Output" });
    const box = (await output.boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(220.5);
    const scrolls = await output.evaluate((element) => element.scrollHeight > element.clientHeight);
    expect(scrolls).toBe(true);
    await expect(host.getByTestId("trace-output-line-note")).toHaveText(
      locale === "ko" ? "42줄 · 스크롤해서 더 보기" : "42 lines · scroll for more",
    );
    // The short arguments do not overflow, so they say nothing about lines.
    await expect(host.getByTestId("trace-output-line-note")).toHaveCount(1);

    const expandedTrigger = host.getByRole("button", { expanded: true }).first();
    expect(Math.abs((await expandedTrigger.boundingBox())!.height - collapsedHeight)).toBeLessThanOrEqual(0.5);
    await expandedTrigger.click();
    await expect(capped.first()).toBeHidden();
    expect(Math.abs((await trigger.boundingBox())!.height - collapsedHeight)).toBeLessThanOrEqual(0.5);
  });
}
