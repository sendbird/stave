import { describe, expect, test } from "bun:test";
import {
  buildLinkedWorktreeFolderName,
  buildLinkedWorktreeSymlinkPath,
  buildProjectDefaultWorkspaceId,
  captureCurrentProjectState,
  formatWorkspacePathLabel,
  isDefaultWorkspaceName,
  normalizeCurrentProjectState,
  normalizeProjectAppearanceColor,
  normalizeProjectAppearanceIcon,
  normalizeProjectBasePrompt,
  normalizeProjectKickoffBranchNamingRule,
  normalizeProjectDisplayName,
  normalizeRecentProjectStates,
  parseRemoteTrackingBranchName,
  reconcileArchivedWorkspacePaths,
  resolvePathBaseName,
  resolveProjectForWorkspaceId,
  resolveWorkspaceRemoteBaseBranchTarget,
  resolveTaskWorkspaceContext,
  resolveCurrentProjectDefaultWorkspaceId,
  resolveWorkspaceName,
  sanitizeBranchName,
  toShellPathArgument,
  toWorkspaceFolderName,
  updateCurrentProjectTextPreference,
  updateCurrentProjectAppearance,
} from "@/store/project.utils";
import {
  filterProjectSidebarProjects,
  formatWorkspaceDisplayName,
} from "@/components/layout/ProjectWorkspaceSidebar.utils";

const PROJECT_PATH = "/tmp/workspace/stave";
const FOREIGN_PROJECT_PATH = "/tmp/sbdashboard";
const FEATURE_WORKSPACE_PATH = `${PROJECT_PATH}/.stave/workspaces/feat__auto-update-on-mac`;
const DEFAULT_WORKSPACE_ID = buildProjectDefaultWorkspaceId({
  projectPath: PROJECT_PATH,
});

