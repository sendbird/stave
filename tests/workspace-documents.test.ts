import { afterEach, describe, expect, test } from "bun:test";
import {
  buildWorkspaceDocumentDiff,
  buildWorkspaceDocumentEditContextPart,
  getWorkspaceDocumentTitle,
  listWorkspaceDocumentPaths,
  readWorkspaceDocuments,
  WORKSPACE_DOCUMENT_EDITS_SOURCE_ID,
} from "@/lib/documents/workspace-documents";
import {
  collectWorkspaceDocumentEditContextParts,
  forgetWorkspaceDocumentActivity,
  loadWorkspaceDocumentCatalog,
  refreshRegisteredWorkspaceDocumentActivity,
  refreshWorkspaceDocumentActivity,
  syncWorkspaceDocuments,
  useWorkspaceDocumentsStore,
} from "@/store/workspace-documents-store";
import { documentRevisionDiffTabId, isSnapshotDiffEditorTab } from "@/lib/editor/snapshot-diff-tabs";
import type { WorkspaceDocumentChange } from "@/lib/documents/workspace-document-schemas";

const originalWindow = globalThis.window;
afterEach(() => {
  (globalThis as { window: typeof window }).window = originalWindow;
  useWorkspaceDocumentsStore.setState({ activityByWorkspace: {} });
});

function change(overrides: Partial<WorkspaceDocumentChange> = {}): WorkspaceDocumentChange {
  return {
    filePath: ".stave/context/plans/retry-design.md",
    revision: 2,
    previousRevision: 1,
    previousContent: "# Retry\n\n- keep\n- old step\n",
    content: "# Retry\n\n- keep\n- new step\n",
    touchedByTask: true,
    ...overrides,
  };
}

describe("workspace document helpers", () => {
  test("titles a document by its first heading, else its file name", () => {
    expect(
      getWorkspaceDocumentTitle({
        filePath: ".stave/context/plans/a.md",
        content: "intro\n## Retry design\n",
      }),
    ).toBe("Retry design");
    expect(
      getWorkspaceDocumentTitle({ filePath: ".stave/context/plans/retry-design.md" }),
    ).toBe("retry-design");
  });

  test("diffs changed lines with their line numbers and nearby context", () => {
    expect(
      buildWorkspaceDocumentDiff({
        before: "a\nb\nc\nd\ne\nf",
        after: "a\nb\nc\nD\ne\nf",
      }),
    ).toBe(["  3: c", "- 4: d", "+ 4: D", "  5: e"].join("\n"));
  });

  test("summarizes a rewrite too large to diff", () => {
    const before = Array.from({ length: 2_000 }, (_, i) => `old ${i}`).join("\n");
    const after = Array.from({ length: 2_000 }, (_, i) => `new ${i}`).join("\n");
    expect(buildWorkspaceDocumentDiff({ before, after })).toContain(
      "was rewritten (2000 lines → 2000 lines)",
    );
  });

  test("tells the agent only about edits to documents its task wrote", () => {
    expect(
      buildWorkspaceDocumentEditContextPart([
        change({ touchedByTask: false }),
        change({ previousContent: null, previousRevision: null }),
      ]),
    ).toBeNull();

    const part = buildWorkspaceDocumentEditContextPart([change()]);
    expect(part?.sourceId).toBe(WORKSPACE_DOCUMENT_EDITS_SOURCE_ID);
    expect(part?.content).toContain(
      "Document `.stave/context/plans/retry-design.md` (revision 1 → 2):",
    );
    expect(part?.content).toContain("- 4: - old step");
    expect(part?.content).toContain("+ 4: - new step");
  });

  test("a revision diff tab is a frozen snapshot, never the file on disk", () => {
    expect(
      isSnapshotDiffEditorTab({
        id: documentRevisionDiffTabId({
          filePath: ".stave/context/plans/a.md",
          fromRevision: 1,
          toRevision: 2,
        }),
      }),
    ).toBe(true);
  });
});

