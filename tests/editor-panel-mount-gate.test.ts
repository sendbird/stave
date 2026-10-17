import { describe, expect, test } from "bun:test";
import {
  EDITOR_HIDDEN_UNMOUNT_DELAY_MS,
  createPanelMountGate,
  type PanelMountGateTimers,
} from "@/components/panes/surfaces/editor-panel-mount-gate";
import {
  disposeTextModelIfUnused,
  reconcileEditorModelContent,
  syncRetainedEditorModels,
} from "@/components/panes/surfaces/editor-model-retention";

function createManualTimers() {
  let now = 0;
  let nextId = 1;
  const scheduled = new Map<number, { at: number; callback: () => void }>();
  const timers: PanelMountGateTimers = {
    setTimeout: (callback, delayMs) => {
      const id = nextId++;
      scheduled.set(id, { at: now + delayMs, callback });
      return id;
    },
    clearTimeout: (handle) => {
      scheduled.delete(handle as number);
    },
  };
  const advance = (ms: number) => {
    now += ms;
    for (const [id, entry] of [...scheduled.entries()]) {
      if (entry.at <= now) {
        scheduled.delete(id);
        entry.callback();
      }
    }
  };
  return { timers, advance, pendingCount: () => scheduled.size };
}

function createGate(initiallyVisible: boolean) {
  const clock = createManualTimers();
  const changes: boolean[] = [];
  const gate = createPanelMountGate({
    initiallyVisible,
    onChange: (mounted) => changes.push(mounted),
    timers: clock.timers,
  });
  return { gate, clock, changes };
}

describe("createPanelMountGate", () => {
  test("a panel that starts hidden mounts nothing until shown, then mounts at once", () => {
    const { gate, changes } = createGate(false);
    expect(gate.isMounted()).toBe(false);
    gate.setVisible(true);
    expect(gate.isMounted()).toBe(true);
    expect(changes).toEqual([true]);
  });

  test("hiding unmounts only after the panel stays hidden for the delay", () => {
    const { gate, clock, changes } = createGate(true);
    gate.setVisible(false);
    clock.advance(EDITOR_HIDDEN_UNMOUNT_DELAY_MS - 1);
    expect(gate.isMounted()).toBe(true);
    clock.advance(1);
    expect(gate.isMounted()).toBe(false);
    expect(changes).toEqual([false]);
  });

  test("quick hide/show toggles never remount the editor", () => {
    const { gate, clock, changes } = createGate(true);
    for (let index = 0; index < 20; index += 1) {
      gate.setVisible(false);
      clock.advance(100);
      gate.setVisible(true);
      clock.advance(100);
    }
    clock.advance(EDITOR_HIDDEN_UNMOUNT_DELAY_MS * 2);
    expect(gate.isMounted()).toBe(true);
    expect(changes).toEqual([]);
    expect(clock.pendingCount()).toBe(0);
  });

  test("repeated hide events do not restart or stack the delay", () => {
    const { gate, clock, changes } = createGate(true);
    gate.setVisible(false);
    clock.advance(EDITOR_HIDDEN_UNMOUNT_DELAY_MS / 2);
    gate.setVisible(false);
    expect(clock.pendingCount()).toBe(1);
    clock.advance(EDITOR_HIDDEN_UNMOUNT_DELAY_MS / 2);
    expect(changes).toEqual([false]);
  });

  test("show after unmount remounts, and dispose cancels a pending hide", () => {
    const { gate, clock, changes } = createGate(true);
    gate.setVisible(false);
    clock.advance(EDITOR_HIDDEN_UNMOUNT_DELAY_MS);
    gate.setVisible(true);
    expect(changes).toEqual([false, true]);
    gate.setVisible(false);
    gate.dispose();
    expect(clock.pendingCount()).toBe(0);
    clock.advance(EDITOR_HIDDEN_UNMOUNT_DELAY_MS);
    gate.setVisible(true);
    expect(changes).toEqual([false, true]);
  });
});

function createFakeModel(value: string) {
  const model = {
    value,
    disposed: false,
    isDisposed: () => model.disposed,
    dispose: () => {
      model.disposed = true;
    },
    getValue: () => model.value,
    getFullModelRange: () => ({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: model.value.length + 1,
    }),
  };
  return model;
}

type FakeModel = ReturnType<typeof createFakeModel>;

function createFakeEditor(model: FakeModel | null) {
  const calls: string[] = [];
  const editor = {
    calls,
    getModel: () => model,
    setValue: (value: string) => {
      calls.push("setValue");
      if (model) model.value = value;
    },
    executeEdits: (_source: string, edits: Array<{ text: string }>) => {
      calls.push("executeEdits");
      if (model) model.value = edits[0]!.text;
      return true;
    },
    pushUndoStop: () => {
      calls.push("pushUndoStop");
      return true;
    },
  };
  return editor;
}

