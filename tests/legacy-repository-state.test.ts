import { describe, expect, test } from "bun:test";
import { migrateLegacyRepositoryState } from "../src/store/legacy-repository-state";

// Covers the temporary migration "repository-persisted-state"; delete this
// file together with it (see config/temporary-migrations.json).

describe("legacy repository state migration", () => {
  test("maps the persisted project keys to their repository names", () => {
    const state: Record<string, unknown> = {
      recentProjects: [{ projectPath: "/tmp/repo", projectName: "repo" }],
      projectPath: "/tmp/repo",
      projectName: "repo",
      isDarkMode: true,
    };

    migrateLegacyRepositoryState(state);

    expect(state.recentProjects).toBeUndefined();
    expect(state.projectPath).toBeUndefined();
    expect(state.projectName).toBeUndefined();
    expect(state.recentRepositories).toEqual([
      { projectPath: "/tmp/repo", projectName: "repo" },
    ]);
    expect(state.repositoryPath).toBe("/tmp/repo");
    expect(state.repositoryName).toBe("repo");
    expect(state.isDarkMode).toBe(true);
  });

  test("keeps a value already stored under the new key", () => {
    const state: Record<string, unknown> = {
      recentProjects: [{ projectPath: "/tmp/old" }],
      recentRepositories: [{ repositoryPath: "/tmp/new" }],
    };

    migrateLegacyRepositoryState(state);

    expect(state.recentProjects).toBeUndefined();
    expect(state.recentRepositories).toEqual([{ repositoryPath: "/tmp/new" }]);
  });

  test("is a no-op on an already migrated snapshot", () => {
    const state: Record<string, unknown> = {
      recentRepositories: [],
      repositoryPath: "/tmp/repo",
    };
    const before = JSON.stringify(state);
    migrateLegacyRepositoryState(state);
    expect(JSON.stringify(state)).toBe(before);
  });
});
