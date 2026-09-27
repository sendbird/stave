import { describe, expect, test } from "bun:test";
import { createAppStorePersistenceOptions } from "../src/store/app-store-persistence";
import {
  migrateLegacyRepositoryEntries,
  migrateLegacyRepositoryEntry,
  migrateLegacyRepositoryState,
} from "../src/store/legacy-repository-state";
import { renameLegacyConnectorMappings } from "../src/lib/legacy-connector-mappings";
import { normalizeJiraConnectorSettings } from "../src/lib/jira-connector/types";
import { normalizeCraneConnectorSettings } from "../src/lib/crane-connector/types";

// Covers the temporary migrations "repository-persisted-state" and
// "connector-repository-mappings"; delete this file together with them (see
// config/temporary-migrations.json).

const legacyEntry = {
  projectPath: "/tmp/repo",
  projectName: "repo",
  projectBasePrompt: "Use Bun.",
  lastOpenedAt: "2026-09-01T00:00:00.000Z",
  defaultBranch: "main",
  workspaces: [],
  activeWorkspaceId: "ws",
  workspaceBranchById: {},
  workspacePathById: {},
  workspaceDefaultById: {},
};

describe("legacy repository state migration", () => {
  test("maps the persisted project keys and each entry's fields to their repository names", () => {
    const state: Record<string, unknown> = {
      recentProjects: [legacyEntry],
      projectPath: "/tmp/repo",
      projectName: "repo",
      isDarkMode: true,
    };

    migrateLegacyRepositoryState(state);

    expect(state.recentProjects).toBeUndefined();
    expect(state.projectPath).toBeUndefined();
    expect(state.projectName).toBeUndefined();
    expect(state.recentRepositories).toEqual([
      expect.objectContaining({ repositoryPath: "/tmp/repo", repositoryName: "repo", repositoryBasePrompt: "Use Bun." }),
    ]);
    expect((state.recentRepositories as Array<Record<string, unknown>>)[0]).not.toHaveProperty("projectPath");
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
      recentRepositories: [{ repositoryPath: "/tmp/repo", repositoryName: "repo" }],
      repositoryPath: "/tmp/repo",
    };
    const before = JSON.stringify(state);
    migrateLegacyRepositoryState(state);
    expect(JSON.stringify(state)).toBe(before);
  });

  test("the store's merge keeps a legacy snapshot's repositories over the initial empty values", () => {
    const { merge } = createAppStorePersistenceOptions();
    const initial = { recentRepositories: [], repositoryPath: null, repositoryName: null, isDarkMode: false };
    const merged = merge(
      { recentProjects: [legacyEntry], projectPath: "/tmp/repo", projectName: "repo", isDarkMode: true },
      initial as never,
    ) as unknown as Record<string, unknown>;
    expect(merged.repositoryPath).toBe("/tmp/repo");
    expect(merged.repositoryName).toBe("repo");
    expect(merged.recentRepositories).toEqual([expect.objectContaining({ repositoryPath: "/tmp/repo" })]);
    expect(merged.isDarkMode).toBe(true);
    expect(merged).not.toHaveProperty("recentProjects");
  });

  test("SQLite registry entries are renamed on read, and other values pass through", () => {
    expect(migrateLegacyRepositoryEntries([legacyEntry])).toEqual([
      expect.objectContaining({ repositoryPath: "/tmp/repo", repositoryName: "repo" }),
    ]);
    const current = { repositoryPath: "/tmp/a" };
    expect(migrateLegacyRepositoryEntry(current)).toBe(current);
    expect(migrateLegacyRepositoryEntries(null)).toBeNull();
  });
});

describe("legacy connector mappings", () => {
  test("Jira and Crane settings saved with projectMappings keep their connection and mappings", () => {
    expect(renameLegacyConnectorMappings({ enabled: true, projectMappings: [] })).toEqual({ enabled: true, repositoryMappings: [] });
    const jira = normalizeJiraConnectorSettings({
      enabled: true,
      siteUrl: "https://acme.atlassian.net",
      authMode: "cloud-api-token",
      jql: "assignee = currentUser()",
      maxResults: 50,
      projectMappings: [],
    });
    expect(jira).toMatchObject({ enabled: true, siteUrl: "https://acme.atlassian.net", repositoryMappings: [] });
    const crane = normalizeCraneConnectorSettings({ ...normalizeCraneConnectorSettings(undefined), enabled: true, repositoryMappings: undefined, projectMappings: [] });
    expect(crane.enabled).toBe(true);
  });
});