describe("workspace document sync", () => {
  function installWindow(args: {
    files: Record<string, string>;
    record: (input: unknown) => Promise<unknown>;
  }) {
    (globalThis as { window: unknown }).window = {
      api: {
        fs: {
          listDirectory: async ({ directoryPath }: { directoryPath: string }) => ({
            ok: true,
            entries: Object.keys(args.files)
              .filter((path) => path.startsWith(`${directoryPath}/`))
              .map((path) => ({ name: path.split("/").pop(), path, type: "file" })),
          }),
          readFile: async ({ filePath }: { filePath: string }) => ({
            ok: true,
            content: args.files[filePath] ?? "",
            revision: "r",
          }),
        },
        persistence: {
          recordWorkspaceDocuments: args.record,
          workspaceDocumentActivity: async () => ({
            ok: true,
            documents: [],
            turnLinks: [],
          }),
        },
      },
    };
  }

  test("reads Markdown documents from the current and legacy directories", async () => {
    installWindow({
      files: {
        ".stave/context/plans/a.md": "A",
        ".stave/context/plans/notes.txt": "skip",
        ".stave/plans/b.md": "B",
      },
      record: async () => ({ ok: true, changes: [] }),
    });
    expect(await readWorkspaceDocuments("/tmp/ws")).toEqual([
      { filePath: ".stave/context/plans/a.md", content: "A" },
      { filePath: ".stave/plans/b.md", content: "B" },
    ]);
  });

  test("a missing document folder is empty, but a folder that failed to read marks the listing failed", async () => {
    const respond = (result: Record<string, unknown>) => {
      (globalThis as { window: unknown }).window = {
        api: { fs: { listDirectory: async ({ directoryPath }: { directoryPath: string }) =>
          directoryPath === ".stave/context/plans"
            ? { ok: true, entries: [{ name: "a.md", path: ".stave/context/plans/a.md", type: "file" }] }
            : result } },
      };
    };
    respond({ ok: false, entries: [], missing: true, stderr: "Directory path cannot be resolved." });
    expect(await listWorkspaceDocumentPaths("/tmp/ws")).toEqual({ paths: [".stave/context/plans/a.md"], failed: false });
    respond({ ok: false, entries: [], stderr: "EIO: i/o error" });
    expect(await listWorkspaceDocumentPaths("/tmp/ws")).toEqual({ paths: [".stave/context/plans/a.md"], failed: true });
  });

  test("a failed document catalog read is null, so the @ list keeps what it had", async () => {
    (globalThis as { window: unknown }).window = { api: { persistence: { workspaceDocumentCatalog: async () => ({ ok: false }) } } };
    expect(await loadWorkspaceDocumentCatalog({ excludeWorkspaceId: "ws" })).toBeNull();
    (globalThis as { window: unknown }).window = { api: { persistence: { workspaceDocumentCatalog: async () => ({ ok: true, entries: [] }) } } };
    expect(await loadWorkspaceDocumentCatalog({ excludeWorkspaceId: "ws" })).toEqual([]);
  });

  test("records edits before a send and returns them for this task", async () => {
    let recorded: unknown = null;
    installWindow({
      files: { ".stave/context/plans/retry-design.md": change().content },
      record: async (input) => {
        recorded = input;
        return { ok: true, changes: [change()] };
      },
    });
    const parts = await collectWorkspaceDocumentEditContextParts({
      workspaceId: "ws",
      rootPath: "/tmp/ws",
      taskId: "task-1",
    });
    expect(recorded).toMatchObject({
      workspaceId: "ws",
      author: "external",
      relevantTaskId: "task-1",
      documents: [{ filePath: ".stave/context/plans/retry-design.md" }],
    });
    expect(parts).toHaveLength(1);
    expect(parts[0]?.sourceId).toBe(WORKSPACE_DOCUMENT_EDITS_SOURCE_ID);
  });
});

