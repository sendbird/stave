import { describe, expect, test } from "bun:test";
import {
  normalizeExternalUrl,
  shouldActivateExternalLinkWithModifier,
  splitTextByExternalUrls,
} from "@/lib/external-links";

describe("external link renderer helpers", () => {
  test("splits plain text URLs and preserves trailing punctuation", () => {
    expect(splitTextByExternalUrls("Preview: https://stave.localhost:3000/test.")).toEqual([
      { type: "text", text: "Preview: " },
      { type: "link", text: "https://stave.localhost:3000/test", href: "https://stave.localhost:3000/test" },
      { type: "text", text: "." },
    ]);
  });

  test("normalizes safe external URLs and blocks unsafe protocols", () => {
    expect(normalizeExternalUrl("https://example.com/docs")).toBe("https://example.com/docs");
    expect(normalizeExternalUrl("mailto:test@example.com")).toBe("mailto:test@example.com");
    expect(normalizeExternalUrl("javascript:alert(1)")).toBeNull();
  });

  test("requires cmd on macOS and ctrl on other platforms", () => {
    expect(shouldActivateExternalLinkWithModifier({
      platform: "MacIntel",
      metaKey: true,
      ctrlKey: false,
    })).toBe(true);
    expect(shouldActivateExternalLinkWithModifier({
      platform: "MacIntel",
      metaKey: false,
      ctrlKey: true,
    })).toBe(false);
    expect(shouldActivateExternalLinkWithModifier({
      platform: "Win32",
      metaKey: true,
      ctrlKey: false,
    })).toBe(false);
    expect(shouldActivateExternalLinkWithModifier({
      platform: "Win32",
      metaKey: false,
      ctrlKey: true,
    })).toBe(true);
  });
});