describe("editor model retention", () => {
  test("disposes a kept model only when no other live editor shows it", () => {
    const shared = createFakeModel("a");
    const other = createFakeEditor(shared);
    const self = createFakeEditor(shared);
    const asArgs = (model: FakeModel) =>
      model as unknown as Parameters<typeof disposeTextModelIfUnused>[0]["model"];
    expect(
      disposeTextModelIfUnused({
        model: asArgs(shared),
        liveEditors: [self, other] as never,
        exceptEditor: self as never,
      }),
    ).toBe(false);
    expect(shared.disposed).toBe(false);
    expect(
      disposeTextModelIfUnused({
        model: asArgs(shared),
        liveEditors: [self] as never,
        exceptEditor: self as never,
      }),
    ).toBe(true);
    expect(shared.disposed).toBe(true);
    // Already disposed: a second release is a no-op.
    expect(
      disposeTextModelIfUnused({ model: asArgs(shared), liveEditors: [] }),
    ).toBe(false);
  });

  test("leaves a reused model alone when it already matches the store", () => {
    const editor = createFakeEditor(createFakeModel("draft"));
    expect(
      reconcileEditorModelContent({
        editor: editor as never,
        content: "draft",
        readOnly: false,
      }),
    ).toBe(false);
    expect(editor.calls).toEqual([]);
  });

  test("applies store changes made while hidden as one undoable edit", () => {
    const model = createFakeModel("stale");
    const editor = createFakeEditor(model);
    expect(
      reconcileEditorModelContent({
        editor: editor as never,
        content: "reloaded from disk",
        readOnly: false,
      }),
    ).toBe(true);
    expect(model.value).toBe("reloaded from disk");
    expect(editor.calls).toEqual(["executeEdits", "pushUndoStop"]);
  });

  test("resets a read-only editor instead of editing it", () => {
    const model = createFakeModel("stale");
    const editor = createFakeEditor(model);
    reconcileEditorModelContent({
      editor: editor as never,
      content: "snapshot",
      readOnly: true,
    });
    expect(model.value).toBe("snapshot");
    expect(editor.calls).toEqual(["setValue"]);
  });
});

function createRetainedModel(value: string) {
  // Extend in place: the base model's methods close over that object.
  const model = Object.assign(createFakeModel(value), {
    calls: [] as string[],
    setValue: (next: string) => {
      model.calls.push("setValue");
      model.value = next;
    },
    pushEditOperations: (
      _before: unknown,
      edits: Array<{ text: string }>,
    ) => {
      model.calls.push("pushEditOperations");
      model.value = edits[0]!.text;
      return null;
    },
    pushStackElement: () => {
      model.calls.push("pushStackElement");
    },
  });
  return model;
}

type RetainedModel = ReturnType<typeof createRetainedModel>;

function syncArgs(overrides: {
  editorMounted?: boolean;
  codeModel?: RetainedModel | null;
  diffModels?: { original: RetainedModel; modified: RetainedModel } | null;
  content?: string;
  originalContent?: string;
  readOnly?: boolean;
  liveEditors?: Array<{ getModel: () => unknown }>;
}) {
  return {
    editorMounted: false,
    codeModel: null,
    diffModels: null,
    content: "reloaded from disk",
    originalContent: "",
    readOnly: false,
    liveEditors: [],
    ...overrides,
  } as unknown as Parameters<typeof syncRetainedEditorModels>[0];
}

describe("retained model sync while hidden", () => {
  test("applies a store change to the kept model while the panel is hidden", () => {
    const model = createRetainedModel("stale");
    expect(syncRetainedEditorModels(syncArgs({ codeModel: model }))).toBe(true);
    expect(model.value).toBe("reloaded from disk");
    // One undoable edit on the model's own undo stack.
    expect(model.calls).toEqual([
      "pushStackElement",
      "pushEditOperations",
      "pushStackElement",
    ]);
    // Already in sync: nothing to do.
    expect(syncRetainedEditorModels(syncArgs({ codeModel: model }))).toBe(false);
  });

  test("resets a read-only kept model and both diff sides", () => {
    const code = createRetainedModel("stale");
    syncRetainedEditorModels(
      syncArgs({ codeModel: code, content: "snapshot", readOnly: true }),
    );
    expect(code.calls).toEqual(["setValue"]);

    const original = createRetainedModel("old base");
    const modified = createRetainedModel("old working");
    expect(
      syncRetainedEditorModels(
        syncArgs({
          diffModels: { original, modified },
          content: "new working",
          originalContent: "new base",
        }),
      ),
    ).toBe(true);
    expect(original.value).toBe("new base");
    expect(original.calls).toEqual(["setValue"]);
    expect(modified.value).toBe("new working");
  });

  test("does nothing while an editor is mounted, for a disposed model, or for a model a live editor shows", () => {
    const mounted = createRetainedModel("stale");
    expect(
      syncRetainedEditorModels(
        syncArgs({ codeModel: mounted, editorMounted: true }),
      ),
    ).toBe(false);
    expect(mounted.value).toBe("stale");

    const disposed = createRetainedModel("stale");
    disposed.dispose();
    expect(syncRetainedEditorModels(syncArgs({ codeModel: disposed }))).toBe(
      false,
    );

    const shared = createRetainedModel("edited in the other tab");
    expect(
      syncRetainedEditorModels(
        syncArgs({
          codeModel: shared,
          liveEditors: [{ getModel: () => shared }],
        }),
      ),
    ).toBe(false);
    expect(shared.value).toBe("edited in the other tab");
  });
});
