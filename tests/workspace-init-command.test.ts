import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  buildImportedWorktreeWorkspaceId,
  toWorkspaceFolderName,
} from "@/store/project.utils";

const originalWindow = globalThis.window;

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    },
  };
}

function setWindowContext(args: { api?: unknown }) {
  (globalThis as { window?: unknown }).window = {
    api: args.api,
    localStorage: createMemoryStorage(),
  } as unknown;
}

beforeEach(() => {
  setWindowContext({});
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("new workspace init command", () => {
  test("refreshes an explicit remote base branch before creating the workspace", async () => {
    const runCalls: Array<{ cwd?: string; command: string }> = [];

    setWindowContext({
      api: {
        terminal: {
          runCommand: async (args: { cwd?: string; command: string }) => {
            runCalls.push(args);
            return {
              ok: true,
              code: 0,
              stdout: "",
              stderr: "",
            };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();

    useAppStore.setState({
      ...initialState,
      projectPath: "/tmp/stave-project",
      projectName: "stave-project",
      defaultBranch: "main",
      recentProjects: [
        {
          projectPath: "/tmp/stave-project",
          projectName: "stave-project",
          lastOpenedAt: "2026-03-26T00:00:00.000Z",
          defaultBranch: "main",
          workspaces: [],
          activeWorkspaceId: "",
          workspaceBranchById: {},
          workspacePathById: {},
          workspaceDefaultById: {},
        },
      ],
      workspaces: [],
      activeWorkspaceId: "",
      workspaceBranchById: {},
      workspacePathById: {},
      workspaceDefaultById: {},
      projectFiles: [],
    });

    const result = await useAppStore.getState().createWorkspace({
      name: "feature/remote-bootstrap",
      mode: "branch",
      fromBranch: "origin/main",
      fromBranchKind: "remote",
    });

    expect(result).toEqual({ ok: true });
    const workspacePath = `/tmp/stave-project/.stave/workspaces/${toWorkspaceFolderName(
      {
        branch: "feature/remote-bootstrap",
        unique: true,
      },
    )}`;
    expect(runCalls.map((call) => call.command)).toEqual([
      "git fetch origin --prune",
      "mkdir -p .stave/workspaces",
      `git worktree add -b "feature/remote-bootstrap" ${JSON.stringify(workspacePath)} "origin/main"`,
    ]);
  });

  test("falls back to the matching local branch when refreshing a remote base branch fails", async () => {
    const runCalls: Array<{ cwd?: string; command: string }> = [];

    setWindowContext({
      api: {
        terminal: {
          runCommand: async (args: { cwd?: string; command: string }) => {
            runCalls.push(args);
            if (args.command === "git fetch origin --prune") {
              return {
                ok: false,
                code: 1,
                stdout: "",
                stderr: "fatal: unable to access remote",
              };
            }
            return {
              ok: true,
              code: 0,
              stdout: "",
              stderr: "",
            };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();

    useAppStore.setState({
      ...initialState,
      projectPath: "/tmp/stave-project",
      projectName: "stave-project",
      defaultBranch: "main",
      recentProjects: [
        {
          projectPath: "/tmp/stave-project",
          projectName: "stave-project",
          lastOpenedAt: "2026-03-26T00:00:00.000Z",
          defaultBranch: "main",
          workspaces: [],
          activeWorkspaceId: "",
          workspaceBranchById: {},
          workspacePathById: {},
          workspaceDefaultById: {},
        },
      ],
      workspaces: [],
      activeWorkspaceId: "",
      workspaceBranchById: {},
      workspacePathById: {},
      workspaceDefaultById: {},
      projectFiles: [],
    });

    const result = await useAppStore.getState().createWorkspace({
      name: "feature/remote-fallback",
      mode: "branch",
      fromBranch: "origin/main",
      fromBranchKind: "remote",
    });

    expect(result).toMatchObject({
      ok: true,
      noticeLevel: "warning",
    });
    expect(result.message).toContain("Could not refresh `origin/main`");
    expect(result.message).toContain("local `main` instead");
    expect(result.message).toContain("fatal: unable to access remote");
    const workspacePath = `/tmp/stave-project/.stave/workspaces/${toWorkspaceFolderName(
      {
        branch: "feature/remote-fallback",
        unique: true,
      },
    )}`;
    expect(runCalls.map((call) => call.command)).toEqual([
      "git fetch origin --prune",
      'git show-ref --verify --quiet "refs/heads/main"',
      "mkdir -p .stave/workspaces",
      `git worktree add -b "feature/remote-fallback" ${JSON.stringify(workspacePath)} "main"`,
    ]);
  });

  test("runs the configured command in the created workspace root", async () => {
    const runCalls: Array<{ cwd?: string; command: string }> = [];

    setWindowContext({
      api: {
        terminal: {
          runCommand: async (args: { cwd?: string; command: string }) => {
            runCalls.push(args);
            return {
              ok: true,
              code: 0,
              stdout: args.command === "bun install" ? "installed" : "",
              stderr: "",
            };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();

    useAppStore.setState({
      ...initialState,
      projectPath: "/tmp/stave-project",
      projectName: "stave-project",
      defaultBranch: "main",
      recentProjects: [
        {
          projectPath: "/tmp/stave-project",
          projectName: "stave-project",
          lastOpenedAt: "2026-03-26T00:00:00.000Z",
          defaultBranch: "main",
          workspaces: [],
          activeWorkspaceId: "",
          workspaceBranchById: {},
          workspacePathById: {},
          workspaceDefaultById: {},
          newWorkspaceInitCommand: "bun install",
        },
      ],
      workspaces: [],
      activeWorkspaceId: "",
      workspaceBranchById: {},
      workspacePathById: {},
      workspaceDefaultById: {},
      projectFiles: [],
    });

    const result = await useAppStore.getState().createWorkspace({
      name: "feature/bootstrap",
      mode: "branch",
      fromBranch: "main",
    });

    expect(result).toMatchObject({
      ok: true,
      noticeLevel: "success",
    });
    const workspacePath = `/tmp/stave-project/.stave/workspaces/${toWorkspaceFolderName(
      {
        branch: "feature/bootstrap",
        unique: true,
      },
    )}`;
    expect(result.message).toContain("bun install");
    expect(runCalls.map((call) => call.command)).toEqual([
      "mkdir -p .stave/workspaces",
      `git worktree add -b \"feature/bootstrap\" ${JSON.stringify(workspacePath)} \"main\"`,
      "bun install",
    ]);
    expect(runCalls[2]).toEqual({
      cwd: workspacePath,
      command: "bun install",
    });
    expect(useAppStore.getState().workspaces).toHaveLength(1);
    expect(useAppStore.getState().workspaces[0]?.id).toBe(
      buildImportedWorktreeWorkspaceId({
        projectPath: "/tmp/stave-project",
        worktreePath: workspacePath,
      }),
    );
    expect(useAppStore.getState().tasks).toHaveLength(1);
    expect(useAppStore.getState().tasks[0]?.title).toBe("New Task");
    expect(useAppStore.getState().activeTaskId).toBe(
      useAppStore.getState().tasks[0]?.id,
    );
  });

  test("reuses the repository root node_modules via symlink before the post-create command when configured", async () => {
    const runCalls: Array<{ cwd?: string; command: string }> = [];

    setWindowContext({
      api: {
        terminal: {
          runCommand: async (args: { cwd?: string; command: string }) => {
            runCalls.push(args);
            return {
              ok: true,
              code: 0,
              stdout: "",
              stderr: "",
            };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();

    useAppStore.setState({
      ...initialState,
      projectPath: "/tmp/stave-project",
      projectName: "stave-project",
      defaultBranch: "main",
      recentProjects: [
        {
          projectPath: "/tmp/stave-project",
          projectName: "stave-project",
          lastOpenedAt: "2026-03-26T00:00:00.000Z",
          defaultBranch: "main",
          workspaces: [],
          activeWorkspaceId: "",
          workspaceBranchById: {},
          workspacePathById: {},
          workspaceDefaultById: {},
          newWorkspaceInitCommand: "bun run bootstrap:workspace",
          newWorkspaceUseRootNodeModulesSymlink: true,
        },
      ],
      workspaces: [],
      activeWorkspaceId: "",
      workspaceBranchById: {},
      workspacePathById: {},
      workspaceDefaultById: {},
      projectFiles: [],
    });

    const result = await useAppStore.getState().createWorkspace({
      name: "feature/shared-deps",
      mode: "branch",
      fromBranch: "main",
    });

    expect(result).toMatchObject({
      ok: true,
      noticeLevel: "success",
    });
    const workspacePath = `/tmp/stave-project/.stave/workspaces/${toWorkspaceFolderName(
      {
        branch: "feature/shared-deps",
        unique: true,
      },
    )}`;
    expect(result.message).toContain("Linked `node_modules`");
    expect(result.message).toContain("bun run bootstrap:workspace");
    expect(runCalls.map((call) => call.command)).toEqual([
      "mkdir -p .stave/workspaces",
      `git worktree add -b \"feature/shared-deps\" ${JSON.stringify(workspacePath)} \"main\"`,
      runCalls[2]?.command ?? "",
      "bun run bootstrap:workspace",
    ]);
    expect(runCalls[2]?.cwd).toBe(workspacePath);
    expect(runCalls[2]?.command).toContain(
      'ln -s "/tmp/stave-project/node_modules" node_modules',
    );
    expect(runCalls[3]).toEqual({
      cwd: workspacePath,
      command: "bun run bootstrap:workspace",
    });
  });

  test("keeps the workspace when the shared node_modules symlink fails", async () => {
    const runCalls: Array<{ cwd?: string; command: string }> = [];

    setWindowContext({
      api: {
        terminal: {
          runCommand: async (args: { cwd?: string; command: string }) => {
            runCalls.push(args);
            if (
              args.command.includes(
                'ln -s "/tmp/stave-project/node_modules" node_modules',
              )
            ) {
              return {
                ok: false,
                code: 1,
                stdout: "",
                stderr: "ln: node_modules: File exists",
              };
            }
            return {
              ok: true,
              code: 0,
              stdout: "",
              stderr: "",
            };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();

    useAppStore.setState({
      ...initialState,
      projectPath: "/tmp/stave-project",
      projectName: "stave-project",
      defaultBranch: "main",
      recentProjects: [
        {
          projectPath: "/tmp/stave-project",
          projectName: "stave-project",
          lastOpenedAt: "2026-03-26T00:00:00.000Z",
          defaultBranch: "main",
          workspaces: [],
          activeWorkspaceId: "",
          workspaceBranchById: {},
          workspacePathById: {},
          workspaceDefaultById: {},
          newWorkspaceInitCommand: "",
          newWorkspaceUseRootNodeModulesSymlink: true,
        },
      ],
      workspaces: [],
      activeWorkspaceId: "",
      workspaceBranchById: {},
      workspacePathById: {},
      workspaceDefaultById: {},
      projectFiles: [],
    });

    const result = await useAppStore.getState().createWorkspace({
      name: "feature/shared-deps-warning",
      mode: "clean",
    });

    expect(result).toMatchObject({
      ok: true,
      noticeLevel: "warning",
    });
    const workspacePath = `/tmp/stave-project/.stave/workspaces/${toWorkspaceFolderName(
      {
        branch: "feature/shared-deps-warning",
        unique: true,
      },
    )}`;
    expect(result.message).toContain(
      "Linking the shared root `node_modules` failed",
    );
    expect(result.message).toContain("ln: node_modules: File exists");
    expect(runCalls[2]?.cwd).toBe(workspacePath);
    expect(runCalls[2]?.command).toContain(
      'ln -s "/tmp/stave-project/node_modules" node_modules',
    );
    expect(useAppStore.getState().workspaces).toHaveLength(1);
  });

  test("keeps the workspace when the configured command fails", async () => {
    const runCalls: Array<{ cwd?: string; command: string }> = [];

    setWindowContext({
      api: {
        terminal: {
          runCommand: async (args: { cwd?: string; command: string }) => {
            runCalls.push(args);
            if (args.command === "npm install") {
              return {
                ok: false,
                code: 1,
                stdout: "",
                stderr: "npm ERR! missing lockfile",
              };
            }
            return {
              ok: true,
              code: 0,
              stdout: "",
              stderr: "",
            };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();

    useAppStore.setState({
      ...initialState,
      projectPath: "/tmp/stave-project",
      projectName: "stave-project",
      defaultBranch: "main",
      recentProjects: [
        {
          projectPath: "/tmp/stave-project",
          projectName: "stave-project",
          lastOpenedAt: "2026-03-26T00:00:00.000Z",
          defaultBranch: "main",
          workspaces: [],
          activeWorkspaceId: "",
          workspaceBranchById: {},
          workspacePathById: {},
          workspaceDefaultById: {},
          newWorkspaceInitCommand: "npm install",
        },
      ],
      workspaces: [],
      activeWorkspaceId: "",
      workspaceBranchById: {},
      workspacePathById: {},
      workspaceDefaultById: {},
      projectFiles: [],
    });

    const result = await useAppStore.getState().createWorkspace({
      name: "feature/failing-bootstrap",
      mode: "clean",
    });

    expect(result).toMatchObject({
      ok: true,
      noticeLevel: "warning",
    });
    const workspacePath = `/tmp/stave-project/.stave/workspaces/${toWorkspaceFolderName(
      {
        branch: "feature/failing-bootstrap",
        unique: true,
      },
    )}`;
    expect(result.message).toContain("post-create command failed");
    expect(result.message).toContain("npm ERR! missing lockfile");
    expect(runCalls.at(-1)).toEqual({
      cwd: workspacePath,
      command: "npm install",
    });
    expect(useAppStore.getState().workspaces).toHaveLength(1);
    expect(useAppStore.getState().activeWorkspaceId).not.toBe("");
  });
});

describe("branch case and legacy/new folder coexistence", () => {
  test("preserves uppercase in branch name and git command when creating a mixed-case workspace", async () => {
    const runCalls: Array<{ cwd?: string; command: string }> = [];

    setWindowContext({
      api: {
        terminal: {
          runCommand: async (args: { cwd?: string; command: string }) => {
            runCalls.push(args);
            return { ok: true, code: 0, stdout: "", stderr: "" };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();

    useAppStore.setState({
      ...initialState,
      projectPath: "/tmp/stave-project",
      projectName: "stave-project",
      defaultBranch: "main",
      recentProjects: [],
      workspaces: [],
      activeWorkspaceId: "",
      workspaceBranchById: {},
      workspacePathById: {},
      workspaceDefaultById: {},
      projectFiles: [],
    });

    const result = await useAppStore.getState().createWorkspace({
      name: "feature/MyFeature",
      mode: "branch",
      fromBranch: "main",
    });

    expect(result.ok).toBe(true);

    const expectedBranch = "feature/MyFeature";
    const expectedPath = `/tmp/stave-project/.stave/workspaces/${toWorkspaceFolderName(
      {
        branch: expectedBranch,
        unique: true,
      },
    )}`;

    // git branch name preserves case
    expect(runCalls[1]?.command).toContain(`-b "${expectedBranch}"`);
    // worktree path is lowercase-safe (unique slug)
    expect(runCalls[1]?.command).toContain(JSON.stringify(expectedPath));
    expect(expectedPath.toLowerCase()).toBe(expectedPath);
  });

  test("two branches differing only in case get distinct worktree folders", async () => {
    const pathsCreated: string[] = [];

    const makeRunner =
      (calls: Array<{ cwd?: string; command: string }>) =>
      async (args: { cwd?: string; command: string }) => {
        calls.push(args);
        const worktreeMatch = args.command.match(
          /git worktree add -b "[^"]+" "([^"]+)"/,
        );
        if (worktreeMatch?.[1]) {
          pathsCreated.push(worktreeMatch[1]);
        }
        return { ok: true, code: 0, stdout: "", stderr: "" };
      };

    const runCallsA: Array<{ cwd?: string; command: string }> = [];
    const runCallsB: Array<{ cwd?: string; command: string }> = [];

    setWindowContext({
      api: { terminal: { runCommand: makeRunner(runCallsA) } },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();

    useAppStore.setState({
      ...initialState,
      projectPath: "/tmp/stave-project",
      projectName: "stave-project",
      defaultBranch: "main",
      recentProjects: [],
      workspaces: [],
      activeWorkspaceId: "",
      workspaceBranchById: {},
      workspacePathById: {},
      workspaceDefaultById: {},
      projectFiles: [],
    });

    await useAppStore
      .getState()
      .createWorkspace({
        name: "feature/abc",
        mode: "branch",
        fromBranch: "main",
      });

    setWindowContext({
      api: { terminal: { runCommand: makeRunner(runCallsB) } },
    });

    await useAppStore
      .getState()
      .createWorkspace({
        name: "feature/ABC",
        mode: "branch",
        fromBranch: "main",
      });

    // Both worktrees should have been created at different paths
    expect(pathsCreated).toHaveLength(2);
    expect(pathsCreated[0]).not.toBe(pathsCreated[1]);
    // Both paths should be lowercase-safe
    expect(pathsCreated[0]).toBe(pathsCreated[0]?.toLowerCase());
    expect(pathsCreated[1]).toBe(pathsCreated[1]?.toLowerCase());
  });

  test("creating a workspace with the same branch as a legacy workspace preserves the legacy path entry", async () => {
    // A workspace that was created before the unique-folder change keeps its old folder path
    // in workspacePathById.  Issuing createWorkspace again for the same branch name should
    // NOT overwrite that stored path.  (Branch-name duplicate detection lives in the host-service
    // layer; the renderer store records whatever git reports back.)
    const runCalls: Array<{ cwd?: string; command: string }> = [];

    setWindowContext({
      api: {
        terminal: {
          runCommand: async (args: { cwd?: string; command: string }) => {
            runCalls.push(args);
            return { ok: true, code: 0, stdout: "", stderr: "" };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();

    const legacyPath =
      "/tmp/stave-project/.stave/workspaces/feature__legacy-branch";

    useAppStore.setState({
      ...initialState,
      projectPath: "/tmp/stave-project",
      projectName: "stave-project",
      defaultBranch: "main",
      recentProjects: [
        {
          projectPath: "/tmp/stave-project",
          projectName: "stave-project",
          lastOpenedAt: "2026-04-01T00:00:00.000Z",
          defaultBranch: "main",
          workspaces: [
            {
              id: "ws-legacy",
              name: "feature/legacy-branch",
              updatedAt: "2026-04-01T00:00:00.000Z",
            },
          ],
          activeWorkspaceId: "ws-legacy",
          workspaceBranchById: { "ws-legacy": "feature/legacy-branch" },
          workspacePathById: { "ws-legacy": legacyPath },
          workspaceDefaultById: { "ws-legacy": false },
        },
      ],
      workspaces: [
        {
          id: "ws-legacy",
          name: "feature/legacy-branch",
          updatedAt: "2026-04-01T00:00:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-legacy",
      workspaceBranchById: { "ws-legacy": "feature/legacy-branch" },
      workspacePathById: { "ws-legacy": legacyPath },
      workspaceDefaultById: { "ws-legacy": false },
      projectFiles: [],
    });

    const result = await useAppStore.getState().createWorkspace({
      name: "feature/legacy-branch",
      mode: "branch",
      fromBranch: "main",
    });

    expect(result.ok).toBe(true);

    // The existing legacy workspace entry must still be in the list
    const state = useAppStore.getState();
    const legacyWorkspace = state.workspaces.find(
      (ws) => ws.id === "ws-legacy",
    );
    expect(legacyWorkspace).toBeDefined();
    // Legacy path must be preserved exactly as stored
    expect(state.workspacePathById["ws-legacy"]).toBe(legacyPath);

    // A git worktree add was attempted at a new unique path (not the legacy one)
    const addCall = runCalls.find((c) =>
      c.command.startsWith("git worktree add"),
    );
    expect(addCall).toBeDefined();
    // Exact quoted path must differ from legacy path (unique slug has a hash suffix)
    expect(addCall?.command).not.toContain(`"${legacyPath}"`);
  });

  test("new mixed-case workspace uses unique path; existing lowercase branch uses legacy path unaffected", async () => {
    const runCalls: Array<{ cwd?: string; command: string }> = [];

    setWindowContext({
      api: {
        terminal: {
          runCommand: async (args: { cwd?: string; command: string }) => {
            runCalls.push(args);
            return { ok: true, code: 0, stdout: "", stderr: "" };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();

    // Existing workspace with legacy folder path
    const legacyPath = "/tmp/stave-project/.stave/workspaces/feature__existing";
    useAppStore.setState({
      ...initialState,
      projectPath: "/tmp/stave-project",
      projectName: "stave-project",
      defaultBranch: "main",
      recentProjects: [
        {
          projectPath: "/tmp/stave-project",
          projectName: "stave-project",
          lastOpenedAt: "2026-04-01T00:00:00.000Z",
          defaultBranch: "main",
          workspaces: [
            {
              id: "ws-existing",
              name: "feature/existing",
              updatedAt: "2026-04-01T00:00:00.000Z",
            },
          ],
          activeWorkspaceId: "ws-existing",
          workspaceBranchById: { "ws-existing": "feature/existing" },
          workspacePathById: { "ws-existing": legacyPath },
          workspaceDefaultById: { "ws-existing": false },
        },
      ],
      workspaces: [
        {
          id: "ws-existing",
          name: "feature/existing",
          updatedAt: "2026-04-01T00:00:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-existing",
      workspaceBranchById: { "ws-existing": "feature/existing" },
      workspacePathById: { "ws-existing": legacyPath },
      workspaceDefaultById: { "ws-existing": false },
      projectFiles: [],
    });

    // Create a new workspace with a mixed-case branch name
    const result = await useAppStore.getState().createWorkspace({
      name: "feature/NewMixedCase",
      mode: "branch",
      fromBranch: "main",
    });

    expect(result.ok).toBe(true);

    const newWorkspaceId = useAppStore
      .getState()
      .workspaces.find((ws) => ws.name === "feature/NewMixedCase")?.id;
    const newPath = newWorkspaceId
      ? useAppStore.getState().workspacePathById[newWorkspaceId]
      : undefined;
    // New path must be different from legacy path
    expect(newPath).not.toBe(legacyPath);
    // New path must be lowercase-safe (unique slug)
    expect(newPath).toBe(newPath?.toLowerCase());
    // Legacy workspace path must be unchanged
    expect(useAppStore.getState().workspacePathById["ws-existing"]).toBe(
      legacyPath,
    );

    const addCall = runCalls.find((c) =>
      c.command.startsWith("git worktree add"),
    );
    // Git branch name preserves case
    expect(addCall?.command).toContain('"feature/NewMixedCase"');
  });
});
