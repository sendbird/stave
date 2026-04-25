import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ImageLightbox } from "@/components/ui/image-lightbox";

describe("ImageLightbox", () => {
  test("renders full-screen preview markup when open", () => {
    const html = renderToStaticMarkup(createElement(ImageLightbox, {
      open: true,
      imageSrc: "data:image/png;base64,abc",
      alt: "Preview image",
      onClose: () => {},
    }));

    expect(html).toContain("data-testid=\"image-lightbox\"");
    expect(html).toContain("z-[110]");
    expect(html).toContain("aria-label=\"Image full screen preview\"");
    expect(html).toContain("src=\"data:image/png;base64,abc\"");
    expect(html).toContain("Preview image");
    expect(html).toContain("Close");
  });

  test("renders nothing when closed", () => {
    const html = renderToStaticMarkup(createElement(ImageLightbox, {
      open: false,
      imageSrc: "data:image/png;base64,abc",
      alt: "Preview image",
      onClose: () => {},
    }));

    expect(html).toBe("");
  });
});
