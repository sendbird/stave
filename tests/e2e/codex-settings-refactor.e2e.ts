import { expect, test, type Page } from "@playwright/test";
import { CODEX_CLI_SLASH_COMMANDS } from "../../src/lib/providers/codex-command-catalog";

type PreviewControls = {
  holdNext: (label: string) => void;
  queueNext: (label: string) => void;
  release: (label: string, snapshotLabel: string) => void;
  getCompletedCount: () => number;
};

function control(page: Page, action: keyof PreviewControls, ...args: string[]) {
  return page.evaluate(
    ({ action, args }) => {
      const preview = (
        window as typeof window & { __codexSettingsPreview: PreviewControls }
      ).__codexSettingsPreview;
      (preview[action] as (...values: string[]) => void)(...args);
    },
    { action, args },
  );
}

async function settleSnapshots(page: Page, count: number) {
  await page.waitForFunction((expected) => {
    const preview = (
      window as typeof window & { __codexSettingsPreview: PreviewControls }
    ).__codexSettingsPreview;
    return preview.getCompletedCount() >= expected;
  }, count);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

test("keeps the selected tab, plugin, and thread through snapshot refresh", async ({
  page,
}) => {
  await page.goto("/?stavePreview=codex-settings");
  await expect(
    page.getByRole("heading", { name: "Runtime summary" }),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Extensions" }).click();
  await page.getByRole("button", { name: "Plugins 2" }).click();
  await page.getByRole("button", { name: /beta plugin/ }).click();
  const pluginInspector = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: "Inspector", exact: true }),
    })
    .last();
  await expect(
    pluginInspector.getByText("beta plugin", { exact: true }),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Threads" }).click();
  await page.getByRole("button", { name: /beta thread/ }).click();
  const threadInspector = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: "Thread inspector" }),
    })
    .last();
  await expect(
    threadInspector.getByText("beta thread", { exact: true }),
  ).toBeVisible();

  await control(page, "queueNext", "refreshed");
  await page.getByRole("button", { name: "Refresh" }).click();
  await settleSnapshots(page, 2);
  await expect(page.getByRole("tab", { name: "Threads" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    threadInspector.getByText("beta thread", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Extensions" }).click();
  await expect(
    pluginInspector.getByText("beta plugin", { exact: true }),
  ).toBeVisible();
});

test("ignores a stale snapshot after a newer refresh completes", async ({
  page,
}) => {
  await page.goto("/?stavePreview=codex-settings");
  await expect(
    page.getByRole("heading", { name: "Runtime summary" }),
  ).toBeVisible();

  await control(page, "holdNext", "old");
  await page.getByRole("button", { name: "Refresh" }).click();
  await control(page, "queueNext", "partial");
  await page.getByRole("button", { name: "Refresh" }).click();
  await settleSnapshots(page, 2);
  await expect(page.getByText("apps unavailable")).toBeVisible();

  await control(page, "release", "old", "old");
  await settleSnapshots(page, 3);
  await expect(page.getByText("apps unavailable")).toBeVisible();
  await page.getByRole("tab", { name: "Advanced" }).click();
  await expect(page.getByText(/"snapshotLabel": "partial"/)).toBeVisible();
});

test("shows loading and recovery from snapshot failure", async ({ page }) => {
  await page.goto("/?stavePreview=codex-settings&codexInitial=held");
  await expect(page.getByText("Loading Codex snapshot")).toBeVisible();
  await control(page, "release", "initial", "partial");
  await expect(page.getByText("apps unavailable")).toBeVisible();

  await page.goto("/?stavePreview=codex-settings&codexInitial=error");
  await expect(page.getByText("Codex snapshot unavailable")).toBeVisible();
  await expect(page.getByText("Preview snapshot rejected")).toBeVisible();
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(
    page.getByRole("heading", { name: "Runtime summary" }),
  ).toBeVisible();
});

test("filters commands and recovers from an empty search", async ({ page }) => {
  const duplicateKeyErrors: string[] = [];
  const collectDuplicateKeyError = (message: string) => {
    if (/same key|duplicate key/i.test(message)) {
      duplicateKeyErrors.push(message);
    }
  };
  page.on("console", (message) => {
    if (message.type() === "error") {
      collectDuplicateKeyError(message.text());
    }
  });
  page.on("pageerror", (error) => collectDuplicateKeyError(error.message));

  await page.goto("/?stavePreview=codex-settings");
  await page.getByRole("tab", { name: "Commands" }).click();
  const commandRows = page.locator("[data-codex-command]");

  const filter = page.getByPlaceholder(
    "Filter by command, behavior, or category",
  );
  await filter.fill("sandbox-add-read-dir");
  await expect(commandRows).toHaveCount(1);
  await expect(commandRows.first()).toHaveAttribute(
    "data-codex-command",
    "/sandbox-add-read-dir",
  );

  await filter.fill("no-such-command");
  await expect(page.getByRole("heading", { name: "No matches" })).toBeVisible();
  await expect(commandRows).toHaveCount(0);
  await filter.clear();
  const expectedCommands = CODEX_CLI_SLASH_COMMANDS.map(
    (command) => command.command,
  );
  await expect(commandRows).toHaveCount(expectedCommands.length);
  await expect
    .poll(() =>
      commandRows.evaluateAll((rows) =>
        rows.map((row) => row.getAttribute("data-codex-command")),
      ),
    )
    .toEqual(expectedCommands);
  expect(duplicateKeyErrors).toEqual([]);
});

test("failed config write keeps its draft and reports the failure", async ({
  page,
}) => {
  await page.goto("/?stavePreview=codex-settings");
  await expect(
    page.getByRole("heading", { name: "Runtime summary" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Advanced" }).click();

  const configEditor = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Advanced config edits" }),
  });
  await configEditor.getByPlaceholder("features.apps").fill("features.retry");
  await configEditor.locator("textarea").first().fill('{"enabled":true}');
  await configEditor.getByRole("button", { name: "Apply single edit" }).click();

  await expect(
    page.getByRole("alert").getByText("Preview write rejected"),
  ).toBeVisible();
  await expect(configEditor.getByPlaceholder("features.apps")).toHaveValue(
    "features.retry",
  );
  await expect(configEditor.locator("textarea").first()).toHaveValue(
    '{"enabled":true}',
  );
});
