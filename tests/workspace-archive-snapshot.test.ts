import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { WorkspaceCleanupActArgsSchema, WorkspaceCleanupRowSchema } from "../src/lib/workspace-cleanup-contract";

test("saved changes survive real Git and SQLite archive lifecycle", () => {
  mkdirSync("test-results", { recursive: true });
  const root = mkdtempSync(path.resolve("test-results/archive-snapshot-host-"));
  try {
    const output = path.join(root, "check.cjs");
    const built = spawnSync(process.execPath, ["build", "tests/fixtures/workspace-archive-snapshot-check.ts", "--outfile", output, "--target=node", "--format=cjs", "--external=better-sqlite3", "--external=electron", "--external=node-pty", '--define=import.meta.env.BASE_URL="/"'], { encoding: "utf8" });
    expect(built.stderr).toBe("");
    expect(built.status).toBe(0);
    const require = createRequire(import.meta.url);
    const executed = spawnSync(require("electron"), [output], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", NODE_PATH: path.resolve("node_modules") }, encoding: "utf8" });
    expect(executed.stderr).toBe("");
    expect(executed.status).toBe(0);
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 60_000);


test("saved change IPC payloads remain strict", () => {
  const valid = { action: "archive", workspaceId: "work", repositoryPath: "/tmp/repository", saveChanges: true };
  expect(WorkspaceCleanupActArgsSchema.safeParse(valid).success).toBe(true);
  expect(WorkspaceCleanupActArgsSchema.safeParse({ ...valid, preserveLocalWork: true }).success).toBe(true);
  expect(WorkspaceCleanupActArgsSchema.safeParse({ ...valid, preserveLocalWork: "true" }).success).toBe(false);
  expect(WorkspaceCleanupActArgsSchema.safeParse({ ...valid, saveChanges: "true" }).success).toBe(false);
  expect(WorkspaceCleanupActArgsSchema.safeParse({ ...valid, force: true }).success).toBe(false);
  const row = { id: "work", repositoryPath: "/tmp/repository", repositoryName: "Repository", name: "Work", path: "/tmp/work", branch: "work", archived: true, branchOnly: false, readOnly: false, archivedAt: null, lastActive: null, blockers: [], reasons: [], bytes: null, branchDeletable: false, savedChanges: true, canSaveChanges: false };
  expect(WorkspaceCleanupRowSchema.safeParse(row).success).toBe(true);
  expect(WorkspaceCleanupRowSchema.safeParse({ ...row, savedChanges: "yes" }).success).toBe(false);
  expect(WorkspaceCleanupRowSchema.safeParse({ ...row, savedChangesRef: "private ref" }).success).toBe(false);
});
