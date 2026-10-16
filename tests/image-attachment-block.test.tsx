import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ImageAttachmentBlock } from "@/components/session/chat-panel-file-blocks";

describe("ImageAttachmentBlock", () => {
  test("exposes each image preview as a keyboard-reachable button", () => {
    const html = renderToStaticMarkup(
      createElement(ImageAttachmentBlock, {
        parts: [{ type: "image_context", dataUrl: "data:image/png;base64,AA==", label: "shot.png", mimeType: "image/png" }],
      }),
    );
    const image = html.match(/<img[^>]*>/)?.[0] ?? "";
    expect(image).toContain('role="button"');
    expect(image).toContain('tabindex="0"');
    expect(image).toContain('aria-label="Open shot.png full size"');
    expect(image).toContain('alt="shot.png"');
  });
});
