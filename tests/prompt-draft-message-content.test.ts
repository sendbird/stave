import { describe, expect, test } from "bun:test";
import { getLensCommentImageId } from "@/lib/lens/lens-annotation-attachment";
import { buildPromptDraftDisplayPartsForSend } from "@/store/prompt-draft-message-content";
import type { PromptDraft } from "@/types/chat";

describe("prompt draft message content", () => {
  test("selects the screenshot from the annotation's lens session", () => {
    const workspaceId = "workspace-1";
    const annotationId = "annotation-1";
    const draft: PromptDraft = {
      text: "",
      attachedFilePaths: [],
      attachments: [
        {
          kind: "lens-annotations",
          id: "lens-annotations:workspace-1:lens-a",
          workspaceId,
          lensSessionId: "lens-a",
          label: "Lens comments",
          count: 1,
          summary: "1. Fix spacing",
          content: "[Lens Visual Comments]",
          annotations: [
            {
              id: annotationId,
              kind: "element",
              pin: 1,
              rect: { x: 0, y: 0, width: 10, height: 10 },
              comment: "Fix spacing",
              createdAt: "2026-07-22T00:00:00.000Z",
            },
          ],
        },
        {
          kind: "image",
          id: getLensCommentImageId({
            workspaceId,
            lensSessionId: "lens-a",
            annotationId,
          }),
          dataUrl: "data:image/png;base64,session-a",
          label: "Session A",
        },
        {
          kind: "image",
          id: getLensCommentImageId({
            workspaceId,
            lensSessionId: "lens-b",
            annotationId,
          }),
          dataUrl: "data:image/png;base64,session-b",
          label: "Session B",
        },
      ],
    };

    expect(buildPromptDraftDisplayPartsForSend(draft)).toEqual([
      {
        type: "image_context",
        dataUrl: "data:image/png;base64,session-a",
        label: "Fix spacing",
        mimeType: "image/png",
      },
    ]);
  });
});
