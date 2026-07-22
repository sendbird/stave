import { describe, expect, test } from "bun:test";
import type { Attachment } from "@/types/chat";
import type { LensAnnotation } from "@/lib/lens/lens.types";
import {
  getLensCommentImageId,
  isLensCommentImageAttachment,
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
};

const sourceMappingConfig = {
  heuristic: true,
  reactDebugSource: false,
};

describe("lens annotation attachments", () => {
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
