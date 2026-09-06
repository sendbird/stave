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
import { resolveSettingsProjectSelection } from "@/components/layout/settings-dialog.utils";
import type { RecentProjectState } from "@/store/project.utils";

function createProject(args: {
  projectPath: string;
  projectName: string;
}): RecentProjectState {
  return {
    projectPath: args.projectPath,
    projectName: args.projectName,
    lastOpenedAt: "2026-04-06T00:00:00.000Z",
    defaultBranch: "main",
    workspaces: [],
    activeWorkspaceId: "",
    workspaceBranchById: {},
    workspacePathById: {},
    workspaceDefaultById: {},
  };
}

describe("resolveSettingsProjectSelection", () => {
  const projects = [
    createProject({
      projectPath: "/tmp/project-a",
      projectName: "project-a",
    }),
    createProject({
      projectPath: "/tmp/project-b",
      projectName: "project-b",
    }),
  ];

  test("returns null when no projects are registered", () => {
    expect(
      resolveSettingsProjectSelection({
        projects: [],
        selectedProjectPath: null,
        highlightedProjectPath: "/tmp/project-a",
        currentProjectPath: "/tmp/project-a",
      }),
    ).toBeNull();
  });

  test("keeps the user's current selection instead of restoring the initial highlight", () => {
    expect(
      resolveSettingsProjectSelection({
        projects,
        selectedProjectPath: "/tmp/project-b",
        highlightedProjectPath: "/tmp/project-a",
        currentProjectPath: "/tmp/project-a",
        allowHighlightedOverride: false,
      }),
    ).toBe("/tmp/project-b");
  });

  test("uses the highlighted project when there is no valid selection yet", () => {
    expect(
      resolveSettingsProjectSelection({
        projects,
        selectedProjectPath: null,
        highlightedProjectPath: "/tmp/project-b",
        currentProjectPath: "/tmp/project-a",
        allowHighlightedOverride: true,
      }),
    ).toBe("/tmp/project-b");
  });

  test("falls back to the current project after a stale selection", () => {
    expect(
      resolveSettingsProjectSelection({
        projects,
        selectedProjectPath: "/tmp/removed-project",
        highlightedProjectPath: "/tmp/project-a",
        currentProjectPath: "/tmp/project-b",
        allowHighlightedOverride: false,
      }),
    ).toBe("/tmp/project-b");
  });

  test("falls back to the first registered project when no other target matches", () => {
    expect(
      resolveSettingsProjectSelection({
        projects,
        selectedProjectPath: "/tmp/removed-project",
        highlightedProjectPath: "/tmp/missing-highlight",
        currentProjectPath: "/tmp/missing-current",
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
    expect(searchSettingsFields("gpt-5.6-sol")).toEqual([advisor!]);
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
