import { describe, expect, test } from "bun:test";
import {
  buildSourceControlDiffPreview,
  parseUnifiedDiffToBuffers,
  resolveSourceControlDiffPaths,
} from "../src/lib/source-control-diff";

describe("resolveSourceControlDiffPaths", () => {
  test("splits rename paths into head and working tree targets", () => {
    expect(resolveSourceControlDiffPaths({ rawPath: "src/old.ts -> src/new.ts" })).toEqual({
      displayPath: "src/old.ts -> src/new.ts",
      headPath: "src/old.ts",
      pathspecs: ["src/old.ts", "src/new.ts"],
      workingTreePath: "src/new.ts",
    });
  });

  test("keeps non-rename paths unchanged", () => {
    expect(resolveSourceControlDiffPaths({ rawPath: "src/app.ts" })).toEqual({
      displayPath: "src/app.ts",
      headPath: "src/app.ts",
      pathspecs: ["src/app.ts"],
      workingTreePath: "src/app.ts",
    });
  });
});

describe("buildSourceControlDiffPreview", () => {
  test("adds staged and unstaged section headers only when patches exist", () => {
    expect(buildSourceControlDiffPreview({
      stagedPatch: "diff --git a/a.ts b/a.ts",
      unstagedPatch: "diff --git a/a.ts b/a.ts",
    })).toBe("# Staged\ndiff --git a/a.ts b/a.ts\n\n# Unstaged\ndiff --git a/a.ts b/a.ts");

    expect(buildSourceControlDiffPreview({})).toBe("No diff output.");
  });
});

describe("parseUnifiedDiffToBuffers", () => {
  test("ignores SCM section labels and diff metadata when reconstructing buffers", () => {
    const parsed = parseUnifiedDiffToBuffers({
      patch: [
        "# Staged",
        "diff --git a/README.md b/README.md",
        "new file mode 100644",
        "index 0000000..1234567",
        "--- /dev/null",
        "+++ b/README.md",
        "@@ -0,0 +1,2 @@",
        "+hello",
        "+world",
        "\\ No newline at end of file",
      ].join("\n"),
    });

    expect(parsed).toEqual({
      oldContent: "",
      newContent: "hello\nworld",
    });
  });

  test("keeps context lines while applying additions and removals", () => {
    const parsed = parseUnifiedDiffToBuffers({
      patch: [
        "diff --git a/note.txt b/note.txt",
        "index 1111111..2222222 100644",
        "--- a/note.txt",
        "+++ b/note.txt",
        "@@ -1,3 +1,3 @@",
        " alpha",
        "-beta",
        "+beta updated",
        " gamma",
      ].join("\n"),
    });

    expect(parsed).toEqual({
      oldContent: "alpha\nbeta\ngamma",
      newContent: "alpha\nbeta updated\ngamma",
    });
  });
});
