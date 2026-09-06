import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { DelegationDraftStore } from "../electron/persistence/delegation-drafts";
import {
  createEmptyDelegationDraft,
  editDelegationDraft,
  prepareDelegationDraftRequest,
  type DelegationDraft,
  type DelegationDraftScope,
} from "@/lib/collaboration/delegation-draft";
import {
  clearAcceptedDelegationDraft,
  loadDelegationDraft,
  saveDelegationDraft,
  subscribeToAcceptedDelegationClear,
} from "@/lib/collaboration/delegation-draft-client";

const scope: DelegationDraftScope = {
  projectPath: "/tmp/project",
  workspaceId: "workspace",
  taskId: "task",
};
const edited = editDelegationDraft(createEmptyDelegationDraft(), {
  prompt: "Review the persistence boundary.",
  providerId: "claude-code",
  model: "chosen-model",
  permissionProfile: "manual",
  keepOpen: false,
  isolated: false,
});

const originalWindow = globalThis.window;
afterEach(() => {
  (globalThis as { window: typeof window }).window = originalWindow;
});

test("unchanged uncertain retries reuse the exact request and edits create a new identity", () => {
  let sequence = 0;
  const first = prepareDelegationDraftRequest({
    scope,
    draft: edited,
    createDelegationKey: () => `request-${++sequence}`,
  });
  expect(first.ok).toBe(true);
  if (!first.ok) throw new Error(first.message);
  const retry = prepareDelegationDraftRequest({
    scope,
    draft: first.draft,
    createDelegationKey: () => `request-${++sequence}`,
  });
  expect(retry.ok).toBe(true);
  if (!retry.ok) throw new Error(retry.message);
  expect(retry.request).toEqual(first.request);
  expect(sequence).toBe(1);

  const changed = editDelegationDraft(first.draft, {
    prompt: `${first.draft.prompt} Add a focused regression.`,
  });
  expect(changed.pendingRequest).toBeUndefined();
  const next = prepareDelegationDraftRequest({
    scope,
    draft: changed,
    createDelegationKey: () => `request-${++sequence}`,
  });
  expect(next.ok).toBe(true);
  if (!next.ok) throw new Error(next.message);
  expect(next.request.delegationKey).toBe("request-2");
  expect(next.request).toMatchObject({
    projectPath: scope.projectPath,
    parentWorkspaceId: scope.workspaceId,
    parentTaskId: scope.taskId,
    providerId: "claude-code",
    model: "chosen-model",
    permissionProfile: "manual",
    lifecycle: "one-turn",
    workspace: { mode: "same-workspace" },
  });
});

test("draft store keeps exact owners and compare-clears only the accepted revision", () => {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE workspace_meta (id TEXT PRIMARY KEY);
    CREATE TABLE tasks (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL);
    INSERT INTO workspace_meta VALUES ('workspace');
    INSERT INTO tasks VALUES ('task', 'workspace')`);
  try {
    const store = new DelegationDraftStore(db);
    const first = prepareDelegationDraftRequest({
      scope,
      draft: edited,
      createDelegationKey: () => "request-one",
    });
    if (!first.ok) throw new Error(first.message);
    store.save(scope, first.draft);
    expect(new DelegationDraftStore(db).load(scope)).toEqual(first.draft);
    expect(
      store.load({ ...scope, projectPath: "/tmp/another-project" }),
    ).toBeNull();
    expect(() =>
      store.save({ ...scope, taskId: "another-task" }, edited),
    ).toThrow("does not belong");
    expect(store.clearAccepted(scope, "different-request")).toBe(false);
    expect(store.load(scope)).toEqual(first.draft);

    const newer = editDelegationDraft(first.draft, {
      prompt: "A deliberately revised assignment.",
    });
    store.save(scope, newer);
    expect(store.clearAccepted(scope, "request-one")).toBe(false);
    expect(store.load(scope)).toEqual(newer);

    const second = prepareDelegationDraftRequest({
      scope,
      draft: newer,
      createDelegationKey: () => "request-two",
    });
    if (!second.ok) throw new Error(second.message);
    store.save(scope, second.draft);
    expect(store.clearAccepted(scope, "request-two")).toBe(true);
    expect(store.load(scope)).toBeNull();

    store.save(scope, second.draft);
    db.exec("DELETE FROM workspace_meta WHERE id = 'workspace'");
    expect(store.load(scope)).toBeNull();
  } finally {
    db.close();
  }
});

test("client orders writes and an accepted clear cannot remove a newer edit", async () => {
  let persisted: DelegationDraft | null = null;
  const first = prepareDelegationDraftRequest({
    scope,
    draft: edited,
    createDelegationKey: () => "request-one",
  });
  if (!first.ok) throw new Error(first.message);
  const writes: string[] = [];
  (globalThis as { window: unknown }).window = {
    api: {
      persistence: {
        saveDelegationDraft: async (args: {
          draft: DelegationDraft | null;
        }) => {
          writes.push(args.draft?.prompt ?? "clear");
          persisted = args.draft;
          return { ok: true };
        },
        loadDelegationDraft: async () => ({ ok: true, draft: persisted }),
        clearAcceptedDelegationDraft: async (args: {
          delegationKey: string;
        }) => {
          const cleared =
            persisted?.pendingRequest?.delegationKey === args.delegationKey;
          if (cleared) persisted = null;
          return { ok: true, cleared };
        },
      },
    },
  };
  await saveDelegationDraft(scope, first.draft);
  const clearedKeys: string[] = [];
  const unsubscribe = subscribeToAcceptedDelegationClear(scope, (key) =>
    clearedKeys.push(key),
  );
  const newer = editDelegationDraft(first.draft, {
    prompt: "A newer local revision.",
  });
  const saveNewer = saveDelegationDraft(scope, newer);
  const clearOld = clearAcceptedDelegationDraft(scope, "request-one");
  await expect(clearOld).resolves.toBe(false);
  await saveNewer;
  expect(await loadDelegationDraft(scope)).toEqual(newer);
  expect(writes).toEqual([edited.prompt, newer.prompt]);
  expect(clearedKeys).toEqual([]);
  const next = prepareDelegationDraftRequest({
    scope,
    draft: newer,
    createDelegationKey: () => "request-two",
  });
  if (!next.ok) throw new Error(next.message);
  await saveDelegationDraft(scope, next.draft);
  await expect(
    clearAcceptedDelegationDraft(scope, "request-two"),
  ).resolves.toBe(true);
  expect(clearedKeys).toEqual(["request-two"]);
  unsubscribe();
});

test("desktop draft failures do not fall back to browser storage", async () => {
  let fallbackWrites = 0;
  (globalThis as { window: unknown }).window = {
    api: {
      persistence: {
        saveDelegationDraft: async () => ({ ok: false }),
      },
    },
    localStorage: {
      setItem: () => {
        fallbackWrites += 1;
      },
    },
  };
  await expect(saveDelegationDraft(scope, edited)).rejects.toThrow(
    "not acknowledged",
  );
  expect(fallbackWrites).toBe(0);
});
