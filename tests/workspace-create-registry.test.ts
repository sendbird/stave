import { afterEach, describe, expect, test } from "bun:test";
import { describeWorkspacePrCheckoutError, type WorkspacePrCheckoutArgs } from "../src/lib/workspace-pr-checkout";
import { useWorkspaceCreationStore } from "../src/store/workspace-creation-progress";

// The host finds a workspace only through the saved repository registry: an
// agent run's lead-task check refuses "The lead task was not found." while the
// registry lacks the workspace. Kickoff starts the first task as soon as
// `createWorkspace` resolves, so creation must save the registry first.

const originalWindow = globalThis.window;
type AppStore = typeof import("../src/store/app.store").useAppStore;
let appStore: AppStore | undefined;
let originalStoreState: ReturnType<AppStore["getState"]> | undefined;
let releaseHeldSave: (() => void) | undefined;
let pendingCreation: Promise<void> | undefined;

type RegistrySave = { repositories: Array<{ workspaces?: Array<{ id: string }>; workspacePathById?: Record<string, string> }> };

function install(args: { holdRegistrySave?: boolean; failRegistrySave?: boolean; toplevel?: string; worktreeList?: string; resolvedRepository?: string; copyFallback?: boolean } = {}) {
  const operations: string[] = [];
  const commands: string[] = [];
  const registrySaves: RegistrySave[] = [];
  let releaseRegistrySave: (() => void) | undefined;
  let registrySavePending = false;
  (globalThis as { window?: unknown }).window = {
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} },
    api: {
      sourceControl: {
        createWorktree: async () => null,
        ...(args.copyFallback ? { seedWorktreeDependencies: async () => ({ status: "fallback" }) } : {}),
      },
      terminal: {
        runCommand: async ({ command }: { command: string }) => {
          commands.push(command);
          if (command.startsWith("git worktree list") && args.worktreeList !== undefined) return { ok: true, code: 0, stdout: args.worktreeList, stderr: "" };
          if (command === "pwd -P" && args.resolvedRepository) return { ok: true, code: 0, stdout: `${args.resolvedRepository}\n`, stderr: "" };
          if (command.includes("--show-toplevel")) return { ok: true, code: 0, stdout: `${args.toplevel ?? ""}\n`, stderr: "" };
          if (command.includes("--abbrev-ref HEAD")) return { ok: true, code: 0, stdout: "feature/linked\n", stderr: "" };
          return { ok: true, code: 0, stdout: "", stderr: "" };
        },
      },
      persistence: {
        listWorkspaces: async () => ({ ok: true, rows: [] }),
        loadWorkspace: async () => ({ ok: true, snapshot: null }),
        loadWorkspaceShellLite: async () => ({ ok: true, shellLite: null }),
        upsertWorkspace: async () => {
          operations.push("snapshot");
          return { ok: true };
        },
        saveRepositoryRegistry: async (save: RegistrySave) => {
          registrySavePending = true;
          if (args.holdRegistrySave) await new Promise<void>((resolve) => { releaseRegistrySave = resolve; });
          if (args.failRegistrySave) return { ok: false };
          registrySaves.push(save);
          operations.push("registry");
          return { ok: true };
        },
      },
    },
  } as unknown;
  releaseHeldSave = () => releaseRegistrySave?.();
  return {
    operations,
    commands,
    registrySaves,
    isRegistrySavePending: () => registrySavePending,
    releaseRegistrySave: () => releaseRegistrySave?.(),
  };
}

/** Fails with a named reason instead of hanging until the test timeout. */
async function waitUntil(condition: () => boolean, label: string, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for " + label);
    await Bun.sleep(1);
  }
}

test("a dependency-copy fallback runs setup and clears the preparation state", async () => {
  const { commands } = install({ copyFallback: true });
  const store = await seedRepository();
  const result = await store.getState().createWorkspace({ mode: "clean", name: "fallback", initCommand: "bun install" });
  expect(result).toMatchObject({ ok: true, noticeLevel: "warning" });
  expect(result.message).toContain("Dependency copy skipped");
  expect(commands).toContain("bun install");
  expect(useWorkspaceCreationStore.getState().byId[store.getState().activeWorkspaceId]).toBeUndefined();
});

