import { describe, expect, test } from "bun:test";
import {
  getSourceControlDisplayCode,
  getSourceControlStatuses,
  hasSourceControlConflicts,
  hasSourceControlStagedChanges,
  hasSourceControlUnstagedChanges,
  isSourceControlUntracked,
  parseSourceControlStatusLines,
} from "@/lib/source-control-status";

describe("parseSourceControlStatusLines", () => {
  test("preserves raw index and working tree status columns", () => {
    expect(parseSourceControlStatusLines({
      stdout: " M README.md\nM  src/app.ts\n?? src/new.ts\n",
    })).toEqual([
      {
        code: "M",
        path: "README.md",
        indexStatus: " ",
        workingTreeStatus: "M",
      },
      {
        code: "M",
        path: "src/app.ts",
        indexStatus: "M",
        workingTreeStatus: " ",
      },
      {
        code: "??",
        path: "src/new.ts",
        indexStatus: "?",
        workingTreeStatus: "?",
      },
    ]);
  });

  test("reads NUL-delimited records as exact paths with rename sources", () => {
    expect(parseSourceControlStatusLines({
      stdout: [
        "R  docs/새 이름.md\0docs/old name.md",
        ' M src/"quoted".ts',
        "?? src/new file.ts",
        "",
      ].join("\0"),
    })).toEqual([
      {
        code: "R",
        path: "docs/새 이름.md",
        oldPath: "docs/old name.md",
        indexStatus: "R",
        workingTreeStatus: " ",
      },
      {
        code: "M",
        path: 'src/"quoted".ts',
        indexStatus: " ",
        workingTreeStatus: "M",
      },
      {
        code: "??",
        path: "src/new file.ts",
        indexStatus: "?",
        workingTreeStatus: "?",
      },
    ]);
  });

  test("unquotes escaped display paths from newline-delimited output", () => {
    expect(parseSourceControlStatusLines({
      stdout: [
        'A  "\\355\\225\\234\\352\\270\\200.txt"',
        'R  "docs/old name.md" -> "docs/new name.md"',
        'M  "src/tab\\there.ts"',
        "",
      ].join("\n"),
    })).toEqual([
      {
        code: "A",
        path: "한글.txt",
        indexStatus: "A",
        workingTreeStatus: " ",
      },
      {
        code: "R",
        path: "docs/new name.md",
        oldPath: "docs/old name.md",
        indexStatus: "R",
        workingTreeStatus: " ",
      },
      {
        code: "M",
        path: "src/tab\there.ts",
        indexStatus: "M",
        workingTreeStatus: " ",
      },
    ]);
  });

  test("keeps trailing whitespace that belongs to a NUL-delimited path", () => {
    expect(parseSourceControlStatusLines({
      stdout: "?? src/trailing space \0",
    })).toEqual([
      {
        code: "??",
        path: "src/trailing space ",
        indexStatus: "?",
        workingTreeStatus: "?",
      },
    ]);
  });
});

describe("source control status helpers", () => {
  test("detects staged, unstaged, untracked, and conflicted items", () => {
    const mixed = { code: "MM", path: "src/mixed.ts" };
    const untracked = { code: "??", path: "src/new.ts" };
    const conflict = { code: "UU", path: "src/conflict.ts" };

    expect(getSourceControlStatuses({ item: mixed })).toEqual({
      indexStatus: "M",
      workingTreeStatus: "M",
    });
    expect(getSourceControlDisplayCode({ item: mixed })).toBe("MM");
    expect(hasSourceControlStagedChanges({ item: mixed })).toBe(true);
    expect(hasSourceControlUnstagedChanges({ item: mixed })).toBe(true);
    expect(isSourceControlUntracked({ item: mixed })).toBe(false);
    expect(hasSourceControlConflicts({ item: mixed })).toBe(false);

    expect(isSourceControlUntracked({ item: untracked })).toBe(true);
    expect(hasSourceControlStagedChanges({ item: untracked })).toBe(false);
    expect(hasSourceControlUnstagedChanges({ item: untracked })).toBe(false);

    expect(hasSourceControlConflicts({ item: conflict })).toBe(true);
  });

  test("treats legacy single-letter codes as working-tree changes", () => {
    const item = { code: "M", path: "README.md" };

    expect(getSourceControlStatuses({ item })).toEqual({
      indexStatus: " ",
      workingTreeStatus: "M",
    });
    expect(hasSourceControlStagedChanges({ item })).toBe(false);
    expect(hasSourceControlUnstagedChanges({ item })).toBe(true);
  });
});
