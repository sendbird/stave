import { describe, expect, test } from "bun:test";
import {
  assignAppShortcutKey,
  normalizeAppShortcutKeys,
} from "@/lib/app-shortcuts";
import {
  APP_SHORTCUT_CHORD_TIMEOUT_MS,
  EDITABLE_SHORTCUT_SELECTOR,
  PROMPT_INPUT_ROOT_SELECTOR,
  TASK_ABORT_SHORTCUT_SCOPE_SELECTOR,
  isEditableShortcutTarget,
  resolveShortcutChord,
  shouldAbortTaskOnEscape,
} from "../src/components/layout/app-shell.shortcuts";

type FakeTarget = EventTarget & {
  closest: (selector: string) => Element | null;
  isContentEditable?: boolean;
};

function createTarget(
  args: {
    matches?: string[];
    isContentEditable?: boolean;
  } = {},
): FakeTarget {
  const matches = new Set(args.matches ?? []);
  return {
    isContentEditable: args.isContentEditable,
    closest: (selector: string) =>
      matches.has(selector) ? ({} as Element) : null,
  } as FakeTarget;
}

describe("app shell shortcut gating", () => {
  test("treats generic inputs as editable shortcut targets", () => {
    const target = createTarget({ matches: [EDITABLE_SHORTCUT_SELECTOR] });

    expect(isEditableShortcutTarget(target)).toBe(true);
  });

  test("keeps the prompt input eligible for shell shortcuts", () => {
    const target = createTarget({
      matches: [EDITABLE_SHORTCUT_SELECTOR, PROMPT_INPUT_ROOT_SELECTOR],
    });

    expect(isEditableShortcutTarget(target)).toBe(false);
  });

  test("allows Escape abort when focus stays inside the task pane", () => {
    const taskPane = createTarget({
      matches: [TASK_ABORT_SHORTCUT_SCOPE_SELECTOR],
    });

    expect(
      shouldAbortTaskOnEscape({
        key: "Escape",
        target: taskPane,
        activeElement: taskPane,
      }),
    ).toBe(true);
  });

  test("allows Escape abort for window-level events when the active element is in the task pane", () => {
    const taskPane = createTarget({
      matches: [TASK_ABORT_SHORTCUT_SCOPE_SELECTOR],
    });

    expect(
      shouldAbortTaskOnEscape({
        key: "Escape",
        target: null,
        activeElement: taskPane,
      }),
    ).toBe(true);
  });

  test("blocks Escape abort when focus is outside the task pane", () => {
    const dialogButton = createTarget();

    expect(
      shouldAbortTaskOnEscape({
        key: "Escape",
        target: dialogButton,
        activeElement: dialogButton,
      }),
    ).toBe(false);
  });

  test("starts the zen-mode chord on Cmd/Ctrl+K", () => {
    expect(
      resolveShortcutChord({
        key: "k",
        metaKey: true,
        now: 100,
      }),
    ).toEqual({
      action: null,
      nextPendingChord: {
        type: "app-command",
        startedAt: 100,
      },
      preventDefault: true,
      stopAppHandling: true,
    });
  });

  test("toggles zen mode when Z follows the chord before timeout", () => {
    expect(
      resolveShortcutChord({
        key: "z",
        pendingChord: {
          type: "app-command",
          startedAt: 100,
        },
        now: 100 + APP_SHORTCUT_CHORD_TIMEOUT_MS - 1,
      }),
    ).toEqual({
      action: "view.toggle-zen-mode",
      nextPendingChord: null,
      preventDefault: true,
      stopAppHandling: true,
    });
  });

  test("opens home when H follows the chord before timeout", () => {
    expect(
      resolveShortcutChord({
        key: "h",
        pendingChord: {
          type: "app-command",
          startedAt: 100,
        },
        now: 150,
      }),
    ).toEqual({
      action: "navigation.home",
      nextPendingChord: null,
      preventDefault: true,
      stopAppHandling: true,
    });
  });

  test("opens Muse when M follows the chord before timeout", () => {
    expect(
      resolveShortcutChord({
        key: "m",
        pendingChord: {
          type: "app-command",
          startedAt: 100,
        },
        now: 150,
      }),
    ).toEqual({
      action: "navigation.open-stave-muse",
      nextPendingChord: null,
      preventDefault: true,
      stopAppHandling: true,
    });
  });

  test("opens scripts when S follows the chord before timeout", () => {
    expect(
      resolveShortcutChord({
        key: "s",
        pendingChord: {
          type: "app-command",
          startedAt: 100,
        },
        now: 150,
      }),
    ).toEqual({
      action: "view.show-scripts",
      nextPendingChord: null,
      preventDefault: true,
      stopAppHandling: true,
    });
  });

  test("opens lens when L follows the chord before timeout", () => {
    expect(
      resolveShortcutChord({
        key: "l",
        pendingChord: {
          type: "app-command",
          startedAt: 100,
        },
        now: 150,
      }),
    ).toEqual({
      action: "view.show-lens",
      nextPendingChord: null,
      preventDefault: true,
      stopAppHandling: true,
    });
  });

  test("keeps the chord valid when Cmd/Ctrl stays held for the second Z key", () => {
    expect(
      resolveShortcutChord({
        key: "z",
        metaKey: true,
        pendingChord: {
          type: "app-command",
          startedAt: 100,
        },
        now: 150,
      }),
    ).toEqual({
      action: "view.toggle-zen-mode",
      nextPendingChord: null,
      preventDefault: true,
      stopAppHandling: true,
    });
  });

  test("cancels expired zen-mode chords", () => {
    expect(
      resolveShortcutChord({
        key: "z",
        pendingChord: {
          type: "app-command",
          startedAt: 100,
        },
        now: 100 + APP_SHORTCUT_CHORD_TIMEOUT_MS + 1,
      }),
    ).toEqual({
      action: null,
      nextPendingChord: null,
      preventDefault: false,
      stopAppHandling: false,
    });
  });

  test("cancels the zen-mode chord on Escape without swallowing dialog handling", () => {
    expect(
      resolveShortcutChord({
        key: "Escape",
        pendingChord: {
          type: "app-command",
          startedAt: 100,
        },
        now: 150,
      }),
    ).toEqual({
      action: null,
      nextPendingChord: null,
      preventDefault: false,
      stopAppHandling: true,
    });
  });

  test("respects customized panel chord mappings", () => {
    expect(
      resolveShortcutChord({
        key: "x",
        pendingChord: {
          type: "app-command",
          startedAt: 100,
        },
        shortcutKeys: assignAppShortcutKey({
          actionId: "view.show-explorer",
          shortcutKeys: normalizeAppShortcutKeys(),
          nextKey: "x",
        }),
        now: 150,
      }),
    ).toEqual({
      action: "view.show-explorer",
      nextPendingChord: null,
      preventDefault: true,
      stopAppHandling: true,
    });
  });
});
