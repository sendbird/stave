import { describe, expect, test } from "bun:test";
import {
  matchesSettingsSection,
  settingsSections,
} from "@/components/layout/settings-dialog.schema";
import {
  matchesSettingsField,
  searchSettingsFields,
  settingDefinitions,
} from "@/components/layout/settings-dialog.registry";
import { resolveSettingsRepositorySelection } from "@/components/layout/settings-dialog.utils";
import type { RecentRepositoryState } from "@/store/repository.utils";

function createRepository(args: {
  repositoryPath: string;
  repositoryName: string;
}): RecentRepositoryState {
  return {
    repositoryPath: args.repositoryPath,
    repositoryName: args.repositoryName,
    lastOpenedAt: "2026-04-06T00:00:00.000Z",
    defaultBranch: "main",
    workspaces: [],
    activeWorkspaceId: "",
    workspaceBranchById: {},
    workspacePathById: {},
    workspaceDefaultById: {},
  };
}

describe("resolveSettingsRepositorySelection", () => {
  const repositories = [
    createRepository({
      repositoryPath: "/tmp/project-a",
      repositoryName: "project-a",
    }),
    createRepository({
      repositoryPath: "/tmp/project-b",
      repositoryName: "project-b",
    }),
  ];

  test("returns null when no projects are registered", () => {
    expect(
      resolveSettingsRepositorySelection({
        repositories: [],
        selectedRepositoryPath: null,
        highlightedRepositoryPath: "/tmp/project-a",
        currentRepositoryPath: "/tmp/project-a",
      }),
    ).toBeNull();
  });

  test("keeps the user's current selection instead of restoring the initial highlight", () => {
    expect(
      resolveSettingsRepositorySelection({
        repositories,
        selectedRepositoryPath: "/tmp/project-b",
        highlightedRepositoryPath: "/tmp/project-a",
        currentRepositoryPath: "/tmp/project-a",
        allowHighlightedOverride: false,
      }),
    ).toBe("/tmp/project-b");
  });

  test("uses the highlighted project when there is no valid selection yet", () => {
    expect(
      resolveSettingsRepositorySelection({
        repositories,
        selectedRepositoryPath: null,
        highlightedRepositoryPath: "/tmp/project-b",
        currentRepositoryPath: "/tmp/project-a",
        allowHighlightedOverride: true,
      }),
    ).toBe("/tmp/project-b");
  });

  test("falls back to the current project after a stale selection", () => {
    expect(
      resolveSettingsRepositorySelection({
        repositories,
        selectedRepositoryPath: "/tmp/removed-project",
        highlightedRepositoryPath: "/tmp/project-a",
        currentRepositoryPath: "/tmp/project-b",
        allowHighlightedOverride: false,
      }),
    ).toBe("/tmp/project-b");
  });

  test("falls back to the first registered project when no other target matches", () => {
    expect(
      resolveSettingsRepositorySelection({
        repositories,
        selectedRepositoryPath: "/tmp/removed-project",
        highlightedRepositoryPath: "/tmp/missing-highlight",
        currentRepositoryPath: "/tmp/missing-current",
        allowHighlightedOverride: false,
      }),
    ).toBe("/tmp/project-a");
  });
});

describe("matchesSettingsSection", () => {
  test("matches section labels and keyword aliases", () => {
    const scripts = settingsSections.find(
      (section) => section.id === "scripts",
    );
    const chat = settingsSections.find((section) => section.id === "chat");
    const providers = settingsSections.find(
      (section) => section.id === "providers",
    );

    expect(scripts).toBeDefined();
    expect(chat).toBeDefined();
    expect(providers).toBeDefined();
    expect(matchesSettingsSection(scripts!, "quick commands")).toBe(true);
    expect(matchesSettingsSection(chat!, "mid-turn")).toBe(true);
    expect(matchesSettingsSection(providers!, "browser access")).toBe(true);
    expect(matchesSettingsSection(providers!, "chrome extension")).toBe(true);
  });

  test("requires every search term to match the same section", () => {
    const commandPalette = settingsSections.find(
      (section) => section.id === "commandPalette",
    );

    expect(commandPalette).toBeDefined();
    expect(matchesSettingsSection(commandPalette!, "keyboard palette")).toBe(
      true,
    );
    expect(matchesSettingsSection(commandPalette!, "keyboard terminal")).toBe(
      false,
    );
  });
});

describe("settings field registry", () => {
  test("finds Advisor by title and provider/model aliases", () => {
    const advisor = settingDefinitions.find(
      (definition) => definition.key === "advisorTarget",
    );

    expect(advisor).toBeDefined();
    expect(matchesSettingsField(advisor!, "advisor")).toBe(true);
    expect(matchesSettingsField(advisor!, "consult")).toBe(true);
    expect(matchesSettingsField(advisor!, "codex model")).toBe(true);
    expect(searchSettingsFields("read only")).toEqual([advisor!]);
    expect(searchSettingsFields("sonnet 5")).toEqual([advisor!]);
    expect(searchSettingsFields("gpt-6-sol")).toEqual([advisor!]);
  });

  test("finds the shared account-usage stop by usage and credits terms", () => {
    const definition = settingDefinitions.find(
      (candidate) => candidate.key === "blockTurnsWhenAccountLimitReached",
    );

    expect(definition).toBeDefined();
    expect(definition?.defaultValue).toBe(true);
    expect(matchesSettingsField(definition!, "100% usage")).toBe(true);
    expect(matchesSettingsField(definition!, "credits")).toBe(true);
    expect(searchSettingsFields("stop turns at 100")).toEqual([definition!]);
  });
});
