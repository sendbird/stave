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
    description: "Use a browser-safe modifier chord for visual comments.",
  },
  {
    value: "mod-period",
    label: "Cmd/Ctrl+.",
    description: "Legacy shortcut that may collide inside browser views.",
  },
  {
    value: "mod-shift-period",
    label: "Cmd/Ctrl+Shift+.",
    description: "Use a shifted modifier shortcut for visual comments.",
  },
  {
    value: "disabled",
    label: "Disabled",
    description: "Do not toggle visual comments from the keyboard.",
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
