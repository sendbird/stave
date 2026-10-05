import { i18n } from "@/i18n/runtime";
export type VisualCommentShortcut =
  | "mod-period"
  | "mod-alt-period"
  | "mod-shift-period"
  | "disabled";

export const DEFAULT_VISUAL_COMMENT_SHORTCUT: VisualCommentShortcut =
  "mod-alt-period";

export const VISUAL_COMMENT_SHORTCUT_OPTIONS: readonly {
  value: VisualCommentShortcut;
  label: string;
  description: string;
}[] = [
  {
    value: "mod-alt-period",
    label: "Cmd/Ctrl+Alt+.",
    get description() { return i18n.t("shell:visualCommentShortcuts.useABrowserSafeModifierChordForVisual"); },
  },
  {
    value: "mod-period",
    label: "Cmd/Ctrl+.",
    get description() { return i18n.t("shell:visualCommentShortcuts.legacyShortcutThatMayCollideInsideBrowser"); },
  },
  {
    value: "mod-shift-period",
    label: "Cmd/Ctrl+Shift+.",
    get description() { return i18n.t("shell:visualCommentShortcuts.useAShiftedModifierShortcutForVisual"); },
  },
  {
    value: "disabled",
    get label() { return i18n.t("shell:visualCommentShortcuts.disabled"); },
    get description() { return i18n.t("shell:visualCommentShortcuts.doNotToggleVisualCommentsFromThe"); },
  },
];

export function normalizeVisualCommentShortcut(
  value: unknown,
): VisualCommentShortcut {
  return value === "mod-period" ||
    value === "mod-alt-period" ||
    value === "mod-shift-period" ||
    value === "disabled"
    ? value
    : DEFAULT_VISUAL_COMMENT_SHORTCUT;
}

export function formatVisualCommentShortcutLabel(
  shortcut: VisualCommentShortcut,
) {
  const normalized = normalizeVisualCommentShortcut(shortcut);
  return (
    VISUAL_COMMENT_SHORTCUT_OPTIONS.find(
      (option) => option.value === normalized,
    )?.label ?? "Cmd/Ctrl+Alt+."
  );
}

export function isVisualCommentShortcut(args: {
  shortcut: VisualCommentShortcut;
  key: string;
  code?: string;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
}) {
  if (args.isComposing) {
    return false;
  }

  const isPeriod = args.key === "." || args.code === "Period";
  if (!isPeriod) {
    return false;
  }

  const shortcut = normalizeVisualCommentShortcut(args.shortcut);
  if (shortcut === "disabled") {
    return false;
  }
  if (shortcut === "mod-shift-period") {
    return Boolean(
      args.shiftKey &&
        !args.altKey &&
        (args.ctrlKey || args.metaKey),
    );
  }
  if (shortcut === "mod-alt-period") {
    return Boolean(
      args.altKey &&
        !args.shiftKey &&
        (args.ctrlKey || args.metaKey),
    );
  }
  return Boolean(!args.shiftKey && !args.altKey && (args.ctrlKey || args.metaKey));
}
