import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ImageLightbox } from "@/components/ui/image-lightbox";

describe("ImageLightbox", () => {
  // Open, zoom, and dismissal are exercised in the Electron Lens flow.
  test("renders nothing when closed", () => {
    const html = renderToStaticMarkup(
      createElement(ImageLightbox, {
        open: false,
        imageSrc: "data:image/png;base64,abc",
        alt: "Preview image",
        onClose: () => {},
      }),
    );

    expect(html).toBe("");
  });
});
