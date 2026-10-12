import { afterEach, describe, expect, test } from "bun:test";
import {
  addDocumentContextAttachment,
  ATTACHED_DOCUMENT_CONTEXT_SOURCE_ID,
  buildAttachedDocumentRetrievedContext,
  buildDocumentMentionOptions,
  createDocumentContextAttachment,
  filterDocumentMentionOptions,
  MAX_ATTACHED_DOCUMENTS,
} from "@/lib/documents/attached-document-context";
import type { WorkspaceDocumentCatalogEntry } from "@/lib/documents/workspace-document-schemas";
import { buildMentionPaletteItems } from "@/components/ai-elements/prompt-input-mentions";
import { buildPromptDraftDisplayPartsForSend } from "@/store/prompt-draft-message-content";
import { collectAttachedDocumentContextParts } from "@/store/workspace-documents-store";
import type { PromptDraft } from "@/types/chat";

function entry(overrides: Partial<WorkspaceDocumentCatalogEntry> = {}): WorkspaceDocumentCatalogEntry {
  return {
    workspaceId: "ws-old",
    workspaceName: "feature/retry",
    workspaceDeleted: true,
    filePath: ".stave/context/plans/retry-design.md",
    revision: 4,
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

const originalWindow = globalThis.window;
afterEach(() => {
  (globalThis as { window: typeof window }).window = originalWindow;
});

describe("document mention options", () => {
  test("label documents by file name and search title, path and workspace", () => {
    const [option] = buildDocumentMentionOptions({ entries: [entry()] });
    expect(option?.title).toBe("retry-design");
    expect(filterDocumentMentionOptions({ options: [option!], query: "retry feature" })).toHaveLength(1);
    expect(filterDocumentMentionOptions({ options: [option!], query: "billing" })).toHaveLength(0);
  });

  test("skip attached documents and list only a few without a query", () => {
    const entries = Array.from({ length: 6 }, (_, index) =>
      entry({ filePath: `.stave/context/plans/doc-${index}.md` }),
    );
    const attachment = createDocumentContextAttachment({
      ...entries[0]!,
      title: "doc-0",
    });
    const options = buildDocumentMentionOptions({ entries, attachments: [attachment] });
    expect(options.map((option) => option.title)).not.toContain("doc-0");
    expect(filterDocumentMentionOptions({ options, query: "" })).toHaveLength(3);
    expect(filterDocumentMentionOptions({ options, query: "doc" })).toHaveLength(5);
  });

  test("sit between tasks and Information items in the palette", () => {
    const [document] = buildDocumentMentionOptions({ entries: [entry()] });
    const items = buildMentionPaletteItems({
      query: "",
      informationOptions: [],
      taskOptions: [
        { taskId: "t1", workspaceId: "ws", title: "Task", updatedAt: "", searchText: "task" },
      ],
      documentOptions: [document!],
    });
    expect(items.map((item) => item.kind)).toEqual(["task", "document"]);
  });
});

describe("document attachments", () => {
  test("attach once and up to the limit", () => {
    const first = createDocumentContextAttachment({ ...entry(), title: "retry-design" });
    const once = addDocumentContextAttachment({ attachments: [], attachment: first });
    expect(addDocumentContextAttachment({ attachments: once, attachment: first })).toBe(once);
    let attachments = once;
    for (let index = 1; index < MAX_ATTACHED_DOCUMENTS + 2; index += 1) {
      attachments = addDocumentContextAttachment({
        attachments,
        attachment: createDocumentContextAttachment({
          ...entry({ filePath: `.stave/context/plans/d-${index}.md` }),
          title: `d-${index}`,
        }),
      });
    }
    expect(attachments).toHaveLength(MAX_ATTACHED_DOCUMENTS);
  });

  test("show on the sent message as a document part", () => {
    const attachment = createDocumentContextAttachment({ ...entry(), title: "retry-design" });
    const draft: PromptDraft = { text: "Use this", attachedFilePaths: [], attachments: [attachment] };
    expect(buildPromptDraftDisplayPartsForSend(draft)).toEqual([
      { type: "text", text: "Use this" },
      {
        type: "document_context",
        workspaceId: "ws-old",
        workspaceName: "feature/retry",
        filePath: ".stave/context/plans/retry-design.md",
        revision: 4,
        title: "retry-design",
      },
    ]);
  });

  test("send the pinned revision and name the ones that cannot be read", async () => {
    const kept = createDocumentContextAttachment({ ...entry(), title: "retry-design" });
    const gone = createDocumentContextAttachment({
      ...entry({ filePath: ".stave/context/plans/gone.md", revision: 2 }),
      title: "gone",
    });
    const requests: unknown[] = [];
    (globalThis as { window: unknown }).window = {
      api: {
        persistence: {
          workspaceDocumentRevision: async (args: { filePath: string }) => {
            requests.push(args);
            return args.filePath.endsWith("gone.md")
              ? { ok: false, content: null }
              : { ok: true, content: "# Retry\n\n- cap at 3\n" };
          },
        },
      },
    };
    const parts = await collectAttachedDocumentContextParts({
      promptDraft: { text: "", attachedFilePaths: [], attachments: [kept, gone] },
    });
    expect(requests).toContainEqual({
      workspaceId: "ws-old",
      filePath: ".stave/context/plans/retry-design.md",
      revision: 4,
    });
    expect(parts).toHaveLength(1);
    expect(parts[0]?.sourceId).toBe(ATTACHED_DOCUMENT_CONTEXT_SOURCE_ID);
    expect(parts[0]?.content).toContain("- cap at 3");
    expect(parts[0]?.content).toContain("`.stave/context/plans/gone.md` from workspace \"feature/retry\" could not be read");
  });

  test("build nothing without documents", () => {
    expect(buildAttachedDocumentRetrievedContext({ documents: [], missing: [] })).toBeNull();
  });
});
