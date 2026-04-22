import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { readWorkspaceSourceFiles } from "../electron/main/ipc/filesystem-source-files";

const tempDirs: string[] = [];

function createTempWorkspace() {
  const workspaceRoot = mkdtempSync(path.join(tmpdir(), "stave-source-files-"));
  tempDirs.push(workspaceRoot);
  return workspaceRoot;
}

function writeText(filePath: string, value: string) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, value);
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("readWorkspaceSourceFiles", () => {
  test("returns canonical Monaco file URIs for workspace source models", async () => {
    const workspaceRoot = createTempWorkspace();
    writeText(path.join(workspaceRoot, "src/App.tsx"), "export const App = () => null;\n");
    writeText(path.join(workspaceRoot, "src/store/app.store.ts"), "export const useAppStore = () => null;\n");
    writeText(path.join(workspaceRoot, "scripts/build.mjs"), "export default {};\n");
    writeText(path.join(workspaceRoot, "src/legacy.jsx"), "export const Legacy = () => null;\n");

    const files = await readWorkspaceSourceFiles({ rootPath: workspaceRoot });
    const filePaths = files.map((file) => file.filePath).sort();

    expect(filePaths).toEqual([
      "file:///scripts/build.mjs",
      "file:///src/App.tsx",
      "file:///src/legacy.jsx",
      "file:///src/store/app.store.ts",
    ]);
  });

  test("skips test, story, and non-source support directories", async () => {
    const workspaceRoot = createTempWorkspace();
    writeText(path.join(workspaceRoot, "src/App.tsx"), "export const App = () => null;\n");
    writeText(path.join(workspaceRoot, "src/App.test.tsx"), "export const AppTest = () => null;\n");
    writeText(path.join(workspaceRoot, "src/App.stories.tsx"), "export const AppStory = () => null;\n");
    writeText(path.join(workspaceRoot, "__mocks__/api.ts"), "export const mockApi = {};\n");
    writeText(path.join(workspaceRoot, "docs/generated.ts"), "export const generated = {};\n");

    const files = await readWorkspaceSourceFiles({ rootPath: workspaceRoot });
    const filePaths = files.map((file) => file.filePath).sort();

    expect(filePaths).toEqual([
      "file:///src/App.tsx",
    ]);
  });

  test("focuses on the active file import graph for tsconfig path aliases", async () => {
    const workspaceRoot = createTempWorkspace();
    writeText(path.join(workspaceRoot, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        baseUrl: "./app",
        paths: {
          "@feather/*": ["./feather/*"],
        },
      },
    }));
    writeText(
      path.join(workspaceRoot, "app/main.tsx"),
      [
        "import { Button } from \"@feather/Button\";",
        "import { localValue } from \"./local\";",
        "export const App = () => Button + localValue;",
      ].join("\n"),
    );
    writeText(
      path.join(workspaceRoot, "app/feather/Button.tsx"),
      [
        "import { theme } from \"./theme\";",
        "export const Button = theme;",
      ].join("\n"),
    );
    writeText(path.join(workspaceRoot, "app/feather/theme.ts"), "export const theme = \"blue\";\n");
    writeText(path.join(workspaceRoot, "app/local.ts"), "export const localValue = 1;\n");
    writeText(path.join(workspaceRoot, "app/unrelated.ts"), "export const unrelated = true;\n");

    const files = await readWorkspaceSourceFiles({
      rootPath: workspaceRoot,
      entryFilePath: "app/main.tsx",
    });
    const filePaths = files.map((file) => file.filePath).sort();

    expect(filePaths).toEqual([
      "file:///app/feather/Button.tsx",
      "file:///app/feather/theme.ts",
      "file:///app/local.ts",
      "file:///app/main.tsx",
    ]);
  });

  test("throws a descriptive error when rootPath is missing", async () => {
    await expect(readWorkspaceSourceFiles({ rootPath: undefined })).rejects.toThrow("Workspace root path is required.");
  });
});
