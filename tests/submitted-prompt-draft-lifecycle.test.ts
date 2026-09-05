import { describe, expect, test } from "bun:test";
import { createSubmittedPromptDraftLifecycle } from "@/store/submitted-prompt-draft-lifecycle";
import type { PromptDraft } from "@/types/chat";

const SENT_DRAFT: PromptDraft = {
  text: "Fix the login form",
  attachedFilePaths: ["src/app.ts"],
  attachments: [{ kind: "file", filePath: "src/app.ts" }],
};

function buildLifecycle(
  overrides: Partial<
    Parameters<typeof createSubmittedPromptDraftLifecycle>[0]
  > = {},
) {
  const updates: Array<Record<string, PromptDraft>> = [];
  const lifecycle = createSubmittedPromptDraftLifecycle({
    taskId: "task-1",
    sourceTaskId: "task-1",
    promptDraft: SENT_DRAFT,
    sourcePromptDraft: SENT_DRAFT,
    updateDrafts: (drafts) => {
      updates.push(drafts);
    },
    ...overrides,
  });
  return { lifecycle, updates };
}

describe("submitted prompt draft lifecycle", () => {
  test("clears once, then puts the sent payload back on a failed send", () => {
    const { lifecycle, updates } = buildLifecycle();

    lifecycle.clear();
    lifecycle.clear();
    expect(updates).toHaveLength(1);
    expect(updates[0]?.["task-1"]?.text).toBe("");
    expect(updates[0]?.["task-1"]?.attachments).toEqual([]);

    lifecycle.restore();
    expect(updates).toHaveLength(2);
    expect(updates[1]?.["task-1"]).toEqual(SENT_DRAFT);

    // Already restored, so a second restore is a no-op.
    lifecycle.restore();
    expect(updates).toHaveLength(2);
  });

  test("leaves a preserved draft untouched in both directions", () => {
    const { lifecycle, updates } = buildLifecycle({
      preservePromptDraft: true,
    });

    lifecycle.clear();
    lifecycle.restore();

    expect(updates).toEqual([]);
  });

  test("never restores after the turn is committed", () => {
    const { lifecycle, updates } = buildLifecycle();

    lifecycle.clear();
    expect(lifecycle.isCommitted()).toBe(false);
    lifecycle.commit();
    expect(lifecycle.isCommitted()).toBe(true);
    lifecycle.restore();

    expect(updates).toHaveLength(1);
  });

  test("returns a failed queued dispatch to the queue instead of the composer", () => {
    const storedDraft: PromptDraft = {
      text: "composer draft in progress",
      attachedFilePaths: [],
      attachments: [],
      queuedTurns: [
        {
          id: "queued-1",
          queuedAt: "2026-09-04T00:00:00.000Z",
          content: "Fix the login form",
          attachedFilePaths: [],
          attachments: [],
        },
      ],
    };
    const { lifecycle, updates } = buildLifecycle({
      storedDraft,
      queuedTurnToSend: storedDraft.queuedTurns?.[0],
      preservedQueuedDispatchDraft: {
        text: "composer draft in progress",
        attachedFilePaths: [],
        attachments: [],
      },
    });

    lifecycle.clear();
    expect(updates[0]?.["task-1"]?.text).toBe("composer draft in progress");

    lifecycle.restore();
    expect(updates[1]?.["task-1"]).toBe(storedDraft);
  });

  test("clears and restores the source draft when the send moved tasks", () => {
    const sourceDraft: PromptDraft = {
      text: "Fix the login form",
      attachedFilePaths: [],
      attachments: [],
    };
    const { lifecycle, updates } = buildLifecycle({
      taskId: "task-1",
      sourceTaskId: "draft:session",
      sourcePromptDraft: sourceDraft,
    });

    lifecycle.clear();
    expect(updates[0]?.["draft:session"]?.text).toBe("");

    lifecycle.restore();
    expect(updates[1]?.["draft:session"]).toBe(sourceDraft);
  });
});
