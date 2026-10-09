import {
  passesTerminalTypingGuard,
  isTypingTarget,
} from "@/components/layout/app-shell.shortcuts";
import {
  matchesKeyStep,
  parseKeySequence,
  type KeyEventLike,
} from "@/lib/keybindings/key-chord";
import {
  APP_SHELL_KEYBINDING_OWNER,
  KEYBINDING_REGISTRY,
  type KeybindingEntry,
  type KeybindingId,
} from "@/lib/keybindings/keybinding-registry";

/**
 * Turns a window keydown into at most one app-level registry command.
 *
 * Entries owned by the app shell (`handledBy` names `useAppKeybindings.ts`)
 * are matched here; the `Cmd/Ctrl+K` chords keep their own resolver because
 * their second key is customizable. Matching, the typing guard, and the
 * preventDefault/stopPropagation policy below reproduce the app shell's
 * behavior from before the registry, key for key.
 */

export interface AppKeybindingEvent extends KeyEventLike {
  target: EventTarget | null;
  preventDefault(): void;
  stopPropagation(): void;
}

/** A handler returns false when it did not act, so the key press goes on. */
export type AppKeybindingHandler = (event: AppKeybindingEvent) => boolean;

export type AppKeybindingHandlers = Partial<
  Record<KeybindingId, AppKeybindingHandler>
>;

export interface AppKeybindingContext {
  /** `activeAppSurface.kind`; `workspace` entries only fire on the workspace. */
  appSurfaceKind: string;
}

type EventPolicy = "prevent" | "prevent-and-stop" | "none";

/**
 * What a handled key press does to the event. Escape-abort leaves it alone so
 * dialogs still see Escape; the rest match the handlers they replaced.
 */
const EVENT_POLICY: Partial<Record<KeybindingId, EventPolicy>> = {
  "task.abort-turn": "none",
  "help.keyboard-shortcuts": "prevent",
  "editor.save": "prevent",
  "task.next": "prevent",
  "task.previous": "prevent",
};

interface DispatchedBinding {
  entry: KeybindingEntry;
  steps: ReturnType<typeof parseKeySequence>[number][];
}

const APP_SHELL_BINDINGS: readonly DispatchedBinding[] = KEYBINDING_REGISTRY.filter(
  (entry: KeybindingEntry) =>
    entry.handledBy.includes(APP_SHELL_KEYBINDING_OWNER) &&
    entry.customization !== "app-chord",
).map((entry: KeybindingEntry) => ({
  entry,
  steps: entry.keys.map((value) => {
    const sequence = parseKeySequence(value);
    if (sequence.length !== 1) {
      throw new Error(`App shell keybinding ${entry.id} must be a single step`);
    }
    return sequence[0]!;
  }),
}));

/** Ids the app shell dispatches, for tests and the handler table. */
export const APP_SHELL_KEYBINDING_IDS: readonly KeybindingId[] =
  APP_SHELL_BINDINGS.map((binding) => binding.entry.id as KeybindingId);

function passesEditableRule(entry: KeybindingEntry, event: AppKeybindingEvent) {
  switch (entry.editable) {
    case "allow":
      return true;
    case "terminal":
      return passesTerminalTypingGuard(event);
    case "block":
      return !isTypingTarget(event.target);
    case "only":
      return isTypingTarget(event.target);
  }
}

function isScopeLive(entry: KeybindingEntry, context: AppKeybindingContext) {
  return entry.scope !== "workspace" || context.appSurfaceKind === "workspace";
}

/** The app-shell entries that may take this key press, in registry order. */
export function findAppKeybindingCandidates(
  event: AppKeybindingEvent,
  context: AppKeybindingContext,
): KeybindingEntry[] {
  return APP_SHELL_BINDINGS.filter(
    (binding) =>
      binding.steps.some((step) => matchesKeyStep(step, event)) &&
      isScopeLive(binding.entry, context) &&
      passesEditableRule(binding.entry, event),
  ).map((binding) => binding.entry);
}

/**
 * Run the first candidate whose handler acts, apply its event policy, and
 * return its id; null when no handler acted.
 */
export function dispatchAppKeybinding(args: {
  event: AppKeybindingEvent;
  context: AppKeybindingContext;
  handlers: AppKeybindingHandlers;
}): KeybindingId | null {
  for (const entry of findAppKeybindingCandidates(args.event, args.context)) {
    const id = entry.id as KeybindingId;
    const handler = args.handlers[id];
    if (!handler || !handler(args.event)) {
      continue;
    }
    const policy = EVENT_POLICY[id] ?? "prevent-and-stop";
    if (policy !== "none") {
      args.event.preventDefault();
    }
    if (policy === "prevent-and-stop") {
      args.event.stopPropagation();
    }
    return id;
  }
  return null;
}
