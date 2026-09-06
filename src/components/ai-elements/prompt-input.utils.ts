import type { CommandPaletteItem } from "@/lib/commands";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { ChatMessage } from "@/types/chat";

export const NO_COMMAND_SELECTION = -1;
export const NO_PROMPT_HISTORY_SELECTION = -1;
/*
 * Enhancement reveal motion.
 *
 * The enhance request is *not* streamed: `provider:enhance-prompt` resolves
 * with one finished string. Replaying it as a character-by-character
 * typewriter was therefore pure theatre, and it answered the wrong question -
 * the user can already see that the draft changed, what they cannot see is
 * *what* changed. The reveal instead word-diffs the rewrite against the draft
 * it replaced: untouched words are simply there, and only new or rewritten
 * words materialise, carrying a short accent afterglow that marks them as the
 * edit before it fades.
 */
const PROMPT_ENHANCEMENT_REVEAL_STAGGER_BUDGET_MS = 520;
const PROMPT_ENHANCEMENT_REVEAL_MIN_STEP_MS = 3;
const PROMPT_ENHANCEMENT_REVEAL_MAX_STEP_MS = 28;
// Must stay in sync with `animate-prompt-diff-word` in `src/globals.css`: the
// reveal is considered finished once the last word's afterglow has faded, and
// the composer stays locked until then.
const PROMPT_ENHANCEMENT_REVEAL_AFTERGLOW_MS = 900;
const PROMPT_ENHANCEMENT_REVEAL_MIN_DURATION_MS = 700;
// A word diff is O(n*m); a runaway draft falls back to "everything changed"
// rather than blocking the frame that starts the animation.
const PROMPT_ENHANCEMENT_DIFF_TOKEN_LIMIT = 400;

export type PromptEnhancementRevealSegment = {
  text: string;
  /** Whether this run is new or rewritten relative to the previous draft. */
  changed: boolean;
  /** Stagger position; `-1` for untouched text, which is never animated. */
  order: number;
};

/**
 * Splits text into words and the whitespace between them, losslessly:
 * joining every token reproduces the input exactly, so the reveal can render
 * the enhanced prompt verbatim (indentation, blank lines and all).
 */
function tokenizePromptText(text: string) {
  return text.match(/\s+|\S+/gu) ?? [];
}

function isWhitespaceToken(token: string) {
  return /^\s+$/u.test(token);
}

/**
 * Marks which of `next`'s tokens are absent from `previous`, using an LCS so a
 * word that merely moved with the surrounding sentence is not reported as new.
 */
function getChangedTokenFlags(previous: string[], next: string[]) {
  const changed = new Array<boolean>(next.length).fill(true);

  let prefix = 0;
  while (
    prefix < previous.length &&
    prefix < next.length &&
    previous[prefix] === next[prefix]
  ) {
    changed[prefix] = false;
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < previous.length - prefix &&
    suffix < next.length - prefix &&
    previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    changed[next.length - 1 - suffix] = false;
    suffix += 1;
  }

  const previousMiddle = previous.slice(prefix, previous.length - suffix);
  const nextMiddle = next.slice(prefix, next.length - suffix);
  if (
    previousMiddle.length === 0 ||
    nextMiddle.length === 0 ||
    previousMiddle.length > PROMPT_ENHANCEMENT_DIFF_TOKEN_LIMIT ||
    nextMiddle.length > PROMPT_ENHANCEMENT_DIFF_TOKEN_LIMIT
  ) {
    return changed;
  }

  const columns = nextMiddle.length + 1;
  const lengths = new Int32Array((previousMiddle.length + 1) * columns);
  const lengthAt = (row: number, column: number) =>
    lengths[row * columns + column] ?? 0;
  for (let row = previousMiddle.length - 1; row >= 0; row -= 1) {
    for (let column = nextMiddle.length - 1; column >= 0; column -= 1) {
      lengths[row * columns + column] =
        previousMiddle[row] === nextMiddle[column]
          ? lengthAt(row + 1, column + 1) + 1
          : Math.max(lengthAt(row + 1, column), lengthAt(row, column + 1));
    }
  }

  let row = 0;
  let column = 0;
  while (row < previousMiddle.length && column < nextMiddle.length) {
    if (previousMiddle[row] === nextMiddle[column]) {
      changed[prefix + column] = false;
      row += 1;
      column += 1;
      continue;
    }
    if (lengthAt(row + 1, column) >= lengthAt(row, column + 1)) {
      row += 1;
      continue;
    }
    column += 1;
  }

  return changed;
}

/**
 * Builds the runs the reveal renders: one segment per untouched stretch, and
 * one per changed word so each can fade in on its own beat.
 *
 * Whitespace never carries the highlight on its own - a gap between an
 * untouched word and a new one would otherwise render as a stray coloured bar,
 * and a highlighted line break as an empty band across the composer.
 */
