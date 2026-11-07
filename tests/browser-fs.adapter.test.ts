import { afterEach, describe, expect, test } from "bun:test";
import { WORKSPACE_HTML_FILE_PREVIEW_MAX_BYTES } from "../src/lib/fs/file-preview-limits";
import { BrowserFsAdapter } from "../src/lib/fs/browser-fs.adapter";

type FakeFileHandle = {
  kind: "file";
  name: string;
};

type FakeDirectoryHandle = {
  kind: "directory";
  name: string;
  children: Array<[string, FakeHandle]>;
};

type FakeHandle = FakeFileHandle | FakeDirectoryHandle;

function createFile(name: string): FakeFileHandle {
  return {
    kind: "file",
    name,
  };
}

function createDirectory(name: string, children: Array<[string, FakeHandle]>): FakeDirectoryHandle {
  return {
    kind: "directory",
    name,
    children,
    async *entries() {
      for (const child of children) {
        yield child;
      }
    },
  };
}

const originalWindow = globalThis.window;

afterEach(() => {
  globalThis.window = originalWindow;
});

describe("BrowserFsAdapter", () => {
  test("keeps hidden files and useful dot-directories while skipping ignored directories during root discovery", async () => {
    const rootHandle = createDirectory("fixture", [
      [".env", createFile(".env")],
      [".github", createDirectory(".github", [["workflows", createDirectory("workflows", [["ci.yml", createFile("ci.yml")]])]])],
      ["empty-folder", createDirectory("empty-folder", [])],
      ["src", createDirectory("src", [["index.ts", createFile("index.ts")]])],
      [".git", createDirectory(".git", [["config", createFile("config")]])],
      ["node_modules", createDirectory("node_modules", [["pkg.js", createFile("pkg.js")]])],
    ]);

    globalThis.window = {
      showDirectoryPicker: async () => rootHandle,
    } as Window & { showDirectoryPicker: () => Promise<FakeDirectoryHandle> };

    const adapter = new BrowserFsAdapter();
    const root = await adapter.pickRoot();

    expect(root?.files).toEqual([
      ".env",
      ".github/workflows/ci.yml",
      "src/index.ts",
    ]);

    await expect(adapter.listDirectory({})).resolves.toEqual([
      { name: ".github", path: ".github", type: "folder" },
      { name: "empty-folder", path: "empty-folder", type: "folder" },
      { name: "src", path: "src", type: "folder" },
      { name: ".env", path: ".env", type: "file" },
    ]);
    await expect(adapter.listDirectory({ directoryPath: ".github" })).resolves.toEqual([
      { name: "workflows", path: ".github/workflows", type: "folder" },
    ]);
  });
});

describe("HTML file preview size policy", () => {
  for (const name of ["artifact.html", "ARTIFACT.HTM"]) {
    test(`${name} reads 10 MiB including multibyte text, then refuses an extra byte`, async () => {
      const content = "한".repeat(Math.floor(WORKSPACE_HTML_FILE_PREVIEW_MAX_BYTES / 3)) + "x";
      let file = new File([content], name);
      expect(file.size).toBe(WORKSPACE_HTML_FILE_PREVIEW_MAX_BYTES);
      const rootHandle = createDirectory("fixture", [[name, {
        ...createFile(name),
        getFile: async () => file,
      } as FakeFileHandle]]);
      globalThis.window = { showDirectoryPicker: async () => rootHandle } as unknown as Window;
      const adapter = new BrowserFsAdapter();
      await adapter.pickRoot();
      expect((await adapter.readFile({ filePath: name }))?.content).toBe(content);
      file = new File([content, "x"], name);
      expect(await adapter.readFile({ filePath: name })).toMatchObject({
        content: "",
        tooLarge: true,
        sizeBytes: WORKSPACE_HTML_FILE_PREVIEW_MAX_BYTES + 1,
        maxSizeBytes: WORKSPACE_HTML_FILE_PREVIEW_MAX_BYTES,
      });
    });
  }

  test("other text still refuses more than 1 MiB before reading content", async () => {
    const rootHandle = createDirectory("fixture", [["large.ts", {
      ...createFile("large.ts"),
      getFile: async () => new File(["x".repeat(1024 * 1024 + 1)], "large.ts"),
    } as FakeFileHandle]]);
    globalThis.window = { showDirectoryPicker: async () => rootHandle } as unknown as Window;
    const adapter = new BrowserFsAdapter();
    await adapter.pickRoot();
    expect(await adapter.readFile({ filePath: "large.ts" })).toMatchObject({
      content: "", tooLarge: true, maxSizeBytes: 1024 * 1024,
    });
  });
});
