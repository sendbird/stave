import { describe, expect, test } from "bun:test";
import {
  ScmCommitDetailsArgsSchema,
  ScmCommitDiffArgsSchema,
  ScmCommitFilesArgsSchema,
  ScmGraphArgsSchema,
} from "../electron/main/ipc/schemas";

const HASH = "a".repeat(40);

describe("git graph IPC schemas", () => {
  test("accepts a bounded graph request with an explicit ref filter", () => {
    const parsed = ScmGraphArgsSchema.safeParse({
      cwd: "/tmp/project",
      limit: 500,
      skip: 1000,
      scope: "all",
      refs: ["main", "origin/main", "refs/tags/v1.0.0"],
      includeRepositoryState: false,
    });

    expect(parsed.success).toBe(true);
  });

  test("rejects option-like refs, control characters, and unknown fields", () => {
    expect(ScmGraphArgsSchema.safeParse({ refs: ["--all"] }).success).toBe(
      false,
    );
    expect(ScmGraphArgsSchema.safeParse({ scope: "main\n--all" }).success).toBe(
      false,
    );
    expect(
      ScmGraphArgsSchema.safeParse({ scope: "all", extra: true }).success,
    ).toBe(false);
  });

  test("requires finite integer pagination bounds", () => {
    expect(ScmGraphArgsSchema.safeParse({ limit: 1.5 }).success).toBe(false);
    expect(ScmGraphArgsSchema.safeParse({ limit: Number.NaN }).success).toBe(
      false,
    );
    expect(ScmGraphArgsSchema.safeParse({ skip: -1 }).success).toBe(false);
    expect(
      ScmGraphArgsSchema.safeParse({
        includeRepositoryState: "false",
      }).success,
    ).toBe(false);
  });

  test("accepts hash-scoped commit details and file requests", () => {
    expect(
      ScmCommitDetailsArgsSchema.safeParse({
        cwd: "/tmp/project",
        hash: HASH,
      }).success,
    ).toBe(true);
    expect(
      ScmCommitFilesArgsSchema.safeParse({
        cwd: "/tmp/project",
        hash: HASH,
      }).success,
    ).toBe(true);
    expect(
      ScmCommitDiffArgsSchema.safeParse({
        cwd: "/tmp/project",
        hash: HASH,
        path: "src/new\nname.ts",
        oldPath: "src/old\tname.ts",
      }).success,
    ).toBe(true);
  });

  test("rejects option-like revisions, NUL paths, and extra detail fields", () => {
    expect(ScmCommitDetailsArgsSchema.safeParse({ hash: "HEAD" }).success).toBe(
      false,
    );
    expect(
      ScmCommitDiffArgsSchema.safeParse({
        hash: HASH,
        path: "src/bad\0name.ts",
      }).success,
    ).toBe(false);
    expect(
      ScmCommitDetailsArgsSchema.safeParse({
        hash: HASH,
        parent: 1,
      }).success,
    ).toBe(false);
  });
});