export function getPromptEnhancementRevealSegments(args: {
  previous: string;
  next: string;
}): PromptEnhancementRevealSegment[] {
  if (!args.next) {
    return [];
  }

  const previousTokens = tokenizePromptText(args.previous);
  const nextTokens = tokenizePromptText(args.next);
  const changed = getChangedTokenFlags(previousTokens, nextTokens);

  for (let index = 0; index < nextTokens.length; index += 1) {
    const token = nextTokens[index] ?? "";
    if (!isWhitespaceToken(token)) {
      continue;
    }
    changed[index] =
      !token.includes("\n") &&
      (changed[index - 1] ?? false) &&
      (changed[index + 1] ?? false);
  }

  const segments: PromptEnhancementRevealSegment[] = [];
  let pendingUnchanged = "";
  let pendingChanged = "";
  let order = 0;

  const flushUnchanged = () => {
    if (!pendingUnchanged) {
      return;
    }
    segments.push({ text: pendingUnchanged, changed: false, order: -1 });
    pendingUnchanged = "";
  };
  const flushChanged = () => {
    if (!pendingChanged) {
      return;
    }
    segments.push({ text: pendingChanged, changed: true, order });
    pendingChanged = "";
    order += 1;
  };

  for (let index = 0; index < nextTokens.length; index += 1) {
    const token = nextTokens[index] ?? "";
    if (!changed[index]) {
      flushChanged();
      pendingUnchanged += token;
      continue;
    }
    flushUnchanged();
    pendingChanged += token;
    // One segment per word, so the stagger is paced by words rather than by
    // the whitespace that happens to precede them.
    if (!isWhitespaceToken(token)) {
      flushChanged();
    }
  }
  flushChanged();
  flushUnchanged();

  return segments;
}

/**
 * Paces the reveal: a handful of new words get a visible beat between them, a
 * wholesale rewrite compresses the stagger instead of making the user wait.
 */
export function getPromptEnhancementRevealTimings(changedSegmentCount: number) {
  if (changedSegmentCount <= 0) {
    return {
      stepMs: 0,
      durationMs: PROMPT_ENHANCEMENT_REVEAL_MIN_DURATION_MS,
    };
  }

  const stepMs = Math.min(
    PROMPT_ENHANCEMENT_REVEAL_MAX_STEP_MS,
    Math.max(
      PROMPT_ENHANCEMENT_REVEAL_MIN_STEP_MS,
      Math.floor(
        PROMPT_ENHANCEMENT_REVEAL_STAGGER_BUDGET_MS / changedSegmentCount,
      ),
    ),
  );
  const durationMs = Math.max(
    PROMPT_ENHANCEMENT_REVEAL_MIN_DURATION_MS,
    stepMs * (changedSegmentCount - 1) + PROMPT_ENHANCEMENT_REVEAL_AFTERGLOW_MS,
  );

  return { stepMs, durationMs };
}

/**
 * Detects the stray character a claimed keyboard chord leaves in the composer.
 *
 * `preventDefault()` on `keydown` is not enough on its own: macOS composes
 * Option chords (Alt+1 -> the model shortcut) through the input method, and the
 * resulting `beforeinput` / composition insertion is not always cancelable. The
 * composer therefore arms a short-lived guard when it claims a chord and drops
 * the next editor change if it is exactly one extra printable character - the
 * signature of that echo - instead of letting it reach the draft.
 *
 * Only a single non-whitespace character insertion qualifies, so real typing
 * (which almost always continues past one character, and pastes, and newlines)
 * is never mistaken for an echo.
 */
export function isShortcutEchoInsertion(args: {
  previous: string;
  next: string;
}) {
  const previous = Array.from(args.previous);
  const next = Array.from(args.next);
  if (next.length !== previous.length + 1) {
    return false;
  }

  let index = 0;
  while (index < previous.length && previous[index] === next[index]) {
    index += 1;
  }

  const inserted = next[index];
  if (!inserted || /\s/u.test(inserted)) {
    return false;
  }

  return previous.slice(index).join("") === next.slice(index + 1).join("");
}

export function getNextCommandSelectionIndex(args: {
  currentIndex: number;
  itemCount: number;
  direction: "next" | "previous";
}) {
  const { currentIndex, itemCount, direction } = args;
  if (itemCount <= 0) {
    return NO_COMMAND_SELECTION;
  }
  if (currentIndex === NO_COMMAND_SELECTION) {
    return direction === "next" ? 0 : itemCount - 1;
  }
  if (direction === "next") {
    return (currentIndex + 1) % itemCount;
  }
  return (currentIndex - 1 + itemCount) % itemCount;
}

export function getAcceptedCommandPaletteItem(args: {
  items: readonly CommandPaletteItem[];
  selectedIndex: number;
  triggerKey: "Enter" | "Tab";
}) {
  return getAcceptedPaletteItem(args);
}

