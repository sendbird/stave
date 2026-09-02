import { describe, expect, test } from "bun:test";
import {
  buildIntentGuardFingerprint,
  IntentGuardFingerprintCache,
} from "../electron/host-service/intent-guard-cache";

const baseArgs = {
  intentContext: "Ship the settings dialog",
  diff: "diff --git a/a.ts b/a.ts",
  workingTreeDiff: "",
  providerId: "claude-code",
  model: "claude-haiku-4-5",
};

describe("buildIntentGuardFingerprint", () => {
  test("is stable for identical inputs", () => {
    expect(buildIntentGuardFingerprint(baseArgs)).toBe(
      buildIntentGuardFingerprint({ ...baseArgs }),
    );
  });

  test("changes when any input that shapes the verdict changes", () => {
    const base = buildIntentGuardFingerprint(baseArgs);
    expect(
      buildIntentGuardFingerprint({ ...baseArgs, diff: "diff --git a/b.ts" }),
    ).not.toBe(base);
    expect(
      buildIntentGuardFingerprint({ ...baseArgs, workingTreeDiff: "+ x" }),
    ).not.toBe(base);
    expect(
      buildIntentGuardFingerprint({ ...baseArgs, intentContext: "Other" }),
    ).not.toBe(base);
    expect(
      buildIntentGuardFingerprint({ ...baseArgs, providerId: "codex" }),
    ).not.toBe(base);
    expect(
      buildIntentGuardFingerprint({ ...baseArgs, model: "claude-sonnet-5" }),
    ).not.toBe(base);
  });

  test("does not confuse a field boundary shift for an unchanged input", () => {
    expect(
      buildIntentGuardFingerprint({
        ...baseArgs,
        intentContext: "a",
        diff: "b",
      }),
    ).not.toBe(
      buildIntentGuardFingerprint({
        ...baseArgs,
        intentContext: "a b",
        diff: "",
      }),
    );
  });
});

describe("IntentGuardFingerprintCache", () => {
  test("returns a stored verdict only for the same fingerprint", () => {
    const cache = new IntentGuardFingerprintCache<string[]>();
    cache.set("/w", "fp-1", ["finding"]);

    expect(cache.get("/w", "fp-1")).toEqual(["finding"]);
    expect(cache.get("/w", "fp-2")).toBeUndefined();
    expect(cache.get("/other", "fp-1")).toBeUndefined();
  });

  test("keeps only the latest verdict per worktree", () => {
    const cache = new IntentGuardFingerprintCache<string[]>();
    cache.set("/w", "fp-1", ["old"]);
    cache.set("/w", "fp-2", ["new"]);

    expect(cache.get("/w", "fp-1")).toBeUndefined();
    expect(cache.get("/w", "fp-2")).toEqual(["new"]);
    expect(cache.size).toBe(1);
  });

  test("evicts the least recently used worktree past the cap", () => {
    const cache = new IntentGuardFingerprintCache<string[]>(2);
    cache.set("/a", "fp", ["a"]);
    cache.set("/b", "fp", ["b"]);
    cache.get("/a", "fp");
    cache.set("/c", "fp", ["c"]);

    expect(cache.size).toBe(2);
    expect(cache.get("/a", "fp")).toEqual(["a"]);
    expect(cache.get("/b", "fp")).toBeUndefined();
    expect(cache.get("/c", "fp")).toEqual(["c"]);
  });
});
