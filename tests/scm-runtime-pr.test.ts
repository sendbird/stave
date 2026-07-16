import { describe, expect, test } from "bun:test";
import { ensureGhAuth, invalidateGhAuthCache } from "../electron/host-service/gh-auth";
import { buildAutoMergePullRequestArgs, classifyAutoMergeFailure } from "../electron/host-service/scm-runtime";

describe("Create PR SCM runtime", () => {
  test("builds a concrete auto-merge command", () => {
    expect(buildAutoMergePullRequestArgs("squash")).toEqual(["pr", "merge", "--auto", "--squash", "--delete-branch"]);
  });

  test("classifies graceful auto-merge fallback cases", () => {
    expect(classifyAutoMergeFailure("GraphQL: Pull request is in clean status")).toBe("clean-status");
    expect(classifyAutoMergeFailure("Auto-merge is disabled for this repository")).toBe("unsupported");
    expect(classifyAutoMergeFailure("network failed")).toBe("other");
  });

  test("caches successful GitHub authentication by cwd", async () => {
    invalidateGhAuthCache();
    let now = 1_000;
    let calls = 0;
    const runCommand: NonNullable<Parameters<typeof ensureGhAuth>[0]["runCommand"]> = async () => {
      calls += 1;
      return { ok: true, code: 0, stdout: "authenticated", stderr: "" };
    };

    await ensureGhAuth({
      cwd: "/tmp/stave-auth-cache",
      now: () => now,
      runCommand,
    });
    await ensureGhAuth({
      cwd: "/tmp/stave-auth-cache",
      now: () => now,
      runCommand,
    });
    expect(calls).toBe(1);

    now += 5 * 60_000 + 1;
    await ensureGhAuth({
      cwd: "/tmp/stave-auth-cache",
      now: () => now,
      runCommand,
    });
    expect(calls).toBe(2);
  });

  test("retries a cached GitHub authentication failure after the short ttl", async () => {
    invalidateGhAuthCache();
    let now = 1_000;
    let calls = 0;
    const runCommand: NonNullable<Parameters<typeof ensureGhAuth>[0]["runCommand"]> = async () => {
      calls += 1;
      return { ok: false, code: 1, stdout: "", stderr: "not authenticated" };
    };

    await ensureGhAuth({ cwd: "/tmp/stave-auth-failure-cache", now: () => now, runCommand });
    await ensureGhAuth({ cwd: "/tmp/stave-auth-failure-cache", now: () => now, runCommand });
    expect(calls).toBe(1);

    now += 20_001;
    await ensureGhAuth({ cwd: "/tmp/stave-auth-failure-cache", now: () => now, runCommand });
    expect(calls).toBe(2);
  });
});