describe("project name normalization", () => {
  test("formats custom workspace labels with branch context", () => {
    expect(
      formatWorkspaceDisplayName({
        name: "Customer issue",
        branch: "feat/noah/DFE-2587",
        isDefault: false,
      }),
    ).toBe("Customer issue (feat/noah/DFE-2587)");
    expect(
      formatWorkspaceDisplayName({
        name: "feat/noah/DFE-2587",
        branch: "feat/noah/DFE-2587",
        isDefault: false,
      }),
    ).toBe("feat/noah/DFE-2587");
    expect(
      formatWorkspaceDisplayName({
        name: "Default Workspace",
        branch: "main",
        isDefault: true,
      }),
    ).toBe("Default");
  });

  test("filters sidebar workspaces by custom label and branch", () => {
    const sourceProjects = [
      {
        projectPath: PROJECT_PATH,
        projectName: "stave",
        activeWorkspaceId: "ws-1",
        isCurrent: true,
        workspacePathById: {},
        workspaces: [
          {
            id: "ws-1",
            name: "Quota UI",
            branch: "feat/noah/DFE-2587",
            isDefault: false,
          },
          {
            id: "ws-2",
            name: "feat/noah/tool-mock",
            branch: "feat/noah/tool-mock",
            isDefault: false,
          },
        ],
      },
    ];
    const projects = filterProjectSidebarProjects({
      query: "quota",
      projects: sourceProjects,
    });

    expect(projects).toHaveLength(1);
    expect(projects[0]?.workspaces.map((workspace) => workspace.id)).toEqual([
      "ws-1",
    ]);
    expect(
      filterProjectSidebarProjects({
        query: "tool-mock",
        projects: sourceProjects,
      })[0]?.workspaces,
    ).toHaveLength(1);
  });

  test("resolves path basenames after trimming trailing separators", () => {
    expect(resolvePathBaseName({ path: "/tmp/workspace/stave/" })).toBe(
      "stave",
    );
    expect(resolvePathBaseName({ path: "", fallback: "project" })).toBe(
      "project",
    );
  });

  test("identifies the default workspace name case-insensitively", () => {
    expect(isDefaultWorkspaceName("Default Workspace")).toBe(true);
    expect(isDefaultWorkspaceName("default workspace")).toBe(true);
    expect(isDefaultWorkspaceName("feature/refactor")).toBe(false);
  });

  test("formats workspace paths relative to the project root when possible", () => {
    expect(
      formatWorkspacePathLabel({
        workspacePath: "/tmp/workspace/stave/.stave/workspaces/feat__agent-ui",
        projectPath: PROJECT_PATH,
      }),
    ).toBe(".stave/workspaces/feat__agent-ui");

    expect(
      formatWorkspacePathLabel({
        workspacePath: PROJECT_PATH,
        projectPath: PROJECT_PATH,
      }),
    ).toBe(PROJECT_PATH);
  });

  test("parses remote tracking branch names into remote and local names", () => {
    expect(parseRemoteTrackingBranchName("origin/feature/search")).toEqual({
      remoteName: "origin",
      localBranch: "feature/search",
    });
    expect(parseRemoteTrackingBranchName("main")).toBeNull();
  });

  test("infers remote base branches only when a remote-tracking ref exists without a matching local branch", async () => {
    const verifyRef = async (ref: string) => ref === "refs/remotes/origin/main";

    await expect(
      resolveWorkspaceRemoteBaseBranchTarget({
        baseBranch: "origin/main",
        verifyRef,
      }),
    ).resolves.toEqual({
      remoteName: "origin",
      localBranch: "main",
    });

    await expect(
      resolveWorkspaceRemoteBaseBranchTarget({
        baseBranch: "origin/main",
        fromBranchKind: "local",
        verifyRef,
      }),
    ).resolves.toBeNull();

    await expect(
      resolveWorkspaceRemoteBaseBranchTarget({
        baseBranch: "origin/main",
        verifyRef: async (ref) =>
          ref === "refs/remotes/origin/main" ||
          ref === "refs/heads/origin/main",
      }),
    ).resolves.toBeNull();
  });

  test("replaces the generic placeholder name with the folder basename", () => {
    expect(
      normalizeProjectDisplayName({
        projectPath: PROJECT_PATH,
        projectName: "project",
      }),
    ).toBe("stave");
  });

  test("normalizes persisted recent projects that still carry the placeholder name", () => {
    const projects = normalizeRecentProjectStates({
      projects: [
        {
          projectPath: PROJECT_PATH,
          projectName: "project",
          lastOpenedAt: "2026-03-30T13:35:33.466Z",
          defaultBranch: "main",
          workspaces: [
            {
              id: DEFAULT_WORKSPACE_ID,
              name: "Default Workspace",
              updatedAt: "2026-03-30T13:06:25.031Z",
            },
          ],
          activeWorkspaceId: DEFAULT_WORKSPACE_ID,
          workspaceBranchById: { [DEFAULT_WORKSPACE_ID]: "main" },
          workspacePathById: { [DEFAULT_WORKSPACE_ID]: PROJECT_PATH },
          workspaceDefaultById: { [DEFAULT_WORKSPACE_ID]: true },
        },
      ],
    });

    expect(projects[0]?.projectName).toBe("stave");
  });

  test("trims and preserves the project base prompt", () => {
    const projects = normalizeRecentProjectStates({
      projects: [
        {
          projectPath: "/tmp/workspace/stave",
          projectName: "stave",
          lastOpenedAt: "2026-03-30T13:35:33.466Z",
          defaultBranch: "main",
          workspaces: [],
          activeWorkspaceId: "",
          workspaceBranchById: {},
          workspacePathById: {},
          workspaceDefaultById: {},
          projectBasePrompt: "  Prefer bun over npm.  ",
        },
      ],
    });

    expect(projects[0]?.projectBasePrompt).toBe("Prefer bun over npm.");
    expect(normalizeProjectBasePrompt({ value: undefined })).toBe("");
  });

  test("trims and preserves the project kickoff branch naming rule", () => {
    const projects = normalizeRecentProjectStates({
      projects: [
        {
          projectPath: PROJECT_PATH,
          projectName: "stave",
          lastOpenedAt: "2026-03-30T13:35:33.466Z",
          defaultBranch: "main",
          workspaces: [],
          activeWorkspaceId: "",
          workspaceBranchById: {},
          workspacePathById: {},
          workspaceDefaultById: {},
          kickoffBranchNamingRule: "  Use feat/<ticket>.  ",
        },
      ],
    });

    expect(projects[0]?.kickoffBranchNamingRule).toBe("Use feat/<ticket>.");
    expect(normalizeProjectKickoffBranchNamingRule({ value: undefined })).toBe(
      "",
    );
  });

  test("normalizes and updates persisted project appearance", () => {
    const state = {
      recentProjects: normalizeRecentProjectStates({
        projects: [
          {
            projectPath: PROJECT_PATH,
            projectName: "stave",
            lastOpenedAt: "2026-03-30T13:35:33.466Z",
            defaultBranch: "main",
            workspaces: [],
            activeWorkspaceId: "",
            workspaceBranchById: {},
            workspacePathById: {},
            workspaceDefaultById: {},
            appearanceIcon: "code" as const,
            appearanceColor: "violet" as const,
          },
        ],
      }),
      projectPath: PROJECT_PATH,
      projectName: "stave",
      defaultBranch: "main",
      workspaces: [],
      activeWorkspaceId: "",
      workspaceBranchById: {},
      workspacePathById: {},
      workspaceDefaultById: {},
    };

    expect(state.recentProjects[0]?.appearanceIcon).toBe("code");
    expect(state.recentProjects[0]?.appearanceColor).toBe("violet");
    expect(normalizeProjectAppearanceIcon("terminal")).toBe("terminal");
    expect(normalizeProjectAppearanceIcon("unknown")).toBe("folder");
    expect(normalizeProjectAppearanceColor("unknown")).toBe("blue");

    const updated = updateCurrentProjectAppearance({
      state,
      icon: "database",
      color: "emerald",
    });
    expect(updated?.[0]?.appearanceIcon).toBe("database");
    expect(updated?.[0]?.appearanceColor).toBe("emerald");
  });

  test("updates an inactive project appearance and preserves no-op state", () => {
    const recentProjects = normalizeRecentProjectStates({
      projects: [
        {
          projectPath: PROJECT_PATH,
          projectName: "stave",
          lastOpenedAt: "2026-03-30T13:35:33.466Z",
          defaultBranch: "main",
          workspaces: [],
          activeWorkspaceId: "",
          workspaceBranchById: {},
          workspacePathById: {},
          workspaceDefaultById: {},
        },
        {
          projectPath: FOREIGN_PROJECT_PATH,
          projectName: "sbdashboard",
          lastOpenedAt: "2026-03-29T13:35:33.466Z",
          defaultBranch: "main",
          workspaces: [],
          activeWorkspaceId: "",
          workspaceBranchById: {},
          workspacePathById: {},
          workspaceDefaultById: {},
        },
      ],
    });
    const state = {
      recentProjects,
      projectPath: PROJECT_PATH,
      projectName: "stave",
      defaultBranch: "main",
      workspaces: [],
      activeWorkspaceId: "",
      workspaceBranchById: {},
      workspacePathById: {},
      workspaceDefaultById: {},
    };

    const updated = updateCurrentProjectAppearance({
      state,
      projectPath: FOREIGN_PROJECT_PATH,
      icon: "sparkles",
      color: "rose",
    });
    expect(
      updated?.find((project) => project.projectPath === PROJECT_PATH)
        ?.appearanceIcon,
    ).toBe("folder");
    expect(
      updated?.find((project) => project.projectPath === FOREIGN_PROJECT_PATH)
        ?.appearanceIcon,
    ).toBe("sparkles");
    expect(
      updated?.find((project) => project.projectPath === FOREIGN_PROJECT_PATH)
        ?.appearanceColor,
    ).toBe("rose");

    expect(
      updateCurrentProjectAppearance({
        state: { ...state, recentProjects: updated ?? recentProjects },
        projectPath: FOREIGN_PROJECT_PATH,
        icon: "sparkles",
        color: "rose",
      }),
    ).toBeNull();
  });

  test("updates project kickoff preferences through the shared registry helper", () => {
    const workspace = {
      id: DEFAULT_WORKSPACE_ID,
      name: "Default Workspace",
      updatedAt: "2026-03-31T13:36:33.211Z",
    };
    const recentProjects = updateCurrentProjectTextPreference({
      state: {
        recentProjects: [],
        projectPath: PROJECT_PATH,
        projectName: "stave",
        defaultBranch: "main",
        workspaces: [workspace],
        activeWorkspaceId: DEFAULT_WORKSPACE_ID,
        workspaceBranchById: { [DEFAULT_WORKSPACE_ID]: "main" },
        workspacePathById: { [DEFAULT_WORKSPACE_ID]: PROJECT_PATH },
        workspaceDefaultById: { [DEFAULT_WORKSPACE_ID]: true },
      },
      preference: {
        key: "kickoffBranchNamingRule",
        value: "  feat/<ticket>-<slug>  ",
      },
    });

    expect(recentProjects?.[0]?.kickoffBranchNamingRule).toBe(
      "feat/<ticket>-<slug>",
    );
  });

  test("preserves and clears archived workspace path tombstones", () => {
    const defaultWorkspace = {
      id: DEFAULT_WORKSPACE_ID,
      name: "Default Workspace",
      updatedAt: "2026-03-31T13:36:33.211Z",
    };
    const archivedProjects = captureCurrentProjectState({
      recentProjects: [],
      projectPath: PROJECT_PATH,
      projectName: "stave",
      defaultBranch: "main",
      workspaces: [defaultWorkspace],
      activeWorkspaceId: DEFAULT_WORKSPACE_ID,
      workspaceBranchById: { [DEFAULT_WORKSPACE_ID]: "main" },
      workspacePathById: { [DEFAULT_WORKSPACE_ID]: PROJECT_PATH },
      workspaceDefaultById: { [DEFAULT_WORKSPACE_ID]: true },
      archivedWorkspacePathsToAdd: [FEATURE_WORKSPACE_PATH],
    });

    expect(archivedProjects[0]?.archivedWorkspacePaths).toEqual([
      FEATURE_WORKSPACE_PATH,
    ]);

    const restoredProjects = captureCurrentProjectState({
      recentProjects: archivedProjects,
      projectPath: PROJECT_PATH,
      projectName: "stave",
      defaultBranch: "main",
      workspaces: [
        defaultWorkspace,
        {
          id: "workspace-feature",
          name: "feat/auto-update-on-mac",
          updatedAt: "2026-03-31T13:37:33.211Z",
        },
      ],
      activeWorkspaceId: "workspace-feature",
      workspaceBranchById: {
        [DEFAULT_WORKSPACE_ID]: "main",
        "workspace-feature": "feat/auto-update-on-mac",
      },
      workspacePathById: {
        [DEFAULT_WORKSPACE_ID]: PROJECT_PATH,
        "workspace-feature": FEATURE_WORKSPACE_PATH,
      },
      workspaceDefaultById: {
        [DEFAULT_WORKSPACE_ID]: true,
        "workspace-feature": false,
      },
      archivedWorkspacePathsToRemove: [FEATURE_WORKSPACE_PATH],
    });

    expect(restoredProjects[0]?.archivedWorkspacePaths).toBeUndefined();
  });

  test("preserves and clears linked workspace paths", () => {
    const linkedWorktreePath = "/tmp/worktrees/feature-elsewhere";
    const defaultWorkspace = {
      id: DEFAULT_WORKSPACE_ID,
      name: "Default Workspace",
      updatedAt: "2026-03-31T13:36:33.211Z",
    };
    const linkedProjects = captureCurrentProjectState({
      recentProjects: [],
      projectPath: PROJECT_PATH,
      projectName: "stave",
      defaultBranch: "main",
      workspaces: [defaultWorkspace],
      activeWorkspaceId: DEFAULT_WORKSPACE_ID,
      workspaceBranchById: { [DEFAULT_WORKSPACE_ID]: "main" },
      workspacePathById: { [DEFAULT_WORKSPACE_ID]: PROJECT_PATH },
      workspaceDefaultById: { [DEFAULT_WORKSPACE_ID]: true },
      linkedWorkspacePathsToAdd: [linkedWorktreePath],
    });

    expect(linkedProjects[0]?.linkedWorkspacePaths).toEqual([
      linkedWorktreePath,
    ]);

    // Linked paths must survive an unrelated capture (no add/remove args).
    const untouchedProjects = captureCurrentProjectState({
      recentProjects: linkedProjects,
      projectPath: PROJECT_PATH,
      projectName: "stave",
      defaultBranch: "main",
      workspaces: [defaultWorkspace],
      activeWorkspaceId: DEFAULT_WORKSPACE_ID,
      workspaceBranchById: { [DEFAULT_WORKSPACE_ID]: "main" },
      workspacePathById: { [DEFAULT_WORKSPACE_ID]: PROJECT_PATH },
      workspaceDefaultById: { [DEFAULT_WORKSPACE_ID]: true },
    });

    expect(untouchedProjects[0]?.linkedWorkspacePaths).toEqual([
      linkedWorktreePath,
    ]);

    const unlinkedProjects = captureCurrentProjectState({
      recentProjects: untouchedProjects,
      projectPath: PROJECT_PATH,
      projectName: "stave",
      defaultBranch: "main",
      workspaces: [defaultWorkspace],
      activeWorkspaceId: DEFAULT_WORKSPACE_ID,
      workspaceBranchById: { [DEFAULT_WORKSPACE_ID]: "main" },
      workspacePathById: { [DEFAULT_WORKSPACE_ID]: PROJECT_PATH },
      workspaceDefaultById: { [DEFAULT_WORKSPACE_ID]: true },
      linkedWorkspacePathsToRemove: [linkedWorktreePath],
    });

    expect(unlinkedProjects[0]?.linkedWorkspacePaths).toBeUndefined();
  });

  test("reconcileArchivedWorkspacePaths restores tombstones lost from one source", () => {
    // localStorage lost the tombstone but the SQLite registry mirror kept it
    // (or vice versa): the union must keep the workspace archived.
    expect(
      reconcileArchivedWorkspacePaths({
        primary: [FEATURE_WORKSPACE_PATH],
        secondary: undefined,
        workspacePathById: { [DEFAULT_WORKSPACE_ID]: PROJECT_PATH },
      }),
    ).toEqual([FEATURE_WORKSPACE_PATH]);
    expect(
      reconcileArchivedWorkspacePaths({
        primary: undefined,
        secondary: [FEATURE_WORKSPACE_PATH],
        workspacePathById: { [DEFAULT_WORKSPACE_ID]: PROJECT_PATH },
      }),
    ).toEqual([FEATURE_WORKSPACE_PATH]);
  });

  test("reconcileArchivedWorkspacePaths dedupes and merges both sources", () => {
    const otherArchivedPath = `${PROJECT_PATH}/.stave/workspaces/fix__other`;
    expect(
      reconcileArchivedWorkspacePaths({
        primary: [FEATURE_WORKSPACE_PATH, otherArchivedPath],
        secondary: [FEATURE_WORKSPACE_PATH],
        workspacePathById: { [DEFAULT_WORKSPACE_ID]: PROJECT_PATH },
      }),
    ).toEqual([FEATURE_WORKSPACE_PATH, otherArchivedPath]);
  });

  test("reconcileArchivedWorkspacePaths drops tombstones for re-registered workspaces", () => {
    // A stale tombstone from one source must not hide a workspace the user
    // re-created at the same path.
    expect(
      reconcileArchivedWorkspacePaths({
        primary: [FEATURE_WORKSPACE_PATH],
        secondary: [],
        workspacePathById: {
          [DEFAULT_WORKSPACE_ID]: PROJECT_PATH,
          "workspace-feature": FEATURE_WORKSPACE_PATH,
        },
      }),
    ).toEqual([]);
  });

  test("keeps linked workspace paths across normalization round-trips", () => {
    const linkedWorktreePath = "/tmp/worktrees/feature-elsewhere";
    const projects = normalizeRecentProjectStates({
      projects: [
        {
          projectPath: PROJECT_PATH,
          projectName: "stave",
          lastOpenedAt: "2026-03-30T13:35:33.466Z",
          defaultBranch: "main",
          workspaces: [],
          activeWorkspaceId: "",
          workspaceBranchById: {},
          workspacePathById: {},
          workspaceDefaultById: {},
          linkedWorkspacePaths: [linkedWorktreePath, linkedWorktreePath, ""],
        },
      ],
    });

    expect(projects[0]?.linkedWorkspacePaths).toEqual([linkedWorktreePath]);
  });

  test("rejects a foreign default workspace when its path points at another project", () => {
    expect(
      resolveCurrentProjectDefaultWorkspaceId({
        projectPath: PROJECT_PATH,
        workspaces: [
          {
            id: "base:1i2znya",
            name: "Default Workspace",
            updatedAt: "2026-03-31T13:36:19.071Z",
          },
        ],
        workspaceDefaultById: { "base:1i2znya": true },
        workspacePathById: {
          "base:1i2znya": FOREIGN_PROJECT_PATH,
        },
      }),
    ).toBe(
      buildProjectDefaultWorkspaceId({
        projectPath: PROJECT_PATH,
      }),
    );
  });

  test("repairs a corrupted project registry entry whose default workspace came from another project", () => {
    const projects = normalizeRecentProjectStates({
      projects: [
        {
          projectPath: PROJECT_PATH,
          projectName: "stave",
          lastOpenedAt: "2026-03-31T13:36:33.211Z",
          defaultBranch: "main",
          workspaces: [
            {
              id: "base:1i2znya",
              name: "Default Workspace",
              updatedAt: "2026-03-31T13:36:19.071Z",
            },
            {
              id: "3158a1b0-acfa-4413-b0c3-e5c7c7441c86",
              name: "feat/auto-update-on-mac",
              updatedAt: "2026-03-31T13:28:16.529Z",
            },
          ],
          activeWorkspaceId: "base:1i2znya",
          workspaceBranchById: {
            "base:1i2znya": "master",
            "3158a1b0-acfa-4413-b0c3-e5c7c7441c86": "feat/auto-update-on-mac",
          },
          workspacePathById: {
            "base:1i2znya": FOREIGN_PROJECT_PATH,
            "3158a1b0-acfa-4413-b0c3-e5c7c7441c86": FEATURE_WORKSPACE_PATH,
          },
          workspaceDefaultById: { "base:1i2znya": true },
        },
      ],
    });

    expect(projects).toHaveLength(1);
    expect(projects[0]).toEqual({
      projectPath: PROJECT_PATH,
      projectName: "stave",
      lastOpenedAt: "2026-03-31T13:36:33.211Z",
      defaultBranch: "main",
      workspaces: [
        {
          id: DEFAULT_WORKSPACE_ID,
          name: "Default Workspace",
          updatedAt: "2026-03-31T13:36:33.211Z",
        },
        {
          id: "3158a1b0-acfa-4413-b0c3-e5c7c7441c86",
          name: "feat/auto-update-on-mac",
          updatedAt: "2026-03-31T13:28:16.529Z",
        },
      ],
      activeWorkspaceId: DEFAULT_WORKSPACE_ID,
      workspaceBranchById: {
        [DEFAULT_WORKSPACE_ID]: "main",
        "3158a1b0-acfa-4413-b0c3-e5c7c7441c86": "feat/auto-update-on-mac",
      },
      workspacePathById: {
        [DEFAULT_WORKSPACE_ID]: PROJECT_PATH,
        "3158a1b0-acfa-4413-b0c3-e5c7c7441c86": FEATURE_WORKSPACE_PATH,
      },
      workspaceDefaultById: {
        [DEFAULT_WORKSPACE_ID]: true,
        "3158a1b0-acfa-4413-b0c3-e5c7c7441c86": false,
      },
      projectBasePrompt: "",
      kickoffBranchNamingRule: "",
      newWorkspaceInitCommand: "",
      newWorkspaceUseRootNodeModulesSymlink: false,
      appearanceIcon: "folder",
      appearanceColor: "blue",
    });
  });

  test("normalizes the current project workspace state against the repaired registry entry", () => {
    const normalized = normalizeCurrentProjectState({
      projectPath: PROJECT_PATH,
      projectName: "stave",
      defaultBranch: "main",
      workspaces: [
        {
          id: "base:1i2znya",
          name: "Default Workspace",
          updatedAt: "2026-03-31T13:36:19.071Z",
        },
      ],
      activeWorkspaceId: "base:1i2znya",
      workspaceBranchById: { "base:1i2znya": "master" },
      workspacePathById: { "base:1i2znya": FOREIGN_PROJECT_PATH },
      workspaceDefaultById: { "base:1i2znya": true },
      recentProjects: [
        {
          projectPath: PROJECT_PATH,
          projectName: "stave",
          lastOpenedAt: "2026-03-31T13:36:33.211Z",
          defaultBranch: "main",
          workspaces: [
            {
              id: "base:1i2znya",
              name: "Default Workspace",
              updatedAt: "2026-03-31T13:36:19.071Z",
            },
          ],
          activeWorkspaceId: "base:1i2znya",
          workspaceBranchById: { "base:1i2znya": "master" },
          workspacePathById: { "base:1i2znya": FOREIGN_PROJECT_PATH },
          workspaceDefaultById: { "base:1i2znya": true },
        },
      ],
    });

    expect(normalized).toMatchObject({
      activeWorkspaceId: DEFAULT_WORKSPACE_ID,
      workspaceBranchById: { [DEFAULT_WORKSPACE_ID]: "main" },
      workspacePathById: { [DEFAULT_WORKSPACE_ID]: PROJECT_PATH },
      workspaceDefaultById: { [DEFAULT_WORKSPACE_ID]: true },
    });
  });

  test("resolves workspace names from current state before falling back to recents", () => {
    expect(
      resolveWorkspaceName({
        workspaceId: "ws-current",
        state: {
          workspaces: [
            {
              id: "ws-current",
              name: "feature/current",
              updatedAt: "2026-04-16T00:00:00.000Z",
            },
          ],
          recentProjects: [
            {
              projectPath: "/tmp/other-project",
              projectName: "other-project",
              lastOpenedAt: "2026-04-16T00:00:00.000Z",
              defaultBranch: "main",
              workspaces: [
                {
                  id: "ws-recent",
                  name: "feature/recent",
                  updatedAt: "2026-04-16T00:00:00.000Z",
                },
              ],
              activeWorkspaceId: "ws-recent",
              workspaceBranchById: {},
              workspacePathById: {},
              workspaceDefaultById: {},
            },
          ],
        },
      }),
    ).toBe("feature/current");

    expect(
      resolveWorkspaceName({
        workspaceId: "ws-recent",
        state: {
          workspaces: [],
          recentProjects: [
            {
              projectPath: "/tmp/other-project",
              projectName: "other-project",
              lastOpenedAt: "2026-04-16T00:00:00.000Z",
              defaultBranch: "main",
              workspaces: [
                {
                  id: "ws-recent",
                  name: "feature/recent",
                  updatedAt: "2026-04-16T00:00:00.000Z",
                },
              ],
              activeWorkspaceId: "ws-recent",
              workspaceBranchById: {},
              workspacePathById: {},
              workspaceDefaultById: {},
            },
          ],
        },
      }),
    ).toBe("feature/recent");
  });

  test("resolves the owning project for a workspace from current state or recents", () => {
    expect(
      resolveProjectForWorkspaceId({
        workspaceId: "ws-current",
        state: {
          projectPath: PROJECT_PATH,
          projectName: "stave",
          workspaces: [
            {
              id: "ws-current",
              name: "feature/current",
              updatedAt: "2026-04-16T00:00:00.000Z",
            },
          ],
          recentProjects: [],
        },
      }),
    ).toEqual({
      projectPath: PROJECT_PATH,
      projectName: "stave",
    });

    expect(
      resolveProjectForWorkspaceId({
        workspaceId: "ws-recent",
        state: {
          projectPath: null,
          projectName: null,
          workspaces: [],
          recentProjects: [
            {
              projectPath: "/tmp/other-project",
              projectName: "other-project",
              lastOpenedAt: "2026-04-16T00:00:00.000Z",
              defaultBranch: "main",
              workspaces: [
                {
                  id: "ws-recent",
                  name: "feature/recent",
                  updatedAt: "2026-04-16T00:00:00.000Z",
                },
              ],
              activeWorkspaceId: "ws-recent",
              workspaceBranchById: {},
              workspacePathById: {},
              workspaceDefaultById: {},
            },
          ],
        },
      }),
    ).toEqual({
      projectPath: "/tmp/other-project",
      projectName: "other-project",
    });
  });

  test("resolves task workspace context from task ownership before falling back to the active workspace", () => {
    expect(
      resolveTaskWorkspaceContext({
        taskId: "task-1",
        activeWorkspaceId: "ws-active",
        taskWorkspaceIdById: { "task-1": "ws-owned" },
        workspacePathById: {
          "ws-active": "/tmp/active",
          "ws-owned": "/tmp/owned",
        },
        workspaceDefaultById: { "ws-active": true, "ws-owned": false },
        projectPath: "/tmp/project",
      }),
    ).toEqual({
      workspaceId: "ws-owned",
      cwd: "/tmp/owned",
    });
  });

  test("does not fall back to the project root for stale task workspace ownership", () => {
    expect(
      resolveTaskWorkspaceContext({
        taskId: "task-1",
        activeWorkspaceId: "ws-active",
        taskWorkspaceIdById: { "task-1": "ws-stale" },
        workspacePathById: {
          "ws-active": "/tmp/active",
        },
        workspaceDefaultById: { "ws-active": false },
        projectPath: "/tmp/project",
      }),
    ).toEqual({
      workspaceId: "ws-stale",
      cwd: undefined,
    });
  });
});

