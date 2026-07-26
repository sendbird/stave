import { describe, expect, test } from "bun:test";
import type { Attachment } from "@/types/chat";
import type { LensAnnotation } from "@/lib/lens/lens.types";
import {
  buildLensAnnotationsAttachment,
  getLensCommentImageId,
  isLensCommentImageAttachment,
  removeLensCommentImageAttachments,
  resolveLensAnnotationClearTargets,
  shouldIncludeImageAttachmentAsProviderContext,
  upsertLensAnnotationsAttachment,
} from "@/lib/lens/lens-annotation-attachment";

const annotation: LensAnnotation = {
  id: "annotation-1",
  kind: "element",
  pin: 1,
  rect: { x: 32, y: 64, width: 180, height: 44 },
  comment: "Button is cramped",
  createdAt: "2026-06-30T00:00:00.000Z",
  selector: "#hero > button:nth-child(1)",
  tagName: "button",
  review: {
    version: 1,
    page: {
      url: "https://example.com/review",
      title: "Review",
      viewport: { width: 1440, height: 900, devicePixelRatio: 2 },
      scroll: { x: 0, y: 0 },
      documentId: "document-1",
    },
    anchor: {
      selector: "#hero > button:nth-child(1)",
      bounds: { x: 32, y: 64, width: 180, height: 44 },
      element: { tagName: "button", classList: [] },
      attributes: {},
      ancestors: [],
      nearby: [],
      computedStyles: {},
    },
    evidence: {
      screenshot: {
        kind: "clipped",
        bounds: { x: 32, y: 64, width: 180, height: 44 },
      },
      styleEdits: [],
    },
    feedback: {
      comment: "Button is cramped",
      intent: "fix",
      priority: "high",
    },
    trust: "untrusted-page-evidence",
  },
};

const sourceMappingConfig = {
  heuristic: true,
  reactDebugSource: false,
};

