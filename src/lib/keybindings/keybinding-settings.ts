import {
  hasAppShortcutCommandId,
  normalizeAppShortcutKeys,
  type AppShortcutCommandId,
} from "@/lib/app-shortcuts";
import {
  formatKeySequenceParts,
  parseKeySequence,
  type KeybindingPlatform,
} from "@/lib/keybindings/key-chord";
import {
  getDefaultKeybindingKeys,
  getKeybinding,
  type KeybindingEntry,
  type KeybindingId,
} from "@/lib/keybindings/keybinding-registry";
import { normalizePromptCommentShortcut } from "@/lib/prompt-comment-shortcuts";
import { normalizeVisualCommentShortcut } from "@/lib/visual-comment-shortcuts";

/** The Settings fields that change which keys a registry entry uses. */
export interface KeybindingSettingsSnapshot {
  appShortcutKeys?: Partial<Record<AppShortcutCommandId, unknown>> | null;
  promptCommentShortcut?: unknown;
  visualCommentShortcut?: unknown;
}

const PROMPT_COMMENT_KEYS = {
  "mod-enter": ["mod+enter"],
  "shift-enter": ["shift+enter"],
  disabled: [],
} as const;

const VISUAL_COMMENT_KEYS = {
  "mod-alt-period": ["mod+alt+."],
  "mod-period": ["mod+."],
  "mod-shift-period": ["mod+shift+."],
  disabled: [],
} as const;

/**
 * The key sequences an entry answers to right now: the platform default, or
 * the user's choice for entries customized in Settings. An empty list means
 * the shortcut is turned off.
 */
export function resolveKeybindingKeys(
  entry: KeybindingEntry,
  args: { platform: KeybindingPlatform; settings?: KeybindingSettingsSnapshot },
): readonly string[] {
  const settings = args.settings ?? {};
  switch (entry.customization) {
    case "app-chord": {
      if (!hasAppShortcutCommandId(entry.id)) {
        return [];
      }
      const key = normalizeAppShortcutKeys(settings.appShortcutKeys)[entry.id];
      return key ? [`mod+k mod?+${key}`] : [];
    }
    case "prompt-comment":
      return PROMPT_COMMENT_KEYS[
        normalizePromptCommentShortcut(settings.promptCommentShortcut)
      ];
    case "visual-comment":
      return VISUAL_COMMENT_KEYS[
        normalizeVisualCommentShortcut(settings.visualCommentShortcut)
      ];
    default:
      return getDefaultKeybindingKeys(entry, args.platform);
  }
}

/**
 * The visible keys of a shortcut: one list of parts per chord step, joined by
 * "then", or one per alternative key, joined by "or".
 */
export interface KeybindingDisplay {
  sequences: string[][];
  sequenceJoiner: "or" | "then";
}

/** The visible parts of `keys` on `platform`, as the shortcut list shows them. */
export function formatKeybindingDisplay(
  keys: readonly string[],
  platform: KeybindingPlatform,
): KeybindingDisplay {
  const parsed = keys.map((value) => parseKeySequence(value));
  const chord = parsed.find((sequence) => sequence.length > 1);
  if (chord) {
    return {
      sequences: formatKeySequenceParts(chord, platform),
      sequenceJoiner: "then",
    };
  }
  return {
    sequences: parsed.map(
      (sequence) => formatKeySequenceParts(sequence, platform)[0]!,
    ),
    sequenceJoiner: "or",
  };
}

/**
 * What a control's tooltip shows for a registry entry right now, with the
 * user's Settings applied; null while the shortcut is turned off.
 */
export function resolveKeybindingDisplay(
  id: KeybindingId,
  args: { platform: KeybindingPlatform; settings?: KeybindingSettingsSnapshot },
): KeybindingDisplay | null {
  const keys = resolveKeybindingKeys(getKeybinding(id), args);
  return keys.length > 0 ? formatKeybindingDisplay(keys, args.platform) : null;
}
