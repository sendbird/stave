import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

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

describe("commit graph diff tabs and the open-tab conflict poll", () => {
  test("keeps the committed revision on the modified side", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "stave-commit-diff-"));
    const filePath = "note.txt";
    await writeFile(
      path.join(rootPath, filePath),
      "working tree content\n",
      "utf8",
    );

    const { useAppStore } = await setupStore({ rootPath, filePath });
    const { commitGraphDiffTabId } = await import(
      "../src/lib/git-graph/presentation"
    );
    const tabId = commitGraphDiffTabId({ revision: "abc1234", filePath });
    expect(tabId).toBe(`git-graph-diff:abc1234:${filePath}`);
    await useAppStore.getState().openDiffInEditor({
      editorTabId: tabId,
      filePath,
      oldContent: "parent revision\n",
      newContent: "commit revision\n",
    });

    await useAppStore.getState().checkOpenTabConflicts();

    const tab = useAppStore
      .getState()
      .editorTabs.find((item) => item.id === tabId);
    expect(tab?.originalContent).toBe("parent revision\n");
    expect(tab?.content).toBe("commit revision\n");
    expect(tab?.hasConflict).toBe(false);
    expect(tab?.isDirty).toBe(false);
  });

  test("still refreshes working tree diff tabs from disk", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "stave-commit-diff-"));
    const filePath = "note.txt";
    const fullPath = path.join(rootPath, filePath);
    await writeFile(fullPath, "on disk\n", "utf8");

    const { useAppStore } = await setupStore({ rootPath, filePath });
    const { COMMIT_GRAPH_WORKING_TREE_REVISION, commitGraphDiffTabId } =
      await import("../src/lib/git-graph/presentation");
    const tabId = commitGraphDiffTabId({
      revision: COMMIT_GRAPH_WORKING_TREE_REVISION,
      filePath,
    });
    // The modified side of a working tree diff is loaded from disk, so the tab
    // starts in sync with the file and only drifts when the file itself changes.
    await useAppStore.getState().openDiffInEditor({
      editorTabId: tabId,
      filePath,
      oldContent: "head revision\n",
      newContent: "on disk\n",
    });
    await writeFile(fullPath, "changed on disk\n", "utf8");

    await useAppStore.getState().checkOpenTabConflicts();

    const tab = useAppStore
      .getState()
      .editorTabs.find((item) => item.id === tabId);
    expect(tab?.originalContent).toBe("head revision\n");
    expect(tab?.content).toBe("changed on disk\n");
    expect(tab?.hasConflict).toBe(false);
    expect(tab?.isDirty).toBe(false);
  });
});

describe("chat diff tabs and the open-tab conflict poll", () => {
  test("keeps the agent's proposed edit on the modified side", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "stave-chat-diff-"));
    const filePath = "note.txt";
    const fullPath = path.join(rootPath, filePath);
    await writeFile(fullPath, "after the agent edit\n", "utf8");

    const { useAppStore } = await setupStore({ rootPath, filePath });
    const { chatDiffTabId } = await import(
      "../src/lib/editor/snapshot-diff-tabs"
    );
    const tabId = chatDiffTabId({ messageId: "msg-1", index: 0, filePath });
    expect(tabId).toBe(`chat-diff:msg-1:0:${filePath}`);
    await useAppStore.getState().openDiffInEditor({
      editorTabId: tabId,
      filePath,
      oldContent: "before the agent edit\n",
      newContent: "after the agent edit\n",
    });
    // Anything can touch the file after the agent's edit: a later turn, another
    // tool, or the user. The recorded diff must not follow it.
    await writeFile(fullPath, "changed long after the edit\n", "utf8");

    await useAppStore.getState().checkOpenTabConflicts();

    const tab = useAppStore
      .getState()
      .editorTabs.find((item) => item.id === tabId);
    expect(tab?.originalContent).toBe("before the agent edit\n");
    expect(tab?.content).toBe("after the agent edit\n");
    expect(tab?.hasConflict).toBe(false);
    expect(tab?.isDirty).toBe(false);
  });
});

describe("saving a chat diff tab", () => {
  test("refuses to write a recorded snapshot over the working tree file", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "stave-chat-save-"));
    const filePath = "note.txt";
    const fullPath = path.join(rootPath, filePath);
    await writeFile(fullPath, "current working tree\n", "utf8");

    const { useAppStore } = await setupStore({ rootPath, filePath });
    const { chatDiffTabId } = await import(
      "../src/lib/editor/snapshot-diff-tabs"
    );
    const tabId = chatDiffTabId({ messageId: "msg-1", index: 0, filePath });
    // The snapshot is as old as the message. Saving it would silently revert
    // every change made to the file since that turn.
    await useAppStore.getState().openDiffInEditor({
      editorTabId: tabId,
      filePath,
      oldContent: "before the agent edit\n",
      newContent: "after the agent edit\n",
    });

    const result = await useAppStore.getState().saveActiveEditorTab();

    expect(result.ok).toBe(false);
    expect(await readFile(fullPath, "utf8")).toBe("current working tree\n");
  });
});

