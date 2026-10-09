import { i18n, type I18nKey } from "@/i18n/runtime";
import {
  formatKeySequenceParts,
  parseKeySequence,
  type KeybindingPlatform,
} from "@/lib/keybindings/key-chord";
import {
  KEYBINDING_REGISTRY,
  KEYBINDING_SECTION_ORDER,
  KEYBINDING_SECTIONS,
  type KeybindingEntry,
  type KeybindingSectionId,
} from "@/lib/keybindings/keybinding-registry";
import type { KeybindingScope } from "@/lib/keybindings/keybinding-scopes";
import {
  resolveKeybindingKeys,
  type KeybindingSettingsSnapshot,
} from "@/lib/keybindings/keybinding-settings";
import {
  describeModelShortcutKey,
  listModelShortcutEffortOptions,
  MODEL_SHORTCUT_SLOT_LABELS,
  normalizeModelShortcutEfforts,
  normalizeModelShortcutKeys,
} from "@/lib/providers/model-shortcuts";
import {
  getTaskPresetShortcutLabel,
  TASK_PRESET_SHORTCUT_SLOT_LABELS,
} from "@/lib/task-presets";

/**
 * The view-only shortcut list, generated from the keybinding registry with
 * the user's Settings applied (Cmd/Ctrl+K keys, comment shortcuts, model and
 * preset slots).
 */
export interface ShortcutListItem {
  id: string;
  label: string;
  description: string;
  /** Where the shortcut is live and how it treats typing; empty when global. */
  meta: string;
  sequences: string[][];
  sequenceJoiner: "or" | "then";
}

export interface ShortcutListSection {
  id: KeybindingSectionId;
  title: string;
  description: string;
  shortcuts: ShortcutListItem[];
}

export interface ShortcutListSettings extends KeybindingSettingsSnapshot {
  modelShortcutKeys?: unknown;
  modelShortcutEfforts?: unknown;
  taskPresets: ReadonlyArray<{ id: string; label: string }>;
}

/** `i18n.t` for keys held in tables, where the key is a union. */
function translate(key: I18nKey, values?: Record<string, string>): string {
  const t = i18n.t as unknown as (key: string, options: object) => string;
  return t(key, values ?? {});
}

const SCOPE_LABEL_KEYS: Partial<Record<KeybindingScope, I18nKey>> = {
  workspace: "shell:keybindings.ui.scope.workspace",
  fleet: "shell:keybindings.ui.scope.fleet",
  issues: "shell:keybindings.ui.scope.issues",
  schedules: "shell:keybindings.ui.scope.schedules",
  agents: "shell:keybindings.ui.scope.agents",
  usage: "shell:keybindings.ui.scope.usage",
  settings: "shell:keybindings.ui.scope.settings",
  "command-palette": "shell:keybindings.ui.scope.commandPalette",
  dialog: "shell:keybindings.ui.scope.dialog",
  sidebar: "shell:keybindings.ui.scope.sidebar",
  composer: "shell:keybindings.ui.scope.composer",
  "task-pane": "shell:keybindings.ui.scope.taskPane",
  editor: "shell:keybindings.ui.scope.editor",
  lens: "shell:keybindings.ui.scope.lens",
  "git-graph": "shell:keybindings.ui.scope.gitGraph",
};

function describeMeta(entry: KeybindingEntry) {
  const scopeKey = SCOPE_LABEL_KEYS[entry.scope];
  const parts = [
    ...(scopeKey ? [translate(scopeKey)] : []),
    ...(entry.editable === "block"
      ? [i18n.t("shell:keybindings.ui.notWhileTyping")]
      : entry.editable === "only"
        ? [i18n.t("shell:keybindings.ui.whileTyping")]
        : []),
  ];
  return parts.join(" · ");
}

function toSequences(keys: readonly string[], platform: KeybindingPlatform) {
  const parsed = keys.map((value) => parseKeySequence(value));
  const chord = parsed.find((sequence) => sequence.length > 1);
  if (chord) {
    return {
      sequences: formatKeySequenceParts(chord, platform),
      sequenceJoiner: "then" as const,
    };
  }
  return {
    sequences: parsed.map(
      (sequence) => formatKeySequenceParts(sequence, platform)[0]!,
    ),
    sequenceJoiner: "or" as const,
  };
}

function baseItem(entry: KeybindingEntry, platform: KeybindingPlatform) {
  return {
    id: entry.id,
    label: translate(entry.titleKey, entry.titleValues?.()),
    description: translate(entry.descriptionKey),
    meta: describeMeta(entry),
    ...toSequences(entry.keys, platform),
  };
}

