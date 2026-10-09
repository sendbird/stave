import {
  hasAppShortcutCommandId,
  normalizeAppShortcutKeys,
  type AppShortcutCommandId,
} from "@/lib/app-shortcuts";
import type { KeybindingPlatform } from "@/lib/keybindings/key-chord";
import {
  getDefaultKeybindingKeys,
  type KeybindingEntry,
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
