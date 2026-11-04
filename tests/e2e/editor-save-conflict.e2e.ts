import { expect, test, type Page } from "@playwright/test";

/**
 * A save conflict in a real editor surface: the warning banner shows above
 * the editor, Compare opens a Monaco diff of the disk copy against the local
 * copy, and Keep mine / Reload from disk each settle it. The workspace file
 * system is replaced with an in-memory file so the disk side is controlled.
 */
const MODULES = {
  react: "/node_modules/.vite/deps/react.js",
  client: "/node_modules/.vite/deps/react-dom_client.js",
  editorPanel: "/src/components/panes/surfaces/EditorSurfacePanel.tsx",
  appStore: "/src/store/app.store.ts",
  fs: "/src/lib/fs/index.ts",
};

const TAB_ID = "file:conflict.txt";

async function mountConflictedEditor(page: Page) {
  await page.goto("/?stavePreview=composer-frame&case=idle", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("textbox", { name: "Prompt" })).toBeVisible();
  await page.evaluate(async ({ modules, tabId }) => {
    const { default: React } = await import(modules.react);
    const { default: { createRoot } } = await import(modules.client);
    const { useAppStore } = await import(modules.appStore);
    const { workspaceFsAdapter } = await import(modules.fs);
    const { EditorSurfacePanel } = await import(modules.editorPanel);
    const disk = { content: "agent change\n", revision: "r2" };
    (window as unknown as { disk: typeof disk }).disk = disk;
    Object.assign(workspaceFsAdapter, {
      readFile: async () => ({ ...disk }),
      writeFile: async (args: { content: string; expectedRevision?: string | null }) => {
        if (args.expectedRevision && args.expectedRevision !== disk.revision) {
          return { ok: false, conflict: true, revision: disk.revision };
        }
        disk.content = args.content;
        disk.revision = `${disk.revision}+`;
        return { ok: true, revision: disk.revision };
      },
    });
    useAppStore.setState({
      editorTabs: [{
        id: tabId,
        filePath: "conflict.txt",
        language: "plaintext",
        content: "local change\n",
        contentState: "ready",
        originalContent: "alpha\n",
        savedContent: "alpha\n",
        baseRevision: "r1",
        conflictRevision: "r2",
        hasConflict: true,
        isDirty: true,
      }],
      activeEditorTabId: tabId,
    });
    const host = document.createElement("div");
    host.id = "conflict-editor-host";
    host.style.cssText = "position: fixed; inset: 0; z-index: 10000; display: flex; flex-direction: column;";
    document.body.append(host);
    const api = {
      id: `editor:${tabId}`,
      isVisible: true,
      onDidVisibilityChange: () => ({ dispose: () => {} }),
    };
    createRoot(host).render(React.createElement(EditorSurfacePanel, { api } as never));
  }, { modules: MODULES, tabId: TAB_ID });
  return page.locator("#conflict-editor-host");
}

const readDisk = (page: Page) =>
  page.evaluate(() => (window as unknown as { disk: { content: string } }).disk.content);

const readTab = (page: Page) =>
  page.evaluate(async ({ modules, tabId }) => {
    const { useAppStore } = await import(modules.appStore);
    const tab = useAppStore.getState().editorTabs.find((item: { id: string }) => item.id === tabId);
    return { content: tab?.content, hasConflict: tab?.hasConflict, isDirty: tab?.isDirty };
  }, { modules: MODULES, tabId: TAB_ID });

test("a conflicted tab blocks saving, compares, and keeps the local copy on request", async ({ page }) => {
  const panel = await mountConflictedEditor(page);
  const banner = panel.getByTestId("editor-save-conflict");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("This file changed on disk");
  await expect(panel.locator(".monaco-editor").first()).toBeVisible();

  // Saving while unresolved writes nothing and keeps the banner.
  const saved = await page.evaluate(async (modules) => {
    const { useAppStore } = await import(modules.appStore);
    return useAppStore.getState().saveActiveEditorTab();
  }, MODULES);
  expect(saved).toEqual({ ok: false, conflict: true });
  expect(await readDisk(page)).toBe("agent change\n");
  await expect(banner).toBeVisible();

  // Compare shows the disk copy against the local copy, then closes again.
  await banner.getByRole("button", { name: "Compare" }).click();
  await expect(panel.locator(".monaco-diff-editor")).toBeVisible();
  await expect(banner.getByRole("button", { name: "Hide comparison" })).toHaveAttribute("aria-pressed", "true");
  await expect(panel.locator(".monaco-diff-editor")).toContainText("agent change");
  await expect(panel.locator(".monaco-diff-editor")).toContainText("local change");
  await banner.getByRole("button", { name: "Hide comparison" }).click();
  await expect(panel.locator(".monaco-diff-editor")).toHaveCount(0);

  await banner.getByRole("button", { name: "Keep mine" }).click();
  await expect(banner).toHaveCount(0);
  expect(await readDisk(page)).toBe("local change\n");
  expect(await readTab(page)).toEqual({ content: "local change\n", hasConflict: false, isDirty: false });
});

test("Reload from disk replaces the local copy and clears the banner", async ({ page }) => {
  const panel = await mountConflictedEditor(page);
  const banner = panel.getByTestId("editor-save-conflict");
  await banner.getByRole("button", { name: "Reload from disk" }).click();
  await expect(banner).toHaveCount(0);
  expect(await readDisk(page)).toBe("agent change\n");
  expect(await readTab(page)).toEqual({ content: "agent change\n", hasConflict: false, isDirty: false });
  await expect(panel.locator(".monaco-editor").first()).toContainText("agent change");
});