describe("workspace document activity lifetime", () => {
  function installActivity(read: () => Promise<unknown>) {
    (globalThis as { window: unknown }).window = {
      api: { persistence: { workspaceDocumentActivity: read } },
    };
  }
  const emptyActivity = { ok: true, documents: [], turnLinks: [] };

  test("a document record that answers after the workspace closed does not re-add it", async () => {
    let answerRecord: (value: unknown) => void = () => {};
    let recordCalled: () => void = () => {};
    const recordStarted = new Promise<void>((resolve) => {
      recordCalled = resolve;
    });
    let activityReads = 0;
    (globalThis as { window: unknown }).window = {
      api: {
        fs: {
          listDirectory: async ({ directoryPath }: { directoryPath: string }) => ({
            ok: true,
            entries: directoryPath.endsWith(".stave/context/plans")
              ? [{ name: "a.md", path: `${directoryPath}/a.md`, type: "file" }]
              : [],
          }),
          readFile: async () => ({ ok: true, content: "A", revision: "r" }),
        },
        persistence: {
          recordWorkspaceDocuments: () => {
            recordCalled();
            return new Promise((resolve) => {
              answerRecord = resolve;
            });
          },
          workspaceDocumentActivity: async () => {
            activityReads += 1;
            return emptyActivity;
          },
        },
      },
    };

    const sync = syncWorkspaceDocuments({ workspaceId: "ws-closed", rootPath: "/tmp/ws", author: "agent" });
    await recordStarted;
    forgetWorkspaceDocumentActivity(["ws-closed"]);
    answerRecord({ ok: true, changes: [change()] });
    await sync;
    await Bun.sleep(0);

    expect(activityReads).toBe(0);
    expect(
      useWorkspaceDocumentsStore.getState().activityByWorkspace["ws-closed"],
    ).toBeUndefined();
  });

  test("a host turn finishing in a closed workspace does not refresh its activity", async () => {
    installActivity(async () => emptyActivity);
    const registry = {
      workspaces: [{ id: "ws-current" }],
      recentRepositories: [{ workspaces: [{ id: "ws-other-repo" }] }],
    };

    await refreshRegisteredWorkspaceDocumentActivity({ ...registry, workspaceId: "ws-closed" });
    await refreshRegisteredWorkspaceDocumentActivity({ ...registry, workspaceId: "ws-current" });
    await refreshRegisteredWorkspaceDocumentActivity({ ...registry, workspaceId: "ws-other-repo" });

    expect(
      Object.keys(useWorkspaceDocumentsStore.getState().activityByWorkspace).sort(),
    ).toEqual(["ws-current", "ws-other-repo"]);
  });

  test("forgetting a closed workspace drops only its activity", async () => {
    installActivity(async () => emptyActivity);
    await refreshWorkspaceDocumentActivity("ws-closed");
    await refreshWorkspaceDocumentActivity("ws-open");

    forgetWorkspaceDocumentActivity(["ws-closed"]);

    const { activityByWorkspace } = useWorkspaceDocumentsStore.getState();
    expect(Object.keys(activityByWorkspace)).toEqual(["ws-open"]);
  });

  test("a read still in flight when the workspace closes does not re-add it", async () => {
    let finishRead!: (value: unknown) => void;
    installActivity(
      () => new Promise((resolve) => {
        finishRead = resolve;
      }),
    );
    const pending = refreshWorkspaceDocumentActivity("ws-closed");
    await Promise.resolve();

    forgetWorkspaceDocumentActivity(["ws-closed"]);
    finishRead(emptyActivity);
    await pending;

    expect(
      useWorkspaceDocumentsStore.getState().activityByWorkspace["ws-closed"],
    ).toBeUndefined();
  });
});

describe("TurnDocumentRevisions", () => {
  test("lists the documents a turn wrote and nothing for a turn without any", async () => {
    const [{ createElement }, { renderToStaticMarkup }, { TurnDocumentRevisionList }] =
      await Promise.all([
        import("react"),
        import("react-dom/server"),
        import("@/components/session/TurnDocumentRevisions"),
      ]);
    const noop = () => {};
    const html = renderToStaticMarkup(
      createElement(TurnDocumentRevisionList, {
        links: [
          {
            turnId: "turn-1",
            taskId: "task-1",
            filePath: ".stave/context/plans/retry-design.md",
            revision: 3,
          },
        ],
        onOpen: noop,
        onCompare: noop,
      }),
    );
    expect(html).toContain("Document updated");
    expect(html).toContain("retry-design");
    expect(html).toContain("v3");
    expect(html).toContain('aria-label="Compare retry-design with its previous revision"');
    expect(
      renderToStaticMarkup(
        createElement(TurnDocumentRevisionList, {
          links: [],
          onOpen: noop,
          onCompare: noop,
        }),
      ),
    ).toBe("");
  });
});
