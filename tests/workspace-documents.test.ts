import { afterEach, describe, expect, test } from "bun:test";
import {
  buildWorkspaceDocumentDiff,
  buildWorkspaceDocumentEditContextPart,
  getWorkspaceDocumentTitle,
  readWorkspaceDocuments,
  WORKSPACE_DOCUMENT_EDITS_SOURCE_ID,
} from "@/lib/documents/workspace-documents";
import {
  collectWorkspaceDocumentEditContextParts,
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
