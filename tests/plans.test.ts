import { describe, expect, test } from "bun:test";
import {
  buildWorkspacePlanListEntries,
  buildWorkspacePlanFilePath,
  deleteWorkspacePlanFile,
  extractPlanTodoItems,
  isWorkspacePlanFilePath,
  MAX_WORKSPACE_PLANS,
  parseWorkspacePlanFilePath,
  persistWorkspacePlanFile,
  sortWorkspacePlansNewestFirst,
} from "@/lib/plans";

type FsCreateDirectoryResult =
  { ok: true } | { ok: false; alreadyExists?: boolean; stderr?: string };

type FsWriteFileResult = { ok: boolean; stderr?: string };
type FsDeleteFileResult = { ok: boolean; stderr?: string };

type StubApi = {
  fs: {
    createDirectory: (args: unknown) => Promise<FsCreateDirectoryResult>;
    writeFile: (args: unknown) => Promise<FsWriteFileResult>;
    deleteFile?: (args: unknown) => Promise<FsDeleteFileResult>;
  };
};

function installStubApi(api: StubApi) {
  const globalScope = globalThis as unknown as { window?: { api?: StubApi } };
  const originalWindow = globalScope.window;
  globalScope.window = { ...(originalWindow ?? {}), api };
  return () => {
    if (originalWindow === undefined) {
      delete globalScope.window;
    } else {
      globalScope.window = originalWindow;
    }
  };
}

describe("extractPlanTodoItems", () => {
  test("extracts task-list checkboxes with completion state", () => {
    const items = extractPlanTodoItems(
      [
        "# Plan",
        "",
        "- [ ] First task",
        "- [x] Second done",
        "* [X] Third done",
        "+ [ ] Fourth task",
        "Some prose that is not a task.",
      ].join("\n"),
    );
    expect(items).toEqual([
      { text: "First task", completed: false },
      { text: "Second done", completed: true },
      { text: "Third done", completed: true },
      { text: "Fourth task", completed: false },
    ]);
  });

  test("falls back to numbered list items when no checkboxes exist", () => {
    const items = extractPlanTodoItems(
      ["1. Set up", "2) Build", "- a plain bullet", "## Heading"].join("\n"),
    );
    expect(items).toEqual([
      { text: "Set up", completed: false },
      { text: "Build", completed: false },
    ]);
  });

  test("ignores numbered items once checkboxes are present", () => {
    const items = extractPlanTodoItems(["1. Ignored", "- [ ] Kept"].join("\n"));
    expect(items).toEqual([{ text: "Kept", completed: false }]);
  });

  test("returns an empty list for empty or task-free markdown", () => {
    expect(extractPlanTodoItems("")).toEqual([]);
    expect(extractPlanTodoItems("Just prose.\n\nMore prose.")).toEqual([]);
  });
});

