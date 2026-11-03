import { expect, test, type Page } from "@playwright/test";

/**
 * Mounts the real SearchablePicker (single) and SearchableMultiPicker on an
 * otherwise empty preview page, both stateful, so the ADS Combobox they are
 * built on is exercised with a keyboard and a pointer.
 */
async function mountPickers(page: Page) {
  await page.goto("/?stavePreview=ads-regressions");
  await expect(page.locator("main svg").first()).toBeVisible();
  await page.evaluate(async () => {
    const resources = performance.getEntriesByType("resource");
    const moduleUrl = (name: string) => resources.find((entry) => new URL(entry.name).pathname.endsWith(`/deps/${name}.js`))!.name;
    const React = (await import(moduleUrl("react"))).default;
    const { createRoot } = (await import(moduleUrl("react-dom_client"))).default;
    const { SearchablePicker, SearchableMultiPicker } = await import("/src/components/layout/settings-searchable-picker.tsx");
    const { Button } = await import("/src/components/ads/components/Button.tsx");
    const { StaveDesignProvider } = await import("/src/components/system/StaveDesignProvider.tsx");
    document.getElementById("root")!.style.display = "none";
    const host = document.createElement("div");
    host.id = "picker-host";
    host.style.cssText = "padding:24px;width:480px;display:grid;gap:24px";
    document.body.append(host);
    const models = [
      { value: "claude-opus-5-5", label: "Claude Opus 5.5", detail: "claude-opus-5-5", group: "Claude", meta: "$5 / $25" },
      { value: "claude-sonnet-5", label: "Claude Sonnet 5", detail: "claude-sonnet-5", group: "Claude" },
      { value: "gpt-5.5-codex", label: "GPT-5.5 Codex", detail: "gpt-5.5-codex", group: "Codex", keywords: ["openai"] },
    ];
    function Harness() {
      const [model, setModel] = React.useState("claude-sonnet-5");
      const [statuses, setStatuses] = React.useState<string[]>(["todo"]);
      const [labels, setLabels] = React.useState<string[]>(["design-system", "retired"]);
      return React.createElement("div", { style: { display: "grid", gap: "24px" } },
        React.createElement("span", { id: "model-label" }, "Model"),
        React.createElement(SearchablePicker, {
          labelledBy: "model-label",
          value: model,
          placeholder: "Choose a model",
          options: models,
          onSelect: setModel,
          searchPlaceholder: "Search models",
          emptyText: "No models match.",
          size: "md",
        }),
        React.createElement("output", { id: "model-value" }, model),
        React.createElement(SearchableMultiPicker, {
          trigger: React.createElement(Button, { variant: "outline", size: "sm" }),
          triggerContent: "Status",
          "aria-label": "Status filter",
          options: [
            { value: "todo", label: "To do" },
            { value: "progress", label: "In progress" },
            { value: "done", label: "Done" },
          ],
          selected: statuses,
          onChange: setStatuses,
          searchPlaceholder: "Search statuses",
          emptyText: "No statuses match.",
        }),
        React.createElement("output", { id: "status-value" }, statuses.join(",")),
        React.createElement("span", { id: "labels-label" }, "Labels"),
        // The default form: chosen values are chips in the field.
        React.createElement(SearchableMultiPicker, {
          labelledBy: "labels-label",
          options: [
            { value: "design-system", label: "design-system" },
            { value: "bug", label: "bug", keywords: ["defect"] },
            { value: "docs", label: "docs" },
          ],
          selected: labels,
          onChange: setLabels,
          missingOption: (value: string) => ({ value, label: `${value} (gone)`, stale: true }),
          searchPlaceholder: "Add labels",
          emptyText: "No labels match.",
          size: "md",
        }),
        React.createElement("output", { id: "labels-value" }, labels.join(",")),
      );
    }
    createRoot(host).render(React.createElement(StaveDesignProvider, null, React.createElement(Harness)));
    await document.fonts.ready;
  });
}

