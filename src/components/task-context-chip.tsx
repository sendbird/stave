import * as stylex from "@stylexjs/stylex";
import { MessagesSquare } from "lucide-react";
import { transition } from "@/components/ads/recipes/transition";
import { sx } from "@/components/ads/utils/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import {
  Button,
  ContextChip,
  ContextChipRemoveButton,
  contextChipStyles,
} from "@/components/ui";
import { Tooltip } from "@/components/ads/components/Tooltip";
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
      <span className={sx(contextChipStyles.prefix)}>{t("taskContext.chip.prefix")}</span>
      <span className={sx(contextChipStyles.muted)}> / </span>
      <span>{args.title}</span>
    </>
  );
  return (
    <ContextChip icon={MessagesSquare} compact={args.compact} data-task-context-chip="">
      {args.onOpen ? (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          aria-label={t("taskContext.chip.openAriaLabel", { title: args.title })}
          title={t("taskContext.chip.openTitle", { title: args.title })}
          onClick={args.onOpen}
          xstyle={[contextChipStyles.label, styles.label, contextChipStyles.openButton, transition.colors]}
        >
          {label}
        </Button>
      ) : (
        <span className={sx(contextChipStyles.label, styles.label)} title={args.title}>
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
          xstyle={[styles.scopeButton, transition.colors]}
        >
          {scopeLabel}
        </Button>
      ) : (
        <span className={sx(contextChipStyles.muted)}>{` · ${scopeLabel}`}</span>
      )}
      {args.partialReply ? (
        <span className={sx(contextChipStyles.muted)} title={t("taskContext.chip.partialReplyHint")}>
          {` · ${t("taskContext.chip.partialReply")}`}
        </span>
      ) : null}
      {args.onRemove ? (
        <Tooltip content={t("taskContext.chip.removeTitle")}>
          <ContextChipRemoveButton
            disabled={args.disabled}
            label={t("taskContext.chip.removeAriaLabel", { title: args.title })}
            onClick={args.onRemove}
          />
        </Tooltip>
      ) : null}
    </ContextChip>
  );
}

const styles = stylex.create({
  label: { maxWidth: "18rem" },
  scopeButton: {
    flexShrink: 0,
    height: vars["--ads-line-height-control"],
    paddingInline: vars["--ads-space-4"],
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
    fontSize: vars["--ads-font-size-caption"],
    whiteSpace: "nowrap",
  },
});