function modelSlotItems(
  entry: KeybindingEntry,
  platform: KeybindingPlatform,
  settings: ShortcutListSettings,
): ShortcutListItem[] {
  const keys = normalizeModelShortcutKeys(settings.modelShortcutKeys as never);
  const efforts = normalizeModelShortcutEfforts(
    settings.modelShortcutEfforts as never,
  );
  const alt = platform === "mac" ? "⌥" : "Alt";
  const assigned = MODEL_SHORTCUT_SLOT_LABELS.flatMap((slotLabel, index) => {
    const details = describeModelShortcutKey({ shortcutKey: keys[index] ?? "" });
    if (!details) {
      return [];
    }
    const effortLabel = listModelShortcutEffortOptions({
      shortcutKey: details.key,
    }).find((option) => option.value === (efforts[index] ?? ""))?.label;
    const effortDescription = effortLabel
      ? i18n.t("shell:keyboardShortcutsDrawer.atEffort", { value1: effortLabel })
      : i18n.t("shell:keyboardShortcutsDrawer.withTheCurrentEffortSetting");
    return [
      {
        ...baseItem(entry, platform),
        id: `${entry.id}.${slotLabel}`,
        label: i18n.t("shell:keyboardShortcutsDrawer.select", {
          value1: details.modelLabel,
        }),
        description: i18n.t(
          "shell:keyboardShortcutsDrawer.switchTheActiveTaskToAndUse",
          {
            value1: details.providerLabel,
            value2: details.modelLabel,
            value3: effortDescription,
          },
        ),
        sequences: [[alt, slotLabel]],
        sequenceJoiner: "or" as const,
      },
    ];
  });
  return assigned.length > 0 ? assigned : [baseItem(entry, platform)];
}

function presetSlotItems(
  entry: KeybindingEntry,
  platform: KeybindingPlatform,
  settings: ShortcutListSettings,
): ShortcutListItem[] {
  const ctrl = platform === "mac" ? "⌃" : "Ctrl";
  const assigned = settings.taskPresets
    .slice(0, TASK_PRESET_SHORTCUT_SLOT_LABELS.length)
    .flatMap((preset, index) => {
      const slotLabel = getTaskPresetShortcutLabel(index);
      if (!slotLabel) {
        return [];
      }
      return [
        {
          ...baseItem(entry, platform),
          id: `${entry.id}.${slotLabel}`,
          label: i18n.t("shell:keyboardShortcutsDrawer.run", {
            value1: preset.label,
          }),
          description: i18n.t(
            "shell:keyboardShortcutsDrawer.launchThisPresetDirectlyReorderPresetsIn",
          ),
          sequences: [[ctrl, slotLabel]],
          sequenceJoiner: "or" as const,
        },
      ];
    });
  return assigned.length > 0 ? assigned : [baseItem(entry, platform)];
}

function entryItems(
  entry: KeybindingEntry,
  platform: KeybindingPlatform,
  settings: ShortcutListSettings,
): ShortcutListItem[] {
  if (entry.customization === "model-slots") {
    return modelSlotItems(entry, platform, settings);
  }
  if (entry.customization === "preset-slots") {
    return presetSlotItems(entry, platform, settings);
  }
  const keys = resolveKeybindingKeys(entry, { platform, settings });
  if (keys.length > 0) {
    return [{ ...baseItem(entry, platform), ...toSequences(keys, platform) }];
  }
  if (!entry.customization) {
    // No keys on this platform (a macOS-only menu key, for example).
    return [];
  }
  const item = baseItem(entry, platform);
  return [
    {
      ...item,
      description:
        entry.customization === "app-chord"
          ? i18n.t("shell:keyboardShortcutsDrawer.disabledInSettingsCommandPalette", {
              value1: item.description,
            })
          : item.description,
      sequences: [[i18n.t("shell:keyboardShortcutsDrawer.disabled")]],
      sequenceJoiner: "or",
    },
  ];
}

export function buildShortcutListSections(args: {
  platform: KeybindingPlatform;
  settings: ShortcutListSettings;
}): ShortcutListSection[] {
  return KEYBINDING_SECTION_ORDER.map((sectionId) => ({
    id: sectionId,
    title: translate(KEYBINDING_SECTIONS[sectionId].titleKey),
    description: translate(KEYBINDING_SECTIONS[sectionId].descriptionKey),
    shortcuts: (KEYBINDING_REGISTRY as readonly KeybindingEntry[])
      .filter((entry) => entry.section === sectionId)
      .flatMap((entry) => entryItems(entry, args.platform, args.settings)),
  })).filter((section) => section.shortcuts.length > 0);
}

/** Search across titles, descriptions, scope notes and key labels. */
export function filterShortcutListSections(
  sections: readonly ShortcutListSection[],
  query: string,
): ShortcutListSection[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [...sections];
  }
  return sections.flatMap((section) => {
    const sectionMatches = `${section.title} ${section.description}`
      .toLowerCase()
      .includes(normalized);
    const shortcuts = sectionMatches
      ? section.shortcuts
      : section.shortcuts.filter((shortcut) =>
          `${shortcut.label} ${shortcut.description} ${shortcut.meta} ${shortcut.id} ${shortcut.sequences
            .flat()
            .join(" ")}`
            .toLowerCase()
            .includes(normalized),
        );
    return shortcuts.length > 0 ? [{ ...section, shortcuts }] : [];
  });
}
