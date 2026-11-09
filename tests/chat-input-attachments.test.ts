import { describe, expect, test } from "bun:test";
import {
  buildAttachmentImportEntries,
  mergeAttachedFilePaths,
  resolveComposerFileAttachments,
  resolvePastedFileAbsolutePath,
  toWorkspaceRelativeFilePath,
} from "../src/components/session/chat-input.attachments";

function makeFile(overrides: { path?: string } = {}) {
  const file = new File(["content"], "App.tsx", { type: "text/plain" });
  if (overrides.path !== undefined) {
    Object.defineProperty(file, "path", { value: overrides.path });
  }
  return file;
}

describe("resolvePastedFileAbsolutePath", () => {
  test("prefers the preload getPathForFile bridge", () => {
    expect(
      resolvePastedFileAbsolutePath({
        file: makeFile({ path: "/legacy/App.tsx" }),
        getPathForFile: () => "/repo/src/App.tsx",
      }),
    ).toBe("/repo/src/App.tsx");
  });

  test("falls back to legacy File.path when the bridge returns empty", () => {
    expect(
      resolvePastedFileAbsolutePath({
        file: makeFile({ path: "/repo/src/App.tsx" }),
        getPathForFile: () => "",
      }),
    ).toBe("/repo/src/App.tsx");
  });

  test("falls back to legacy File.path when the bridge throws", () => {
    expect(
      resolvePastedFileAbsolutePath({
        file: makeFile({ path: "/repo/src/App.tsx" }),
        getPathForFile: () => {
          throw new Error("not a file");
        },
      }),
    ).toBe("/repo/src/App.tsx");
  });

  test("returns null when no path source is available", () => {
    expect(resolvePastedFileAbsolutePath({ file: makeFile() })).toBeNull();
  });

  test("returns null without the bridge when File.path is blank", () => {
    expect(
      resolvePastedFileAbsolutePath({ file: makeFile({ path: "  " }) }),
    ).toBeNull();
  });
});

describe("toWorkspaceRelativeFilePath", () => {
  test("returns a workspace-relative path for files inside the root", () => {
    expect(toWorkspaceRelativeFilePath({
      absolutePath: "/repo/src/App.tsx",
      rootPath: "/repo",
    })).toBe("src/App.tsx");
  });

  test("returns null for files outside the workspace root", () => {
    expect(toWorkspaceRelativeFilePath({
      absolutePath: "/other/src/App.tsx",
      rootPath: "/repo",
    })).toBeNull();
  });

  test("matches windows roots case-insensitively", () => {
    expect(toWorkspaceRelativeFilePath({
      absolutePath: "c:\\Repo\\src\\App.tsx",
      rootPath: "C:\\repo",
    })).toBe("src/App.tsx");
  });
});

test("does not alias separate POSIX workspace roots by case", () => {
  expect(toWorkspaceRelativeFilePath({
    absolutePath: "/tmp/Repo/screenshot.png",
    rootPath: "/tmp/repo",
  })).toBeNull();
});

describe("buildAttachmentImportEntries", () => {
  test("sends the disk path when there is one, and bytes otherwise", async () => {
    const withPath = makeFile({ path: "/Users/me/Downloads/App.tsx" });
    const withoutPath = new File(["hi"], "clip.txt", { type: "text/plain" });
    const entries = await buildAttachmentImportEntries({ files: [withPath, withoutPath] });
    expect(entries[0]).toEqual({ absolutePath: "/Users/me/Downloads/App.tsx" });
    expect(entries[1] && "data" in entries[1] ? [entries[1].name, Array.from(entries[1].data)] : null)
      .toEqual(["clip.txt", [104, 105]]);
  });
});

describe("mergeAttachedFilePaths", () => {
  test("appends new paths once and keeps order", () => {
    expect(mergeAttachedFilePaths(["a.ts"], ["b.ts", "a.ts", "", "b.ts"])).toEqual(["a.ts", "b.ts"]);
  });
});

describe("resolveComposerFileAttachments", () => {
  test("hands files from anywhere to the desktop import bridge", async () => {
    const calls: unknown[] = [];
    const result = await resolveComposerFileAttachments({
      files: [makeFile({ path: "/Users/me/Desktop/App.tsx" })],
      rootPath: "/repo",
      importAttachments: async (args) => {
        calls.push(args);
        return { filePaths: [".stave/attachments/ab12cd34/App.tsx"], failures: [] };
      },
    });
    expect(calls).toEqual([{ rootPath: "/repo", entries: [{ absolutePath: "/Users/me/Desktop/App.tsx" }] }]);
    expect(result.filePaths).toEqual([".stave/attachments/ab12cd34/App.tsx"]);
  });

  test("reports every file as failed when the bridge throws", async () => {
    const result = await resolveComposerFileAttachments({
      files: [makeFile({ path: "/x/App.tsx" })],
      rootPath: "/repo",
      importAttachments: async () => { throw new Error("ipc down"); },
    });
    expect(result).toEqual({ filePaths: [], failures: [{ name: "App.tsx" }] });
  });

  test("without the bridge keeps only workspace files", async () => {
    const result = await resolveComposerFileAttachments({
      files: [makeFile({ path: "/repo/src/App.tsx" }), makeFile({ path: "/elsewhere/App.tsx" })],
      rootPath: "/repo",
    });
    expect(result).toEqual({ filePaths: ["src/App.tsx"], failures: [] });
  });
});
