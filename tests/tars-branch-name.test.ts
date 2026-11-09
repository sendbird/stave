import { describe, expect, test } from "bun:test";
import { buildTarsBranchName, sanitizeTarsBranchName, TARS_BRANCH_NAME_MAX_CHARS } from "../src/lib/tars/branch-name";

describe("Tars branch names", () => {
  test("keeps a rule-following proposal and appends a stable suffix from the request id", () => {
    const first = buildTarsBranchName({ proposed: "feat/billing-export", title: "Fix billing", requestId: "tars-message:a:0" });
    expect(first).toMatch(/^feat\/billing-export-[0-9a-f]{8}$/);
    expect(buildTarsBranchName({ proposed: "feat/billing-export", title: "Other title", requestId: "tars-message:a:0" })).toBe(first);
    expect(buildTarsBranchName({ proposed: "feat/billing-export", title: "Fix billing", requestId: "tars-message:a:1" })).not.toBe(first);
  });

  test("keeps issue-key rules such as PROJ-123/description", () => {
    expect(buildTarsBranchName({ proposed: "PROJ-123/fix-login", title: "x", requestId: "r" })).toMatch(/^PROJ-123\/fix-login-[0-9a-f]{8}$/);
  });

  test("falls back to tars/<title words> when the proposal is missing or unusable", () => {
    expect(buildTarsBranchName({ title: "Write the API docs!", requestId: "r" })).toMatch(/^tars\/write-the-api-docs-[0-9a-f]{8}$/);
    expect(buildTarsBranchName({ proposed: "../..", title: "결제 수정", requestId: "r" })).toMatch(/^tars\/work-[0-9a-f]{8}$/);
    expect(buildTarsBranchName({ proposed: "HEAD", title: "Docs", requestId: "r" })).toMatch(/^tars\/docs-[0-9a-f]{8}$/);
  });

  test.each([
    ["-x/../y", "x/y"],
    ["/feat//a b/", "feat/a-b"],
    [".hidden/name.lock", "hidden/name"],
    ["feat/a@{1}", "feat/a-1"],
    ["refs/heads/../main", "refs/heads/main"],
    ["feat/한글-설명", "feat"],
    ["feat/foo.lock.lock/bar", "feat/foo/bar"],
    ["a/b.-.lock-", "a/b"],
  ])("sanitizes %p to a git-safe name", (input, expected) => {
    expect(sanitizeTarsBranchName(input)).toBe(expected);
  });

  test("strips accents in the fallback instead of splitting words", () => {
    expect(buildTarsBranchName({ title: "Résumé export", requestId: "r" })).toMatch(/^tars\/resume-export-[0-9a-f]{8}$/);
  });

  test("every sample passes git check-ref-format --branch", () => {
    const samples = ["feat/foo.lock.lock/bar", "-x/../y", ".a/b.", "feat/a@{u}", "x\\y", "a//b", "PROJ-123/fix", `feat/${"a.lock/".repeat(30)}`];
    for (const sample of samples) {
      const name = buildTarsBranchName({ proposed: sample, title: "t", requestId: sample });
      const result = Bun.spawnSync(["git", "check-ref-format", "--branch", name]);
      expect({ name, ok: result.exitCode === 0 }).toEqual({ name, ok: true });
    }
  });

  test("bounds the length before the suffix", () => {
    const name = sanitizeTarsBranchName(`feat/${"a".repeat(200)}`);
    expect(name.length).toBeLessThanOrEqual(TARS_BRANCH_NAME_MAX_CHARS);
  });
});
