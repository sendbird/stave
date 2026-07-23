import { describe, expect, test } from "bun:test";
import {
  normalizeLensHostEntry,
  normalizeLensHostList,
} from "../src/lib/lens/lens-security";

describe("Lens host normalization", () => {
  test("stores only the lowercase hostname from URLs", () => {
    expect(
      normalizeLensHostEntry("HTTPS://LOCALHOST:8899/dashboard?mode=debug"),
    ).toBe("localhost");
    expect(normalizeLensHostEntry("https://App.Example.com./path")).toBe(
      "app.example.com",
    );
    expect(normalizeLensHostEntry("http://[::1]:3000/path")).toBe("::1");
  });

  test("ignores wildcard prefixes, ports, paths, and duplicate entries", () => {
    expect(
      normalizeLensHostList([
        "*.Example.com",
        "example.com:443/path",
        "https://example.com/another-path",
        "localhost:3000",
        "http://localhost:8899",
      ]),
    ).toEqual(["example.com", "localhost"]);
  });

  test("uses a copy of the fallback for invalid persisted values", () => {
    const fallback = ["localhost"];
    const normalized = normalizeLensHostList("not-an-array", fallback);

    expect(normalized).toEqual(fallback);
    expect(normalized).not.toBe(fallback);
  });
});
