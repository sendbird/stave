import { describe, expect, test } from "bun:test";
import {
  compareAppVersionTags,
  isAppUpdateAvailable,
  normalizeAppVersionTag,
} from "@/lib/app-update";
import {
  DEFAULT_STAVE_RELEASE_REPO,
  resolveStaveReleaseRepo,
} from "@/lib/release-repo";

describe("normalizeAppVersionTag", () => {
  test("adds a leading v when needed", () => {
    expect(normalizeAppVersionTag("0.0.36")).toBe("v0.0.36");
  });

  test("preserves existing tag prefixes", () => {
    expect(normalizeAppVersionTag("v0.0.36")).toBe("v0.0.36");
  });
});

describe("compareAppVersionTags", () => {
  test("returns a positive number when the latest version is newer", () => {
    expect(
      compareAppVersionTags({
        currentVersion: "v0.0.36",
        latestVersion: "v0.0.37",
      }),
    ).toBeGreaterThan(0);
  });

  test("returns zero when the versions match", () => {
    expect(
      compareAppVersionTags({
        currentVersion: "v0.0.36",
        latestVersion: "v0.0.36",
      }),
    ).toBe(0);
  });

  test("returns a negative number when the installed build is newer", () => {
    expect(
      compareAppVersionTags({
        currentVersion: "v0.0.37",
        latestVersion: "v0.0.36",
      }),
    ).toBeLessThan(0);
  });
});

describe("isAppUpdateAvailable", () => {
  test("detects newer releases", () => {
    expect(
      isAppUpdateAvailable({
        currentVersion: "0.0.36",
        latestVersion: "v0.0.37",
      }),
    ).toBe(true);
  });

  test("returns false when versions match", () => {
    expect(
      isAppUpdateAvailable({
        currentVersion: "0.0.36",
        latestVersion: "v0.0.36",
      }),
    ).toBe(false);
  });
});

describe("resolveStaveReleaseRepo", () => {
  test("falls back to the shipped release repo when unset", () => {
    expect(resolveStaveReleaseRepo("")).toBe(DEFAULT_STAVE_RELEASE_REPO);
    expect(resolveStaveReleaseRepo("   ")).toBe(DEFAULT_STAVE_RELEASE_REPO);
    expect(resolveStaveReleaseRepo(undefined)).toBe(DEFAULT_STAVE_RELEASE_REPO);
  });

  test("preserves explicit repository overrides", () => {
    expect(resolveStaveReleaseRepo("example-org/stave")).toBe(
      "example-org/stave",
    );
  });
});
