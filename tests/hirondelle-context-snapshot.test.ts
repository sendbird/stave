import { afterEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildHirondelleContextSnapshotRelativePath,
  writeHirondelleContextSnapshot,
} from "../electron/main/hirondelle-sync/context-snapshot";
import { isHirondelleContextStale } from "../src/lib/hirondelle-sync/staleness";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("Hirondelle context staleness", () => {
  const now = new Date("2026-08-09T12:00:00.000Z");

  test("treats missing and expired snapshots as stale", () => {
    expect(isHirondelleContextStale({ lastPulledAt: null, now })).toBe(true);
    expect(
      isHirondelleContextStale({
        lastPulledAt: new Date(now.getTime() - 59 * 60_000).toISOString(),
        now,
      }),
    ).toBe(false);
    expect(
      isHirondelleContextStale({
        lastPulledAt: new Date(now.getTime() - 61 * 60_000).toISOString(),
        now,
      }),
    ).toBe(true);
  });
});

describe("Hirondelle context snapshots", () => {
  test("builds a workspace-relative path from a safe slug", () => {
    expect(
      buildHirondelleContextSnapshotRelativePath("checkout-v2"),
    ).toBe(".stave/context/hirondelle/checkout-v2.md");
    expect(() =>
      buildHirondelleContextSnapshotRelativePath("../checkout"),
    ).toThrow();
    expect(() =>
      buildHirondelleContextSnapshotRelativePath("team/checkout"),
    ).toThrow();
    expect(() =>
      buildHirondelleContextSnapshotRelativePath("team\\checkout"),
    ).toThrow();
  });

  test("atomically creates and replaces the nested snapshot", async () => {
    const workspacePath = await fs.mkdtemp(
      path.join(os.tmpdir(), "stave-hirondelle-snapshot-"),
    );
    temporaryDirectories.push(workspacePath);

    const first = await writeHirondelleContextSnapshot({
      workspacePath,
      slug: "checkout-v2",
      markdown: "# First\n",
    });
    expect(first.relativePath).toBe(
      ".stave/context/hirondelle/checkout-v2.md",
    );
    expect(await fs.readFile(first.absolutePath, "utf8")).toBe("# First\n");

    const second = await writeHirondelleContextSnapshot({
      workspacePath,
      slug: "checkout-v2",
      markdown: "# Second\n",
    });
    expect(second).toEqual(first);
    expect(await fs.readFile(second.absolutePath, "utf8")).toBe(
      "# Second\n",
    );
  });
});
