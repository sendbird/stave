import { expect, test, type Page } from "@playwright/test";

/**
 * The rendered view of an `.html` editor tab, in a real browser: the page
 * renders and runs its scripts, stays walled off from the app, and cannot
 * follow a link out of the preview. The toolbar toggle names the HTML mode,
 * and each HTML tab keeps its own mode in a split, whichever path activates
 * it. Each case mounts the component on the dev preview's own module
 * instances. Script navigations (`location.href`, a meta refresh) are refused
 * by the desktop main process and are covered by the Electron suite.
 */
const MODULES = {
  react: "/node_modules/.vite/deps/react.js",
  client: "/node_modules/.vite/deps/react-dom_client.js",
  htmlPreview: "/src/components/layout/editor-html-preview.tsx",
  editorToolbar: "/src/components/panes/surfaces/editor-surface-toolbar.tsx",
  editorPanel: "/src/components/panes/surfaces/EditorSurfacePanel.tsx",
  appStore: "/src/store/app.store.ts",
};

const PAGE = `<!doctype html>
<html>
  <head><title>Fixture</title></head>
  <body>
    <h1 id="title">Hello preview</h1>
    <p id="script-ran">script did not run</p>
    <p id="parent-access">not checked</p>
    <a id="external" href="https://example.com/">Leave</a>
    <a id="relative" href="other.html">Relative</a>
    <a id="stopped" href="https://example.com/stopped">Stopped</a>
    <a id="fragment" href="#bottom">Down</a>
    <a id="widget" href="#" onclick="document.getElementById('widget-state').textContent = 'widget toggled'; return false;">Widget</a>
    <p id="widget-state">widget idle</p>
    <p id="hash-count">0</p>
    <div style="height: 3000px"></div>
    <p id="bottom">Bottom</p>
    <script>
      document.getElementById("script-ran").textContent = "script ran";
      // A handler that stops propagation must not let its link leave the page.
      document.getElementById("stopped").addEventListener("click", (event) => event.stopPropagation());
      let hashChanges = 0;
      window.addEventListener("hashchange", () => {
        hashChanges += 1;
        document.getElementById("hash-count").textContent = String(hashChanges);
      });
      try {
        void window.parent.document.title;
        document.getElementById("parent-access").textContent = "parent reachable";
      } catch (error) {
        document.getElementById("parent-access").textContent = "parent blocked";
      }
    </script>
  </body>
</html>`;

async function openPreview(page: Page) {
  await page.goto("/?stavePreview=composer-frame&case=idle", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("textbox", { name: "Prompt" })).toBeVisible();
}