test("single picker: field trigger, search in the list, empty result, keyboard pick", async ({ page }) => {
  await mountPickers(page);
  const trigger = page.getByRole("combobox", { name: /Model/ });
  await expect(trigger).toContainText("Claude Sonnet 5");
  await trigger.click();
  const search = page.getByRole("combobox", { name: "Search models" });
  await expect(search).toBeFocused();
  // Grouped, with the price as a muted trailing value where the row has one.
  await expect(page.getByRole("option")).toHaveCount(3);
  await expect(page.getByRole("option", { name: /Claude Opus 5\.5/ })).toContainText("$5 / $25");
  // The current choice is marked.
  await expect(page.getByRole("option", { name: /Claude Sonnet 5/ })).toHaveAttribute("aria-selected", "true");
  // Matches identifiers and keywords, not only labels.
  await search.fill("openai");
  await expect(page.getByRole("option")).toHaveCount(1);
  await search.fill("zzz");
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect(page.getByText("No models match.")).toBeVisible();
  await search.fill("opus");
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(page.locator("#model-value")).toHaveText("claude-opus-5-5");
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect(trigger).toContainText("Claude Opus 5.5");
  // Escape closes without changing the choice, and the search starts empty again.
  await trigger.click();
  await expect(page.getByRole("combobox", { name: "Search models" })).toHaveValue("");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect(page.locator("#model-value")).toHaveText("claude-opus-5-5");
});

test("multiple picker: stays open while checking, searches, and clears to none", async ({ page }) => {
  await mountPickers(page);
  await page.getByRole("combobox", { name: "Status filter" }).click();
  const search = page.getByRole("combobox", { name: "Search statuses" });
  await expect(search).toBeFocused();
  await expect(page.getByRole("option", { name: "To do" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("option", { name: "In progress" }).click();
  // Still open: a multiple choice keeps its list while values are toggled.
  await expect(page.getByRole("option")).toHaveCount(3);
  await expect(page.locator("#status-value")).toHaveText("todo,progress");
  await search.fill("done");
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(page.locator("#status-value")).toHaveText("todo,progress,done");
  await search.fill("nothing");
  await expect(page.getByText("No statuses match.")).toBeVisible();
  await search.fill("");
  // Unchecking every row clears the choice.
  for (const name of ["To do", "In progress", "Done"]) await page.getByRole("option", { name }).click();
  await expect(page.locator("#status-value")).toHaveText("");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("option")).toHaveCount(0);
});

test("chip field: chips in the field, search in its input, remove, Backspace and clear", async ({ page }) => {
  await mountPickers(page);
  const input = page.getByRole("combobox", { name: "Labels" });
  const field = page.locator('[data-ads-slot="chips"]').filter({ has: input });
  // Both chosen values are chips inside the field, the one no option lists
  // included, beside the input.
  const chips = field.locator('[data-ads-slot="chip"]');
  await expect(chips).toHaveText(["design-system", "retired (gone)"]);
  const fieldBox = (await field.boundingBox())!;
  for (const index of [0, 1]) {
    const box = (await chips.nth(index).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(fieldBox.x - 0.5);
    expect(box.x + box.width).toBeLessThanOrEqual(fieldBox.x + fieldBox.width + 0.5);
    expect(box.y).toBeGreaterThanOrEqual(fieldBox.y - 0.5);
  }
  // The stale value reads differently from a resolved one.
  const borderStyle = (index: number) => chips.nth(index).evaluate((chip) => getComputedStyle(chip).borderStyle);
  expect(await borderStyle(1)).toBe("dashed");
  expect(await borderStyle(0)).not.toBe("dashed");

  // The field's input is the search; the list has no second search row.
  await input.click();
  await expect(page.getByRole("option")).toHaveCount(3);
  await expect(page.getByRole("combobox", { name: "Add labels" })).toHaveCount(0);
  await input.fill("defect");
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(page.locator("#labels-value")).toHaveText("design-system,retired,bug");
  await expect(chips).toHaveCount(3);
  await input.fill("zzz");
  await expect(page.getByText("No labels match.")).toBeVisible();
  await input.fill("");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("option")).toHaveCount(0);

  // Each chip's own remove button takes that value out.
  await page.getByRole("button", { name: "Remove retired (gone)" }).click();
  await expect(page.locator("#labels-value")).toHaveText("design-system,bug");
  // Backspace in the empty input removes the last chip.
  await input.focus();
  await expect(input).toHaveValue("");
  await page.keyboard.press("Backspace");
  await expect(page.locator("#labels-value")).toHaveText("design-system");
  await expect(chips).toHaveText(["design-system"]);
  // Clear empties the field, and the placeholder comes back.
  await page.getByRole("button", { name: "Clear selection" }).click();
  await expect(page.locator("#labels-value")).toHaveText("");
  await expect(chips).toHaveCount(0);
  await expect(input).toHaveAttribute("placeholder", "Add labels");
  await expect(page.getByRole("button", { name: "Clear selection" })).toHaveCount(0);
});
