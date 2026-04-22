import { describe, expect, test } from "bun:test";
import { isAllowedExternalUrl } from "../electron/main/utils/external-url";

describe("external URL allowlist", () => {
  test("allows safe external protocols", () => {
    expect(isAllowedExternalUrl({ url: "https://example.com" })).toBe(true);
    expect(isAllowedExternalUrl({ url: "mailto:test@example.com" })).toBe(true);
  });

  test("blocks unsafe or unsupported protocols", () => {
    expect(isAllowedExternalUrl({ url: "file:///etc/passwd" })).toBe(false);
    expect(isAllowedExternalUrl({ url: "javascript:alert(1)" })).toBe(false);
    expect(isAllowedExternalUrl({ url: "not a url" })).toBe(false);
  });
});
