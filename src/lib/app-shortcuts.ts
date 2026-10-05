import { i18n } from "@/i18n/runtime";
import { WORKSPACE_TOOLS_PRESENTATION } from "@/lib/workspace-tools-presentation";

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
  | "navigation.fleet-view"
  | "navigation.automation-center"
  | "navigation.issues"
  | "navigation.agents"
  | "view.toggle-workspace-sidebar"
  | "view.toggle-changes-panel"
  | "view.show-explorer"
  | "view.show-information"
  | "view.show-scripts"
  | "view.show-lens"
  | "view.toggle-editor"
  | "view.toggle-terminal";

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
    get title() { return i18n.t("shell:appShortcuts.goHome"); },
    get description() { return i18n.t("shell:appShortcuts.clearTheActiveTaskSelectionAndReturn"); },
    defaultKey: "h",
  },
  {
    commandId: "navigation.fleet-view",
    get title() { return i18n.t("shell:appShortcuts.openFleetView"); },
    get description() { return i18n.t("shell:appShortcuts.openTheCrossWorkspaceAgentStatusView"); },
    defaultKey: "f",
  },
  {
    commandId: "navigation.automation-center",
    get title() { return i18n.t("shell:appShortcuts.openSchedules"); },
    get description() { return i18n.t("shell:appShortcuts.openWorkThatRunsOnItsOwn"); },
    defaultKey: "a",
  },
  {
    commandId: "navigation.issues",
    get title() { return i18n.t("shell:appShortcuts.openIssues"); },
    get description() { return i18n.t("shell:appShortcuts.openAssignedTrackerTicketsAndStartA"); },
    defaultKey: "t",
  },
  {
    commandId: "navigation.agents",
    get title() { return i18n.t("shell:appShortcuts.openAgents"); },
    get description() { return i18n.t("shell:appShortcuts.openSavedAgentsWorkflowsAndYourStandards"); },
    defaultKey: "g",
  },
  {
    commandId: "view.toggle-workspace-sidebar",
    get title() { return i18n.t("shell:appShortcuts.toggleWorkspaceSidebar"); },
    get description() { return i18n.t("shell:appShortcuts.collapseOrExpandTheLeftRepositoryAnd"); },
    defaultKey: "b",
  },
  {
    commandId: "view.toggle-changes-panel",
    get title() { return i18n.t("shell:appShortcuts.toggleSourceControlPanel"); },
    get description() { return i18n.t("shell:appShortcuts.showOrHideTheSourceControlOverlay"); },
    defaultKey: "c",
  },
  {
    commandId: "view.show-explorer",
    get title() { return i18n.t("shell:appShortcuts.openExplorerPanel"); },
    get description() { return i18n.t("shell:appShortcuts.openTheExplorerOverlayOnTheRight"); },
    defaultKey: "e",
  },
  {
    commandId: "view.show-information",
    get title() { return i18n.t("shell:appShortcuts.toggleInformationPanel"); },
    get description() { return i18n.t("shell:appShortcuts.showOrHideNotesLinksPlansAnd"); },
    defaultKey: "i",
  },
  {
    commandId: "view.show-scripts",
    get title() { return i18n.t("shell:appShortcuts.open", { value1: WORKSPACE_TOOLS_PRESENTATION.label }); },
    get description() { return i18n.t("shell:appShortcuts.openLongRunningProcessesOneShotCommandsLifecycleTriggers"); },
    defaultKey: "s",
  },
  {
    commandId: "view.show-lens",
    get title() { return i18n.t("shell:appShortcuts.openLensTab"); },
    get description() { return i18n.t("shell:appShortcuts.focusTheLatestEmbeddedBrowserTabOr"); },
    defaultKey: "l",
  },
  {
    commandId: "view.toggle-editor",
    get title() { return i18n.t("shell:appShortcuts.focusEditor"); },
    get description() { return i18n.t("shell:appShortcuts.focusTheActiveEditorTab"); },
    defaultKey: "\\",
  },
  {
    commandId: "view.toggle-terminal",
    get title() { return i18n.t("shell:appShortcuts.toggleTerminal"); },
    get description() { return i18n.t("shell:appShortcuts.focusTheTerminalPaneCreatingOneIf"); },
    defaultKey: "`",
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
    return i18n.t("shell:appShortcuts.disabled");
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
