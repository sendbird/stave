import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
  isRendererAppUrl,
  RENDERER_ENTRY_URL,
  resolveRendererAssetPath,
} from "../electron/main/renderer-entry";

const root = path.resolve("repo", "out", "renderer");

describe("renderer scheme asset resolution", () => {
  test("maps the entry and nested assets inside the renderer directory", () => {
    expect(resolveRendererAssetPath(root, RENDERER_ENTRY_URL)).toBe(
      path.join(root, "index.html"),
    );
    expect(
      resolveRendererAssetPath(root, "stave-app://renderer/assets/index-abc.js?v=1#x"),
    ).toBe(path.join(root, "assets", "index-abc.js"));
    expect(
      resolveRendererAssetPath(root, "stave-app://renderer/fonts/Inter%20Variable.woff2"),
    ).toBe(path.join(root, "fonts", "Inter Variable.woff2"));
    expect(resolveRendererAssetPath(root, "stave-app://renderer/")).toBe(
      path.join(root, "index.html"),
    );
  });

  test("clamps URL dot segments at the renderer root", () => {
    expect(
      resolveRendererAssetPath(root, "stave-app://renderer/%2e%2e/main/index.js"),
    ).toBe(path.join(root, "main", "index.js"));
  });

  test("refuses anything that escapes the renderer directory or another origin", () => {
    for (const url of [
      "stave-app://renderer/..%2F..%2Fsecret.txt",
      "stave-app://renderer/..%5C..%5Csecret.txt",
      "stave-app://renderer/assets/%00.js",
      "stave-app://renderer/%E0%A4%A",
      "stave-app://other/index.html",
      "file:///etc/passwd",
      "not a url",
    ]) {
      expect(resolveRendererAssetPath(root, url)).toBeNull();
    }
  });
});

describe("main window navigation guard", () => {
  test("accepts only the origin the window loaded the app from", () => {
    expect(
      isRendererAppUrl({
        url: "stave-app://renderer/index.html#settings",
        entryKind: "scheme",
        devServerOrigin: null,
      }),
    ).toBe(true);
    expect(
      isRendererAppUrl({
        url: "file:///Applications/Stave.app/index.html",
        entryKind: "scheme",
        devServerOrigin: null,
      }),
    ).toBe(false);
    expect(
      isRendererAppUrl({
        url: "file:///Applications/Stave.app/index.html",
        entryKind: "file",
        devServerOrigin: null,
      }),
    ).toBe(true);
    expect(
      isRendererAppUrl({
        url: "stave-app://renderer/index.html",
        entryKind: "file",
        devServerOrigin: null,
      }),
    ).toBe(false);
    expect(
      isRendererAppUrl({
        url: "http://127.0.0.1:4174/",
        entryKind: "scheme",
        devServerOrigin: "http://127.0.0.1:4174",
      }),
    ).toBe(true);
    expect(
      isRendererAppUrl({
        url: "https://example.com/",
        entryKind: "scheme",
        devServerOrigin: null,
      }),
    ).toBe(false);
  });
});
