import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { readWorkspaceTypeDefinitionFiles } from "../electron/main/ipc/filesystem-type-libs";

const tempDirs: string[] = [];

function createTempWorkspace() {
  const workspaceRoot = mkdtempSync(path.join(tmpdir(), "stave-type-libs-"));
  tempDirs.push(workspaceRoot);
  return workspaceRoot;
}

function writeJson(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2));
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

describe("readWorkspaceTypeDefinitionFiles", () => {
  test("preserves package type entry paths under node_modules", async () => {
    const workspaceRoot = createTempWorkspace();
    writeJson(path.join(workspaceRoot, "package.json"), {
      dependencies: {
        "lucide-react": "0.0.0",
      },
    });
    writeJson(path.join(workspaceRoot, "node_modules/lucide-react/package.json"), {
      name: "lucide-react",
      typings: "dist/lucide-react.d.ts",
    });
    writeText(
      path.join(workspaceRoot, "node_modules/lucide-react/dist/lucide-react.d.ts"),
      "export declare const Circle: () => null;\n",
    );

    const libs = await readWorkspaceTypeDefinitionFiles({ rootPath: workspaceRoot });
    const filePaths = libs.map((file) => file.filePath);

    expect(filePaths).toContain("file:///node_modules/lucide-react/package.json");
    expect(filePaths).toContain("file:///node_modules/lucide-react/dist/lucide-react.d.ts");
  });

  test("walks transitive package dependencies for downstream type imports", async () => {
    const workspaceRoot = createTempWorkspace();
    writeJson(path.join(workspaceRoot, "package.json"), {
      dependencies: {
        alpha: "0.0.0",
      },
    });
    writeJson(path.join(workspaceRoot, "node_modules/alpha/package.json"), {
      name: "alpha",
      types: "index.d.ts",
      dependencies: {
        beta: "0.0.0",
      },
    });
    writeText(
      path.join(workspaceRoot, "node_modules/alpha/index.d.ts"),
      "export type { BetaValue } from \"beta\";\n",
    );
    writeJson(path.join(workspaceRoot, "node_modules/beta/package.json"), {
      name: "beta",
      types: "types/index.d.ts",
    });
    writeText(
      path.join(workspaceRoot, "node_modules/beta/types/index.d.ts"),
      "export interface BetaValue { value: string; }\n",
    );

    const libs = await readWorkspaceTypeDefinitionFiles({ rootPath: workspaceRoot });
    const filePaths = libs.map((file) => file.filePath);

    expect(filePaths).toContain("file:///node_modules/alpha/index.d.ts");
    expect(filePaths).toContain("file:///node_modules/beta/package.json");
    expect(filePaths).toContain("file:///node_modules/beta/types/index.d.ts");
  });

  test("loads definitely typed packages for dependencies without bundled types", async () => {
    const workspaceRoot = createTempWorkspace();
    writeJson(path.join(workspaceRoot, "package.json"), {
      dependencies: {
        "better-sqlite3": "0.0.0",
      },
    });
    writeJson(path.join(workspaceRoot, "node_modules/better-sqlite3/package.json"), {
      name: "better-sqlite3",
    });
    writeJson(path.join(workspaceRoot, "node_modules/@types/better-sqlite3/package.json"), {
      name: "@types/better-sqlite3",
      types: "index.d.ts",
    });
    writeText(
      path.join(workspaceRoot, "node_modules/@types/better-sqlite3/index.d.ts"),
      "declare module \"better-sqlite3\" { export default class Database {} }\n",
    );

    const libs = await readWorkspaceTypeDefinitionFiles({ rootPath: workspaceRoot });
    const filePaths = libs.map((file) => file.filePath);

    expect(filePaths).toContain("file:///node_modules/@types/better-sqlite3/package.json");
    expect(filePaths).toContain("file:///node_modules/@types/better-sqlite3/index.d.ts");
  });

  test("prioritizes direct @types packages without walking versioned duplicate directories", async () => {
    const workspaceRoot = createTempWorkspace();
    writeJson(path.join(workspaceRoot, "package.json"), {
      devDependencies: {
        "@types/node": "0.0.0",
        "@types/react": "0.0.0",
      },
    });
    writeJson(path.join(workspaceRoot, "node_modules/@types/node/package.json"), {
      name: "@types/node",
      types: "index.d.ts",
    });
    writeText(path.join(workspaceRoot, "node_modules/@types/node/index.d.ts"), "export interface NodeRoot {}\n");
    writeText(path.join(workspaceRoot, "node_modules/@types/node/ts4.8/globals.d.ts"), "export interface LegacyNode {}\n");
    writeText(path.join(workspaceRoot, "node_modules/@types/node/ts4.8/stream.d.ts"), "export interface LegacyStream {}\n");
    writeJson(path.join(workspaceRoot, "node_modules/@types/react/package.json"), {
      name: "@types/react",
      types: "index.d.ts",
    });
    writeText(path.join(workspaceRoot, "node_modules/@types/react/index.d.ts"), "export interface ReactNode {}\n");

    const libs = await readWorkspaceTypeDefinitionFiles({
      rootPath: workspaceRoot,
      maxFileCount: 4,
      maxPackageCount: 10,
    });
    const filePaths = libs.map((file) => file.filePath);

    expect(filePaths).toContain("file:///node_modules/@types/react/index.d.ts");
    expect(filePaths.some((filePath) => filePath.includes("/ts4.8/"))).toBe(false);
  });

  test("prioritizes packages imported by the active file graph", async () => {
    const workspaceRoot = createTempWorkspace();
    writeJson(path.join(workspaceRoot, "package.json"), {
      dependencies: {
        alpha: "0.0.0",
        history: "0.0.0",
        "styled-components": "0.0.0",
      },
      devDependencies: {
        "@types/styled-components": "0.0.0",
      },
    });
    writeJson(path.join(workspaceRoot, "tsconfig.json"), {
      compilerOptions: {
        baseUrl: "./app",
      },
    });
    writeText(
      path.join(workspaceRoot, "app/main.tsx"),
      [
        "import { createBrowserHistory } from \"history\";",
        "import styled from \"styled-components\";",
        "export const App = styled.div`${createBrowserHistory}`;",
      ].join("\n"),
    );
    writeJson(path.join(workspaceRoot, "node_modules/alpha/package.json"), {
      name: "alpha",
      types: "index.d.ts",
    });
    writeText(path.join(workspaceRoot, "node_modules/alpha/index.d.ts"), "export interface Alpha {}\n");
    writeJson(path.join(workspaceRoot, "node_modules/history/package.json"), {
      name: "history",
      types: "index.d.ts",
    });
    writeText(path.join(workspaceRoot, "node_modules/history/index.d.ts"), "export declare function createBrowserHistory(): void;\n");
    writeJson(path.join(workspaceRoot, "node_modules/@types/styled-components/package.json"), {
      name: "@types/styled-components",
      types: "index.d.ts",
    });
    writeText(path.join(workspaceRoot, "node_modules/@types/styled-components/index.d.ts"), "export default function styled(): void;\n");

    const libs = await readWorkspaceTypeDefinitionFiles({
      rootPath: workspaceRoot,
      entryFilePath: "app/main.tsx",
      maxFileCount: 4,
      maxPackageCount: 8,
    });
    const filePaths = libs.map((file) => file.filePath);

    expect(filePaths).toContain("file:///node_modules/history/index.d.ts");
    expect(filePaths).toContain("file:///node_modules/@types/styled-components/index.d.ts");
    expect(filePaths).not.toContain("file:///node_modules/alpha/index.d.ts");
  });

  test("returns an empty library set when the workspace has no root package.json", async () => {
    const workspaceRoot = createTempWorkspace();

    const libs = await readWorkspaceTypeDefinitionFiles({ rootPath: workspaceRoot });

    expect(libs).toEqual([]);
  });

  test("throws a descriptive error when rootPath is missing", async () => {
    await expect(readWorkspaceTypeDefinitionFiles({ rootPath: undefined })).rejects.toThrow("Workspace root path is required.");
  });
});
