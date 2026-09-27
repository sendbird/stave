import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { starterPlaybook } from "./fixtures/mission-fixtures";

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

const originalWindow = (globalThis as { window?: unknown }).window;

function createMemoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

beforeEach(() => {
  (globalThis as { window?: unknown }).window = undefined;
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("saved playbooks across versions", () => {
  test("a playbook this version cannot read is kept aside and written back unchanged", async () => {
    (globalThis as { window?: unknown }).window = { localStorage: createMemoryStorage(), api: {} };
    const { useAppStore } = await import("../src/store/app.store");
    const { createAppStorePersistenceOptions } = await import("../src/store/app-store-persistence");
    const readable = starterPlaybook("request-to-pr");
    const fromNewerVersion = { ...starterPlaybook("fix-failing-checks"), version: 2 };
    const options = createAppStorePersistenceOptions();
    // What a load finds in storage, as a newer version saved it.
    const state = {
      ...useAppStore.getInitialState(),
      settings: { playbooks: [readable, fromNewerVersion] },
    } as unknown as Parameters<NonNullable<ReturnType<typeof options.onRehydrateStorage>>>[0] & {
      settings: { playbooks: Array<{ id: string }>; playbooksUnreadable: Array<{ value: unknown }> };
    };
    options.onRehydrateStorage?.(state)?.(state);

    expect(state.settings.playbooks.map((playbook) => playbook.id)).toEqual([readable.id]);
    expect(state.settings.playbooksUnreadable.map((entry) => entry.value)).toEqual([fromNewerVersion]);
    // What is written back keeps it beside the list instead of shrinking the list for good.
    const written = options.partialize(state as never) as {
      settings: { playbooks: unknown[]; playbooksUnreadable: Array<{ value: unknown }> };
    };
    expect(written.settings.playbooks).toHaveLength(1);
    expect(written.settings.playbooksUnreadable.map((entry) => entry.value)).toEqual([fromNewerVersion]);
  });
});

describe("playbook drafts", () => {
  test("unsaved edits outlive the tab that made them", async () => {
    const { usePlaybookDraftsStore } = await import("../src/store/playbook-drafts-store");
    const draft = { ...starterPlaybook("request-to-pr"), name: "Edited" };
    usePlaybookDraftsStore.getState().setDraft(draft);
    usePlaybookDraftsStore.getState().select(draft.id);
    usePlaybookDraftsStore.getState().setDraftingId(draft.id);
    // The tab unmounts and mounts again: the store still holds the edit.
    expect(usePlaybookDraftsStore.getState().drafts[draft.id]?.name).toBe("Edited");
    expect(usePlaybookDraftsStore.getState().selectedId).toBe(draft.id);
    usePlaybookDraftsStore.getState().dropDraft(draft.id);
    expect(usePlaybookDraftsStore.getState().drafts[draft.id]).toBeUndefined();
    expect(usePlaybookDraftsStore.getState().draftingId).toBeNull();
  });
});

describe("Draft with AI", () => {
  test("cancelling stops the turn and never returns the late draft", async () => {
    const aborted: string[] = [];
    let finish: (events: unknown[]) => void = () => {};
    let startedTurnId: string | undefined;
    (globalThis as { window?: unknown }).window = {
      localStorage: createMemoryStorage(),
      api: {
        provider: {
          streamTurn: (args: { turnId?: string }) => {
            startedTurnId = args.turnId;
            return new Promise<unknown[]>((resolve) => {
              finish = resolve;
            });
          },
          abortTurn: async (args: { turnId: string }) => {
            aborted.push(args.turnId);
            return { ok: true };
          },
        },
      },
    };
    const { draftPlaybookWithAi } = await import("../src/store/playbook-draft-runtime");
    const controller = new AbortController();
    const pending = draftPlaybookWithAi("Fix a bug and open a PR", { signal: controller.signal });
    await Promise.resolve();
    controller.abort();
    finish([{ type: "text", text: JSON.stringify({ name: "Late", purpose: "Too late.", stages: [{ kind: "ai", title: "Fix", instruction: "Fix it.", doneWhen: "Fixed." }] }) }]);
    const result = await pending;

    expect(result).toEqual({ ok: false, message: "Drafting was cancelled." });
    expect(startedTurnId).toBeDefined();
    expect(aborted).toEqual([startedTurnId!]);
  });

  test("an already cancelled draft starts nothing", async () => {
    let started = false;
    (globalThis as { window?: unknown }).window = {
      localStorage: createMemoryStorage(),
      api: { provider: { streamTurn: () => ((started = true), []) } },
    };
    const { draftPlaybookWithAi } = await import("../src/store/playbook-draft-runtime");
    const controller = new AbortController();
    controller.abort();
    expect(await draftPlaybookWithAi("Anything", { signal: controller.signal })).toMatchObject({ ok: false });
    expect(started).toBe(false);
  });
});
