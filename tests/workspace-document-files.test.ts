import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readWorkspaceDocumentFiles } from "../electron/persistence/workspace-document-files";
import { MAX_WORKSPACE_DOCUMENT_CHARS } from "@/lib/documents/workspace-document-schemas";

describe("readWorkspaceDocumentFiles", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "stave-documents-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("reads Markdown files directly inside both document directories", async () => {
    await mkdir(path.join(root, ".stave/context/plans/nested"), { recursive: true });
    await mkdir(path.join(root, ".stave/plans"), { recursive: true });
    await writeFile(path.join(root, ".stave/context/plans/b.md"), "# B\n");
    await writeFile(path.join(root, ".stave/context/plans/a.md"), "# A\n");
    await writeFile(path.join(root, ".stave/context/plans/notes.txt"), "skip");
    await writeFile(path.join(root, ".stave/context/plans/nested/deep.md"), "skip");
    await writeFile(path.join(root, ".stave/plans/old.md"), "# Old\n");

    expect(await readWorkspaceDocumentFiles(root)).toEqual([
      { filePath: ".stave/context/plans/a.md", content: "# A\n" },
      { filePath: ".stave/context/plans/b.md", content: "# B\n" },
      { filePath: ".stave/plans/old.md", content: "# Old\n" },
    ]);
  });

  test("skips oversized files and symlinks, and tolerates missing directories", async () => {
    expect(await readWorkspaceDocumentFiles(root)).toEqual([]);
    await mkdir(path.join(root, ".stave/context/plans"), { recursive: true });
    await writeFile(
      path.join(root, ".stave/context/plans/huge.md"),
      "x".repeat(MAX_WORKSPACE_DOCUMENT_CHARS + 1),
    );
    await writeFile(path.join(root, "outside.md"), "# Outside\n");
    await symlink(
      path.join(root, "outside.md"),
      path.join(root, ".stave/context/plans/link.md"),
    );

    expect(await readWorkspaceDocumentFiles(root)).toEqual([]);
  });
});
