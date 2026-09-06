import { describe, expect, test } from "bun:test";
import { normalizeLensAnnotationPayload } from "@/lib/lens/lens-annotation-schema";
import {
  buildLensAnnotationsAttachment,
  getLensCommentImageId,
} from "@/lib/lens/lens-annotation-attachment";
import { getSentLensFeedback } from "@/lib/lens/lens-feedback-history";
import { buildPromptDraftDisplayPartsForSend } from "@/store/prompt-draft-message-content";
import { ChatMessageSchema } from "@/lib/task-context/schemas";
import type { ChatMessage, PromptDraft } from "@/types/chat";

const target = {
  workspaceId: "workspace-a",
  lensSessionId: "preview-a",
  sourceMappingConfig: { heuristic: true, reactDebugSource: false },
};
const annotation = normalizeLensAnnotationPayload(
  {
    id: "capture-a",
    kind: "element",
    pin: 1,
    rect: { x: 0, y: 0, width: 100, height: 40 },
    comment: "Increase contrast",
    selector: "#action",
    createdAt: "2026-09-06T00:00:00Z",
  },
  {
    documentId: "document-a",
    url: "https://example.com/preview",
    title: "Preview",
  },
);

describe("sent Lens feedback", () => {
  test("survives the conversation JSON round trip without borrowing another session's evidence", () => {
    const draft: PromptDraft = {
      text: "Fix the selected action",
      attachedFilePaths: [],
      attachments: [
        buildLensAnnotationsAttachment({
          ...target,
          annotations: [annotation],
        }),
        {
          kind: "image",
          id: getLensCommentImageId({ ...target, annotationId: annotation.id }),
          dataUrl: "data:image/png;base64,before",
          label: "Before",
        },
      ],
    };
    const message: ChatMessage = {
      id: "sent-a",
      role: "user",
      providerId: "user",
      model: "user",
      content: "Fix the selected action",
      parts: [],
      displayParts: buildPromptDraftDisplayPartsForSend(draft),
    };
    const messages = JSON.parse(JSON.stringify([message])).map(
      (entry: unknown) => ChatMessageSchema.parse(entry),
    );
    const restored = getSentLensFeedback(messages, target);
    expect(restored[0]).toMatchObject({
      kind: "lens-annotations",
      annotations: [
        expect.objectContaining({
          selector: "#action",
          comment: "Increase contrast",
        }),
      ],
    });
    expect(restored[1]).toMatchObject({
      kind: "image",
      dataUrl: "data:image/png;base64,before",
    });
    expect(
      getSentLensFeedback(messages, { ...target, workspaceId: "workspace-b" }),
    ).toEqual([]);
    expect(
      getSentLensFeedback(messages, { ...target, lensSessionId: "preview-b" }),
    ).toEqual([]);
    expect(
      getSentLensFeedback([{ ...message, role: "assistant" }], target),
    ).toEqual([]);
  });
  test("retains a request without an image and reads legacy messages without inventing feedback", () => {
    const draft: PromptDraft = {
      text: "",
      attachedFilePaths: [],
      attachments: [
        buildLensAnnotationsAttachment({
          ...target,
          annotations: [annotation],
        }),
      ],
    };
    const message: ChatMessage = {
      id: "sent-a",
      role: "user",
      providerId: "user",
      model: "user",
      content: "",
      parts: [],
      displayParts: buildPromptDraftDisplayPartsForSend(draft),
    };
    expect(getSentLensFeedback([message], target)).toHaveLength(1);
    expect(
      getSentLensFeedback([{ ...message, displayParts: undefined }], target),
    ).toEqual([]);
  });
});
