import { expect, test, type Page } from "@playwright/test";

/**
 * The command palette preview with search responses held back, so the rows a
 * slow search left on screen are still there when the next query arrives.
 * What Enter runs must be the row the palette shows as selected.
 */
const SEARCH_DELAY_MS = 900;

interface Probe {
  openedTasks: string[];
  settings: () => { customThemeId: string | null; themeMode: string };
}

async function probe(page: Page) {
  return page.evaluate(() => {
    const value = (window as unknown as { __stavePalettePreview: Probe }).__stavePalettePreview;
    return { openedTasks: [...value.openedTasks], ...value.settings() };
  });
}

/** The row Enter would run, and the row drawn as selected. */
async function selection(page: Page) {
  return page.evaluate(() => ({
    highlighted: Array.from(document.querySelectorAll('[data-slot="command-item"][data-highlighted]')).map(
      (node) => node.textContent?.trim() ?? "",
    ),
    selected: Array.from(document.querySelectorAll('[data-slot="command-item"][data-selected="true"]')).map(
      (node) => node.textContent?.trim() ?? "",
    ),
  }));
}

async function openAllRepositories(page: Page) {
  await page.goto(`/?stavePreview=command-palette&searchDelay=${SEARCH_DELAY_MS}`, {
    waitUntil: "domcontentloaded",
  });
  const input = page.getByPlaceholder("Find a command, task, workspace, or setting");
  await expect(input).toBeFocused();
  await page.locator('[data-task-scope="all"]').click();
  return input;
}

test("an option that arrives while an older search is still on screen is the row Enter runs", async ({
  page,
}) => {
  const input = await openAllRepositories(page);
  await input.fill("login");
  await expect(page.getByText("Fix the login redirect").first()).toBeVisible({
    timeout: SEARCH_DELAY_MS * 4,
  });

  // The next search is still pending: the login results stay on screen.
  await input.fill("dracula");
  await expect(page.getByText("Fix the login redirect").first()).toBeVisible();
  await expect(page.getByText("Theme: Dracula")).toBeVisible();

  const shown = await selection(page);
  expect(shown.highlighted).toHaveLength(1);
  expect(shown.highlighted[0]).toContain("Theme: Dracula");
  expect(shown.selected).toEqual(shown.highlighted);

  await page.keyboard.press("Enter");
  await expect.poll(async () => (await probe(page)).customThemeId).toBe("dracula");
  expect((await probe(page)).openedTasks).toEqual([]);
});

test("a search across repositories starts on its first result, and Enter opens it", async ({
  page,
}) => {
  const input = await openAllRepositories(page);
  await input.fill("redirect");
  await expect(page.getByText("Fix the login redirect").first()).toBeVisible({
    timeout: SEARCH_DELAY_MS * 4,
  });

  const shown = await selection(page);
  expect(shown.highlighted).toHaveLength(1);
  expect(shown.highlighted[0]).toContain("Fix the login redirect");
  expect(shown.highlighted[0]).toContain("feat/search");
  expect(shown.selected).toEqual(shown.highlighted);

  await page.keyboard.press("Enter");
  await expect.poll(async () => (await probe(page)).openedTasks).toEqual(["t2"]);
});

test("arrow keys move the drawn selection and the row Enter runs together", async ({ page }) => {
  await page.goto("/?stavePreview=command-palette", { waitUntil: "domcontentloaded" });
  const input = page.getByPlaceholder("Find a command, task, workspace, or setting");
  await input.fill("dark");
  await expect(page.getByText("Appearance: Dark")).toBeVisible();

  await page.keyboard.press("ArrowDown");
  const shown = await selection(page);
  expect(shown.highlighted).toHaveLength(1);
  expect(shown.selected).toEqual(shown.highlighted);
  const target = shown.highlighted[0]!;
  expect(target).toMatch(/^Theme: /);

  await page.keyboard.press("Enter");
  // The second row is a theme; the first ("Appearance: Dark") would clear it.
  await expect.poll(async () => (await probe(page)).customThemeId).not.toBeNull();
});
