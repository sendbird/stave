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