describe("lens annotation attachments", () => {
  test("includes intent and priority in the attachment summary", () => {
    const [attachment] = upsertLensAnnotationsAttachment({
      attachments: [],
      workspaceId: "workspace-1",
      annotations: [annotation],
      sourceMappingConfig,
    });

    expect(attachment?.kind).toBe("lens-annotations");
    if (attachment?.kind === "lens-annotations") {
      expect(attachment.summary).toContain("[fix/high]");
    }
  });

  test("keeps regular image attachments as provider context", () => {
    const attachment: Attachment = {
      kind: "image",
      id: "image:user-upload-1",
      dataUrl: "data:image/png;base64,regular",
      label: "Uploaded image",
    };

    expect(
      shouldIncludeImageAttachmentAsProviderContext(attachment, false),
    ).toBe(true);
  });

  test("gates visual comment screenshots behind the provider context setting", () => {
    const attachment: Attachment = {
      kind: "image",
      id: getLensCommentImageId({
        workspaceId: "workspace-1",
        annotationId: "annotation-1",
      }),
      dataUrl: "data:image/png;base64,lens-comment",
      label: "Visual comment 1",
    };

    expect(
      shouldIncludeImageAttachmentAsProviderContext(attachment, false),
    ).toBe(false);
    expect(
      shouldIncludeImageAttachmentAsProviderContext(attachment, true),
    ).toBe(true);
  });

  test("scopes visual comment screenshots to a lens session", () => {
    const sessionAId = getLensCommentImageId({
      workspaceId: "workspace-1",
      lensSessionId: "lens-a",
      annotationId: "annotation-1",
    });
    const sessionBId = getLensCommentImageId({
      workspaceId: "workspace-1",
      lensSessionId: "lens-b",
      annotationId: "annotation-1",
    });
    expect(sessionAId).not.toBe(sessionBId);
    expect(
      isLensCommentImageAttachment(
        {
          kind: "image",
          id: sessionBId,
          dataUrl: "data:image/png;base64,lens-comment",
          label: "Visual comment 1",
        },
        "workspace-1",
        "lens-a",
      ),
    ).toBe(false);
    expect(sessionAId).not.toBe(
      getLensCommentImageId({
        workspaceId: "workspace-1",
        annotationId: "annotation-1",
      }),
    );
  });

  test("removes only the deleted annotation screenshot", () => {
    const firstId = getLensCommentImageId({
      workspaceId: "workspace-1",
      lensSessionId: "lens-a",
      annotationId: "annotation-1",
    });
    const secondId = getLensCommentImageId({
      workspaceId: "workspace-1",
      lensSessionId: "lens-a",
      annotationId: "annotation-2",
    });
    const attachments: Attachment[] = [
      {
        kind: "image",
        id: firstId,
        dataUrl: "data:image/png;base64,first",
        label: "First",
      },
      {
        kind: "image",
        id: secondId,
        dataUrl: "data:image/png;base64,second",
        label: "Second",
      },
      {
        kind: "image",
        id: "image:user-upload",
        dataUrl: "data:image/png;base64,user",
        label: "User upload",
      },
    ];

    expect(
      removeLensCommentImageAttachments({
        attachments,
        workspaceId: "workspace-1",
        lensSessionId: "lens-a",
        annotationIds: ["annotation-1"],
      }).map((attachment) => attachment.id),
    ).toEqual([secondId, "image:user-upload"]);
  });

  test("upserts one lens session without replacing another", () => {
    const sessionA = upsertLensAnnotationsAttachment({
      attachments: [],
      workspaceId: "workspace-1",
      lensSessionId: "lens-a",
      annotations: [annotation],
      sourceMappingConfig,
    });
    const bothSessions = upsertLensAnnotationsAttachment({
      attachments: sessionA,
      workspaceId: "workspace-1",
      lensSessionId: "lens-b",
      annotations: [{ ...annotation, id: "annotation-2" }],
      sourceMappingConfig,
    });

    expect(
      bothSessions
        .filter(
          (attachment) => attachment.kind === "lens-annotations",
        )
        .map((attachment) => attachment.lensSessionId),
    ).toEqual(["lens-a", "lens-b"]);

    expect(
      upsertLensAnnotationsAttachment({
        attachments: bothSessions,
        workspaceId: "workspace-1",
        lensSessionId: "lens-a",
        annotations: [],
        sourceMappingConfig,
      }).filter((attachment) => attachment.kind === "lens-annotations"),
    ).toEqual([bothSessions[1]]);
  });

  test("preserves composer feedback when session annotations refresh", () => {
    const editedAttachment = buildLensAnnotationsAttachment({
      workspaceId: "workspace-1",
      lensSessionId: "lens-a",
      annotations: [
        {
          ...annotation,
          review: {
            ...annotation.review,
            feedback: {
              ...annotation.review.feedback,
              intent: "question",
              priority: "low",
            },
          },
        },
      ],
      sourceMappingConfig,
    });
    const refreshedAnnotation = {
      ...annotation,
      rect: { ...annotation.rect, width: 220 },
      review: {
        ...annotation.review,
        anchor: {
          ...annotation.review.anchor,
          bounds: { ...annotation.review.anchor.bounds, width: 220 },
        },
      },
    };

    const refreshed = upsertLensAnnotationsAttachment({
      attachments: [editedAttachment],
      workspaceId: "workspace-1",
      lensSessionId: "lens-a",
      annotations: [
        refreshedAnnotation,
        {
          ...annotation,
          id: "annotation-2",
          pin: 2,
          comment: "Second comment",
          review: {
            ...annotation.review,
            feedback: {
              ...annotation.review.feedback,
              comment: "Second comment",
            },
          },
        },
      ],
      sourceMappingConfig,
    });

    expect(refreshed).toHaveLength(1);
    const [attachment] = refreshed;
    expect(attachment?.kind).toBe("lens-annotations");
    if (attachment?.kind === "lens-annotations") {
      expect(attachment.annotations?.[0]?.rect.width).toBe(220);
      expect(attachment.annotations?.[0]?.review.feedback).toEqual({
        comment: "Button is cramped",
        intent: "question",
        priority: "low",
      });
      expect(attachment.summary).toContain("[question/low]");
      expect(attachment.summary).toContain("[fix/high] Second comment");
    }
  });

  test("resolves every annotated lens session for submit cleanup", () => {
    const attachments = [
      ...upsertLensAnnotationsAttachment({
        attachments: [],
        workspaceId: "workspace-1",
        lensSessionId: "lens-a",
        annotations: [annotation],
        sourceMappingConfig,
      }),
      ...upsertLensAnnotationsAttachment({
        attachments: [],
        workspaceId: "workspace-1",
        lensSessionId: "lens-b",
        annotations: [annotation],
        sourceMappingConfig,
      }),
    ];

    expect(
      resolveLensAnnotationClearTargets({
        attachments,
        fallbackWorkspaceId: "workspace-1",
      }),
    ).toEqual([
      { workspaceId: "workspace-1", lensSessionId: "lens-a" },
      { workspaceId: "workspace-1", lensSessionId: "lens-b" },
    ]);
  });
});