describe("workspace plans helpers", () => {
  test("writes new plans into the workspace context plans directory", () => {
    const filePath = buildWorkspacePlanFilePath({
      taskId: "12345678-aaaa-bbbb-cccc-1234567890ab",
      createdAt: new Date("2026-04-01T01:02:03.000Z"),
    });

    expect(filePath).toBe(
      ".stave/context/plans/12345678_2026-04-01T01-02-03.md",
    );
  });

  test("recognizes both current and legacy plan file paths", () => {
    expect(
      isWorkspacePlanFilePath(
        ".stave/context/plans/abcd1234_2026-04-01T01-02-03.md",
      ),
    ).toBe(true);
    expect(
      isWorkspacePlanFilePath(".stave/plans/abcd1234_2026-04-01T01-02-03.md"),
    ).toBe(true);
    expect(isWorkspacePlanFilePath(".stave/context/notes.md")).toBe(false);
    expect(isWorkspacePlanFilePath(".stave/context/plans/nested/plan.md")).toBe(
      false,
    );
    expect(
      isWorkspacePlanFilePath(".stave/context/plans/../../secrets.md"),
    ).toBe(false);
  });

  test("parses and sorts plan entries newest-first", () => {
    const older = parseWorkspacePlanFilePath(
      ".stave/plans/abcd1234_2026-03-30T01-02-03.md",
    );
    const newer = parseWorkspacePlanFilePath(
      ".stave/context/plans/abcd1234_2026-04-01T04-05-06.md",
    );

    expect(
      sortWorkspacePlansNewestFirst([older, newer]).map(
        (entry) => entry.filePath,
      ),
    ).toEqual([newer.filePath, older.filePath]);
    expect(newer.label).toBe("2026-04-01 04:05:06");
  });

  test("builds a newest-first workspace document list capped to the newest entries", () => {
    const day = (value: number) => String(value).padStart(2, "0");
    const entries = buildWorkspacePlanListEntries({
      currentFilePaths: Array.from(
        { length: 10 },
        (_, index) =>
          `.stave/context/plans/task00${day(index + 1)}_2026-04-${day(index + 1)}T01-00-00.md`,
      ),
      legacyFilePaths: [
        ".stave/plans/task0011_2026-04-11T01-00-00.md",
        ".stave/plans/task0012_2026-04-12T01-00-00.md",
      ],
    });

    expect(entries).toHaveLength(MAX_WORKSPACE_PLANS);
    expect(entries[0]?.filePath).toBe(
      ".stave/plans/task0012_2026-04-12T01-00-00.md",
    );
    expect(entries[0]?.source).toBe("legacy");
    expect(entries.at(-1)?.filePath).toBe(
      ".stave/context/plans/task0003_2026-04-03T01-00-00.md",
    );
  });

  test("names a content-named document after its file and orders by recorded updates", () => {
    const named = parseWorkspacePlanFilePath(
      ".stave/context/plans/retry-design.md",
    );
    expect(named).toMatchObject({
      label: "retry-design",
      taskIdPrefix: "",
      timestamp: "",
    });

    const entries = buildWorkspacePlanListEntries({
      currentFilePaths: [
        ".stave/context/plans/retry-design.md",
        ".stave/context/plans/task0001_2026-04-01T01-00-00.md",
      ],
      updatedAtByPath: {
        ".stave/context/plans/retry-design.md": "2026-05-01T00:00:00.000Z",
      },
    });
    expect(entries.map((entry) => entry.filePath)).toEqual([
      ".stave/context/plans/retry-design.md",
      ".stave/context/plans/task0001_2026-04-01T01-00-00.md",
    ]);
  });

  test("dedupes exact duplicate plan paths before sorting", () => {
    const entries = buildWorkspacePlanListEntries({
      currentFilePaths: [
        ".stave/context/plans/task0001_2026-04-01T01-00-00.md",
        ".stave/context/plans/task0001_2026-04-01T01-00-00.md",
      ],
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.filePath).toBe(
      ".stave/context/plans/task0001_2026-04-01T01-00-00.md",
    );
  });

});

describe("persistWorkspacePlanFile", () => {
  const taskId = "12345678-aaaa-bbbb-cccc-1234567890ab";
  const rootPath = "/tmp/ws";

  test("returns the file path when IPC create + write both succeed", async () => {
    const restore = installStubApi({
      fs: {
        createDirectory: async () => ({ ok: true }),
        writeFile: async () => ({ ok: true }),
      },
    });
    try {
      const result = await persistWorkspacePlanFile({
        rootPath,
        taskId,
        planText: "## Plan\n- Do",
      });
      expect(result).toMatch(/^\.stave\/context\/plans\/12345678_/);
      expect(result?.endsWith(".md")).toBe(true);
    } finally {
      restore();
    }
  });

  test("treats alreadyExists directory as success", async () => {
    const restore = installStubApi({
      fs: {
        createDirectory: async () => ({ ok: false, alreadyExists: true }),
        writeFile: async () => ({ ok: true }),
      },
    });
    try {
      const result = await persistWorkspacePlanFile({
        rootPath,
        taskId,
        planText: "## Plan",
      });
      expect(result).toMatch(/^\.stave\/context\/plans\/12345678_/);
    } finally {
      restore();
    }
  });

  test("returns null when writeFile reports ok:false", async () => {
    const restore = installStubApi({
      fs: {
        createDirectory: async () => ({ ok: true }),
        writeFile: async () => ({
          ok: false,
          stderr: "EROFS: read-only file system",
        }),
      },
    });
    try {
      const result = await persistWorkspacePlanFile({
        rootPath,
        taskId,
        planText: "## Plan",
      });
      expect(result).toBeNull();
    } finally {
      restore();
    }
  });

  test("returns null when createDirectory reports ok:false without alreadyExists", async () => {
    const restore = installStubApi({
      fs: {
        createDirectory: async () => ({
          ok: false,
          stderr: "Permission denied",
        }),
        writeFile: async () => ({ ok: true }),
      },
    });
    try {
      const result = await persistWorkspacePlanFile({
        rootPath,
        taskId,
        planText: "## Plan",
      });
      expect(result).toBeNull();
    } finally {
      restore();
    }
  });

  test("returns null when IPC transport itself throws", async () => {
    const restore = installStubApi({
      fs: {
        createDirectory: async () => {
          throw new Error("ipc transport closed");
        },
        writeFile: async () => ({ ok: true }),
      },
    });
    try {
      const result = await persistWorkspacePlanFile({
        rootPath,
        taskId,
        planText: "## Plan",
      });
      expect(result).toBeNull();
    } finally {
      restore();
    }
  });
});

describe("deleteWorkspacePlanFile", () => {
  const rootPath = "/tmp/ws";
  const filePath = ".stave/context/plans/12345678_2026-04-01T01-02-03.md";

  test("deletes a validated plan through the root-bound filesystem bridge", async () => {
    const calls: unknown[] = [];
    const restore = installStubApi({
      fs: {
        createDirectory: async () => ({ ok: true }),
        writeFile: async () => ({ ok: true }),
        deleteFile: async (args) => {
          calls.push(args);
          return { ok: true };
        },
      },
    });
    try {
      expect(await deleteWorkspacePlanFile({ rootPath, filePath })).toBe(true);
      expect(calls).toEqual([{ rootPath, filePath }]);
    } finally {
      restore();
    }
  });

  test("rejects paths outside the plans directories before calling IPC", async () => {
    let calls = 0;
    const restore = installStubApi({
      fs: {
        createDirectory: async () => ({ ok: true }),
        writeFile: async () => ({ ok: true }),
        deleteFile: async () => {
          calls += 1;
          return { ok: true };
        },
      },
    });
    try {
      expect(
        await deleteWorkspacePlanFile({
          rootPath,
          filePath: ".stave/context/notes.md",
        }),
      ).toBe(false);
      expect(calls).toBe(0);
    } finally {
      restore();
    }
  });

  test("reports bridge failures without treating the file as deleted", async () => {
    const restore = installStubApi({
      fs: {
        createDirectory: async () => ({ ok: true }),
        writeFile: async () => ({ ok: true }),
        deleteFile: async () => ({ ok: false, stderr: "EPERM" }),
      },
    });
    try {
      expect(await deleteWorkspacePlanFile({ rootPath, filePath })).toBe(false);
    } finally {
      restore();
    }
  });
});
