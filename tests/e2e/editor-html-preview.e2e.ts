import { expect, test, type Page } from "@playwright/test";

/**
 * The rendered view of an `.html` editor tab, in a real browser: the page
 * renders and runs its scripts, stays walled off from the app, and cannot
 * follow a link out of the preview. The toolbar toggle names the HTML mode.
 * Each case mounts the component on the dev preview's own module instances.
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
    <a id="fragment" href="#bottom">Down</a>
    <div style="height: 3000px"></div>
    <p id="bottom">Bottom</p>
    <script>
      document.getElementById("script-ran").textContent = "script ran";
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
    createRoot(host).render(React.createElement(EditorHtmlPreview, {
      content: html,
      frameTitle: "index.html",
      "data-testid": "editor-html-preview",
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

  // Links that leave the page are cancelled; the preview stays on the file.
  await frame.locator("#external").click();
  await frame.locator("#relative").click();
  await page.waitForTimeout(300);
  await expect(frame.locator("#title")).toHaveText("Hello preview");
  const frameUrl = page.frames().find((item) => item !== page.mainFrame())?.url();
  expect(frameUrl).toBe("about:srcdoc");

  // In-page fragment links still scroll, without leaving the document: a
  // srcdoc frame would otherwise resolve `#bottom` against the app's URL.
  await frame.locator("#fragment").click();
  await expect(frame.locator("#bottom")).toBeInViewport();
  expect(page.frames().find((item) => item !== page.mainFrame())?.url()).toBe("about:srcdoc");
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

test("opens HTML in preview, then in the last mode the user picked", async ({ page }) => {
  await openPreview(page);
  await page.evaluate(async ({ modules, html }) => {
    const { default: React } = await import(modules.react);
    const { default: { createRoot } } = await import(modules.client);
    const { useAppStore } = await import(modules.appStore);
    const { EditorSurfacePanel } = await import(modules.editorPanel);
    useAppStore.getState().updateSettings({ patch: { editorHtmlViewMode: "preview" } });
    await useAppStore.getState().openFileFromTree({ filePath: "fixture-preview.html", fallbackContent: html });
    const host = document.createElement("div");
    host.id = "html-editor-host";
    host.style.cssText = "position: fixed; inset: 0; z-index: 10000; display: flex; flex-direction: column;";
    document.body.append(host);
    const api = {
      id: "editor:file:fixture-preview.html",
      isVisible: true,
      onDidVisibilityChange: () => ({ dispose: () => {} }),
    };
    createRoot(host).render(React.createElement(EditorSurfacePanel, { api } as never));
  }, { modules: MODULES, html: PAGE });

  const editor = page.locator("#html-editor-host");
  const toggle = editor.getByTestId("editor-html-preview-toggle");
  const frame = editor.frameLocator('iframe[title="fixture-preview.html"]');
  await expect(frame.locator("#title")).toHaveText("Hello preview");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  await toggle.click();
  await expect(editor.locator("iframe")).toHaveCount(0);
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(editor.locator(".monaco-editor")).toBeVisible();

  const reopened = await page.evaluate(async (modules) => {
    const { useAppStore } = await import(modules.appStore);
    const store = useAppStore.getState();
    const mode = store.settings.editorHtmlViewMode;
    store.closeEditorTab({ tabId: "file:fixture-preview.html" });
    await useAppStore.getState().openFileFromTree({ filePath: "fixture-preview.html", fallbackContent: "<p>again</p>" });
    return { mode, preview: useAppStore.getState().layout.editorMarkdownPreviewMode };
  }, MODULES);
  expect(reopened).toEqual({ mode: "source", preview: false });
});