export function getAcceptedPaletteItem<T>(args: {
  items: readonly T[];
  selectedIndex: number;
  triggerKey: "Enter" | "Tab";
}) {
  const { items, selectedIndex } = args;
  if (items.length === 0) {
    return null;
  }
  return items[selectedIndex] ?? items[0] ?? null;
}

export function isPromptHistoryBoundaryReached(args: {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  direction: "previous" | "next";
}) {
  if (args.selectionStart !== args.selectionEnd) {
    return false;
  }
  if (args.direction === "previous") {
    return !args.value.slice(0, args.selectionStart).includes("\n");
  }
  return !args.value.slice(args.selectionEnd).includes("\n");
}

export function navigatePromptHistory(args: {
  entries: readonly string[];
  selectedIndex: number;
  direction: "previous" | "next";
  draftBeforeHistory: string;
  currentValue: string;
}) {
  const {
    entries,
    selectedIndex,
    direction,
    draftBeforeHistory,
    currentValue,
  } = args;
  if (entries.length === 0) {
    return null;
  }

  if (direction === "previous") {
    if (selectedIndex === NO_PROMPT_HISTORY_SELECTION) {
      const nextIndex = entries.length - 1;
      return {
        selectedIndex: nextIndex,
        value: entries[nextIndex] ?? currentValue,
        draftBeforeHistory: currentValue,
      };
    }
    if (selectedIndex <= 0) {
      return null;
    }
    const nextIndex = selectedIndex - 1;
    return {
      selectedIndex: nextIndex,
      value: entries[nextIndex] ?? currentValue,
      draftBeforeHistory,
    };
  }

  if (selectedIndex === NO_PROMPT_HISTORY_SELECTION) {
    return null;
  }
  if (selectedIndex >= entries.length - 1) {
    return {
      selectedIndex: NO_PROMPT_HISTORY_SELECTION,
      value: draftBeforeHistory,
      draftBeforeHistory: "",
    };
  }
  const nextIndex = selectedIndex + 1;
  return {
    selectedIndex: nextIndex,
    value: entries[nextIndex] ?? currentValue,
    draftBeforeHistory,
  };
}

export type ConversationContextUsageTone = "ok" | "warn" | "critical";

export interface ConversationContextUsage {
  usedPercent: number;
  usedTokens?: number;
  windowTokens?: number;
  remainingTokens?: number;
  messageId: string;
}

const CONTEXT_WARN_PERCENT = 60;
const CONTEXT_CRITICAL_PERCENT = 85;

export function conversationContextUsageTone(
  usedPercent: number,
): ConversationContextUsageTone {
  if (usedPercent < CONTEXT_WARN_PERCENT) {
    return "ok";
  }
  if (usedPercent < CONTEXT_CRITICAL_PERCENT) {
    return "warn";
  }
  return "critical";
}

export function formatConversationContextPercent(usedPercent: number): string {
  return `${usedPercent < 10 ? usedPercent.toFixed(1) : Math.round(usedPercent)}%`;
}

/**
 * Latest reported conversation-window fill. Walks newest-first and stops at
 * the first usage that names a window or a used percent. Counts are a
 * snapshot, not a sum across turns.
 */
export function resolveLatestConversationContextUsage(
  messages: readonly ChatMessage[],
  providerId?: ProviderId,
): ConversationContextUsage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (providerId && message?.providerId !== providerId) continue;
    const usage = message?.usage;
    // A completed compact invalidates older snapshots. Wait for this provider
    // to report a new one instead of showing its pre-compaction fill forever.
    const compacted = message?.parts.some((part) =>
      part.type === "system_event" &&
      (part.compactBoundary?.trigger === "manual" || part.compactBoundary?.trigger === "auto"),
    );
    if (!usage) {
      if (compacted) return null;
      continue;
    }
    const used = usage.contextUsedTokens;
    const window = usage.contextWindowTokens;
    const percent = usage.contextUsedPercent;
    if (used === undefined && window === undefined && percent === undefined) {
      if (compacted) return null;
      continue;
    }
    if (used !== undefined && window !== undefined && window > 0) {
      return {
        usedPercent: percent ?? Math.min(100, (used / window) * 100),
        usedTokens: used,
        windowTokens: window,
        remainingTokens: Math.max(0, window - used),
        messageId: message.id,
      };
    }
    if (percent !== undefined) {
      return {
        usedPercent: percent,
        messageId: message.id,
      };
    }
  }
  return null;
}

export function formatConversationContextCounts(
  usage: ConversationContextUsage,
): string | null {
  if (usage.usedTokens === undefined || usage.windowTokens === undefined) {
    return null;
  }
  return `${usage.usedTokens.toLocaleString()} / ${usage.windowTokens.toLocaleString()}`;
}

export function providerOffersConversationCompact(args: {
  providerId: ProviderId;
  commandPaletteItems?: readonly Pick<CommandPaletteItem, "command">[];
}): boolean {
  if (args.commandPaletteItems?.some((item) => item.command === "/compact")) {
    return true;
  }
  return args.providerId === "claude-code" || args.providerId === "codex";
}
