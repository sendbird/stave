import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { WorkspaceDirectionDraftStore } from "../electron/persistence/workspace-direction-drafts";
import { emptyResumeBriefFields } from "@/lib/workspace-resume-brief";
import {
  loadDirectionDraft,
  saveDirectionDraft,
} from "@/lib/workspace-direction-draft-client";

const draft = {
  ...emptyResumeBriefFields(),
  goal: "Preserve scope",
  updatedAt: "",
  sourceTaskId: null,
};
const originalWindow = globalThis.window;
afterEach(() => {
  (globalThis as { window: typeof window }).window = originalWindow;
});

test("draft store retains small acknowledged writes and removes drafts with the workspace", () => {
  const db = new Database(":memory:");
  db.exec(
    "CREATE TABLE workspace_meta (id TEXT PRIMARY KEY); INSERT INTO workspace_meta VALUES ('workspace')",
  );
  try {
    const store = new WorkspaceDirectionDraftStore(db);
    store.save("workspace", draft);
    expect(new WorkspaceDirectionDraftStore(db).load("workspace")).toEqual(
      draft,
    );
    expect(() => store.save("missing", draft)).toThrow("no longer exists");
    store.save("workspace", null);
    expect(store.load("workspace")).toBeNull();
    store.save("workspace", draft);
    db.exec("DELETE FROM workspace_meta");
    expect(store.load("workspace")).toBeNull();
  } finally {
    db.close();
  }
});

test("a pending edit cannot arrive after clearing a direction draft", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let persisted: typeof draft | null = null;
  const writes: Array<typeof draft | null> = [];
  (globalThis as { window: unknown }).window = {
    api: {
      persistence: {
        saveDirectionDraft: async (args: { draft: typeof draft | null }) => {
          if (args.draft) await gate;
          writes.push(args.draft);
          persisted = args.draft;
          return { ok: true };
        },
        loadDirectionDraft: async () => ({ ok: true, draft: persisted }),
      },
    },
  };
  const save = saveDirectionDraft("ordered", draft);
  const clear = saveDirectionDraft("ordered", null);
  release();
  await Promise.all([save, clear]);
  expect(writes).toEqual([draft, null]);
  expect(await loadDirectionDraft("ordered")).toBeNull();
});

test("desktop write failures reject without silently switching storage", async () => {
  let fallbackWrites = 0;
  (globalThis as { window: unknown }).window = {
    api: {
      persistence: {
        saveDirectionDraft: async () => ({ ok: false }),
      },
    },
    localStorage: {
      setItem: () => {
        ++fallbackWrites;
      },
    },
  };
  await expect(saveDirectionDraft("failed", draft)).rejects.toThrow(
    "not acknowledged",
  );
  expect(fallbackWrites).toBe(0);
});
