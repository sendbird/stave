export const APP_SHORTCUT_PREFIX_KEY = "k";
export const APP_SHORTCUT_PREFIX_LABEL = "K";

export const APP_SHORTCUT_ALLOWED_KEYS = [
  ..."abcdefghijklmnopqrstuvwxyz",
  "\\",
  "`",
] as const;

export type AppShortcutAllowedKey = (typeof APP_SHORTCUT_ALLOWED_KEYS)[number];

export type AppShortcutCommandId =
  | "navigation.home"
  | "navigation.open-stave-muse"
  | "view.toggle-workspace-sidebar"
  | "view.toggle-changes-panel"
  | "view.show-explorer"
  | "view.show-information"
  | "view.show-scripts"
  | "view.show-lens"
  | "view.toggle-editor"
  | "view.toggle-terminal"
  | "view.toggle-zen-mode";

export interface AppShortcutDefinition {
  commandId: AppShortcutCommandId;
  title: string;
  description: string;
  defaultKey: AppShortcutAllowedKey;
}

export type AppShortcutKeys = Record<AppShortcutCommandId, string>;

export const APP_SHORTCUT_DEFINITIONS: readonly AppShortcutDefinition[] = [
  {
    commandId: "navigation.home",
    title: "Go home",
    description: "Clear the active task selection and return to the home view.",
    defaultKey: "h",
  },
  {
    commandId: "navigation.open-stave-muse",
    title: "Open Stave Muse",
    description: "Open the global Muse widget for app-wide workflows.",
    defaultKey: "m",
  },
  {
    commandId: "view.toggle-workspace-sidebar",
    title: "Toggle workspace sidebar",
    description: "Collapse or expand the left project and workspace list.",
    defaultKey: "b",
  },
  {
    commandId: "view.toggle-changes-panel",
    title: "Toggle source control panel",
    description: "Show or hide the source control overlay on the right rail.",
    defaultKey: "c",
  },
  {
    commandId: "view.show-explorer",
    title: "Open explorer panel",
    description: "Open the explorer overlay on the right rail.",
    defaultKey: "e",
  },
  {
    commandId: "view.show-information",
    title: "Toggle information panel",
    description: "Show or hide notes, links, plans, and workspace fields.",
    defaultKey: "i",
  },
  {
    commandId: "view.show-scripts",
    title: "Open scripts panel",
    description: "Open the workspace scripts runtime, hooks, and services.",
    defaultKey: "s",
  },
  {
    commandId: "view.show-lens",
    title: "Open Lens panel",
    description: "Open the embedded browser for preview and inspection.",
    defaultKey: "l",
  },
  {
    commandId: "view.toggle-editor",
    title: "Toggle editor",
    description: "Show or hide the editor panel.",
    defaultKey: "\\",
  },
  {
    commandId: "view.toggle-terminal",
    title: "Toggle terminal",
    description: "Dock or hide the terminal panel.",
    defaultKey: "`",
  },
  {
    commandId: "view.toggle-zen-mode",
    title: "Toggle Zen mode",
    description:
      "Hide surrounding workspace chrome and focus on chat and results.",
    defaultKey: "z",
  },
] as const;

const APP_SHORTCUT_DEFINITION_BY_ID = new Map(
  APP_SHORTCUT_DEFINITIONS.map((definition) => [
    definition.commandId,
    definition,
  ]),
);

const APP_SHORTCUT_ALLOWED_KEY_SET = new Set<string>(APP_SHORTCUT_ALLOWED_KEYS);

export const DEFAULT_APP_SHORTCUT_KEYS = APP_SHORTCUT_DEFINITIONS.reduce(
  (result, definition) => {
    result[definition.commandId] = definition.defaultKey;
    return result;
  },
  {} as AppShortcutKeys,
);

export const APP_SHORTCUT_KEY_OPTIONS = APP_SHORTCUT_ALLOWED_KEYS.map(
  (key) => ({
    key,
    label: formatAppShortcutKeyLabel(key),
  }),
);

