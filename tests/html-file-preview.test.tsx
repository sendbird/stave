import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EditorHtmlPreview } from "@/components/layout/editor-html-preview";
import {
  HTML_FILE_PREVIEW_CSP,
  HTML_FILE_PREVIEW_FRAME_SANDBOX,
  buildHtmlFilePreviewDocument,
} from "@/lib/editor/html-file-preview";

describe("buildHtmlFilePreviewDocument", () => {
  test("keeps the doctype first and puts the CSP ahead of the page's scripts", () => {
    const document = buildHtmlFilePreviewDocument(
      "﻿  <!DOCTYPE html><html><head><script>window.x=1</script></head><body><p>Hi</p></body></html>",
    );
    expect(document.startsWith("<!DOCTYPE html><meta http-equiv=\"Content-Security-Policy\"")).toBe(true);
    expect(document.indexOf("Content-Security-Policy")).toBeLessThan(
      document.indexOf("window.x=1"),
    );
    expect(document).toContain("<body><p>Hi</p></body>");
  });

  test("does not add a doctype a fragment did not have", () => {
    const document = buildHtmlFilePreviewDocument("﻿<p>fragment</p>");
    expect(document.startsWith("<meta http-equiv")).toBe(true);
    expect(document.toLowerCase()).not.toContain("<!doctype");
    expect(document.endsWith("<p>fragment</p>")).toBe(true);
  });

  test("blocks forms, plugins, and base rewrites but leaves the network open", () => {
    expect(HTML_FILE_PREVIEW_CSP).toContain("form-action 'none'");
    expect(HTML_FILE_PREVIEW_CSP).toContain("object-src 'none'");
    expect(HTML_FILE_PREVIEW_CSP).toContain("base-uri 'none'");
    expect(HTML_FILE_PREVIEW_CSP).toContain("script-src *");
    // A `<meta>` CSP cannot carry `sandbox`; the frame attribute does.
    expect(HTML_FILE_PREVIEW_CSP).not.toContain("sandbox");
  });

  test("never grants the frame the app's origin, popups, or modals", () => {
    const tokens = HTML_FILE_PREVIEW_FRAME_SANDBOX.split(/\s+/);
    expect(tokens).toContain("allow-scripts");
    expect(tokens).not.toContain("allow-same-origin");
    expect(tokens).not.toContain("allow-popups");
    expect(tokens).not.toContain("allow-modals");
    expect(tokens).not.toContain("allow-top-navigation");
  });
});

describe("EditorHtmlPreview", () => {
  test("renders the file in a sandboxed srcdoc frame", () => {
    const markup = renderToStaticMarkup(
      createElement(EditorHtmlPreview, {
        content: "<h1 class=\"title\">Hello & bye</h1>",
        frameTitle: "index.html",
        "data-testid": "editor-html-preview",
      }),
    );
    expect(markup).toContain('data-testid="editor-html-preview"');
    expect(markup).toContain("<iframe");
    expect(markup).toContain('title="index.html"');
    expect(markup).toContain(`sandbox="${HTML_FILE_PREVIEW_FRAME_SANDBOX}"`);
    expect(markup).toContain('="no-referrer"');
    // The page markup travels escaped inside the srcdoc attribute.
    expect(markup).toContain("&lt;h1 class=&quot;title&quot;&gt;Hello &amp; bye&lt;/h1&gt;");
  });
});
