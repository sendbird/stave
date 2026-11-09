import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

    // An edit made in source saves with Cmd/Ctrl+S while the preview holds
    // focus: the key never reaches the app window, so the frame passes it up.
    await page.locator('[data-testid="editor-surface"] .monaco-editor .view-lines').first().click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type('<p id="added">Added line</p>');
    await page.getByTestId("editor-html-preview-toggle").first().click();
    const nextFrame = page.frameLocator('iframe[title="next.html"]');
    await expect(nextFrame.locator("#added")).toHaveText("Added line");
    await nextFrame.locator("#title").click();
    await page.keyboard.press("ControlOrMeta+s");
    await expect
      .poll(() => readFile(path.join(repositoryPath, "next.html"), "utf8"), { timeout: 15_000 })
      .toContain('<p id="added">Added line</p>');
  } finally {
    await stave.close();
    await rm(repositoryPath, { recursive: true, force: true });
  }
});

test("each HTML tab's mode comes back after a restart", async () => {
  test.setTimeout(240_000);
  const repositoryPath = await mkdtemp(path.join(tmpdir(), "stave-html-restart-"));
  const profileDir = await mkdtemp(path.join(tmpdir(), "stave-html-restart-profile-"));
  await writeFile(path.join(repositoryPath, "a.html"), "<!doctype html><h1 id=\"title\">Page A</h1>");
  await writeFile(path.join(repositoryPath, "b.html"), "<!doctype html><h1 id=\"title\">Page B</h1>");
  execFileSync("git", ["init", "-q", "-b", "main", repositoryPath]);
  try {
    const first = await launchStave({ userDataDir: profileDir });
    try {
      const { page } = first;
      await seedRepository(page, { repositoryPath });
      await page.getByRole("button", { name: "Explorer", exact: true }).click();
      // a.html: opened in preview, switched to source.
      await openFromExplorer(page, "a.html");
      await expect(page.frameLocator('iframe[title="a.html"]').locator("#title")).toHaveText("Page A", { timeout: 30_000 });
      await page.getByTestId("editor-html-preview-toggle").first().click();
      await expect(page.locator('iframe[title="a.html"]')).toHaveCount(0);
      // b.html: opened in source (the last pick), switched to preview.
      await openFromExplorer(page, "b.html");
      await expect(page.locator('.dv-tab.dv-active-tab [data-pane-tab-chip="editor:file:b.html"]')).toBeVisible();
      await page.getByTestId("editor-html-preview-toggle").first().click();
      await expect(page.frameLocator('iframe[title="b.html"]').locator("#title")).toHaveText("Page B");

      // Wait until main has the workspace with both modes.
      await expect
        .poll(
          () =>
            page.evaluate(async () => {
              const result = await window.api.persistence?.loadWorkspaceShell?.({ workspaceId: "ws-e2e" });
              const tabs = (result?.shell?.editorTabs ?? []) as Array<{ id: string; htmlViewMode?: string }>;
              return Object.fromEntries(tabs.map((tab) => [tab.id, tab.htmlViewMode ?? null]));
            }),
          { timeout: 30_000 },
        )
        .toMatchObject({ "file:a.html": "source", "file:b.html": "preview" });
    } finally {
      await first.close();
    }

    const second = await launchStave({ userDataDir: profileDir });
    try {
      const { page } = second;
      const tabA = page.locator('.dv-tab [data-pane-tab-chip="editor:file:a.html"]');
      await expect(tabA).toBeVisible({ timeout: 60_000 });
      await tabA.click();
      await expect(page.locator('.dv-tab.dv-active-tab [data-pane-tab-chip="editor:file:a.html"]')).toBeVisible();
      await expect(page.getByTestId("editor-html-preview-toggle").first()).toHaveAttribute("aria-pressed", "false");
      await expect(page.locator('iframe[title="a.html"]')).toHaveCount(0);
      await page.locator('.dv-tab [data-pane-tab-chip="editor:file:b.html"]').click();
      await expect(page.frameLocator('iframe[title="b.html"]').locator("#title")).toHaveText("Page B", { timeout: 30_000 });
    } finally {
      await second.close();
    }
  } finally {
    await rm(repositoryPath, { recursive: true, force: true });
    await rm(profileDir, { recursive: true, force: true });
  }
});


test("HTML preview reads and renders a file over 1 MiB and enforces its new byte boundary", async () => {
  test.setTimeout(180_000);
  const repositoryPath = await mkdtemp(path.join(tmpdir(), "stave-large-html-"));
  const maxBytes = 10 * 1024 * 1024;
  const prefix = '<!doctype html><h1 id="large">Large HTML preview</h1><!--';
  const html = prefix + "x".repeat(maxBytes - prefix.length - 3) + "-->";
  await writeFile(path.join(repositoryPath, "large.html"), html);
  await writeFile(path.join(repositoryPath, "oversized.HTM"), html + "x");
  await writeFile(path.join(repositoryPath, "large.txt"), "x".repeat(1024 * 1024 + 1));
  execFileSync("git", ["init", "-q", "-b", "main", repositoryPath]);
  const stave = await launchStave();
  try {
    const { page } = stave;
    await seedRepository(page, { repositoryPath });
    const read = (filePath: string) => page.evaluate(async ({ rootPath, filePath }) => {
      const result = await window.api.fs.readFile({ rootPath, filePath });
      return { ...result, content: undefined, contentLength: result.content.length };
    }, { rootPath: repositoryPath, filePath });
    expect(await read("large.html")).toMatchObject({ ok: true, contentLength: maxBytes });
    expect(await read("oversized.HTM")).toMatchObject({
      ok: false, tooLarge: true, sizeBytes: maxBytes + 1, maxSizeBytes: maxBytes,
    });
    expect(await read("large.txt")).toMatchObject({ ok: false, tooLarge: true, maxSizeBytes: 1024 * 1024 });
    await page.getByRole("button", { name: "Explorer", exact: true }).click();
    await openFromExplorer(page, "large.html");
    await expect(page.frameLocator('iframe[title="large.html"]').locator("#large"))
      .toHaveText("Large HTML preview", { timeout: 30_000 });
  } finally {
    await stave.close();
    await rm(repositoryPath, { recursive: true, force: true });
  }
});
