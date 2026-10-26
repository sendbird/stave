import { describe, expect, test } from "bun:test";
import { formatLensAddressForDisplay } from "../src/lib/lens/lens-address";

describe("formatLensAddressForDisplay", () => {
  test("drops the http and https prefix", () => {
    expect(formatLensAddressForDisplay("http://localhost:5173/settings")).toBe("localhost:5173/settings");
    expect(formatLensAddressForDisplay("https://example.com/docs?q=1#a")).toBe("example.com/docs?q=1#a");
    expect(formatLensAddressForDisplay("HTTPS://Example.com/")).toBe("Example.com/");
  });

  test("keeps every other scheme", () => {
    for (const address of ["file:///tmp/a.html", "about:blank", "data:text/html,hi", "ftp://host/x"]) {
      expect(formatLensAddressForDisplay(address)).toBe(address);
    }
  });

  test("leaves empty, bare-prefix and scheme-less input alone", () => {
    expect(formatLensAddressForDisplay("")).toBe("");
    expect(formatLensAddressForDisplay("http://")).toBe("http://");
    expect(formatLensAddressForDisplay("localhost:3000")).toBe("localhost:3000");
  });
});