describe("sanitizeBranchName", () => {
  test("preserves uppercase letters in branch names", () => {
    expect(sanitizeBranchName({ value: "feature/MyFeature" })).toBe(
      "feature/MyFeature",
    );
    expect(sanitizeBranchName({ value: "JIRA-123/Fix-Bug" })).toBe(
      "JIRA-123/Fix-Bug",
    );
    expect(sanitizeBranchName({ value: "feat/Add-OAuth2-Support" })).toBe(
      "feat/Add-OAuth2-Support",
    );
  });

  test("trims surrounding whitespace", () => {
    expect(sanitizeBranchName({ value: "  feature/MyBranch  " })).toBe(
      "feature/MyBranch",
    );
  });

  test("replaces disallowed characters with hyphens and strips leading/trailing hyphens", () => {
    expect(sanitizeBranchName({ value: "feat: add OAuth" })).toBe(
      "feat-add-OAuth",
    );
    expect(sanitizeBranchName({ value: "  Feature PR Status  " })).toBe(
      "Feature-PR-Status",
    );
    expect(sanitizeBranchName({ value: "--bad-name--" })).toBe("bad-name");
  });

  test("preserves slashes, dots, and underscores already allowed in branch names", () => {
    expect(sanitizeBranchName({ value: "feat/v2.0_release" })).toBe(
      "feat/v2.0_release",
    );
  });

  test("returns empty string for whitespace-only input", () => {
    expect(sanitizeBranchName({ value: "   " })).toBe("");
  });
});

