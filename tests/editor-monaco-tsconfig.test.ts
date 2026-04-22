import { describe, expect, test } from "bun:test";
import { parseWorkspaceTypeScriptCompilerOptions } from "@/components/layout/editor-monaco-tsconfig";

describe("parseWorkspaceTypeScriptCompilerOptions", () => {
  test("reads compiler options from tsconfig jsonc", () => {
    const parsed = parseWorkspaceTypeScriptCompilerOptions(`
      {
        // comment
        "compilerOptions": {
          "baseUrl": ".",
          "paths": {
            "@/*": ["./src/*",]
          },
          "moduleResolution": "Bundler",
          "jsx": "react-jsx"
        }
      }
    `);

    expect(parsed).toEqual({
      baseUrl: "",
      paths: {
        "@/*": ["src/*"],
      },
      moduleResolution: "Bundler",
      jsx: "react-jsx",
    });
  });

  test("preserves parent-relative path targets for baseUrl-relative aliases", () => {
    const parsed = parseWorkspaceTypeScriptCompilerOptions(`
      {
        "compilerOptions": {
          "baseUrl": "./app",
          "paths": {
            "history": ["../node_modules/history"],
            "@/*": ["./*"]
          }
        }
      }
    `);

    expect(parsed).toEqual({
      baseUrl: "app",
      paths: {
        history: ["../node_modules/history"],
        "@/*": ["*"],
      },
    });
  });

  test("returns null for invalid tsconfig text", () => {
    expect(parseWorkspaceTypeScriptCompilerOptions("{ nope")).toBeNull();
  });
});