test("renders an HTML file in an isolated frame that cannot navigate away", async ({ page }) => {
  await openPreview(page);
  await page.evaluate(async ({ modules, html }) => {
    const { default: React } = await import(modules.react);
    const { default: { createRoot } } = await import(modules.client);
    const { EditorHtmlPreview } = await import(modules.htmlPreview);
    const host = document.createElement("div");
    host.id = "html-preview-host";
    host.style.cssText = "position: fixed; inset: 0; z-index: 10000;";
    document.body.append(host);
    (window as unknown as { saves: number }).saves = 0;
    createRoot(host).render(React.createElement(EditorHtmlPreview, {
      content: html,
      frameTitle: "index.html",
      "data-testid": "editor-html-preview",
      onSaveShortcut: () => {
        (window as unknown as { saves: number }).saves += 1;
      },
    }));
  }, { modules: MODULES, html: PAGE });

  const frame = page.frameLocator('[data-testid="editor-html-preview"] iframe[title="index.html"]');
  await expect(frame.locator("#title")).toHaveText("Hello preview");
  await expect(frame.locator("#script-ran")).toHaveText("script ran");
  await expect(frame.locator("#parent-access")).toHaveText("parent blocked");

  // The frame fills the preview host.
  const box = await page.locator('[data-testid="editor-html-preview"] iframe').boundingBox();
  const viewport = page.viewportSize();
  expect(box?.width).toBe(viewport?.width);
  expect(box?.height).toBe(viewport?.height);

  const frameUrl = () => page.frames().find((item) => item !== page.mainFrame())?.url();

  // Links that leave the page are cancelled, even when a page handler stops
  // the click's propagation; the preview stays on the file.
  await frame.locator("#external").click();
  await frame.locator("#relative").click();
  await frame.locator("#stopped").click();
  await page.waitForTimeout(300);
  await expect(frame.locator("#title")).toHaveText("Hello preview");
  expect(frameUrl()).toBe("about:srcdoc");

  // In-page fragment links move within the srcdoc document (a srcdoc frame
  // would otherwise resolve `#bottom` against the app's URL), so the page
  // scrolls and gets its hashchange, as it would in a browser tab.
  await frame.locator("#fragment").click();
  await expect(frame.locator("#bottom")).toBeInViewport();
  expect(frameUrl()).toBe("about:srcdoc#bottom");
  await expect(frame.locator("#hash-count")).toHaveText("1");

  // Following the same fragment again scrolls back to it.
  await frame.locator("body").evaluate(() => window.scrollTo(0, 0));
  await expect(frame.locator("#bottom")).not.toBeInViewport();
  await frame.locator("#fragment").click();
  await expect(frame.locator("#bottom")).toBeInViewport();

  // A `#` link the page handles itself does not move the page.
  await frame.locator("#widget").click();
  await expect(frame.locator("#widget-state")).toHaveText("widget toggled");
  expect(frameUrl()).toBe("about:srcdoc#bottom");
  await expect(frame.locator("#hash-count")).toHaveText("1");

  // Cmd/Ctrl+S inside the page reaches the editor's save.
  const saves = () => page.evaluate(() => (window as unknown as { saves: number }).saves);
  await frame.locator("#title").click();
  await page.keyboard.press("ControlOrMeta+s");
  await expect.poll(saves).toBe(1);

  // A page script cannot save while the user is elsewhere: neither after the
  // app window loses focus with the frame still its active element (the user
  // switched apps), nor after focus moves off the frame.
  const postSaveFromPage = () =>
    frame.locator("body").evaluate((_body, type) => {
      window.parent.postMessage({ type }, "*");
    }, "stave:html-file-preview:save");
  await page.evaluate(() => {
    const frameElement = document.querySelector('iframe[title="index.html"]');
    if (document.activeElement !== frameElement) throw new Error("the frame should still hold focus");
    document.hasFocus = () => false;
  });
  await postSaveFromPage();
  await page.waitForTimeout(200);
  expect(await saves()).toBe(1);
  await page.evaluate(() => {
    delete (document as { hasFocus?: unknown }).hasFocus;
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await postSaveFromPage();
  await page.waitForTimeout(200);
  expect(await saves()).toBe(1);
});

test("labels the toolbar toggle for HTML", async ({ page }) => {
  await openPreview(page);
  await page.evaluate(async (modules) => {
    const { default: React } = await import(modules.react);
    const { default: { createRoot } } = await import(modules.client);
    const { EditorSurfaceToolbar } = await import(modules.editorToolbar);
    const noop = () => {};
    const mount = (id: string, previewMode: boolean) => {
      const host = document.createElement("div");
      host.id = id;
      document.body.append(host);
      createRoot(host).render(React.createElement(EditorSurfaceToolbar, {
        tab: { id: "file:index.html", filePath: "index.html", language: "html", content: "<p></p>", isDirty: false },
        absolutePath: "/repo/index.html", tabIsImage: false, previewKind: "html", sendToAgentDisabled: true,
        diffMode: false, previewMode, diffViewMode: "unified", showDiffDisplayControls: false,
        reviewCommentCount: 0, fileReviewCommentCount: 0, canAddReviewComment: false, canSubmitReviewFeedback: false,
        onSave: noop, onToggleDiffMode: noop, onTogglePreviewMode: noop, onChangeDiffViewMode: noop,
        onAddReviewComment: noop, onSubmitReviewFeedback: noop, onSubmitFileReviewFeedback: noop, onSendToAgent: noop,
        onBulkClose: noop, onCopyPath: noop, onCopyRelativePath: noop, onCopyBreadcrumbsPath: noop,
      }));
    };
    mount("html-toolbar-preview", true);
    mount("html-toolbar-source", false);
  }, MODULES);

  const inPreview = page.locator("#html-toolbar-preview").getByTestId("editor-html-preview-toggle");
  await expect(inPreview).toHaveAttribute("aria-label", "Show HTML Source");
  await expect(inPreview).toHaveAttribute("aria-pressed", "true");
  const inSource = page.locator("#html-toolbar-source").getByTestId("editor-html-preview-toggle");
  await expect(inSource).toHaveAttribute("aria-label", "Show HTML Preview");
  await expect(inSource).toHaveAttribute("aria-pressed", "false");
});

test("each HTML tab keeps its mode in a split, on every activation path, and new tabs open in the last pick", async ({ page }) => {
  await openPreview(page);
  await page.evaluate(async ({ modules, html }) => {
    const { default: React } = await import(modules.react);
    const { default: { createRoot } } = await import(modules.client);
    const { useAppStore } = await import(modules.appStore);
    const { EditorSurfacePanel } = await import(modules.editorPanel);
    useAppStore.getState().updateSettings({ patch: { editorHtmlViewMode: "preview" } });
    await useAppStore.getState().openFileFromTree({ filePath: "fixture-preview.html", fallbackContent: html });
    await useAppStore.getState().openFileFromTree({ filePath: "NOTES.md", fallbackContent: "# Notes heading\n" });
    const mount = (id: string, editorTabId: string, side: "left" | "right") => {
      const host = document.createElement("div");
      host.id = id;
      host.style.cssText = `position: fixed; top: 0; bottom: 0; ${side}: 0; width: 50%; z-index: 10000; display: flex; flex-direction: column;`;
      document.body.append(host);
      const api = {
        id: `editor:${editorTabId}`,
        isVisible: true,
        onDidVisibilityChange: () => ({ dispose: () => {} }),
      };
      createRoot(host).render(React.createElement(EditorSurfacePanel, { api } as never));
    };
    mount("html-editor-host", "file:fixture-preview.html", "left");
    mount("markdown-editor-host", "file:NOTES.md", "right");
  }, { modules: MODULES, html: PAGE });

  const htmlPanel = page.locator("#html-editor-host");
  const markdownPanel = page.locator("#markdown-editor-host");
  const htmlToggle = htmlPanel.getByTestId("editor-html-preview-toggle");
  const htmlFrame = htmlPanel.frameLocator('iframe[title="fixture-preview.html"]');
  const clickPaneTab = (editorTabId: string) =>
    page.evaluate(async ({ modules, editorTabId }) => {
      const { useAppStore } = await import(modules.appStore);
      // The path a Dockview tab click takes.
      useAppStore.getState().setActiveSurfaceFromPane({ kind: "editor", editorTabId });
    }, { modules: MODULES, editorTabId });
  const expectHtmlSource = async () => {
    await expect(htmlPanel.locator("iframe")).toHaveCount(0);
    await expect(htmlToggle).toHaveAttribute("aria-pressed", "false");
    await expect(htmlPanel.locator(".monaco-editor")).toBeVisible();
  };

  // The markdown tab is active; the HTML panel beside it still shows its page.
  await expect(markdownPanel.getByTestId("editor-markdown-preview")).toBeVisible();
  await expect(htmlFrame.locator("#title")).toHaveText("Hello preview");
  await expect(htmlToggle).toHaveAttribute("aria-pressed", "true");

  // Switching the HTML tab to source keeps it there across pane tab clicks,
  // whether or not it is the active tab.
  await htmlToggle.click();
  await expectHtmlSource();
  await clickPaneTab("file:NOTES.md");
  await expect(markdownPanel.getByTestId("editor-markdown-preview")).toBeVisible();
  await expectHtmlSource();
  await clickPaneTab("file:fixture-preview.html");
  await expectHtmlSource();

  // Back to preview, which also stays while markdown is active and in source.
  await htmlToggle.click();
  await expect(htmlFrame.locator("#title")).toHaveText("Hello preview");
  await clickPaneTab("file:NOTES.md");
  await markdownPanel.getByTestId("editor-markdown-preview-toggle").click();
  await expect(markdownPanel.getByTestId("editor-markdown-preview")).toHaveCount(0);
  await expect(htmlFrame.locator("#title")).toHaveText("Hello preview");
  await expect(htmlToggle).toHaveAttribute("aria-pressed", "true");

  // The last pick is how the HTML file opens next time.
  await htmlToggle.click();
  await expectHtmlSource();
  const reopened = await page.evaluate(async (modules) => {
    const { useAppStore } = await import(modules.appStore);
    useAppStore.getState().closeEditorTab({ tabId: "file:fixture-preview.html" });
    await useAppStore.getState().openFileFromTree({ filePath: "fixture-preview.html", fallbackContent: "<p>again</p>" });
    const state = useAppStore.getState();
    return {
      remembered: state.settings.editorHtmlViewMode,
      tabMode: state.editorTabs.find((tab: { id: string }) => tab.id === "file:fixture-preview.html")?.htmlViewMode,
    };
  }, MODULES);
  expect(reopened).toEqual({ remembered: "source", tabMode: "source" });
  await expectHtmlSource();
});
