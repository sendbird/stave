import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

type FsApiResult<T> = Promise<T>;

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
}

const originalWindow = (globalThis as { window?: unknown }).window;

function createMemoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    },
  };
}

function buildRevision(args: { size: number; mtimeMs: number }) {
  return `node:${args.size}:${Math.floor(args.mtimeMs)}`;
}

async function createFsApi(args: { rootPath: string; filePath: string }) {
  function resolveRequestedFilePath(requestedFilePath: string) {
    const normalizedPath = requestedFilePath
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\.\/+/, "")
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");
    if (!normalizedPath || normalizedPath !== args.filePath) {
      return null;
    }
    return path.join(args.rootPath, normalizedPath);
  }

  async function readWithRevision() {
    const fullPath = path.join(args.rootPath, args.filePath);
    const [content, fileStat] = await Promise.all([
      readFile(fullPath, "utf8"),
      stat(fullPath),
    ]);
    return {
      content,
      revision: buildRevision({
        size: fileStat.size,
        mtimeMs: fileStat.mtimeMs,
      }),
    };
  }

  return {
    pickRoot: async () => ({
      ok: true,
      rootPath: args.rootPath,
      rootName: "fixture",
      files: [args.filePath],
    }),
    listFiles: async () => ({ ok: true, files: [args.filePath] }),
    readFile: async (req: { rootPath: string; filePath: string }) => {
      if (req.rootPath !== args.rootPath || !resolveRequestedFilePath(req.filePath)) {
        return { ok: false, content: "", revision: "" };
      }
      const file = await readWithRevision();
      return { ok: true, content: file.content, revision: file.revision };
    },
    writeFile: async (req: {
      rootPath: string;
      filePath: string;
      content: string;
      expectedRevision?: string | null;
    }) => {
      const fullPath = resolveRequestedFilePath(req.filePath);
      if (req.rootPath !== args.rootPath || !fullPath) {
        return { ok: false };
      }
      const current = await readWithRevision();
      if (req.expectedRevision && req.expectedRevision !== current.revision) {
        return { ok: false, conflict: true, revision: current.revision };
      }
      await writeFile(fullPath, req.content, "utf8");
      const next = await readWithRevision();
      return { ok: true, revision: next.revision };
    },
  };
}

async function setupStore(args: {
  rootPath: string;
  filePath: string;
  fix?: (request: { text: string }) => Promise<{ ok: boolean; output: string }>;
}) {
  const localStorage = createMemoryStorage();
  const fsApi = await createFsApi(args);
  (globalThis as { window?: unknown }).window = {
    localStorage,
    api: {
      fs: fsApi,
      eslint: { fix: args.fix },
    },
  };

  const [{ workspaceFsAdapter }, { useAppStore }] = await Promise.all([
    import("../src/lib/fs"),
    import("../src/store/app.store"),
  ]);

  await (
    workspaceFsAdapter as {
      setRoot?: (args: {
        rootPath: string;
        rootName: string;
        files: string[];
      }) => Promise<void>;
    }
  ).setRoot?.({
    rootPath: args.rootPath,
    rootName: "fixture",
    files: [args.filePath],
  });

  useAppStore.setState((state) => ({
    ...state,
    workspaces: [
      { id: "ws-main", name: "main", updatedAt: new Date().toISOString() },
    ],
    activeWorkspaceId: "ws-main",
    repositoryPath: args.rootPath,
    workspacePathById: { "ws-main": args.rootPath },
    workspaceBranchById: { "ws-main": "main" },
    workspaceDefaultById: { "ws-main": true },
    layout: {
      ...state.layout,
      editorDiffMode: false,
      editorMarkdownPreviewMode: false,
    },
    editorTabs: [],
    activeEditorTabId: null,
  }));

  return { fsApi, useAppStore };
}

