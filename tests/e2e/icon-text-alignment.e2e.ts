import { expect, test, type Locator, type Page } from "@playwright/test";

/** Compare the glyph with the first line box, not the whole wrapped copy. */
async function firstLineDelta(row: Locator, icon: string, text: string) {
  return row.evaluate((element, selectors) => {
    const glyph = element.querySelector(selectors.icon)!;
    const label = element.querySelector(selectors.text)!;
    const box = glyph.getBoundingClientRect();
    const copy = label.getBoundingClientRect();
    const lineHeight = Number.parseFloat(getComputedStyle(label).lineHeight);
    return box.y + box.height / 2 - (copy.y + lineHeight / 2);
  }, { icon, text });
}

async function mountIssueRow(page: Page) {
  await page.goto("/?stavePreview=ads-regressions");
  await expect(page.locator("main svg").first()).toBeVisible();
  await page.evaluate(async () => {
    const resources = performance.getEntriesByType("resource");
    const moduleUrl = (name: string) => resources.find((entry) => new URL(entry.name).pathname.endsWith(`/deps/${name}.js`))!.name;
    const React = (await import(moduleUrl("react"))).default;
    const { createRoot } = (await import(moduleUrl("react-dom_client"))).default;
    const { TrackerIssueRow } = await import("/src/components/layout/issues/TrackerIssueRow.tsx");
    const { tickets } = await import("/src/dev/ads-regression-preview/fixtures.ts");
    const { StaveDesignProvider } = await import("/src/components/system/StaveDesignProvider.tsx");
    document.getElementById("root")!.style.display = "none";
    const host = document.createElement("div");
    host.id = "alignment-issue-row";
    host.style.cssText = "padding:24px;width:1100px;max-width:100%";
    document.body.append(host);
    createRoot(host).render(React.createElement(StaveDesignProvider, null,
      React.createElement(TrackerIssueRow, {
        item: { ...tickets[0], task: { ...tickets[0].task, parentKey: "PREVIEW-0", title: "Subtask title ".repeat(20) } },
        now: new Date(), selected: false, onSelect: () => {}, onKickoff: () => {},
        onAttach: () => {}, onOpenStaveTask: () => {}, attachTargetLabel: null,
      }),
    ));
  });
  await expect(page.locator("#alignment-issue-row .lucide-corner-down-right")).toBeVisible();
}

test("return status stays on its first line with details, without details and after the action wraps", async ({ page }) => {
  await page.goto("/?stavePreview=task-panel&return=idle");
  const card = page.getByTestId("return-summary");
  await expect(card).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const row = card.locator('[data-return-line="status"]');
  const delta = () => firstLineDelta(row, "svg", "p");
  expect(Math.abs(await delta())).toBeLessThanOrEqual(0.5);
  await page.evaluate(async () => {
    const { useTaskHandoffStore } = await import("/src/store/task-handoff-store.ts");
    useTaskHandoffStore.setState((state) => ({
      records: Object.fromEntries(Object.entries(state.records).map(([key, record]) => [key, {
        ...record, sections: { ...record.sections, remaining: { ...record.sections.remaining, text: "" } },
      }])),
    }));
  });
  await expect(row.locator("p")).toHaveCount(1);
  expect(Math.abs(await delta())).toBeLessThanOrEqual(0.5);
  await page.getByTestId("side-chat-frame").evaluate((element) => {
    element.style.cssText = "flex:0 0 300px;min-width:0;width:300px";
  });
  expect(Math.abs(await delta())).toBeLessThanOrEqual(0.5);
  const title = (await row.locator("p").boundingBox())!;
  const action = (await row.getByRole("button").boundingBox())!;
  expect(action.y).toBeGreaterThan(title.y + title.height);
  await card.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(card).toHaveCount(0);
});

