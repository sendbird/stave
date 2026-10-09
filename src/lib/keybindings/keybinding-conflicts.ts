import {
  keySequencesOverlap,
  parseKeySequence,
  type KeybindingPlatform,
} from "@/lib/keybindings/key-chord";
import type {
  KeybindingEditableRule,
  KeybindingEntry,
} from "@/lib/keybindings/keybinding-registry";
import {
  isScopeWithin,
  scopesOverlap,
} from "@/lib/keybindings/keybinding-scopes";

export interface KeybindingConflict {
  left: { id: string; keys: string };
  right: { id: string; keys: string };
  platform: KeybindingPlatform;
}

function editableRulesOverlap(
  left: KeybindingEditableRule,
  right: KeybindingEditableRule,
) {
  return !(
    (left === "block" && right === "only") ||
    (left === "only" && right === "block")
  );
}

/**
 * True when both entries can be live for the same key press. Keys are compared
 * separately; this only answers "could both be listening right now".
 *
 * - Scopes that cannot be live together never collide.
 * - A shortcut that never fires while typing cannot collide with one that only
 *   fires while typing.
 * - Two focus-bound shortcuts collide only when one element sits inside the
 *   other, since focus is in one place.
 * - A focus-bound shortcut runs before window listeners, so it does not
 *   collide with a window listener that skips already-handled events.
 */
export function keybindingsCanCoexist(
  left: KeybindingEntry,
  right: KeybindingEntry,
) {
  if (!scopesOverlap(left.scope, right.scope)) {
    return false;
  }
  if (!editableRulesOverlap(left.editable, right.editable)) {
    return false;
  }
  if (left.focus && right.focus) {
    return (
      isScopeWithin(left.scope, right.scope) ||
      isScopeWithin(right.scope, left.scope)
    );
  }
  if (left.focus && right.yieldsToHandled) {
    return false;
  }
  if (right.focus && left.yieldsToHandled) {
    return false;
  }
  return true;
}

function parseAll(keys: readonly string[]) {
  return keys.map((value) => ({ value, sequence: parseKeySequence(value) }));
}

/**
 * Every pair of entries whose keys collide in scopes that can be live at the
 * same time, checked on each platform with `resolveKeys` (defaults when
 * omitted).
 */
export function findKeybindingConflicts(args: {
  entries: readonly KeybindingEntry[];
  platforms?: readonly KeybindingPlatform[];
  resolveKeys?: (
    entry: KeybindingEntry,
    platform: KeybindingPlatform,
  ) => readonly string[];
}): KeybindingConflict[] {
  const platforms = args.platforms ?? ["mac", "windows", "linux"];
  const resolveKeys =
    args.resolveKeys ??
    ((entry: KeybindingEntry, platform: KeybindingPlatform) =>
      entry.platformKeys?.[platform] ?? entry.keys);
  const conflicts: KeybindingConflict[] = [];
  for (const platform of platforms) {
    const parsed = args.entries.map((entry) => ({
      entry,
      sequences: parseAll(resolveKeys(entry, platform)),
    }));
    for (let leftIndex = 0; leftIndex < parsed.length; leftIndex += 1) {
      const left = parsed[leftIndex]!;
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < parsed.length;
        rightIndex += 1
      ) {
        const right = parsed[rightIndex]!;
        if (!keybindingsCanCoexist(left.entry, right.entry)) {
          continue;
        }
        for (const leftKeys of left.sequences) {
          const match = right.sequences.find((rightKeys) =>
            keySequencesOverlap(leftKeys.sequence, rightKeys.sequence),
          );
          if (match) {
            conflicts.push({
              left: { id: left.entry.id, keys: leftKeys.value },
              right: { id: right.entry.id, keys: match.value },
              platform,
            });
          }
        }
      }
    }
  }
  return conflicts;
}

/** Throws with a readable list when the entries collide. */
export function assertNoKeybindingConflicts(
  entries: readonly KeybindingEntry[],
) {
  const conflicts = findKeybindingConflicts({ entries });
  if (conflicts.length === 0) {
    return;
  }
  const lines = conflicts.map(
    (conflict) =>
      `${conflict.left.id} (${conflict.left.keys}) and ${conflict.right.id} (${conflict.right.keys}) on ${conflict.platform}`,
  );
  throw new Error(`Keybinding conflicts:\n${lines.join("\n")}`);
}