async function seedRepository() {
  const { useAppStore } = await import("../src/store/app.store");
  appStore = useAppStore;
  originalStoreState ??= useAppStore.getState();
  useAppStore.setState({
    ...useAppStore.getInitialState(),
    repositoryPath: "/tmp/stave-project",
    repositoryName: "stave-project",
    defaultBranch: "main",
    recentRepositories: [{
      repositoryPath: "/tmp/stave-project",
      repositoryName: "stave-project",
      lastOpenedAt: "2026-10-01T00:00:00.000Z",
      defaultBranch: "main",
      workspaces: [],
      activeWorkspaceId: "",
      workspaceBranchById: {},
      workspacePathById: {},
      workspaceDefaultById: {},
    }],
    workspaces: [],
    activeWorkspaceId: "",
    workspaceBranchById: {},
    workspacePathById: {},
    workspaceDefaultById: {},
    repositoryFiles: [],
  });
  return useAppStore;
}

const registryHas = (save: RegistrySave | undefined, workspaceId: string) =>
  Boolean(save?.repositories.some((repository) => repository.workspaces?.some((workspace) => workspace.id === workspaceId)));

afterEach(async () => {
  // Never leave a held save, a running creation or this file's repository
  // state to later files: release the save, let creation settle, then restore.
  releaseHeldSave?.();
  releaseHeldSave = undefined;
  await pendingCreation;
  pendingCreation = undefined;
  useWorkspaceCreationStore.setState({ byId: {} });
  if (appStore && originalStoreState) appStore.setState(originalStoreState, true);
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("a created workspace is registered before creation resolves", () => {
  test("createWorkspace waits for the registry save that lists the new workspace", async () => {
    const harness = install({ holdRegistrySave: true });
    const store = await seedRepository();
    let resolved = false;
    const creating = store.getState().createWorkspace({ name: "feature/kickoff-agent", mode: "branch", fromBranch: "main" })
      .finally(() => { resolved = true; });
    // Handled at once so an early assertion failure leaves no unhandled rejection.
    pendingCreation = creating.then(() => undefined, () => undefined);
    // Without the registry save, creation resolves first: fail on that, not on a timeout.
    await waitUntil(() => harness.isRegistrySavePending() || resolved, "the registry save or creation to finish");
    expect(harness.isRegistrySavePending()).toBe(true);
    await Bun.sleep(5);
    expect(resolved).toBe(false);
    harness.releaseRegistrySave();
    const result = await creating;
    expect(result).toMatchObject({ ok: true });
    expect(harness.operations).toEqual(["snapshot", "registry"]);
    const saved = harness.registrySaves[0];
    expect(registryHas(saved, result.workspaceId!)).toBe(true);
    const repository = saved?.repositories.find((entry) => entry.workspaces?.some((workspace) => workspace.id === result.workspaceId));
    expect(repository?.workspacePathById?.[result.workspaceId!]).toBe(store.getState().workspacePathById[result.workspaceId!]);
  });

  test("keeps the active workspace until preparation finishes", async () => {
    const harness = install();
    const store = await seedRepository();
    let release!: () => void;
    const checkout = new Promise<void>((resolve) => { release = resolve; });
    window.api.sourceControl!.createWorktree = async () => { await checkout; return null; };
    let workspaceId = "";
    let currentTaskId = "";
    const creating = store.getState().createWorkspace({
      name: "feature/staged", mode: "clean",
      initialPromptDraft: { text: "Check changes", attachedFilePaths: [], attachments: [] },
      onWorkspacePreparing: (id) => { workspaceId = id; },
      onWorkspaceReady: (id) => {
        expect(store.getState().activeWorkspaceId).toBe(id);
        currentTaskId = store.getState().activeTaskId;
      },
    });
    pendingCreation = creating.then(() => undefined, () => undefined);
    try {
      await waitUntil(() => !!workspaceId, "the pending workspace and task");
      expect(store.getState().activeWorkspaceId).toBe("");
      expect(store.getState().workspaces).toEqual([]);
      expect(useWorkspaceCreationStore.getState().byId[workspaceId]?.prompt).toBe("Check changes");
      await store.getState().flushRepositoryRegistry();
      expect(registryHas(harness.registrySaves.at(-1), workspaceId)).toBe(false);
      release();
      const result = await creating;
      expect(currentTaskId).toBeTruthy();
      expect(result).toMatchObject({ ok: true, workspaceId, taskId: currentTaskId });
      expect(store.getState().promptDraftByTask[currentTaskId]?.text).toBe("Check changes");
      expect(registryHas(harness.registrySaves.at(-1), workspaceId)).toBe(true);
    } finally {
      release();
    }
  });

  test("PR checkout runs as the worktree step and retries in the same workspace", async () => {
    const harness = install();
    const store = await seedRepository();
    const sourceControl = window.api.sourceControl!;
    const checkouts: WorkspacePrCheckoutArgs[] = [];
    const failure = { ok: false, code: "fetchFailed", detail: "connection reset" } as const;
    sourceControl.createWorktree = async () => { throw new Error("Expected PR checkout"); };
    sourceControl.seedWorktreeDependencies = async () => { throw new Error("Unexpected PR dependency copy"); };
    let workspaceId = "";
    let taskId = "";
    const readProgress = () => useWorkspaceCreationStore.getState().byId[workspaceId];
    sourceControl.checkoutWorkspacePr = async (args) => {
      checkouts.push(args);
      expect(workspaceId).toMatch(/^worktree:/);
      expect(store.getState().activeWorkspaceId).toBe("");
      expect(readProgress()).toMatchObject({
        prompt: "Review changes",
        steps: { worktree: { status: "running" }, copy: { status: "waiting" } },
      });
      if (checkouts.length === 1) return failure;
      return {
        ok: true, branch: "feature/from-pr", base: "main", fork: true,
        url: "https://github.com/example/project/pull/123", title: "Review changes",
      };
    };

    const stagesAtStartup: string[] = [];
    const result = await store.getState().createWorkspace({
      name: "", mode: "pr", prReference: "#123", fromBranch: "origin/main",
      initCommand: "bun install", useRootNodeModulesSymlink: true,
      initialPromptDraft: { text: "Review changes", attachedFilePaths: [], attachments: [] },
      onWorkspacePreparing: (id) => { workspaceId = id; },
      onWorkspaceReady: (id) => {
        expect(store.getState().activeWorkspaceId).toBe(id);
        expect(store.getState().activeTaskId).toBe(taskId);
        expect(store.getState().promptDraftByTask[taskId]?.text).toBe("Review changes");
      },
      startInitialTask: async (target) => {
        expect(target).toEqual({ workspaceId, taskId });
        const steps = readProgress()?.steps;
        stagesAtStartup.push(steps?.worktree.status ?? "", steps?.copy.status ?? "", steps?.setup.status ?? "");
        return { ok: true, startup: "started", ...target };
      },
    });
    taskId = result.taskId!;
    const message = describeWorkspacePrCheckoutError(failure);
    expect(result).toEqual({ ok: false, workspaceId, taskId, message });
    expect(checkouts).toEqual([{
      cwd: "/tmp/stave-project",
      path: expect.stringMatching(/^\/tmp\/stave-project\/\.stave\/workspaces\/pr-123--/),
      reference: "#123",
      branch: undefined,
    }]);
    expect(readProgress()?.steps.worktree).toMatchObject({ status: "failed", detail: message });
    expect(readProgress()?.steps.setup.status).toBe("waiting");
    expect(harness.operations).toEqual([]);
    expect(stagesAtStartup).toEqual([]);

    const retry = readProgress()?.steps.worktree.retry;
    expect(retry).toBeDefined();
    await retry?.();
    expect(checkouts).toEqual([checkouts[0], checkouts[0]]);
    expect(stagesAtStartup).toEqual(["complete", "skipped", "skipped"]);
    expect(readProgress()).toBeUndefined();
    expect(store.getState().workspaces).toEqual([expect.objectContaining({ id: workspaceId, name: "feature/from-pr" })]);
    expect(store.getState().workspaceBranchById[workspaceId]).toBe("feature/from-pr");
    expect(store.getState().workspaceInformation.linkedPullRequests).toEqual([
      expect.objectContaining({ url: "https://github.com/example/project/pull/123", title: "Review changes" }),
    ]);
    expect(harness.operations).toEqual(["snapshot", "registry"]);
    expect(registryHas(harness.registrySaves.at(-1), workspaceId)).toBe(true);
    expect(harness.commands).toEqual([]);
  });

  test("a failed registry save keeps the created workspace", async () => {
    install({ failRegistrySave: true });
    const store = await seedRepository();
    const originalError = console.error;
    console.error = () => {};
    try {
      const result = await store.getState().createWorkspace({ name: "feature/registry-down", mode: "branch", fromBranch: "main" });
      expect(result).toMatchObject({ ok: true });
      expect(store.getState().activeWorkspaceId).toBe(result.workspaceId!);
    } finally {
      console.error = originalError;
    }
  });

  test("importWorkspaceFromWorktree saves the registry with the linked workspace", async () => {
    const harness = install({ toplevel: "/tmp/stave-project/.stave/workspaces/feature-linked" });
    const store = await seedRepository();
    const result = await store.getState().importWorkspaceFromWorktree({ worktreePath: "/tmp/stave-project/.stave/workspaces/feature-linked" });
    expect(result).toMatchObject({ ok: true });
    const workspaceId = store.getState().activeWorkspaceId;
    expect(harness.operations).toEqual(["snapshot", "registry"]);
    expect(registryHas(harness.registrySaves[0], workspaceId)).toBe(true);
  });
});

describe("importWorkspaceFromWorktree judges a worktree against the repository's own list", () => {
  const listing = (root: string) => `worktree ${root}\nHEAD a\nbranch refs/heads/main\n\nworktree ${root}/.stave/workspaces/feature-linked\nHEAD b\nbranch refs/heads/feature/linked\n\n`;
  const linkedPaths = (store: AppStore) => store.getState().recentRepositories.find((entry) => entry.repositoryPath === "/tmp/stave-project")?.linkedWorkspacePaths ?? [];

  test("a worktree Git reports through a resolved symbolic link is this repository's own, not external", async () => {
    const harness = install({ toplevel: "/private/tmp/stave-project/.stave/workspaces/feature-linked", worktreeList: listing("/private/tmp/stave-project"), resolvedRepository: "/private/tmp/stave-project" });
    const store = await seedRepository();
    const result = await store.getState().importWorkspaceFromWorktree({ worktreePath: "/tmp/stave-project/.stave/workspaces/feature-linked" });
    expect(result).toMatchObject({ ok: true });
    const workspaceId = store.getState().activeWorkspaceId;
    expect(store.getState().workspacePathById[workspaceId]).toBe("/tmp/stave-project/.stave/workspaces/feature-linked");
    expect(linkedPaths(store)).toEqual([]);
    expect(harness.commands.some((command) => command.startsWith("ln -sfn"))).toBe(false);
  });

  test("matching paths keep the plain comparison, and an unlisted checkout stays external", async () => {
    install({ toplevel: "/tmp/stave-project/.stave/workspaces/feature-linked", worktreeList: listing("/tmp/stave-project") });
    let store = await seedRepository();
    await store.getState().importWorkspaceFromWorktree({ worktreePath: "/tmp/stave-project/.stave/workspaces/feature-linked" });
    expect(store.getState().workspacePathById[store.getState().activeWorkspaceId]).toBe("/tmp/stave-project/.stave/workspaces/feature-linked");
    expect(linkedPaths(store)).toEqual([]);

    install({ toplevel: "/elsewhere/checkout", worktreeList: listing("/tmp/stave-project") });
    store = await seedRepository();
    await store.getState().importWorkspaceFromWorktree({ worktreePath: "/elsewhere/checkout" });
    expect(store.getState().workspacePathById[store.getState().activeWorkspaceId]).toBe("/elsewhere/checkout");
    expect(linkedPaths(store)).toEqual(["/elsewhere/checkout"]);
  });

  test("a workspace saved under Git's resolved path is reused, not registered again", async () => {
    install({ toplevel: "/private/tmp/stave-project/.stave/workspaces/feature-linked", worktreeList: listing("/private/tmp/stave-project"), resolvedRepository: "/private/tmp/stave-project" });
    const store = await seedRepository();
    const saved = "/private/tmp/stave-project/.stave/workspaces/feature-linked";
    store.setState({ workspaces: [{ id: "existing", name: "feature-linked", updatedAt: "2026-10-01T00:00:00.000Z" }] as never,
      workspacePathById: { existing: saved }, workspaceBranchById: { existing: "feature/linked" } });
    const result = await store.getState().importWorkspaceFromWorktree({ worktreePath: "/tmp/stave-project/.stave/workspaces/feature-linked" });
    expect(result).toMatchObject({ ok: true });
    expect(store.getState().workspaces.map((workspace) => workspace.id)).toEqual(["existing"]);
    expect(store.getState().activeWorkspaceId).toBe("existing");
    expect(store.getState().workspacePathById).toEqual({ existing: saved });
  });

  test("the repository root reached through its resolved path is refused", async () => {
    install({ toplevel: "/private/tmp/stave-project", worktreeList: listing("/private/tmp/stave-project"), resolvedRepository: "/private/tmp/stave-project" });
    const store = await seedRepository();
    const result = await store.getState().importWorkspaceFromWorktree({ worktreePath: "/private/tmp/stave-project" });
    expect(result.ok).toBe(false);
  });
});