describe("saving a commit graph diff tab", () => {
  test("refuses to write a committed revision over the working tree file", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "stave-commit-save-"));
    const filePath = "note.txt";
    const fullPath = path.join(rootPath, filePath);
    await writeFile(fullPath, "working tree content\n", "utf8");

    const { useAppStore } = await setupStore({ rootPath, filePath });
    const { commitGraphDiffTabId } = await import(
      "../src/lib/git-graph/presentation"
    );
    const tabId = commitGraphDiffTabId({ revision: "abc1234", filePath });
    await useAppStore.getState().openDiffInEditor({
      editorTabId: tabId,
      filePath,
      oldContent: "parent revision\n",
      newContent: "commit revision\n",
    });

    const result = await useAppStore.getState().saveActiveEditorTab();

    expect(result.ok).toBe(false);
    expect(await readFile(fullPath, "utf8")).toBe("working tree content\n");
  });

  test("still saves a working tree diff tab to disk", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "stave-commit-save-"));
    const filePath = "note.txt";
    const fullPath = path.join(rootPath, filePath);
    await writeFile(fullPath, "on disk\n", "utf8");

    const { useAppStore } = await setupStore({ rootPath, filePath });
    const { COMMIT_GRAPH_WORKING_TREE_REVISION, commitGraphDiffTabId } =
      await import("../src/lib/git-graph/presentation");
    const tabId = commitGraphDiffTabId({
      revision: COMMIT_GRAPH_WORKING_TREE_REVISION,
      filePath,
    });
    // The modified side of a working tree diff opens as the file on disk; the
    // edit the user then types in the editor is what a save has to land.
    await useAppStore.getState().openDiffInEditor({
      editorTabId: tabId,
      filePath,
      oldContent: "head revision\n",
      newContent: "on disk\n",
    });
    useAppStore
      .getState()
      .updateEditorContent({ tabId, content: "edited in editor\n" });

    const result = await useAppStore.getState().saveActiveEditorTab();

    expect(result.ok).toBe(true);
    expect(await readFile(fullPath, "utf8")).toBe("edited in editor\n");
  });
});

describe("anchoring a live diff tab to disk", () => {
  test("pairs the revision with the content of the same read", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "stave-anchor-race-"));
    const filePath = "note.txt";
    const fullPath = path.join(rootPath, filePath);
    // The file as it stands after something else wrote to it between the git
    // diff request and the tab opening.
    await writeFile(fullPath, "newer on disk\n", "utf8");

    const { useAppStore } = await setupStore({ rootPath, filePath });
    const { COMMIT_GRAPH_WORKING_TREE_REVISION, commitGraphDiffTabId } =
      await import("../src/lib/git-graph/presentation");
    const tabId = commitGraphDiffTabId({
      revision: COMMIT_GRAPH_WORKING_TREE_REVISION,
      filePath,
    });
    // `newContent` is what the earlier git diff request observed, so it is
    // already stale. Anchoring it to the revision of a later read would make the
    // conflict poll treat the tab as current and let the first save pass the
    // revision check, dropping the update the tab never showed.
    await useAppStore.getState().openDiffInEditor({
      editorTabId: tabId,
      filePath,
      oldContent: "head revision\n",
      newContent: "stale from git\n",
    });

    const opened = useAppStore
      .getState()
      .editorTabs.find((item) => item.id === tabId);
    expect(opened?.content).toBe("newer on disk\n");
    expect(opened?.isDirty).toBe(false);

    await useAppStore.getState().checkOpenTabConflicts();
    const polled = useAppStore
      .getState()
      .editorTabs.find((item) => item.id === tabId);
    expect(polled?.content).toBe("newer on disk\n");
    expect(polled?.hasConflict).toBe(false);

    await useAppStore.getState().saveActiveEditorTab();
    expect(await readFile(fullPath, "utf8")).toBe("newer on disk\n");
  });
});

describe("a diff open that a newer request superseded", () => {
  test("leaves the store to the newer selection", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "stave-stale-open-"));
    const filePath = "note.txt";
    await writeFile(path.join(rootPath, filePath), "on disk\n", "utf8");

    const { useAppStore } = await setupStore({ rootPath, filePath });
    const { COMMIT_GRAPH_WORKING_TREE_REVISION, commitGraphDiffTabId } =
      await import("../src/lib/git-graph/presentation");
    // Opening reads from disk, so a second selection can land while the first is
    // still in flight. The superseded open must not activate its own tab.
    await useAppStore.getState().openDiffInEditor({
      editorTabId: commitGraphDiffTabId({
        revision: COMMIT_GRAPH_WORKING_TREE_REVISION,
        filePath,
      }),
      filePath,
      oldContent: "head revision\n",
      newContent: "on disk\n",
      isStale: () => true,
    });

    expect(useAppStore.getState().editorTabs).toEqual([]);
    expect(useAppStore.getState().activeEditorTabId).toBe(null);
  });
});

describe("editing a snapshot diff tab", () => {
  test("ignores content updates so the tab can never go dirty", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "stave-snapshot-edit-"));
    const filePath = "note.txt";
    const fullPath = path.join(rootPath, filePath);
    await writeFile(fullPath, "current working tree\n", "utf8");

    const { useAppStore } = await setupStore({ rootPath, filePath });
    const { chatDiffTabId } = await import(
      "../src/lib/editor/snapshot-diff-tabs"
    );
    const tabId = chatDiffTabId({ messageId: "msg-1", index: 0, filePath });
    // An added file has an empty original side, which renders as a single
    // editor rather than a diff. A save is refused there, so accepting edits
    // would strand the user with a dirty tab they cannot write or close
    // cleanly.
    await useAppStore.getState().openDiffInEditor({
      editorTabId: tabId,
      filePath,
      oldContent: "",
      newContent: "added by the agent\n",
    });

    useAppStore
      .getState()
      .updateEditorContent({ tabId, content: "typed by the user\n" });

    const tab = useAppStore
      .getState()
      .editorTabs.find((item) => item.id === tabId);
    expect(tab?.content).toBe("added by the agent\n");
    expect(tab?.isDirty).toBe(false);
  });
});
