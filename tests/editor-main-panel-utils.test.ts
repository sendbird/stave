import { describe, expect, test } from "bun:test";
import { buildDiffEditorModelPath, releaseDiffEditorModels } from "../src/components/layout/editor-main-panel.utils";

describe("releaseDiffEditorModels", () => {
  test("detaches the diff editor model before disposing both sides", () => {
    const calls: string[] = [];
    const editor = {
      getModel: () => ({
        original: {
          dispose: () => {
            calls.push("dispose:original");
          },
        },
        modified: {
          dispose: () => {
            calls.push("dispose:modified");
          },
        },
      }),
      setModel: (_model: null) => {
        calls.push("setModel:null");
      },
    };

    const released = releaseDiffEditorModels(editor);

    expect(released).toBe(true);
    expect(calls).toEqual([
      "setModel:null",
      "dispose:original",
      "dispose:modified",
    ]);
  });

  test("is a no-op when no diff model is attached", () => {
    const editor = {
      getModel: () => null,
      setModel: (_model: null) => {
        throw new Error("setModel should not be called");
      },
    };

    expect(releaseDiffEditorModels(editor)).toBe(false);
    expect(releaseDiffEditorModels(null)).toBe(false);
  });
});

describe("buildDiffEditorModelPath", () => {
  test("creates unique model paths per tab and side for the same file", () => {
    const firstOriginal = buildDiffEditorModelPath({
      filePath: "src/note.ts",
      tabId: "chat-diff:a",
      side: "original",
    });
    const secondOriginal = buildDiffEditorModelPath({
      filePath: "src/note.ts",
      tabId: "chat-diff:b",
      side: "original",
    });
    const firstModified = buildDiffEditorModelPath({
      filePath: "src/note.ts",
      tabId: "chat-diff:a",
      side: "modified",
    });

    expect(firstOriginal).toContain("diffTab=chat-diff%3Aa");
    expect(firstOriginal).toContain("side=original");
    expect(firstModified).toContain("side=modified");
    expect(firstOriginal).not.toBe(secondOriginal);
    expect(firstOriginal).not.toBe(firstModified);
  });
});
