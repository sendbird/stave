import * as stylex from "@stylexjs/stylex";
import { MessagesSquare, X } from "lucide-react";
import { transition } from "@/components/ads/recipes/transition";
import { sx } from "@/components/ads/utils/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { Button } from "@/components/ui";
import { useTranslation, type I18nKey } from "@/i18n";
import { TASK_CONTEXT_SCOPE_LABEL_KEYS } from "@/lib/task-context/attached-task-context";
import type { TaskContextScope } from "@/types/chat";

const NEXT_SCOPE: Record<TaskContextScope, TaskContextScope> = {
  "latest-reply": "conversation",
  conversation: "latest-reply",
};

const SCOPE_HELP_KEYS = {
  "latest-reply": "workspace:taskContext.chip.scopeHelp.latestReply",
  conversation: "workspace:taskContext.chip.scopeHelp.conversation",
} as const satisfies Record<TaskContextScope, I18nKey>;

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
  /** A review narrowed to chosen findings sends those instead of a scope. */
  findingCount?: number;
  partialReply?: boolean;
}) {
  const { t } = useTranslation(["workspace"]);
  const scopeLabel = args.findingCount
    ? t("taskContext.chip.findingCount", { count: args.findingCount })
    : t(TASK_CONTEXT_SCOPE_LABEL_KEYS[args.scope]);
  const scopeHelp = t(SCOPE_HELP_KEYS[args.scope]);
  const label = (
    <>
      <span className={sx(styles.prefix)}>{t("taskContext.chip.prefix")}</span>
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
          aria-label={t("taskContext.chip.openAriaLabel", { title: args.title })}
          title={t("taskContext.chip.openTitle", { title: args.title })}
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
      {args.onScopeChange && !args.findingCount ? (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          disabled={args.disabled}
          aria-label={t("taskContext.chip.scopeAriaLabel", {
            title: args.title,
            scope: scopeLabel,
            help: scopeHelp,
          })}
          title={scopeHelp}
          onClick={() => args.onScopeChange?.(NEXT_SCOPE[args.scope])}
          className={sx(styles.scopeButton, transition.colors)}
        >
          {scopeLabel}
        </Button>
      ) : (
        <span className={sx(styles.muted)}>{` · ${scopeLabel}`}</span>
      )}
      {args.partialReply ? (
        <span className={sx(styles.muted)} title={t("taskContext.chip.partialReplyHint")}>
          {` · ${t("taskContext.chip.partialReply")}`}
        </span>
      ) : null}
      {args.onRemove ? (
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          disabled={args.disabled}
          aria-label={t("taskContext.chip.removeAriaLabel", { title: args.title })}
          title={t("taskContext.chip.removeTitle")}
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
    flexShrink: 0,
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
