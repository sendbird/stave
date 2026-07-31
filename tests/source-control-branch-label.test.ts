import { describe, expect, test } from "bun:test";
import {
  DETACHED_HEAD_BRANCH,
  DETACHED_HEAD_LABEL,
  formatBranchLabel,
  isDetachedHead,
} from "../src/lib/source-control-branch-label";

describe("isDetachedHead", () => {
  test("detects the raw git sentinel", () => {
    expect(isDetachedHead(DETACHED_HEAD_BRANCH)).toBe(true);
    expect(isDetachedHead("  HEAD  ")).toBe(true);
  });

  test("treats real branches and empty values as attached", () => {
    expect(isDetachedHead("main")).toBe(false);
    expect(isDetachedHead("feature/HEAD")).toBe(false);
    expect(isDetachedHead("head")).toBe(false);
    expect(isDetachedHead("")).toBe(false);
    expect(isDetachedHead(null)).toBe(false);
    expect(isDetachedHead(undefined)).toBe(false);
  });
});

describe("formatBranchLabel", () => {
  test("renders the detached sentinel as a human label", () => {
    expect(formatBranchLabel(DETACHED_HEAD_BRANCH)).toBe(DETACHED_HEAD_LABEL);
    expect(formatBranchLabel(" HEAD ")).toBe(DETACHED_HEAD_LABEL);
  });

  test("passes real branch names through trimmed", () => {
    expect(formatBranchLabel("main")).toBe("main");
    expect(formatBranchLabel("  feat/x  ")).toBe("feat/x");
  });

  test("returns an empty string for missing values so callers can fall back", () => {
    expect(formatBranchLabel("")).toBe("");
    expect(formatBranchLabel("   ")).toBe("");
    expect(formatBranchLabel(null)).toBe("");
    expect(formatBranchLabel(undefined)).toBe("");
  });
});