describe("toWorkspaceFolderName", () => {
  test("legacy mode converts slashes to double-underscores (case preserved)", () => {
    expect(toWorkspaceFolderName({ branch: "feature/MyFeature" })).toBe(
      "feature__MyFeature",
    );
    expect(toWorkspaceFolderName({ branch: "feature/pr-status" })).toBe(
      "feature__pr-status",
    );
  });

  test("unique mode produces a lowercase slug with a deterministic hash suffix", () => {
    const folder = toWorkspaceFolderName({
      branch: "feature/MyFeature",
      unique: true,
    });
    // Must be fully lowercase
    expect(folder).toBe(folder.toLowerCase());
    // Must contain a "--" separator before the hash
    expect(folder).toMatch(/^feature__myfeature--[a-z0-9]+$/);
  });

  test("unique mode generates distinct folders for branches that differ only in case", () => {
    const lower = toWorkspaceFolderName({
      branch: "feature/abc",
      unique: true,
    });
    const upper = toWorkspaceFolderName({
      branch: "feature/ABC",
      unique: true,
    });
    expect(lower).not.toBe(upper);
    // Both prefixes should be lowercase-identical while hashes differ
    expect(lower.split("--")[0]).toBe(upper.split("--")[0]);
    expect(lower.split("--")[1]).not.toBe(upper.split("--")[1]);
  });

  test("unique mode is deterministic for the same input", () => {
    const a = toWorkspaceFolderName({
      branch: "feature/MyFeature",
      unique: true,
    });
    const b = toWorkspaceFolderName({
      branch: "feature/MyFeature",
      unique: true,
    });
    expect(a).toBe(b);
  });

  test("legacy and unique modes produce different paths for mixed-case branches", () => {
    const legacy = toWorkspaceFolderName({ branch: "feature/MyFeature" });
    const unique = toWorkspaceFolderName({
      branch: "feature/MyFeature",
      unique: true,
    });
    // Legacy keeps case; unique lowercases
    expect(legacy).toBe("feature__MyFeature");
    expect(unique).not.toBe("feature__MyFeature");
    expect(unique).toBe(unique.toLowerCase());
  });
});

