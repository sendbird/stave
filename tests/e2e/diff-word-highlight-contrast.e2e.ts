import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Changed words in a word-level diff stay readable. The syntax palette has to
 * follow the theme the diff is painted in (the root `.dark` class), which is
 * also where its added/removed washes come from, even when the store's
 * `isDarkMode` flag says otherwise. Picked from the flag, a light page drew
 * near-white tokens on the light washes (about 1.1:1), so changed words read
 * as empty red and green boxes.
 *
 * The review preview paints a light theme by default, or the theme named by
 * `&theme=`; each case then sets the store flag to the opposite mode.
 */
const MODULES = {
  react: "/node_modules/.vite/deps/react.js",
  client: "/node_modules/.vite/deps/react-dom_client.js",
  appStore: "/src/store/app.store.ts",
  applyTheme: "/src/lib/themes/apply.ts",
  fileBlocks: "/src/components/session/chat-panel-file-blocks.tsx",
};

/**
 * Syntax colors are fitted to 4.5:1 on the code surface, not on the diff
 * washes; on a wash the lowest measured pair is about 3.7:1. 3:1 still
 * separates readable text from the ~1.1:1 failure by a wide margin.
 */
const MIN_CONTRAST = 3;

/** The review preview's edited file, in the changed-file list. */
const FILE_BUTTON = "src/billing/BillingTable.tsx, Modified";

const THEMES = [
  { param: "", dark: false, label: "light" },
  { param: "dark", dark: true, label: "dark" },
  { param: "dark-high-contrast", dark: true, label: "dark high contrast" },
  { param: "github-light-default", dark: false, label: "a light built-in theme" },
] as const;

async function openReviewPreview(page: Page, theme: string) {
  await page.goto(`/?stavePreview=review${theme ? `&theme=${theme}` : ""}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: FILE_BUTTON })).toBeVisible();
}

/** Sets the store's dark-mode flag without touching the root class. */
async function setStoreDarkMode(page: Page, isDarkMode: boolean) {
  await page.evaluate(async ({ modules, isDarkMode }) => {
    const { useAppStore } = await import(modules.appStore);
    useAppStore.setState({ isDarkMode });
  }, { modules: MODULES, isDarkMode });
}

type TokenContrast = { text: string; ratio: number; washed: boolean };

/**
 * Every non-blank text run in the diff with its contrast against the nearest
 * painted background (its own word wash, else the row or the viewer).
 * Computed colors may be `oklch()`, so each is resolved to sRGB by painting it.
 */
async function tokenContrasts(diff: Locator): Promise<TokenContrast[]> {
  return diff.evaluate((root) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    const rgba = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    };
    const luminance = ([r, g, b]: number[]) => {
      const channel = (value: number) => {
        const v = value / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
    };
    const backgroundOf = (element: Element) => {
      for (let node: Element | null = element; node; node = node.parentElement) {
        const color = rgba(getComputedStyle(node).backgroundColor);
        if (color[3]! > 0) return color;
      }
      return rgba(getComputedStyle(document.body).backgroundColor);
    };
    const runs: { text: string; ratio: number; washed: boolean }[] = [];
    for (const span of root.querySelectorAll("span")) {
      const text = span.textContent ?? "";
      if (span.children.length > 0 || !text.trim()) continue;
      const style = getComputedStyle(span);
      const a = luminance(rgba(style.color));
      const b = luminance(backgroundOf(span));
      runs.push({
        text,
        ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        washed: rgba(style.backgroundColor)[3]! > 0,
      });
    }
    return runs;
  });
}

/** Waits until the shared highlighter has painted syntax color into the diff. */
async function waitForSyntaxColor(diff: Locator) {
  await expect.poll(() => diff.locator("span[style*='--stave-syntax-']").count()).toBeGreaterThan(0);
}

function expectReadable(runs: TokenContrast[]) {
  const washed = runs.filter((run) => run.washed);
  // The fixture's edited line has changed words on both sides.
  expect(washed.length).toBeGreaterThan(0);
  const unreadable = runs.filter((run) => run.ratio < MIN_CONTRAST);
  expect(unreadable, `tokens under ${MIN_CONTRAST}:1: ${JSON.stringify(unreadable)}`).toEqual([]);
}

for (const theme of THEMES) {
  test(`Review keeps changed words readable in ${theme.label} when the store flag disagrees`, async ({ page }) => {
    await openReviewPreview(page, theme.param);
    await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(theme.dark);
    await setStoreDarkMode(page, !theme.dark);
    await page.getByRole("button", { name: FILE_BUTTON }).click();
    const diff = page.getByRole("group", { name: "Changes in src/billing/BillingTable.tsx" });
    await waitForSyntaxColor(diff);
    expectReadable(await tokenContrasts(diff));
    // The palette is the painted theme's, not the flag's.
    await expect(diff.locator(`span[style*='--stave-syntax-${theme.dark ? "dark" : "light"}-']`).first()).toBeVisible();
    await expect(diff.locator(`span[style*='--stave-syntax-${theme.dark ? "light" : "dark"}-']`)).toHaveCount(0);
  });
}

test("a chat file diff repaints its syntax colors when only the root theme class changes", async ({ page }) => {
  await openReviewPreview(page, "");
  await setStoreDarkMode(page, true);
  await page.evaluate(async (modules) => {
    const { default: React } = await import(modules.react);
    const { default: { createRoot } } = await import(modules.client);
    const { OpenedFileDiff } = await import(modules.fileBlocks);
    const host = document.createElement("div");
    host.id = "chat-file-diff";
    host.style.cssText = "position: fixed; top: 0; left: 0; width: 900px; z-index: 10;";
    document.body.append(host);
    createRoot(host).render(React.createElement(OpenedFileDiff, {
      before: "const sorted = items.sort((a, b) => a.rank - b.rank);\n",
      after: "const sorted = items.toSorted((a, b) => b.rank - a.rank);\n",
      displayFilePath: "src/rank.ts",
      filePath: "src/rank.ts",
    }));
  }, MODULES);
  const diff = page.locator("#chat-file-diff").getByRole("group", { name: /src\/rank\.ts/ });
  await waitForSyntaxColor(diff);
  expectReadable(await tokenContrasts(diff));
  await expect(diff.locator("span[style*='--stave-syntax-dark-']")).toHaveCount(0);

  // Dark paint without a store update, as a preview or custom theme applies it.
  await page.evaluate(async (modules) => {
    const { applyThemeClass } = await import(modules.applyTheme);
    applyThemeClass({ enabled: true });
  }, MODULES);
  await expect(diff.locator("span[style*='--stave-syntax-light-']")).toHaveCount(0);
  await expect(diff.locator("span[style*='--stave-syntax-dark-']").first()).toBeVisible();
  expectReadable(await tokenContrasts(diff));
});
