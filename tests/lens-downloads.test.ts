import { describe, expect, test } from "bun:test";
import {
  deriveDownloadFilename,
  filterDownloadableAssetUrls,
} from "../electron/main/browser/browser-downloads";

describe("deriveDownloadFilename", () => {
  test("uses the URL basename without query strings", () => {
    expect(
      deriveDownloadFilename("https://example.com/assets/app.css?v=123"),
    ).toBe("app.css");
  });

  test("falls back for trailing slash URLs", () => {
    expect(deriveDownloadFilename("https://example.com/assets/")).toBe(
      "download",
    );
  });

  test("dedupes filename collisions", () => {
    expect(
      deriveDownloadFilename(
        "https://example.com/report.pdf",
        null,
        new Set(["report.pdf", "report (1).pdf"]),
      ),
    ).toBe("report (2).pdf");
  });

  test("prefers sanitized header filenames", () => {
    expect(
      deriveDownloadFilename("https://example.com/download", "bad/name?.png"),
    ).toBe("bad-name-.png");
  });
});

describe("filterDownloadableAssetUrls", () => {
  test("drops data/blob URLs, non-strings, blanks, and duplicates", () => {
    expect(
      filterDownloadableAssetUrls([
        "https://example.com/app.js",
        "data:image/png;base64,aaa",
        "blob:https://example.com/asset",
        "",
        null,
        "https://example.com/app.js",
        "https://example.com/app.css",
      ]),
    ).toEqual(["https://example.com/app.js", "https://example.com/app.css"]);
  });
});