describe("linked worktree helpers", () => {
  test("builds a deterministic symlink folder from the worktree path", () => {
    const first = buildLinkedWorktreeFolderName({
      worktreePath: "/tmp/worktrees/Feature Branch",
    });
    const second = buildLinkedWorktreeFolderName({
      worktreePath: "/tmp/worktrees/Feature Branch",
    });
    expect(first).toBe(second);
    expect(first).toMatch(/^feature-branch--[a-z0-9]+$/);
  });

  test("distinguishes worktrees with the same basename in different parents", () => {
    const first = buildLinkedWorktreeFolderName({
      worktreePath: "/tmp/worktrees-a/feature",
    });
    const second = buildLinkedWorktreeFolderName({
      worktreePath: "/tmp/worktrees-b/feature",
    });
    expect(first).not.toBe(second);
  });

  test("places the symlink under the project workspaces directory", () => {
    const symlinkPath = buildLinkedWorktreeSymlinkPath({
      projectPath: PROJECT_PATH,
      worktreePath: "/tmp/worktrees/feature",
    });
    expect(symlinkPath.startsWith(`${PROJECT_PATH}/.stave/workspaces/`)).toBe(
      true,
    );
    expect(
      symlinkPath.endsWith(`/feature--${symlinkPath.split("--").at(-1)}`),
    ).toBe(true);
  });
});

describe("toShellPathArgument", () => {
  test("quotes absolute paths, including spaces", () => {
    expect(toShellPathArgument({ path: "/tmp/work trees/feature" })).toBe(
      '"/tmp/work trees/feature"',
    );
  });

  test("keeps a leading tilde expandable while quoting the rest", () => {
    expect(toShellPathArgument({ path: "~" })).toBe("~");
    expect(toShellPathArgument({ path: "~/worktrees/my feature" })).toBe(
      '~/"worktrees/my feature"',
    );
  });

  test("trims surrounding whitespace before quoting", () => {
    expect(toShellPathArgument({ path: "  /tmp/worktrees/feature  " })).toBe(
      '"/tmp/worktrees/feature"',
    );
  });
});
