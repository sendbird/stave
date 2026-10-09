import { afterEach, describe, expect, test } from "bun:test";
import {
  APP_SHELL_KEYBINDING_IDS,
  dispatchAppKeybinding,
  findAppKeybindingCandidates,
  type AppKeybindingEvent,
  type AppKeybindingHandlers,
} from "../src/components/layout/app-keybinding-dispatch";
import {
  EDITABLE_SHORTCUT_SELECTOR,
  PROMPT_INPUT_ROOT_SELECTOR,
  TERMINAL_SURFACE_SELECTOR,
} from "../src/components/layout/app-shell.shortcuts";
import {
  clearPendingUndos,
  hasPendingUndo,
  registerPendingUndo,
  runPendingUndo,
} from "@/lib/notifications/pending-undo";

function target(args: { matches?: string[]; isContentEditable?: boolean } = {}) {
  const matches = new Set(args.matches ?? []);
  return {
    isContentEditable: args.isContentEditable,
    closest: (selector: string) => (matches.has(selector) ? ({} as Element) : null),
  } as unknown as EventTarget;
}

const INPUT = target({ matches: [EDITABLE_SHORTCUT_SELECTOR] });
const COMPOSER = target({ isContentEditable: true, matches: [PROMPT_INPUT_ROOT_SELECTOR] });
const TERMINAL = target({ matches: [EDITABLE_SHORTCUT_SELECTOR, TERMINAL_SURFACE_SELECTOR] });
const BODY = target();

function keyEvent(
  init: Partial<Omit<AppKeybindingEvent, "preventDefault" | "stopPropagation">> & { key: string },
) {
  const calls = { prevented: false, stopped: false };
  const event: AppKeybindingEvent = {
    target: BODY,
    ...init,
    preventDefault: () => {
      calls.prevented = true;
    },
    stopPropagation: () => {
      calls.stopped = true;
    },
  };
  return { event, calls };
}

function candidates(
  init: Parameters<typeof keyEvent>[0],
  appSurfaceKind = "workspace",
) {
  return findAppKeybindingCandidates(keyEvent(init).event, { appSurfaceKind }).map(
    (entry) => entry.id,
  );
}

const ALL_HANDLED: AppKeybindingHandlers = Object.fromEntries(
  APP_SHELL_KEYBINDING_IDS.map((id) => [id, () => true]),
);

afterEach(() => clearPendingUndos());

describe("app shell dispatch keeps the old key behavior", () => {
  test("loose modifiers stay loose where the old handler ignored them", () => {
    expect(candidates({ key: "N", metaKey: true, shiftKey: true })).toEqual(["task.new"]);
    expect(candidates({ key: "s", ctrlKey: true, altKey: true })).toEqual(["editor.save"]);
    expect(candidates({ key: "ArrowDown", metaKey: true, shiftKey: true })).toEqual(["task.next"]);
    expect(candidates({ key: "K", metaKey: true, shiftKey: true })).toEqual(["task.previous"]);
  });

  test("presets need Ctrl itself, not Cmd", () => {
    expect(candidates({ key: "1", code: "Digit1", ctrlKey: true })).toEqual(["presets.run-slot"]);
    expect(candidates({ key: "1", code: "Digit1", metaKey: true })).toEqual([]);
  });

  test("launchers fire while typing; pane commands do not", () => {
    expect(candidates({ key: "P", metaKey: true, shiftKey: true, target: INPUT })).toEqual([
      "command-palette.open",
    ]);
    expect(candidates({ key: ",", metaKey: true, target: INPUT })).toEqual(["settings.open"]);
    expect(candidates({ key: "\\", code: "Backslash", metaKey: true, target: INPUT })).toEqual([]);
    expect(candidates({ key: "n", metaKey: true, target: INPUT })).toEqual([]);
  });

  test("the terminal keeps Cmd keys for the app and Ctrl keys for the shell", () => {
    expect(candidates({ key: "n", metaKey: true, target: TERMINAL })).toEqual(["task.new"]);
    expect(candidates({ key: "n", ctrlKey: true, target: TERMINAL })).toEqual([]);
  });

  test("Escape abort leaves the event untouched", () => {
    const { event, calls } = keyEvent({ key: "Escape" });
    expect(
      dispatchAppKeybinding({
        event,
        context: { appSurfaceKind: "workspace" },
        handlers: { "task.abort-turn": () => true },
      }),
    ).toBe("task.abort-turn");
    expect(calls).toEqual({ prevented: false, stopped: false });
  });

  test("a handler that does not act lets the key through", () => {
    const { event, calls } = keyEvent({ key: "p", metaKey: true });
    expect(
      dispatchAppKeybinding({
        event,
        context: { appSurfaceKind: "workspace" },
        handlers: { "file.quick-open": () => false },
      }),
    ).toBeNull();
    expect(calls.prevented).toBe(false);
  });

  test("save prevents the default without stopping propagation", () => {
    const { event, calls } = keyEvent({ key: "s", metaKey: true });
    dispatchAppKeybinding({ event, context: { appSurfaceKind: "workspace" }, handlers: ALL_HANDLED });
    expect(calls).toEqual({ prevented: true, stopped: false });
  });

  test("Cmd/Ctrl+K never reaches the single-key table", () => {
    expect(candidates({ key: "k", metaKey: true })).toEqual([]);
  });
});

