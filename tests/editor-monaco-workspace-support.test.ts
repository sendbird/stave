import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { syncWorkspaceMonacoSupport } from "../src/components/layout/editor-monaco-workspace-support";

const tempDirs: string[] = [];
const originalWindow = globalThis.window;

function createTempWorkspace() {
  const workspaceRoot = mkdtempSync(path.join(tmpdir(), "stave-monaco-support-"));
  tempDirs.push(workspaceRoot);
  return workspaceRoot;
}

function createFakeMonaco() {
  const models = new Map<string, { dispose(): void }>();
  const extraLibAddCounts = new Map<string, number>();
  const compilerOptions: unknown[] = [];
  const diagnosticsOptions: unknown[] = [];

  function incrementCount(map: Map<string, number>, key: string) {
    map.set(key, (map.get(key) ?? 0) + 1);
  }

  const monaco = {
    Uri: {
      parse: (value: string) => value,
    },
    editor: {
      getModel: (uri: string) => models.get(uri) ?? null,
      createModel: () => {
        throw new Error("Workspace support should not create hidden Monaco models.");
      },
    },
    languages: {
      typescript: {
        typescriptDefaults: {
          addExtraLib: (_content: string, filePath: string) => {
            incrementCount(extraLibAddCounts, filePath);
            return {
              dispose: () => {},
            };
          },
          setCompilerOptions: (options: unknown) => compilerOptions.push(options),
          setDiagnosticsOptions: (options: unknown) => diagnosticsOptions.push(options),
          setEagerModelSync: (_enabled: boolean) => {},
        },
        javascriptDefaults: {
          addExtraLib: (_content: string, filePath: string) => {
            incrementCount(extraLibAddCounts, filePath);
            return {
              dispose: () => {},
            };
          },
          setCompilerOptions: (options: unknown) => compilerOptions.push(options),
          setDiagnosticsOptions: (options: unknown) => diagnosticsOptions.push(options),
          setEagerModelSync: (_enabled: boolean) => {},
        },
        ScriptTarget: {
          ESNext: 99,
          ES2022: 98,
        },
        ModuleKind: {
          ESNext: 1,
        },
        ModuleResolutionKind: {
          Bundler: 2,
          NodeJs: 3,
        },
        JsxEmit: {
          ReactJSX: 4,
        },
      },
    },
  };

  return {
    monaco,
    models,
    extraLibAddCounts,
    compilerOptions,
    diagnosticsOptions,
  };
}

async function flushAsyncWork() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

afterEach(async () => {
  syncWorkspaceMonacoSupport({
    monaco: null,
    workspaceRootPath: "",
    shouldLoadWorkspaceSupport: false,
  });
  if (originalWindow === undefined) {
    delete (globalThis as typeof globalThis & { window?: typeof window }).window;
  } else {
    globalThis.window = originalWindow;
  }
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
  await flushAsyncWork();
});

describe("syncWorkspaceMonacoSupport", () => {
  test("applies tsconfig compiler options without creating hidden models or extra libs", async () => {
    const workspaceRoot = createTempWorkspace();
    const fakeMonaco = createFakeMonaco();
    const readFilePaths: string[] = [];
    writeFileSync(
      path.join(workspaceRoot, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          baseUrl: "./src",
          paths: {
            "@/*": ["./*"],
          },
        },
      }),
    );

    globalThis.window = {
      api: {
        fs: {
          readFile: async ({ filePath }: { filePath: string }) => {
            readFilePaths.push(filePath);
            return {
              ok: true,
              content: readFileSync(path.join(workspaceRoot, filePath), "utf8"),
            };
          },
        },
      },
    } as typeof window;

    syncWorkspaceMonacoSupport({
      monaco: fakeMonaco.monaco as never,
      workspaceRootPath: workspaceRoot,
      shouldLoadWorkspaceSupport: true,
      entryFilePath: "src/a.ts",
    });
    await flushAsyncWork();

    expect(fakeMonaco.models.size).toBe(0);
    expect(fakeMonaco.extraLibAddCounts.size).toBe(0);
    expect(readFilePaths).toEqual(["tsconfig.json"]);
    expect(fakeMonaco.compilerOptions).toContainEqual(
      expect.objectContaining({
        baseUrl: "file:///src",
        paths: { "@/*": ["*"] },
      }),
    );
    expect(fakeMonaco.diagnosticsOptions.at(-1)).toEqual(
      expect.objectContaining({ noSemanticValidation: false }),
    );
  });

  test("does not reload compiler options when switching files in the same workspace", async () => {
    const workspaceRoot = createTempWorkspace();
    const fakeMonaco = createFakeMonaco();
    const readFilePaths: string[] = [];
    writeFileSync(path.join(workspaceRoot, "tsconfig.json"), "{}");

    globalThis.window = {
      api: {
        fs: {
          readFile: async ({ filePath }: { filePath: string }) => {
            readFilePaths.push(filePath);
            return { ok: true, content: "{}" };
          },
        },
      },
    } as typeof window;

    syncWorkspaceMonacoSupport({
      monaco: fakeMonaco.monaco as never,
      workspaceRootPath: workspaceRoot,
      shouldLoadWorkspaceSupport: true,
      entryFilePath: "src/a.ts",
    });
    await flushAsyncWork();

    syncWorkspaceMonacoSupport({
      monaco: fakeMonaco.monaco as never,
      workspaceRootPath: workspaceRoot,
      shouldLoadWorkspaceSupport: true,
      entryFilePath: "src/b.ts",
    });
    await flushAsyncWork();

    expect(readFilePaths).toEqual(["tsconfig.json"]);
    expect(fakeMonaco.extraLibAddCounts.size).toBe(0);
  });

  test("disables TypeScript semantic diagnostics when the active tab does not need workspace support", async () => {
    const workspaceRoot = createTempWorkspace();
    const fakeMonaco = createFakeMonaco();

    globalThis.window = {
      api: {
        fs: {
          readFile: async () => ({ ok: false, stderr: "missing" }),
        },
      },
    } as typeof window;

    syncWorkspaceMonacoSupport({
      monaco: fakeMonaco.monaco as never,
      workspaceRootPath: workspaceRoot,
      shouldLoadWorkspaceSupport: true,
      entryFilePath: "src/a.ts",
    });
    await flushAsyncWork();

    syncWorkspaceMonacoSupport({
      monaco: fakeMonaco.monaco as never,
      workspaceRootPath: workspaceRoot,
      shouldLoadWorkspaceSupport: false,
      entryFilePath: undefined,
    });
    await flushAsyncWork();

    expect(fakeMonaco.models.size).toBe(0);
    expect(fakeMonaco.extraLibAddCounts.size).toBe(0);
    expect(fakeMonaco.diagnosticsOptions.at(-1)).toEqual(
      expect.objectContaining({ noSemanticValidation: true }),
    );
  });
});
