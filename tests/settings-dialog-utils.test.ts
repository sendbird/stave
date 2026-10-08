import { describe, expect, test } from "bun:test";
import {
  isSettingsSectionVisible,
  listVisibleSettingsSections,
  matchesSettingsSection,
  resolveVisibleSettingsSection,
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
    expect(matchesSettingsSection(providers!, "codex plugins")).toBe(true);
    expect(matchesSettingsSection(providers!, "플러그인")).toBe(true);
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
  test("review prompt settings are discoverable and normalize saved rubrics", () => {
    const definition = settingDefinitions.find((candidate) => candidate.key === "reviewTask")!;
    expect(searchSettingsFields("custom review prompt")).toContain(definition);
    expect(definition.sectionId).toBe("prompts");
    expect(definition.schema.safeParse("invalid").success).toBe(false);
    const parsed = definition.schema.parse({ promptSource: "custom", customPrompt: "Check public callbacks.", presetId: "sdk-compatibility" });
    expect(parsed.promptSource).toBe("custom");
    expect(parsed.customPrompt).toBe("Check public callbacks.");
    expect(definition.schema.parse({ skillSlug: "team-review" }).promptSource).toBe("skill");
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

  test("finds the account and API connection cards by the words people type", () => {
    const fieldIds = (query: string) => searchSettingsFields(query).map((field) => field.fieldId);
    expect(fieldIds("sign in")).toEqual(
      expect.arrayContaining(["settings-field-claude-accounts", "settings-field-codex-accounts"]),
    );
    expect(fieldIds("login codex")).toContain("settings-field-codex-accounts");
    for (const query of ["vercel", "api key", "base url", "gateway", "api connection", "kimi", "model_provider"]) {
      expect(fieldIds(query)).toContain("settings-field-api-connections");
    }
    // Profile ids are machine-local, so account choices never travel in an export.
    for (const field of settingDefinitions.filter((candidate) => candidate.sectionId === "tooling")) {
      expect(field.importExport).toBe("exclude");
    }
  });
});

describe("settings section visibility", () => {
  test("hides the developer section while Developer mode is off", () => {
    const ids = listVisibleSettingsSections({ developerModeEnabled: false }).map(
      (section) => section.id,
    );
    expect(ids).not.toContain("developer");
    expect(ids).toContain("general");
    expect(ids).toHaveLength(settingsSections.length - 1);
    expect(
      isSettingsSectionVisible("developer", { developerModeEnabled: false }),
    ).toBe(false);
  });

  test("lists the developer section once Developer mode is on", () => {
    const ids = listVisibleSettingsSections({ developerModeEnabled: true }).map(
      (section) => section.id,
    );
    expect(ids).toContain("developer");
    expect(ids).toHaveLength(settingsSections.length);
  });

  test("deep links to a hidden section land on General", () => {
    expect(
      resolveVisibleSettingsSection("developer", { developerModeEnabled: false }),
    ).toBe("general");
    expect(
      resolveVisibleSettingsSection("developer", { developerModeEnabled: true }),
    ).toBe("developer");
    expect(
      resolveVisibleSettingsSection("mcp", { developerModeEnabled: false }),
    ).toBe("mcp");
  });
});