describe("new shortcuts", () => {
  test("reopen, back and forward only run on the workspace surface", () => {
    expect(candidates({ key: "T", metaKey: true, shiftKey: true })).toEqual(["tabs.reopen-closed"]);
    expect(candidates({ key: "T", metaKey: true, shiftKey: true }, "fleet-view")).toEqual([]);
    expect(candidates({ key: "[", code: "BracketLeft", metaKey: true })).toEqual(["navigation.back"]);
    expect(candidates({ key: "]", code: "BracketRight", ctrlKey: true })).toEqual(["navigation.forward"]);
    expect(candidates({ key: "[", code: "BracketLeft", metaKey: true }, "issues")).toEqual([]);
  });

  test("back and forward never fire from an editable field", () => {
    for (const focus of [INPUT, COMPOSER, TERMINAL]) {
      expect(candidates({ key: "[", code: "BracketLeft", metaKey: true, target: focus })).toEqual([]);
    }
  });
});

describe("Cmd/Ctrl+Z undo", () => {
  function pressUndo(focus: EventTarget) {
    const { event, calls } = keyEvent({ key: "z", metaKey: true, target: focus });
    const handled = dispatchAppKeybinding({
      event,
      context: { appSurfaceKind: "fleet-view" },
      handlers: { "work-queue.undo": () => runPendingUndo() },
    });
    return { handled, calls };
  }

  test("does nothing when no undo is pending", () => {
    const { handled, calls } = pressUndo(BODY);
    expect(handled).toBeNull();
    expect(calls.prevented).toBe(false);
  });

  test("runs the newest pending undo outside editable fields", () => {
    const ran: string[] = [];
    registerPendingUndo({ id: "first", run: () => ran.push("first") });
    registerPendingUndo({ id: "second", run: () => ran.push("second") });
    const { handled, calls } = pressUndo(BODY);
    expect(handled).toBe("work-queue.undo");
    expect(calls).toEqual({ prevented: true, stopped: true });
    expect(ran).toEqual(["second"]);
    expect(hasPendingUndo()).toBe(true);
  });

  test("never takes undo from the editor, composer, inputs or the terminal", () => {
    const ran: string[] = [];
    registerPendingUndo({ id: "pending", run: () => ran.push("pending") });
    for (const focus of [INPUT, COMPOSER, TERMINAL]) {
      const { handled, calls } = pressUndo(focus);
      expect(handled).toBeNull();
      expect(calls.prevented).toBe(false);
    }
    expect(ran).toEqual([]);
  });

  test("redo and other modifiers are left alone", () => {
    registerPendingUndo({ id: "pending", run: () => undefined });
    expect(candidates({ key: "Z", metaKey: true, shiftKey: true })).toEqual([]);
    expect(candidates({ key: "z", metaKey: true, altKey: true })).toEqual([]);
  });
});
