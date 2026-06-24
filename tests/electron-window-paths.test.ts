import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
  resolvePreloadScriptPath,
  resolveRendererEntryPath,
} from "../electron/main/window-paths";

describe("Electron main window asset paths", () => {
  test("resolves preload and renderer entries from the main output directory", () => {
    const runtimeDirectory = path.join("repo", "out", "main");

    expect(resolvePreloadScriptPath(runtimeDirectory)).toBe(
      path.join("repo", "out", "preload", "index.js"),
    );
    expect(resolveRendererEntryPath(runtimeDirectory)).toBe(
      path.join("repo", "out", "renderer", "index.html"),
    );
  });

  test("resolves preload and renderer entries from an emitted main chunk", () => {
    const runtimeDirectory = path.join("repo", "out", "main", "chunks");

    expect(resolvePreloadScriptPath(runtimeDirectory)).toBe(
      path.join("repo", "out", "preload", "index.js"),
    );
    expect(resolveRendererEntryPath(runtimeDirectory)).toBe(
      path.join("repo", "out", "renderer", "index.html"),
    );
  });
});
