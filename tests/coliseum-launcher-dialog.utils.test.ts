import { describe, expect, test } from "bun:test";
import {
  getColiseumDefaultModelForProvider,
  isColiseumSubmitShortcut,
  mergeColiseumAttachedFilePaths,
  resolveColiseumInitialModel,
  resolveColiseumAttachmentFileContexts,
} from "@/components/session/coliseum-launcher-dialog.utils";

describe("resolveColiseumAttachmentFileContexts", () => {
  test("prefers open editor content and reads unopened files from disk", async () => {
    const result = await resolveColiseumAttachmentFileContexts({
      attachedFilePaths: ["src/open.ts", "README.md"],
      editorTabs: [
        {
          filePath: "src/open.ts",
          content: "export const fromEditor = true;",
          language: "typescript",
        },
      ],
      workspaceRootPath: "/repo",
      readFile: async ({ filePath }) => ({
        ok: true,
        content: `file:${filePath}`,
      }),
    });

    expect(result.unreadableFilePaths).toEqual([]);
    expect(result.fileContexts).toEqual([
      {
        filePath: "src/open.ts",
        content: "export const fromEditor = true;",
        language: "typescript",
      },
      {
        filePath: "README.md",
        content: "file:README.md",
        language: "markdown",
      },
    ]);
  });

  test("dedupes inputs and reports unreadable files", async () => {
    const result = await resolveColiseumAttachmentFileContexts({
      attachedFilePaths: ["src/missing.ts", "src/missing.ts", "src/ok.ts"],
      editorTabs: [],
      workspaceRootPath: "/repo",
      readFile: async ({ filePath }) =>
        filePath === "src/ok.ts"
          ? { ok: true, content: "export const ok = true;" }
          : { ok: false, content: "" },
    });

    expect(result.fileContexts).toEqual([
      {
        filePath: "src/ok.ts",
        content: "export const ok = true;",
        language: "typescript",
      },
    ]);
    expect(result.unreadableFilePaths).toEqual(["src/missing.ts"]);
  });
});

describe("mergeColiseumAttachedFilePaths", () => {
  test("keeps existing order and appends only new trimmed paths", () => {
    expect(
      mergeColiseumAttachedFilePaths({
        existing: ["src/a.ts"],
        incoming: [" src/b.ts ", "src/a.ts", ""],
      }),
    ).toEqual(["src/a.ts", "src/b.ts"]);
  });
});

describe("getColiseumDefaultModelForProvider", () => {
  test("uses Opus 4.7 as the Claude default inside Coliseum", () => {
    expect(
      getColiseumDefaultModelForProvider({ providerId: "claude-code" }),
    ).toBe("claude-opus-4-7");
  });

  test("keeps non-Claude providers on their registry defaults", () => {
    expect(getColiseumDefaultModelForProvider({ providerId: "codex" })).toBe(
      "gpt-5.4",
    );
    expect(getColiseumDefaultModelForProvider({ providerId: "stave" })).toBe(
      "stave-auto",
    );
  });
});

describe("resolveColiseumInitialModel", () => {
  test("forces Claude Coliseum rows onto Opus 4.7 even when a different Claude model was preferred", () => {
    expect(
      resolveColiseumInitialModel({
        providerId: "claude-code",
        preferredModel: "claude-sonnet-4-6",
      }),
    ).toBe("claude-opus-4-7");
  });

  test("preserves an explicit non-Claude preferred model", () => {
    expect(
      resolveColiseumInitialModel({
        providerId: "codex",
        preferredModel: "gpt-5.4-mini",
      }),
    ).toBe("gpt-5.4-mini");
  });
});

describe("isColiseumSubmitShortcut", () => {
  test("accepts Ctrl/Cmd+Enter and rejects plain Enter or composing input", () => {
    expect(
      isColiseumSubmitShortcut({ key: "Enter", ctrlKey: true }),
    ).toBe(true);
    expect(
      isColiseumSubmitShortcut({ key: "Enter", metaKey: true }),
    ).toBe(true);
    expect(isColiseumSubmitShortcut({ key: "Enter" })).toBe(false);
    expect(
      isColiseumSubmitShortcut({
        key: "Enter",
        metaKey: true,
        isComposing: true,
      }),
    ).toBe(false);
  });
});