function hasOwnKey(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeAppShortcutKeyValue(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  return APP_SHORTCUT_ALLOWED_KEY_SET.has(normalized) ? normalized : "";
}

export function formatAppShortcutKeyLabel(key: string) {
  if (!key) {
    return "Disabled";
  }
  if (key === "\\") {
    return "\\";
  }
  if (key === "`") {
    return "`";
  }
  return key.toUpperCase();
}

export function hasAppShortcutCommandId(
  commandId: string,
): commandId is AppShortcutCommandId {
  return APP_SHORTCUT_DEFINITION_BY_ID.has(commandId as AppShortcutCommandId);
}

export function getAppShortcutDefinition(commandId: AppShortcutCommandId) {
  return APP_SHORTCUT_DEFINITION_BY_ID.get(commandId) ?? null;
}

export function createEmptyAppShortcutKeys(): AppShortcutKeys {
  return APP_SHORTCUT_DEFINITIONS.reduce((result, definition) => {
    result[definition.commandId] = "";
    return result;
  }, {} as AppShortcutKeys);
}

export function normalizeAppShortcutKeys(
  value?: Partial<Record<AppShortcutCommandId, unknown>> | null,
): AppShortcutKeys {
  const rawValue =
    value && typeof value === "object"
      ? value
      : ({} as Record<string, unknown>);
  const usedKeys = new Set<string>();
  const nextKeys = {} as AppShortcutKeys;

  for (const definition of APP_SHORTCUT_DEFINITIONS) {
    const hasStoredValue = hasOwnKey(rawValue, definition.commandId);
    const normalizedKey = normalizeAppShortcutKeyValue(
      rawValue[definition.commandId],
    );

    if (hasStoredValue) {
      if (normalizedKey && !usedKeys.has(normalizedKey)) {
        nextKeys[definition.commandId] = normalizedKey;
        usedKeys.add(normalizedKey);
        continue;
      }
      nextKeys[definition.commandId] = "";
      continue;
    }

    if (!usedKeys.has(definition.defaultKey)) {
      nextKeys[definition.commandId] = definition.defaultKey;
      usedKeys.add(definition.defaultKey);
      continue;
    }

    nextKeys[definition.commandId] = "";
  }

  return nextKeys;
}

export function assignAppShortcutKey(args: {
  actionId: AppShortcutCommandId;
  shortcutKeys?: Partial<Record<AppShortcutCommandId, unknown>> | null;
  nextKey: string;
}) {
  const normalizedShortcutKeys = normalizeAppShortcutKeys(args.shortcutKeys);
  const normalizedKey = normalizeAppShortcutKeyValue(args.nextKey);
  const nextShortcutKeys: AppShortcutKeys = { ...normalizedShortcutKeys };

  if (normalizedKey) {
    for (const definition of APP_SHORTCUT_DEFINITIONS) {
      if (
        definition.commandId !== args.actionId &&
        nextShortcutKeys[definition.commandId] === normalizedKey
      ) {
        nextShortcutKeys[definition.commandId] = "";
      }
    }
  }

  nextShortcutKeys[args.actionId] = normalizedKey;
  return normalizeAppShortcutKeys(nextShortcutKeys);
}

export function resolveAppShortcutAction(args: {
  key: string;
  shortcutKeys?: Partial<Record<AppShortcutCommandId, unknown>> | null;
}) {
  const normalizedKey = args.key.toLowerCase();
  if (!normalizedKey) {
    return null;
  }

  const shortcutKeys = normalizeAppShortcutKeys(args.shortcutKeys);
  const definition = APP_SHORTCUT_DEFINITIONS.find(
    (candidate) => shortcutKeys[candidate.commandId] === normalizedKey,
  );
  return definition?.commandId ?? null;
}

export function formatAppShortcutLabel(args: {
  actionId: AppShortcutCommandId;
  modifierLabel: string;
  shortcutKeys?: Partial<Record<AppShortcutCommandId, unknown>> | null;
}) {
  const shortcutKeys = normalizeAppShortcutKeys(args.shortcutKeys);
  const key = shortcutKeys[args.actionId];
  if (!key) {
    return undefined;
  }
  return `${args.modifierLabel}+${APP_SHORTCUT_PREFIX_LABEL} ${formatAppShortcutKeyLabel(key)}`;
}

export function buildAppShortcutSequences(args: {
  actionId: AppShortcutCommandId;
  modifierLabel: string;
  shortcutKeys?: Partial<Record<AppShortcutCommandId, unknown>> | null;
}) {
  const shortcutKeys = normalizeAppShortcutKeys(args.shortcutKeys);
  const key = shortcutKeys[args.actionId];
  if (!key) {
    return [["Disabled"]];
  }
  return [
    [args.modifierLabel, APP_SHORTCUT_PREFIX_LABEL],
    [formatAppShortcutKeyLabel(key)],
  ];
}
