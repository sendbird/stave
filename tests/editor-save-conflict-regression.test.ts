import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
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
      if (!resolveRequestedFilePath(req.filePath)) {
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
      if (!fullPath) {
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

async function setupStore(args: { rootPath: string; filePath: string }) {
  const localStorage = createMemoryStorage();
  const fsApi = await createFsApi(args);
  (globalThis as { window?: unknown }).window = {
    localStorage,
    api: {
      fs: fsApi,
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
    projectPath: args.rootPath,
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

  return { useAppStore };
}

beforeEach(() => {
  (globalThis as { window?: unknown }).window = undefined;
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
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
});
