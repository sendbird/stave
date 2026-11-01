import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { launchStave, seedRepository } from "./harness/stave-app";

/**
 * An `.html` file opened from the Explorer in the desktop app: it renders as a
 * page, the toolbar switches it to source, each tab keeps its mode through
 * pane tab clicks, and the page cannot replace itself. The last two need the
 * real app: tab clicks go through Dockview, and script navigations are refused
 * by the main process, which the browser suite does not run.
 */
const DEMO = `<!doctype html>
<html><head><title>Demo</title></head>
<body>
  <h1 id="title">Demo page</h1>
  <button id="leave" onclick="location.href = 'https://example.com/left'">Leave by script</button>
  <a id="link" href="https://example.com/linked">Leave by link</a>
</body></html>`;

const REFRESH = `<!doctype html>
<html><head><meta http-equiv="refresh" content="0;url=https://example.com/refreshed"></head>
<body><h1 id="title">Refresh page</h1></body></html>`;

async function openFromExplorer(page: Page, fileName: string) {
  await page.getByText(fileName, { exact: true }).first().click();
}

test("an HTML file renders as a page, keeps its mode per tab, and cannot replace itself", async () => {
  test.setTimeout(180_000);
  const repositoryPath = await mkdtemp(path.join(tmpdir(), "stave-html-preview-"));
  await writeFile(path.join(repositoryPath, "demo.html"), DEMO);
  await writeFile(path.join(repositoryPath, "refresh.html"), REFRESH);
  await writeFile(path.join(repositoryPath, "NOTES.md"), "# Notes heading\n");
  await writeFile(path.join(repositoryPath, "next.html"), "<!doctype html><h1 id=\"title\">Next page</h1>");
  execFileSync("git", ["init", "-q", "-b", "main", repositoryPath]);
  const stave = await launchStave();
  try {
    const { page } = stave;
    await seedRepository(page, { repositoryPath });
    await page.getByRole("button", { name: "Explorer", exact: true }).click();

    // A meta refresh cannot take the preview away from the file.
    await openFromExplorer(page, "refresh.html");
    const refreshFrame = page.frameLocator('iframe[title="refresh.html"]');
    await expect(refreshFrame.locator("#title")).toHaveText("Refresh page", { timeout: 30_000 });
    await page.waitForTimeout(1_500);
    await expect(refreshFrame.locator("#title")).toHaveText("Refresh page");

    // The default is the rendered page.
    await openFromExplorer(page, "demo.html");
    const demoFrame = page.frameLocator('iframe[title="demo.html"]');
    await expect(demoFrame.locator("#title")).toHaveText("Demo page", { timeout: 30_000 });

    // Neither a script nor a link can replace the page.
    await demoFrame.locator("#leave").click();
    await demoFrame.locator("#link").click();
    await page.waitForTimeout(1_000);
    await expect(demoFrame.locator("#title")).toHaveText("Demo page");
    // Read from main: Playwright reports an Electron srcdoc frame's URL as "".
    const frameUrls = await stave.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().flatMap((window) =>
        window.webContents.mainFrame.framesInSubtree.map((frame) => frame.url),
      ),
    );
    expect(frameUrls).toContain("about:srcdoc");
    expect(frameUrls.some((url) => url.startsWith("https://example.com"))).toBe(false);

    // Source mode survives pane tab clicks to and from a markdown preview.
    await page.getByTestId("editor-html-preview-toggle").first().click();
    await expect(page.locator('iframe[title="demo.html"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="editor-surface"] .monaco-editor').first()).toBeVisible({
      timeout: 30_000,
    });

    await openFromExplorer(page, "NOTES.md");
    await expect(page.getByTestId("editor-markdown-preview").first()).toBeVisible();
    await page.locator('.dv-tab [data-pane-tab-chip="editor:file:demo.html"]').click();
    await expect(page.getByTestId("editor-html-preview-toggle").first()).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator('iframe[title="demo.html"]')).toHaveCount(0);

    // A tab opened before the pick keeps its own mode.
    await page.locator('.dv-tab [data-pane-tab-chip="editor:file:refresh.html"]').click();
    await expect(page.locator('iframe[title="refresh.html"]')).toHaveCount(1);
    // A file opened after the pick opens in it.
    await openFromExplorer(page, "next.html");
    await expect(page.locator('.dv-tab.dv-active-tab [data-pane-tab-chip="editor:file:next.html"]')).toBeVisible();
    await expect(page.getByTestId("editor-html-preview-toggle").first()).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator('iframe[title="next.html"]')).toHaveCount(0);

    // The pick reaches the persisted settings once the store's write debounce
    // settles, so it outlives the session.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const raw = window.localStorage.getItem("stave-store");
            const parsed = raw
              ? (JSON.parse(raw) as { state?: { settings?: { editorHtmlViewMode?: string } } })
              : null;
            return parsed?.state?.settings?.editorHtmlViewMode ?? null;
          }),
        { timeout: 15_000 },
      )
      .toBe("source");
  } finally {
    await stave.close();
    await rm(repositoryPath, { recursive: true, force: true });
  }
});
