import { afterEach, describe, expect, test } from "bun:test";

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

function install(args: { holdRegistrySave?: boolean; failRegistrySave?: boolean; toplevel?: string } = {}) {
  const operations: string[] = [];
  const registrySaves: RegistrySave[] = [];
  let releaseRegistrySave: (() => void) | undefined;
  let registrySavePending = false;
  (globalThis as { window?: unknown }).window = {
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} },
    api: {
      terminal: {
        runCommand: async ({ command }: { command: string }) => {
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
