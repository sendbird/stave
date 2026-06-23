import {
  APP_SHORTCUT_PREFIX_KEY,
  resolveAppShortcutAction,
  type AppShortcutCommandId,
  type AppShortcutKeys,
} from "@/lib/app-shortcuts";

export const EDITABLE_SHORTCUT_SELECTOR =
  "input, textarea, select, [role='textbox'], [contenteditable='true']";
export const PROMPT_INPUT_ROOT_SELECTOR = "[data-prompt-input-root]";
export const TERMINAL_SURFACE_SELECTOR = "[data-terminal-surface]";
export const TASK_ABORT_SHORTCUT_SCOPE_SELECTOR = "[data-task-abort-scope]";
export const APP_SHORTCUT_CHORD_TIMEOUT_MS = 2000;

export interface PendingShortcutChord {
  type: "app-command";
  startedAt: number;
}

export interface ShortcutChordResolution {
  action: AppShortcutCommandId | null;
  nextPendingChord: PendingShortcutChord | null;
  preventDefault: boolean;
  stopAppHandling: boolean;
}

type ClosestCapableTarget = EventTarget & {
  closest?: (selector: string) => Element | null;
  isContentEditable?: boolean;
};

function matchesClosest(
  target: EventTarget | null | undefined,
  selector: string,
) {
  const candidate = target as ClosestCapableTarget | null | undefined;
  return (
    typeof candidate?.closest === "function" &&
    Boolean(candidate.closest(selector))
  );
}

function isModifierKey(key: string) {
  return (
    key === "meta" || key === "control" || key === "shift" || key === "alt"
  );
}

function isPendingChordExpired(args: {
  pendingChord: PendingShortcutChord;
  now: number;
}) {
  return args.now - args.pendingChord.startedAt > APP_SHORTCUT_CHORD_TIMEOUT_MS;
}

export function isTerminalSurfaceTarget(target: EventTarget | null) {
  return matchesClosest(target, TERMINAL_SURFACE_SELECTOR);
}

export function isEditableShortcutTarget(target: EventTarget | null) {
  const candidate = target as ClosestCapableTarget | null;
  if (!candidate) {
    return false;
  }

  return Boolean(
    candidate.isContentEditable ||
    (matchesClosest(target, EDITABLE_SHORTCUT_SELECTOR) &&
      !matchesClosest(target, PROMPT_INPUT_ROOT_SELECTOR)),
  );
}

export function resolveShortcutChord(args: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  pendingChord?: PendingShortcutChord | null;
  shortcutKeys?: AppShortcutKeys | null;
  now?: number;
}): ShortcutChordResolution {
  const now = args.now ?? Date.now();
  const normalizedKey = args.key.toLowerCase();
  const hasMod = Boolean(args.ctrlKey || args.metaKey);
  const pendingChord =
    args.pendingChord &&
    !isPendingChordExpired({ pendingChord: args.pendingChord, now })
      ? args.pendingChord
      : null;

  if (
    hasMod &&
    !args.altKey &&
    !args.shiftKey &&
    normalizedKey === APP_SHORTCUT_PREFIX_KEY
  ) {
    return {
      action: null,
      nextPendingChord: { type: "app-command", startedAt: now },
      preventDefault: true,
      stopAppHandling: true,
    };
  }

  if (!pendingChord) {
    return {
      action: null,
      nextPendingChord: null,
      preventDefault: false,
      stopAppHandling: false,
    };
  }

  if (isModifierKey(normalizedKey)) {
    return {
      action: null,
      nextPendingChord: pendingChord,
      preventDefault: false,
      stopAppHandling: false,
    };
  }

  const action =
    !args.altKey && !args.shiftKey
      ? resolveAppShortcutAction({
          key: normalizedKey,
          shortcutKeys: args.shortcutKeys,
        })
      : null;

  if (action) {
    return {
      action,
      nextPendingChord: null,
      preventDefault: true,
      stopAppHandling: true,
    };
  }

  if (normalizedKey === "escape") {
    return {
      action: null,
      nextPendingChord: null,
      preventDefault: false,
      stopAppHandling: true,
    };
  }

  return {
    action: null,
    nextPendingChord: null,
    preventDefault: false,
    stopAppHandling: false,
  };
}

export function shouldAbortTaskOnEscape(args: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  target: EventTarget | null;
  activeElement: EventTarget | null;
}) {
  if (args.key !== "Escape" || args.ctrlKey || args.metaKey || args.shiftKey) {
    return false;
  }

  if (isEditableShortcutTarget(args.target)) {
    return false;
  }

  return (
    matchesClosest(args.target, TASK_ABORT_SHORTCUT_SCOPE_SELECTOR) ||
    matchesClosest(args.activeElement, TASK_ABORT_SHORTCUT_SCOPE_SELECTOR)
  );
}
