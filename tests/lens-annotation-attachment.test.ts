import { describe, expect, test } from "bun:test";
import type { Attachment } from "@/types/chat";
import {
  getLensCommentImageId,
  shouldIncludeImageAttachmentAsProviderContext,
} from "@/lib/lens/lens-annotation-attachment";

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
});