test("run check marks stay on the first line when criteria wrap and when details grow", async ({ page }) => {
  await page.goto("/?stavePreview=review");
  const rows = page.locator('li[class*="agentRunStyles.check "]');
  await expect(rows).toHaveCount(3);
  await page.evaluate(() => document.fonts.ready);
  for (const width of [320, 640]) {
    await page.locator("main").evaluate((element, width) => {
      element.style.width = `${width}px`;
      element.style.maxWidth = `${width}px`;
    }, width);
    for (const row of await rows.all()) {
      expect(Math.abs(await firstLineDelta(row, "svg", '[class*="checkText"]'))).toBeLessThanOrEqual(0.5);
    }
  }
  await page.goto("/?stavePreview=agent-run");
  const wakeUps = page.locator('[data-preview-case="Wake-ups"] [class*="agentRunStyles.check "]');
  await expect(wakeUps).not.toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  for (const row of await wakeUps.all()) {
    expect(Math.abs(await firstLineDelta(row, "svg", '[class*="checkText"]'))).toBeLessThanOrEqual(0.5);
  }
});

test("the attached review check centers with its label in the shelf and detail dialog", async ({ page }) => {
  await page.goto("/?stavePreview=composer-frame&case=reviews");
  const row = page.locator('[data-testid="composer-shelf-review"][data-status="ready"]');
  await row.getByRole("button", { name: "Attach", exact: true }).click();
  const check = row.locator("svg.lucide-check");
  await expect(check).toBeVisible();
  const labelDelta = async (glyph: Locator) => glyph.evaluate((svg) => {
    const host = svg.parentElement!;
    const labelElement = host.querySelector("span");
    const range = document.createRange();
    const text = [...host.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent!.trim());
    if (text) range.selectNodeContents(text);
    // Compare line boxes; a font's text range includes different ascent/leading.
    const label = labelElement?.getBoundingClientRect() ?? range.getBoundingClientRect();
    const icon = svg.getBoundingClientRect();
    return icon.y + icon.height / 2 - (label.y + label.height / 2);
  });
  expect(Math.abs(await labelDelta(check))).toBeLessThanOrEqual(0.5);
  await row.getByRole("button", { name: "View", exact: true }).click();
  const dialogCheck = page.getByRole("dialog").locator('span:has(> svg.lucide-check)').filter({ hasText: "Attached to your message" }).locator("svg");
  await expect(dialogCheck).toBeVisible();
  expect(Math.abs(await labelDelta(dialogCheck))).toBeLessThanOrEqual(0.5);
});

test("subtask arrows align with long titles without losing ellipsis", async ({ page }) => {
  await mountIssueRow(page);
  const host = page.locator("#alignment-issue-row");
  const delta = await host.locator("svg.lucide-corner-down-right").evaluate((svg) => {
    const title = svg.parentElement!;
    const text = title.querySelector("span");
    const range = document.createRange();
    range.selectNodeContents(title.lastChild!);
    const label = text?.getBoundingClientRect() ?? range.getBoundingClientRect();
    const icon = svg.getBoundingClientRect();
    return icon.y + icon.height / 2 - (label.y + label.height / 2);
  });
  expect(Math.abs(delta)).toBeLessThanOrEqual(0.5);
  const title = host.locator('[title^="Subtask title"]');
  expect(await title.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const copy = title.locator("span");
  await expect(copy).toHaveCSS("text-overflow", "ellipsis");
  expect(await copy.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
});

test("priority glyphs center inside their fixed issue-row slots", async ({ page }) => {
  await mountIssueRow(page);
  const delta = await page.locator('#alignment-issue-row [role="img"][aria-label="High priority"]').evaluate((icon) => {
    const glyph = icon.querySelector("svg")!.getBoundingClientRect();
    const slot = icon.parentElement!.getBoundingClientRect();
    return glyph.y + glyph.height / 2 - (slot.y + slot.height / 2);
  });
  expect(Math.abs(delta)).toBeLessThanOrEqual(0.5);
});

test("palette icons center on titles with subtitles and context badges", async ({ page }) => {
  await page.goto("/?stavePreview=command-palette");
  const row = page.getByRole("option").filter({ hasText: "Show Information Panel" });
  await expect(row).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(Math.abs(await firstLineDelta(row, "svg", '[class*="itemTitle "]'))).toBeLessThanOrEqual(0.5);
  await expect(row.getByText("Active task", { exact: true })).toBeVisible();
});
