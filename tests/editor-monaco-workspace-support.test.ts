import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
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
  const modelDisposeCounts = new Map<string, number>();
  const extraLibDisposeCounts = new Map<string, number>();

  function incrementCount(map: Map<string, number>, key: string) {
    map.set(key, (map.get(key) ?? 0) + 1);
  }

  const monaco = {
    Uri: {
      parse: (value: string) => value,
    },
    editor: {
      getModel: (uri: string) => models.get(uri) ?? null,
      createModel: (_content: string, _language: string | undefined, uri: string) => {
        const model = {
          dispose: () => {
            incrementCount(modelDisposeCounts, uri);
            models.delete(uri);
          },
        };
        models.set(uri, model);
        return model;
      },
    },
    languages: {
      typescript: {
        typescriptDefaults: {
          addExtraLib: (_content: string, filePath: string) => ({
            dispose: () => incrementCount(extraLibDisposeCounts, filePath),
          }),
          setCompilerOptions: (_options: unknown) => {},
          setDiagnosticsOptions: (_options: unknown) => {},
          setEagerModelSync: (_enabled: boolean) => {},
        },
        javascriptDefaults: {
          addExtraLib: (_content: string, filePath: string) => ({
            dispose: () => incrementCount(extraLibDisposeCounts, filePath),
          }),
          setCompilerOptions: (_options: unknown) => {},
          setDiagnosticsOptions: (_options: unknown) => {},
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
    modelDisposeCounts,
    extraLibDisposeCounts,
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
  test("replaces the focused workspace support context instead of accumulating models", async () => {
    const workspaceRoot = createTempWorkspace();
    const fakeMonaco = createFakeMonaco();

    globalThis.window = {
      api: {
        fs: {
          readTypeDefs: async ({ entryFilePath }: { entryFilePath?: string }) => ({
            ok: true,
            libs: entryFilePath === "src/a.ts"
              ? [{ content: "export {};", filePath: "file:///node_modules/@types/a/index.d.ts" }]
              : [{ content: "export {};", filePath: "file:///node_modules/@types/b/index.d.ts" }],
          }),
          readSourceFiles: async ({ entryFilePath }: { entryFilePath?: string }) => ({
            ok: true,
            files: entryFilePath === "src/a.ts"
              ? [{ content: "export const a = true;", filePath: "file:///src/support/a-dep.ts" }]
              : [{ content: "export const b = true;", filePath: "file:///src/support/b-dep.ts" }],
          }),
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

    expect(Array.from(fakeMonaco.models.keys())).toEqual([
      "file:///src/support/a-dep.ts",
    ]);

    syncWorkspaceMonacoSupport({
      monaco: fakeMonaco.monaco as never,
      workspaceRootPath: workspaceRoot,
      shouldLoadWorkspaceSupport: true,
      entryFilePath: "src/b.ts",
    });
    await flushAsyncWork();

    expect(fakeMonaco.modelDisposeCounts.get("file:///src/support/a-dep.ts")).toBe(
      1,
    );
    expect(
      fakeMonaco.extraLibDisposeCounts.get(
        "file:///node_modules/@types/a/index.d.ts",
      ),
    ).toBe(2);
    expect(
      fakeMonaco.extraLibDisposeCounts.get("file:///src/support/a-dep.ts"),
    ).toBe(2);
    expect(Array.from(fakeMonaco.models.keys())).toEqual([
      "file:///src/support/b-dep.ts",
    ]);
  });

  test("clears focused workspace support when the active tab no longer needs it", async () => {
    const workspaceRoot = createTempWorkspace();
    const fakeMonaco = createFakeMonaco();

    globalThis.window = {
      api: {
        fs: {
          readTypeDefs: async () => ({
            ok: true,
            libs: [
              {
                content: "export {};",
                filePath: "file:///node_modules/@types/a/index.d.ts",
              },
            ],
          }),
          readSourceFiles: async () => ({
            ok: true,
            files: [
              {
                content: "export const a = true;",
                filePath: "file:///src/support/a-dep.ts",
              },
            ],
          }),
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
    expect(fakeMonaco.modelDisposeCounts.get("file:///src/support/a-dep.ts")).toBe(
      1,
    );
    expect(
      fakeMonaco.extraLibDisposeCounts.get(
        "file:///node_modules/@types/a/index.d.ts",
      ),
    ).toBe(2);
    expect(
      fakeMonaco.extraLibDisposeCounts.get("file:///src/support/a-dep.ts"),
    ).toBe(2);
  });
});