beforeEach(() => {
  (globalThis as { window?: unknown }).window = undefined;
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("editor async save and refresh", () => {
  const filePath = "note.ts";
  const tabId = `file:${filePath}`;
  const initial = "const initial = true;\n";
  const draft = "const draft=true\n";
  const newerDraft = `${draft}const newer = true;\n`;
  let rootPath: string;

  beforeEach(async () => {
    rootPath = await mkdtemp(path.join(tmpdir(), "stave-editor-race-"));
    await writeFile(path.join(rootPath, filePath), initial);
  });

  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true });
  });

  async function open(fix?: Parameters<typeof setupStore>[0]["fix"]) {
    const { fsApi, useAppStore } = await setupStore({ rootPath, filePath, fix });
    const state = useAppStore.getState;
    state().updateSettings({
      patch: { editorFormatOnSave: Boolean(fix), editorEslintEnabled: Boolean(fix) },
    });
    await state().openFileFromTree({ filePath });
    return {
      fsApi,
      state,
      setState: useAppStore.setState,
      tab: () => state().editorTabs.find((tab) => tab.id === tabId)!,
      edit: (content: string) => state().updateEditorContent({ tabId, content }),
      readDisk: () => readFile(path.join(rootPath, filePath), "utf8"),
    };
  }

  function pauseNextRead(fsApi: Awaited<ReturnType<typeof setupStore>>["fsApi"]) {
    const read = fsApi.readFile;
    const started = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    fsApi.readFile = async (request) => {
      fsApi.readFile = read;
      const result = await read(request);
      started.resolve();
      await resume.promise;
      return result;
    };
    return { started: started.promise, resume: resume.resolve };
  }

  test("discards a format result if typing changed the draft while formatting", async () => {
    const formatted = Promise.withResolvers<{ ok: boolean; output: string }>();
    const invoked = Promise.withResolvers<string>();
    const { state, tab, edit, readDisk } = await open(({ text }) => {
      invoked.resolve(text);
      return formatted.promise;
    });
    edit(draft);
    const save = state().saveActiveEditorTab();
    expect(await invoked.promise).toBe(draft);
    edit(newerDraft);
    formatted.resolve({ ok: true, output: "const draft = true;\n" });

    expect(await save).toEqual({ ok: true });
    expect(await readDisk()).toBe(draft);
    expect(tab()).toMatchObject({
      content: newerDraft,
      originalContent: draft,
      savedContent: draft,
      isDirty: true,
    });
  });

  test("shows the formatted text once the unchanged draft is written", async () => {
    const formatted = "const draft = true;\n";
    const { state, tab, edit, readDisk } = await open(async () => ({
      ok: true,
      output: formatted,
    }));
    edit(draft);

    expect(await state().saveActiveEditorTab()).toEqual({ ok: true });
    expect(await readDisk()).toBe(formatted);
    expect(tab()).toMatchObject({
      content: formatted,
      originalContent: formatted,
      savedContent: formatted,
      isDirty: false,
    });
  });

  test.each([false, true])("acknowledges the exact write while typing and switching tabs (format: %s)", async (format) => {
    const formatted = "const draft = true;\n";
    const { fsApi, state, tab, edit, readDisk } = await open(
      format ? async () => ({ ok: true, output: formatted }) : undefined,
    );
    const write = fsApi.writeFile;
    const written = Promise.withResolvers<Awaited<ReturnType<typeof write>>>();
    const resume = Promise.withResolvers<void>();
    fsApi.writeFile = async (request) => {
      const result = await write(request);
      written.resolve(result);
      await resume.promise;
      return result;
    };
    edit(draft);
    const save = state().saveActiveEditorTab();
    const { revision } = await written.promise;
    edit(newerDraft);
    const otherPath = "other.ts";
    await state().openFileFromTree({ filePath: otherPath, fallbackContent: "other draft" });
    const otherTab = state().editorTabs.find((tab) => tab.filePath === otherPath);
    resume.resolve();

    const expected = format ? formatted : draft;
    expect(await save).toEqual({ ok: true });
    expect(await readDisk()).toBe(expected);
    expect(tab()).toMatchObject({
      content: newerDraft,
      originalContent: expected,
      savedContent: expected,
      baseRevision: revision,
      isDirty: true,
    });
    expect(state().activeEditorTabId).toBe(otherTab?.id);
    expect(state().editorTabs.find((tab) => tab.id === otherTab?.id)).toBe(otherTab);
  });

  test("flags the disk revision without replacing edits made during the poll", async () => {
    const { fsApi, state, tab, edit } = await open();
    const baseRevision = tab().baseRevision;
    await writeFile(path.join(rootPath, filePath), "external change\n");
    const { revision } = await fsApi.readFile({ rootPath, filePath });
    const read = pauseNextRead(fsApi);
    const poll = state().checkOpenTabConflicts();
    await read.started;
    edit(draft);
    read.resume();
    await poll;

    expect(tab()).toMatchObject({
      content: draft,
      originalContent: initial,
      baseRevision,
      conflictRevision: revision,
      isDirty: true,
      hasConflict: true,
    });
  });

  test("ignores a poll response that predates a completed save", async () => {
    const { fsApi, state, tab, edit } = await open();
    await writeFile(path.join(rootPath, filePath), "external change\n");
    const read = pauseNextRead(fsApi);
    const poll = state().checkOpenTabConflicts();
    await read.started;
    // A second poll applies the disk change before this response arrives.
    await state().checkOpenTabConflicts();
    edit(draft);
    expect(await state().saveActiveEditorTab()).toEqual({ ok: true });
    const savedRevision = tab().baseRevision;
    // A later edit stays based on the revision acknowledged by the save.
    edit(newerDraft);
    read.resume();
    await poll;

    expect(tab()).toMatchObject({
      content: newerDraft,
      baseRevision: savedRevision,
      hasConflict: false,
      isDirty: true,
    });
  });

  test("ignores a poll response after switching to a workspace with the same tab id", async () => {
    const { fsApi, state, setState, tab } = await open();
    await writeFile(path.join(rootPath, filePath), "external change\n");
    const read = pauseNextRead(fsApi);
    const poll = state().checkOpenTabConflicts();
    await read.started;
    const otherTab = { ...tab(), content: "other workspace" };
    setState({ activeWorkspaceId: "ws-other", editorTabs: [otherTab] });
    read.resume();
    await poll;

    expect(tab()).toBe(otherTab);
  });

  test("keeps edits made while resolving a conflict with Reload", async () => {
    const { fsApi, state, tab, edit } = await open();
    edit(draft);
    await writeFile(path.join(rootPath, filePath), "external change\n");
    await state().checkOpenTabConflicts();
    const read = pauseNextRead(fsApi);
    const reload = state().resolveEditorTabConflict({ tabId, resolution: "reload" });
    await read.started;
    edit(newerDraft);
    read.resume();

    expect(await reload).toEqual({ ok: false });
    expect(tab()).toMatchObject({ content: newerDraft, isDirty: true, hasConflict: true });
  });

  test("keeps the captured write scoped to its workspace when the adapter root moves", async () => {
    const { state, tab, edit, readDisk } = await open();
    const { workspaceFsAdapter } = await import("../src/lib/fs");
    edit(draft);
    const save = state().saveActiveEditorTab();
    // Workspace switching prepares the adapter before installing the new state.
    await workspaceFsAdapter.setRoot({ rootPath: path.join(rootPath, "other"), rootName: "other" });

    expect(await save).toEqual({ ok: true });
    expect(await readDisk()).toBe(draft);
    expect(tab()).toMatchObject({ savedContent: draft, isDirty: false });
    expect(workspaceFsAdapter.getRootPath()).toBe(path.join(rootPath, "other"));
  });

  test("preserves an undo to the old base while the write and its revision are pending", async () => {
    const { fsApi, state, tab, edit, readDisk } = await open();
    const write = fsApi.writeFile;
    const written = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    fsApi.writeFile = async (request) => {
      fsApi.writeFile = write;
      const result = await write(request);
      written.resolve();
      await resume.promise;
      return result;
    };
    edit(draft);
    const save = state().saveActiveEditorTab();
    await written.promise;
    edit(initial);
    const overlappingSave = await state().saveActiveEditorTab();
    await state().checkOpenTabConflicts();
    resume.resolve();

    expect(overlappingSave).toEqual({ ok: false });
    expect(await save).toEqual({ ok: true });
    expect(await readDisk()).toBe(draft);
    expect(tab()).toMatchObject({
      content: initial,
      savedContent: draft,
      isDirty: true,
      hasConflict: false,
    });
  });
});

