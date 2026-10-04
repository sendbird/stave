import * as stylex from "@stylexjs/stylex";
import { MessagesSquare, X } from "lucide-react";
import { transition } from "@/components/ads/recipes/transition";
import { sx } from "@/components/ads/utils/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { Button } from "@/components/ui";
import { TASK_CONTEXT_SCOPE_LABEL } from "@/lib/task-context/attached-task-context";
import type { TaskContextScope } from "@/types/chat";

const NEXT_SCOPE: Record<TaskContextScope, TaskContextScope> = {
  "latest-reply": "conversation",
  conversation: "latest-reply",
};

const SCOPE_HELP: Record<TaskContextScope, string> = {
  "latest-reply": "Sends the task's latest reply. Choose to send its recent conversation instead.",
  conversation: "Sends the task's recent conversation. Choose to send only its latest reply.",
};

/**
 * Another task attached as context. In the composer the scope reads as a
 * button that switches between the latest reply and the recent conversation;
 * on a sent message it is plain text. With `onOpen`, the title opens the
 * attached task, so the context it came from is one click away.
 */
export function TaskContextChip(args: {
  title: string;
  scope: TaskContextScope;
  disabled?: boolean;
  compact?: boolean;
  onScopeChange?: (scope: TaskContextScope) => void;
  onRemove?: () => void;
  onOpen?: () => void;
}) {
  const scopeLabel = TASK_CONTEXT_SCOPE_LABEL[args.scope];
  const label = (
    <>
      <span className={sx(styles.prefix)}>Task</span>
      <span className={sx(styles.muted)}> / </span>
      <span>{args.title}</span>
    </>
  );
  return (
    <span className={sx(styles.root, args.compact && styles.compact)} data-task-context-chip="">
      <MessagesSquare aria-hidden className={sx(styles.icon)} />
      {args.onOpen ? (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          aria-label={`Open attached task ${args.title}`}
          title={`Open ${args.title}`}
          onClick={args.onOpen}
          className={sx(styles.label, styles.openButton, transition.colors)}
        >
          {label}
        </Button>
      ) : (
        <span className={sx(styles.label)} title={args.title}>
          {label}
        </span>
      )}
      {args.onScopeChange ? (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          disabled={args.disabled}
          aria-label={`${args.title}: ${scopeLabel}. ${SCOPE_HELP[args.scope]}`}
          title={SCOPE_HELP[args.scope]}
          onClick={() => args.onScopeChange?.(NEXT_SCOPE[args.scope])}
          className={sx(styles.scopeButton, transition.colors)}
        >
          {scopeLabel}
        </Button>
      ) : (
        <span className={sx(styles.muted)}>{` · ${scopeLabel}`}</span>
      )}
      {args.onRemove ? (
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          disabled={args.disabled}
          aria-label={`Remove attached task ${args.title}`}
          title="Remove attached task"
          onClick={args.onRemove}
          className={sx(styles.remove, transition.colors)}
        >
          <X aria-hidden className={sx(styles.removeIcon)} />
        </Button>
      ) : null}
    </span>
  );
}

const styles = stylex.create({
  root: {
    display: "inline-flex",
    maxWidth: "100%",
    alignItems: "center",
    gap: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-accent-soft"],
    paddingInline: 8,
    paddingBlock: 4,
    fontSize: vars["--ads-font-size-body"],
    color: vars["--ads-color-text"],
  },
  compact: { paddingInline: 6, paddingBlock: 2, fontSize: vars["--ads-font-size-caption"] },
  icon: { width: 14, height: 14, flexShrink: 0 },
  label: {
    minWidth: 0,
    maxWidth: "18rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  openButton: {
    height: 20,
    paddingInline: 2,
    marginInline: -2,
    justifyContent: "flex-start",
    color: vars["--ads-color-text"],
    fontSize: "inherit",
    fontWeight: "inherit",
    textDecorationLine: { default: "none", ":hover": "underline" },
  },
  prefix: { fontWeight: 500 },
  muted: { color: vars["--ads-color-text-muted"], whiteSpace: "nowrap" },
  scopeButton: {
    height: 20,
    paddingInline: 4,
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
    fontSize: vars["--ads-font-size-caption"],
    whiteSpace: "nowrap",
  },
  remove: {
    marginRight: -4,
    width: 20,
    height: 20,
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
  },
  removeIcon: { width: 12, height: 12 },
});
