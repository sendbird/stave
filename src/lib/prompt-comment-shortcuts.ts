export type PromptCommentShortcut = "mod-enter" | "shift-enter" | "disabled";

export const DEFAULT_PROMPT_COMMENT_SHORTCUT: PromptCommentShortcut =
  "mod-enter";

export const PROMPT_COMMENT_SHORTCUT_OPTIONS: readonly {
  value: PromptCommentShortcut;
  label: string;
  description: string;
}[] = [
  {
    value: "mod-enter",
    label: "Cmd/Ctrl+Enter",
    description: "Stage the current prompt text as a comment.",
  },
  {
    value: "shift-enter",
    label: "Shift+Enter",
    description: "Use the previous comment staging shortcut.",
  },
  {
    value: "disabled",
    label: "Disabled",
    description: "Do not stage comments from the keyboard.",
  },
];

export function normalizePromptCommentShortcut(
  value: unknown,
): PromptCommentShortcut {
  return value === "shift-enter" || value === "disabled" || value === "mod-enter"
    ? value
    : DEFAULT_PROMPT_COMMENT_SHORTCUT;
}

export function formatPromptCommentShortcutLabel(
  shortcut: PromptCommentShortcut,
) {
  const normalized = normalizePromptCommentShortcut(shortcut);
  return (
    PROMPT_COMMENT_SHORTCUT_OPTIONS.find((option) => option.value === normalized)
      ?.label ?? "Cmd/Ctrl+Enter"
  );
}

export function isPromptCommentShortcut(args: {
  shortcut: PromptCommentShortcut;
  key: string;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
}) {
  if (args.key !== "Enter" || args.altKey || args.isComposing) {
    return false;
  }

  const shortcut = normalizePromptCommentShortcut(args.shortcut);
  if (shortcut === "disabled") {
    return false;
  }
  if (shortcut === "shift-enter") {
    return Boolean(args.shiftKey && !args.ctrlKey && !args.metaKey);
  }
  return Boolean(!args.shiftKey && (args.ctrlKey || args.metaKey));
}