describe("editor save/conflict behavior", () => {
  test("opens markdown files in preview mode by default", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "stave-editor-"));
    const filePath = "README.md";
    await writeFile(path.join(rootPath, filePath), "# Hello\n", "utf8");

    const { useAppStore } = await setupStore({ rootPath, filePath });
    await useAppStore.getState().openFileFromTree({ filePath });

    expect(useAppStore.getState().layout.editorMarkdownPreviewMode).toBe(true);
    expect(useAppStore.getState().layout.editorDiffMode).toBe(false);

    useAppStore.getState().toggleEditorMarkdownPreviewMode();
    expect(useAppStore.getState().layout.editorMarkdownPreviewMode).toBe(false);

    await useAppStore.getState().openFileFromTree({ filePath });
    expect(useAppStore.getState().layout.editorMarkdownPreviewMode).toBe(true);
    expect(useAppStore.getState().editorTabs).toHaveLength(1);
  });

  test("opens HTML files in preview by default and remembers the last choice", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "stave-editor-"));
    const filePath = "index.html";
    const tabId = `file:${filePath}`;
    await writeFile(path.join(rootPath, filePath), "<h1>Hello</h1>\n", "utf8");

    const { useAppStore } = await setupStore({ rootPath, filePath });
    const htmlMode = () =>
      useAppStore.getState().editorTabs.find((tab) => tab.id === tabId)?.htmlViewMode;
    useAppStore.getState().updateSettings({ patch: { editorHtmlViewMode: "preview" } });
    await useAppStore.getState().openFileFromTree({ filePath });
    expect(htmlMode()).toBe("preview");

    // Switching to source is remembered for the next open, even after a close.
    useAppStore.getState().toggleEditorMarkdownPreviewMode();
    expect(htmlMode()).toBe("source");
    expect(useAppStore.getState().settings.editorHtmlViewMode).toBe("source");
    useAppStore.getState().closeEditorTab({ tabId });
    await useAppStore.getState().openFileFromTree({ filePath });
    expect(htmlMode()).toBe("source");

    // Opening a tab that is already open keeps what it shows.
    await useAppStore.getState().openFileFromTree({ filePath });
    expect(htmlMode()).toBe("source");

    // And switching back to preview is remembered the same way.
    useAppStore.getState().setEditorTabHtmlViewMode({ tabId, mode: "preview" });
    expect(useAppStore.getState().settings.editorHtmlViewMode).toBe("preview");
    useAppStore.getState().closeEditorTab({ tabId });
    await useAppStore.getState().openFileFromTree({ filePath });
    expect(htmlMode()).toBe("preview");
  });

  test("keeps each HTML tab's mode on every tab switch path, including a pane tab click", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "stave-editor-"));
    const filePath = "index.html";
    const htmlTabId = `file:${filePath}`;
    const markdownTabId = "file:README.md";
    await writeFile(path.join(rootPath, filePath), "<h1>Hello</h1>\n", "utf8");

    const { useAppStore } = await setupStore({ rootPath, filePath });
    const htmlMode = () =>
      useAppStore.getState().editorTabs.find((tab) => tab.id === htmlTabId)?.htmlViewMode;
    const clickPaneTab = (editorTabId: string) =>
      useAppStore.getState().setActiveSurfaceFromPane({ kind: "editor", editorTabId });
    useAppStore.getState().updateSettings({ patch: { editorHtmlViewMode: "preview" } });
    await useAppStore.getState().openFileFromTree({ filePath });
    useAppStore.getState().setEditorTabHtmlViewMode({ tabId: htmlTabId, mode: "source" });

    // Markdown keeps opening in preview and does not touch the HTML choice.
    await useAppStore.getState().openFileFromTree({
      filePath: "README.md",
      fallbackContent: "# Notes\n",
    });
    expect(useAppStore.getState().layout.editorMarkdownPreviewMode).toBe(true);

    // Source stays source when the HTML tab is clicked from a markdown preview.
    clickPaneTab(htmlTabId);
    expect(useAppStore.getState().activeEditorTabId).toBe(htmlTabId);
    expect(htmlMode()).toBe("source");

    // Preview stays preview when the HTML tab is clicked from markdown source.
    useAppStore.getState().setEditorTabHtmlViewMode({ tabId: htmlTabId, mode: "preview" });
    clickPaneTab(markdownTabId);
    useAppStore.getState().toggleEditorMarkdownPreviewMode();
    expect(useAppStore.getState().layout.editorMarkdownPreviewMode).toBe(false);
    expect(useAppStore.getState().settings.editorHtmlViewMode).toBe("preview");
    clickPaneTab(htmlTabId);
    expect(htmlMode()).toBe("preview");
    useAppStore.getState().setActiveEditorTab({ tabId: markdownTabId });
    useAppStore.getState().setActiveEditorTab({ tabId: htmlTabId });
    expect(htmlMode()).toBe("preview");

    // Closing the HTML tab falls back to markdown, which keeps its flag as is.
    useAppStore.getState().closeEditorTab({ tabId: htmlTabId });
    expect(useAppStore.getState().activeEditorTabId).toBe(markdownTabId);
    expect(useAppStore.getState().layout.editorMarkdownPreviewMode).toBe(false);
  });

  test("a pane tab click shows the clicked tab's own diff mode", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "stave-editor-"));
    const filePath = "index.html";
    await writeFile(path.join(rootPath, filePath), "<h1>Hello</h1>\n", "utf8");

    const { useAppStore } = await setupStore({ rootPath, filePath });
    await useAppStore.getState().openFileFromTree({ filePath });
    await useAppStore.getState().openDiffInEditor({
      editorTabId: "scm-diff:index.html",
      filePath,
      oldContent: "<h1>Before</h1>\n",
      newContent: "<h1>Hello</h1>\n",
    });
    expect(useAppStore.getState().layout.editorDiffMode).toBe(true);
    // Leaving an HTML diff lands on its source, as a markdown diff does.
    expect(
      useAppStore.getState().editorTabs.find((tab) => tab.id === "scm-diff:index.html")?.htmlViewMode,
    ).toBe("source");

    useAppStore.getState().setActiveSurfaceFromPane({ kind: "editor", editorTabId: `file:${filePath}` });
    expect(useAppStore.getState().layout.editorDiffMode).toBe(false);
    useAppStore.getState().setActiveSurfaceFromPane({ kind: "editor", editorTabId: "scm-diff:index.html" });
    expect(useAppStore.getState().layout.editorDiffMode).toBe(true);
    expect(useAppStore.getState().layout.editorMarkdownPreviewMode).toBe(false);

    // Re-reporting the tab that is already active changes nothing.
    useAppStore.getState().toggleEditorDiffMode();
    useAppStore.getState().setActiveSurfaceFromPane({ kind: "editor", editorTabId: "scm-diff:index.html" });
    expect(useAppStore.getState().layout.editorDiffMode).toBe(false);
  });

  test("keeps markdown preview and diff mode mutually exclusive", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "stave-editor-"));
    const filePath = "README.md";
    await writeFile(path.join(rootPath, filePath), "# Hello\n", "utf8");

    const { useAppStore } = await setupStore({ rootPath, filePath });
    await useAppStore.getState().openFileFromTree({ filePath });

    expect(useAppStore.getState().layout.editorMarkdownPreviewMode).toBe(true);
    expect(useAppStore.getState().layout.editorDiffMode).toBe(false);

    await useAppStore.getState().openDiffInEditor({
      editorTabId: "scm-diff:README.md",
      filePath,
      oldContent: "# Before\n",
      newContent: "# After\n",
    });
    expect(useAppStore.getState().layout.editorDiffMode).toBe(true);
    expect(useAppStore.getState().layout.editorMarkdownPreviewMode).toBe(false);

    useAppStore.getState().toggleEditorMarkdownPreviewMode();
    expect(useAppStore.getState().layout.editorMarkdownPreviewMode).toBe(true);
    expect(useAppStore.getState().layout.editorDiffMode).toBe(false);
  });

  // Uses `scm-diff:`, an editable diff scheme. A `chat-diff:` tab is a frozen
  // snapshot and renders read-only, so it can never reach an edited state.
  test("keeps an editable diff tab clean until the modified side actually changes", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "stave-editor-"));
    const filePath = "note.txt";
    const fullPath = path.join(rootPath, filePath);
    await writeFile(fullPath, "after\n", "utf8");

    const { useAppStore } = await setupStore({ rootPath, filePath });
    await useAppStore.getState().openDiffInEditor({
      editorTabId: "scm-diff:note.txt",
      filePath,
      oldContent: "before\n",
      newContent: "after\n",
    });

    let tab = useAppStore
      .getState()
      .editorTabs.find((item) => item.id === "scm-diff:note.txt");
    expect(tab?.isDirty).toBe(false);

    useAppStore
      .getState()
      .updateEditorContent({
        tabId: "scm-diff:note.txt",
        content: "after\n",
      });
    tab = useAppStore
      .getState()
      .editorTabs.find((item) => item.id === "scm-diff:note.txt");
    expect(tab?.isDirty).toBe(false);

    useAppStore
      .getState()
      .updateEditorContent({
        tabId: "scm-diff:note.txt",
        content: "after plus edit\n",
      });
    tab = useAppStore
      .getState()
      .editorTabs.find((item) => item.id === "scm-diff:note.txt");
    expect(tab?.isDirty).toBe(true);
  });

  test("refreshes an existing clean diff tab when the same diff id is reopened", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "stave-editor-"));
    const filePath = "note.txt";
    await writeFile(path.join(rootPath, filePath), "after\n", "utf8");

    const { useAppStore } = await setupStore({ rootPath, filePath });
    await useAppStore.getState().openDiffInEditor({
      editorTabId: "scm-diff:note.txt",
      filePath,
      oldContent: "before\n",
      newContent: "after\n",
    });

    // The modified side of an SCM diff is the file on disk, so a reopen that
    // reports new content only happens after the file itself changed. Leaving
    // the old bytes on disk would ask the tab to show content the file does not
    // have, which is the stale anchor this suite guards against elsewhere.
    await writeFile(path.join(rootPath, filePath), "after again\n", "utf8");
    await useAppStore.getState().openDiffInEditor({
      editorTabId: "scm-diff:note.txt",
      filePath,
      oldContent: "before again\n",
      newContent: "after again\n",
    });

    const tab = useAppStore
      .getState()
      .editorTabs.find((item) => item.id === "scm-diff:note.txt");
    expect(tab?.originalContent).toBe("before again\n");
    expect(tab?.content).toBe("after again\n");
    expect(tab?.savedContent).toBe("after again\n");
    expect(tab?.isDirty).toBe(false);
  });

  test("preserves dirty diff tab edits when the same diff id is reopened", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "stave-editor-"));
    const filePath = "note.txt";
    await writeFile(path.join(rootPath, filePath), "after\n", "utf8");

    const { useAppStore } = await setupStore({ rootPath, filePath });
    await useAppStore.getState().openDiffInEditor({
      editorTabId: "scm-diff:note.txt",
      filePath,
      oldContent: "before\n",
      newContent: "after\n",
    });
    useAppStore.getState().updateEditorContent({
      tabId: "scm-diff:note.txt",
      content: "after with local edit\n",
    });

    await useAppStore.getState().openDiffInEditor({
      editorTabId: "scm-diff:note.txt",
      filePath,
      oldContent: "before again\n",
      newContent: "after again\n",
    });

    const tab = useAppStore
      .getState()
      .editorTabs.find((item) => item.id === "scm-diff:note.txt");
    expect(tab?.originalContent).toBe("before\n");
    expect(tab?.content).toBe("after with local edit\n");
    expect(tab?.isDirty).toBe(true);
  });

  test("marks conflict on stale revision save and keeps dirty content", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "stave-editor-"));
    const filePath = "note.txt";
    const fullPath = path.join(rootPath, filePath);
    await writeFile(fullPath, "alpha\n", "utf8");

    const { useAppStore } = await setupStore({ rootPath, filePath });
    await useAppStore.getState().openFileFromTree({ filePath });
    const opened = useAppStore.getState().editorTabs[0];
    expect(opened).toBeDefined();
    expect(opened.baseRevision).toBeString();

    useAppStore
      .getState()
      .updateEditorContent({ tabId: opened.id, content: "local change\n" });
    await Bun.sleep(5);
    await writeFile(fullPath, "external change\n", "utf8");

    const saved = await useAppStore.getState().saveActiveEditorTab();
    expect(saved.ok).toBe(false);
    expect(saved.conflict).toBe(true);

    const tab = useAppStore
      .getState()
      .editorTabs.find((item) => item.id === opened.id);
    expect(tab?.hasConflict).toBe(true);
    expect(tab?.isDirty).toBe(true);
    expect(tab?.content).toBe("local change\n");
  });

  test("anchors a diff tab to the on-disk revision so a stale save conflicts", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "stave-editor-"));
    const filePath = "note.txt";
    const fullPath = path.join(rootPath, filePath);
    await writeFile(fullPath, "on disk\n", "utf8");

    const { useAppStore } = await setupStore({ rootPath, filePath });
    await useAppStore.getState().openDiffInEditor({
      editorTabId: "scm-diff:note.txt",
      filePath,
      oldContent: "head revision\n",
      newContent: "on disk\n",
    });

    const opened = useAppStore
      .getState()
      .editorTabs.find((item) => item.id === "scm-diff:note.txt");
    expect(opened).toBeDefined();
    expect(opened?.baseRevision).toBeString();

    useAppStore
      .getState()
      .updateEditorContent({
        tabId: "scm-diff:note.txt",
        content: "editor change\n",
      });
    await Bun.sleep(5);
    await writeFile(fullPath, "external change\n", "utf8");

    const saved = await useAppStore.getState().saveActiveEditorTab();
    expect(saved.ok).toBe(false);
    expect(saved.conflict).toBe(true);
    expect(await readFile(fullPath, "utf8")).toBe("external change\n");

    const tab = useAppStore
      .getState()
      .editorTabs.find((item) => item.id === "scm-diff:note.txt");
    expect(tab?.hasConflict).toBe(true);
    expect(tab?.content).toBe("editor change\n");
  });

  test("leaves a dirty diff tab unflagged while the file on disk is unchanged", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "stave-editor-"));
    const filePath = "note.txt";
    await writeFile(path.join(rootPath, filePath), "on disk\n", "utf8");

    const { useAppStore } = await setupStore({ rootPath, filePath });
    await useAppStore.getState().openDiffInEditor({
      editorTabId: "scm-diff:note.txt",
      filePath,
      oldContent: "head revision\n",
      newContent: "on disk\n",
    });
    useAppStore
      .getState()
      .updateEditorContent({
        tabId: "scm-diff:note.txt",
        content: "editor change\n",
      });

    await useAppStore.getState().checkOpenTabConflicts();

    const tab = useAppStore
      .getState()
      .editorTabs.find((item) => item.id === "scm-diff:note.txt");
    expect(tab?.hasConflict).toBe(false);
    expect(tab?.isDirty).toBe(true);
    expect(tab?.content).toBe("editor change\n");
  });

  test("normalizes workspace absolute file paths before opening editor tabs", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "stave-editor-"));
    const filePath = "note.txt";
    await writeFile(path.join(rootPath, filePath), "alpha\n", "utf8");

    const { useAppStore } = await setupStore({ rootPath, filePath });
    await useAppStore
      .getState()
      .openFileFromTree({ filePath: path.join(rootPath, filePath) });

    const opened = useAppStore.getState().editorTabs[0];
    expect(opened).toBeDefined();
    expect(opened?.filePath).toBe(filePath);
    expect(opened?.content).toBe("alpha\n");

    await useAppStore.getState().openFileFromTree({ filePath });
    expect(useAppStore.getState().editorTabs).toHaveLength(1);
  });

  test("opens oversized files as non-editable metadata tabs", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "stave-editor-"));
    const filePath = "large.log";
    await writeFile(path.join(rootPath, filePath), "placeholder\n", "utf8");

    const { useAppStore } = await setupStore({ rootPath, filePath });
    const fsApi = (globalThis as {
      window?: {
        api?: {
          fs?: {
            readFile?: (req: {
              rootPath: string;
              filePath: string;
            }) => FsApiResult<{
              ok: boolean;
              content: string;
              revision: string;
              tooLarge?: boolean;
              sizeBytes?: number;
              maxSizeBytes?: number;
            }>;
          };
        };
      };
    }).window?.api?.fs;
    fsApi!.readFile = async () => ({
      ok: false,
      content: "",
      revision: "node:2097152:1",
      tooLarge: true,
      sizeBytes: 2 * 1024 * 1024,
      maxSizeBytes: 1024 * 1024,
    });

    await useAppStore.getState().openFileFromTree({ filePath });

    const opened = useAppStore.getState().editorTabs[0];
    expect(opened).toBeDefined();
    expect(opened?.filePath).toBe(filePath);
    expect(opened?.content).toBe("");
    expect(opened?.contentState).toBe("too-large");
    expect(opened?.fileSizeBytes).toBe(2 * 1024 * 1024);
    expect(opened?.fileSizeLimitBytes).toBe(1024 * 1024);
    expect(opened?.isDirty).toBe(false);
    expect(await useAppStore.getState().saveActiveEditorTab()).toEqual({
      ok: false,
    });
  });

  test("clears the active editor when the last open tab is closed", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "stave-editor-"));
    const filePath = "note.txt";
    await writeFile(path.join(rootPath, filePath), "alpha\n", "utf8");

    const { useAppStore } = await setupStore({ rootPath, filePath });
    await useAppStore.getState().openFileFromTree({ filePath });

    const opened = useAppStore.getState().editorTabs[0];
    expect(opened).toBeDefined();
    useAppStore.getState().closeEditorTab({ tabId: opened.id });

    expect(useAppStore.getState().editorTabs).toHaveLength(0);
    expect(useAppStore.getState().activeEditorTabId).toBeNull();
  });

  test("refreshes clean tabs from disk and flags dirty tabs as conflict", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "stave-editor-"));
    const filePath = "note.txt";
    const fullPath = path.join(rootPath, filePath);
    await writeFile(fullPath, "initial\n", "utf8");

    const { useAppStore } = await setupStore({ rootPath, filePath });
    await useAppStore.getState().openFileFromTree({ filePath });
    const opened = useAppStore.getState().editorTabs[0];
    expect(opened).toBeDefined();

    await Bun.sleep(5);
    await writeFile(fullPath, "changed on disk\n", "utf8");
    await useAppStore.getState().checkOpenTabConflicts();

    let tab = useAppStore
      .getState()
      .editorTabs.find((item) => item.id === opened.id);
    expect(tab?.hasConflict).toBe(false);
    expect(tab?.isDirty).toBe(false);
    expect(tab?.content).toBe("changed on disk\n");

    useAppStore
      .getState()
      .updateEditorContent({ tabId: opened.id, content: "dirty local edit\n" });
    await Bun.sleep(5);
    await writeFile(fullPath, "changed on disk again\n", "utf8");
    await useAppStore.getState().checkOpenTabConflicts();

    tab = useAppStore
      .getState()
      .editorTabs.find((item) => item.id === opened.id);
    expect(tab?.hasConflict).toBe(true);
    expect(tab?.isDirty).toBe(true);
    expect(tab?.content).toBe("dirty local edit\n");
  });

  test("a second save after a conflict does not overwrite the disk change", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "stave-editor-"));
    const filePath = "note.txt";
    const fullPath = path.join(rootPath, filePath);
    await writeFile(fullPath, "alpha\n", "utf8");

    const { useAppStore } = await setupStore({ rootPath, filePath });
    await useAppStore.getState().openFileFromTree({ filePath });
    const opened = useAppStore.getState().editorTabs[0];
    const startRevision = opened.baseRevision;

    useAppStore
      .getState()
      .updateEditorContent({ tabId: opened.id, content: "local change\n" });
    await Bun.sleep(5);
    await writeFile(fullPath, "agent change\n", "utf8");

    expect(await useAppStore.getState().saveActiveEditorTab()).toEqual({
      ok: false,
      conflict: true,
    });
    // Typing on does not count as a choice.
    useAppStore
      .getState()
      .updateEditorContent({ tabId: opened.id, content: "local change 2\n" });
    expect(await useAppStore.getState().saveActiveEditorTab()).toEqual({
      ok: false,
      conflict: true,
    });

    expect(await readFile(fullPath, "utf8")).toBe("agent change\n");
    const tab = useAppStore
      .getState()
      .editorTabs.find((item) => item.id === opened.id);
    expect(tab?.hasConflict).toBe(true);
    expect(tab?.baseRevision).toBe(startRevision);
    expect(tab?.conflictRevision).toBeString();
    expect(tab?.conflictRevision).not.toBe(startRevision);
    expect(tab?.content).toBe("local change 2\n");
  });

  test("a conflict found by the disk poll also blocks the save", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "stave-editor-"));
    const filePath = "note.txt";
    const fullPath = path.join(rootPath, filePath);
    await writeFile(fullPath, "alpha\n", "utf8");

    const { useAppStore } = await setupStore({ rootPath, filePath });
    await useAppStore.getState().openFileFromTree({ filePath });
    const opened = useAppStore.getState().editorTabs[0];
    const startRevision = opened.baseRevision;

    useAppStore
      .getState()
      .updateEditorContent({ tabId: opened.id, content: "local change\n" });
    await Bun.sleep(5);
    await writeFile(fullPath, "agent change\n", "utf8");
    await useAppStore.getState().checkOpenTabConflicts();

    let tab = useAppStore
      .getState()
      .editorTabs.find((item) => item.id === opened.id);
    expect(tab?.hasConflict).toBe(true);
    expect(tab?.baseRevision).toBe(startRevision);

    // A repeated poll against the same disk version changes nothing.
    const versionBefore = useAppStore.getState().workspaceSnapshotVersion;
    await useAppStore.getState().checkOpenTabConflicts();
    expect(useAppStore.getState().workspaceSnapshotVersion).toBe(versionBefore);

    expect(await useAppStore.getState().saveActiveEditorTab()).toEqual({
      ok: false,
      conflict: true,
    });
    expect(await readFile(fullPath, "utf8")).toBe("agent change\n");
    tab = useAppStore
      .getState()
      .editorTabs.find((item) => item.id === opened.id);
    expect(tab?.content).toBe("local change\n");
  });

  test("Keep mine saves the local copy over the disk version it was shown", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "stave-editor-"));
    const filePath = "note.txt";
    const fullPath = path.join(rootPath, filePath);
    await writeFile(fullPath, "alpha\n", "utf8");

    const { useAppStore } = await setupStore({ rootPath, filePath });
    await useAppStore.getState().openFileFromTree({ filePath });
    const opened = useAppStore.getState().editorTabs[0];

    useAppStore
      .getState()
      .updateEditorContent({ tabId: opened.id, content: "local change\n" });
    await Bun.sleep(5);
    await writeFile(fullPath, "agent change\n", "utf8");
    await useAppStore.getState().saveActiveEditorTab();

    expect(
      await useAppStore
        .getState()
        .resolveEditorTabConflict({ tabId: opened.id, resolution: "keep-mine" }),
    ).toEqual({ ok: true });
    expect(await readFile(fullPath, "utf8")).toBe("local change\n");
    const tab = useAppStore
      .getState()
      .editorTabs.find((item) => item.id === opened.id);
    expect(tab?.hasConflict).toBe(false);
    expect(tab?.conflictRevision).toBeNull();
    expect(tab?.isDirty).toBe(false);
    expect(tab?.savedContent).toBe("local change\n");

    // The tab is back to normal: the next save goes through.
    useAppStore
      .getState()
      .updateEditorContent({ tabId: opened.id, content: "local change 2\n" });
    expect(await useAppStore.getState().saveActiveEditorTab()).toEqual({
      ok: true,
    });
    expect(await readFile(fullPath, "utf8")).toBe("local change 2\n");
  });

  test("Keep mine asks again when the file moved after the conflict", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "stave-editor-"));
    const filePath = "note.txt";
    const fullPath = path.join(rootPath, filePath);
    await writeFile(fullPath, "alpha\n", "utf8");

    const { useAppStore } = await setupStore({ rootPath, filePath });
    await useAppStore.getState().openFileFromTree({ filePath });
    const opened = useAppStore.getState().editorTabs[0];

    useAppStore
      .getState()
      .updateEditorContent({ tabId: opened.id, content: "local change\n" });
    await Bun.sleep(5);
    await writeFile(fullPath, "agent change\n", "utf8");
    await useAppStore.getState().saveActiveEditorTab();
    await Bun.sleep(5);
    await writeFile(fullPath, "agent change, longer\n", "utf8");

    expect(
      await useAppStore
        .getState()
        .resolveEditorTabConflict({ tabId: opened.id, resolution: "keep-mine" }),
    ).toEqual({ ok: false, conflict: true });
    expect(await readFile(fullPath, "utf8")).toBe("agent change, longer\n");
    const tab = useAppStore
      .getState()
      .editorTabs.find((item) => item.id === opened.id);
    expect(tab?.hasConflict).toBe(true);
    expect(tab?.content).toBe("local change\n");
  });

  test("Reload from disk drops the local copy and clears the conflict", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "stave-editor-"));
    const filePath = "note.txt";
    const fullPath = path.join(rootPath, filePath);
    await writeFile(fullPath, "alpha\n", "utf8");

    const { useAppStore } = await setupStore({ rootPath, filePath });
    await useAppStore.getState().openFileFromTree({ filePath });
    const opened = useAppStore.getState().editorTabs[0];

    useAppStore
      .getState()
      .updateEditorContent({ tabId: opened.id, content: "local change\n" });
    await Bun.sleep(5);
    await writeFile(fullPath, "agent change\n", "utf8");
    await useAppStore.getState().saveActiveEditorTab();

    expect(
      await useAppStore
        .getState()
        .resolveEditorTabConflict({ tabId: opened.id, resolution: "reload" }),
    ).toEqual({ ok: true });
    expect(await readFile(fullPath, "utf8")).toBe("agent change\n");
    const tab = useAppStore
      .getState()
      .editorTabs.find((item) => item.id === opened.id);
    expect(tab?.hasConflict).toBe(false);
    expect(tab?.isDirty).toBe(false);
    expect(tab?.content).toBe("agent change\n");
    expect(tab?.savedContent).toBe("agent change\n");

    useAppStore
      .getState()
      .updateEditorContent({ tabId: opened.id, content: "edit on top\n" });
    expect(await useAppStore.getState().saveActiveEditorTab()).toEqual({
      ok: true,
    });
    expect(await readFile(fullPath, "utf8")).toBe("edit on top\n");
  });
});
