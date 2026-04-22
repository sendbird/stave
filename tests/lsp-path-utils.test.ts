import { describe, expect, test } from "bun:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { toLspDocumentUri, toLspWorkspaceRootUri, toWorkspaceFilePathFromUri } from "../electron/main/lsp/path-utils";

describe("LSP path utilities", () => {
  test("builds a root URI from the workspace path", () => {
    const rootPath = path.join(process.cwd(), "tmp-workspace");

    expect(toLspWorkspaceRootUri(rootPath)).toBe(pathToFileURL(path.resolve(rootPath)).toString());
  });

  test("round-trips workspace-relative document URIs", () => {
    const rootPath = path.join(process.cwd(), "tmp-workspace");
    const uri = toLspDocumentUri({
      rootPath,
      filePath: "/src/app.py",
    });

    expect(uri).toBe(pathToFileURL(path.join(path.resolve(rootPath), "src/app.py")).toString());
    expect(toWorkspaceFilePathFromUri({ rootPath, uri })).toBe("src/app.py");
  });

  test("rejects URIs outside the active workspace root", () => {
    const rootPath = path.join(process.cwd(), "tmp-workspace");
    const outsideUri = pathToFileURL(path.join(path.resolve(rootPath), "..", "outside.py")).toString();

    expect(toWorkspaceFilePathFromUri({ rootPath, uri: outsideUri })).toBeNull();
  });
});
