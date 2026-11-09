import { useTranslation } from "@/i18n";
import { formatAgeCompact, formatTimeAgo } from "@/i18n/format";
import { AlertTriangle, CheckCircle2, GitMerge } from "lucide-react";
import type { FocusEvent, KeyboardEvent, ReactNode, Ref } from "react";
import { Badge, type BadgeTone } from "@/components/aui/components/Badge";
import { Button as AuiButton } from "@/components/aui/components/Button";
import { StateMark } from "@/components/aui/components/StateMark";
import { focusRing } from "@/components/aui/recipes/focus-ring";
import { sx, type StyleXValue } from "@/components/aui/utils/stylex";
import { useNow } from "@/components/agent-runs/useAgentRun";
import { FLEET_ATTENTION_WORK_STATE } from "@/components/layout/fleet-attention-marks";
import { PrStatusIcon } from "@/components/layout/PrStatusIcon";
import type { FleetAttentionKind } from "@/lib/fleet/attention-projection";
import { FLEET_ATTENTION_KIND_LABEL } from "@/lib/fleet/fleet-vocabulary";
import type { FleetInboxEntry } from "@/lib/fleet/inbox-model";
import { classifyWaitAge, type WaitAgeTone } from "@/lib/fleet/wait-age";
import type { WorkspacePrStatus } from "@/lib/pr-status";
import { inboxRowStyles as styles } from "./inbox-row.styles";

/** Which semantic family an entry belongs to; the Badge owns the colors. */
export const INBOX_KIND_TONE: Record<FleetAttentionKind, BadgeTone> = {
  "user-input": "warning",
  approval: "warning",
  "run-failed": "danger",
  "turn-stalled": "warning",
  "result-ready": "info",
  "pr-changes-requested": "danger",
  "pr-checks-failed": "danger",
  "pr-merge-conflict": "danger",
  "pr-behind-base": "warning",
  "pr-ready-to-merge": "success",
  "agent-run-sign-off": "warning",
  "agent-run-blocked": "danger",
  "agent-run-stuck": "danger",
  "tars-decision": "warning",
  "tars-blocked": "danger",
};

export function InboxEntryIcon(props: {
  kind: FleetAttentionKind;
  prStatus?: WorkspacePrStatus;
}) {
  switch (props.kind) {
    // Needs of the agent work are work states, drawn as every surface draws them.
    case "user-input":
    case "approval":
    case "run-failed":
    case "turn-stalled":
    case "agent-run-sign-off":
    case "agent-run-blocked":
    case "agent-run-stuck":
    case "tars-decision":
    case "tars-blocked":
      return <StateMark state={FLEET_ATTENTION_WORK_STATE[props.kind]!} />;
    case "result-ready":
      return <CheckCircle2 className={sx(styles.needIcon)} aria-hidden="true" />;
    case "pr-ready-to-merge":
      return <GitMerge className={sx(styles.needIcon)} aria-hidden="true" />;
    case "pr-changes-requested":
    case "pr-checks-failed":
    case "pr-merge-conflict":
    case "pr-behind-base":
      return props.prStatus ? (
        <PrStatusIcon status={props.prStatus} className={sx(styles.needIcon)} />
      ) : (
        <AlertTriangle className={sx(styles.needIcon)} aria-hidden="true" />
      );
  }
}

function isTextEntry(target: EventTarget | null) {
  const element = target as Partial<HTMLInputElement> | null;
  if (!element || typeof element.tagName !== "string") return false;
  const tag = element.tagName.toUpperCase();
  return (
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (tag === "INPUT" && element.type !== "radio" && element.type !== "checkbox") ||
    element.isContentEditable === true
  );
}

/** J and K are the letters for Down and Up, as in Issues and Review. */
const INBOX_STEP_BY_KEY: Readonly<Record<string, 1 | -1>> = {
  ArrowDown: 1,
  j: 1,
  ArrowUp: -1,
  k: -1,
};

/**
 * Up and Down (or J and K) move between the rows of an inbox list, from any
 * row control that is not a text field, and wrap at the ends. The key is
 * consumed so a scroller does not also scroll.
 */
export function moveInboxFocus(event: KeyboardEvent<HTMLElement>) {
  const step = INBOX_STEP_BY_KEY[event.key];
  if (
    step === undefined ||
    event.nativeEvent?.isComposing === true ||
    event.defaultPrevented ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    isTextEntry(event.target)
  ) {
    return;
  }
  const triggers = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>("[data-inbox-trigger]"),
  ).filter((trigger) => !trigger.hasAttribute("disabled"));
  if (triggers.length === 0) return;
  const row = (event.target as HTMLElement | null)?.closest?.("[data-inbox-entry]");
  const current = row
    ? triggers.findIndex((trigger) => row.contains(trigger))
    : -1;
  const next =
    current === -1
      ? step === 1
        ? 0
        : triggers.length - 1
      : (current + step + triggers.length) % triggers.length;
  event.preventDefault();
  triggers[next]?.focus();
}

const WAIT_TONE_STYLE: Record<WaitAgeTone, StyleXValue> = {
  neutral: null,
  warning: styles.rowTimeWarning,
  danger: styles.rowTimeDanger,
};

/** A minute is the finest step a row's age shows. */
const WAIT_AGE_TICK_MS = 60_000;

/**
 * How late a blocking entry's wait reads. Only a wait whose start a source
 * recorded (`waitingSince`) is colored, and only the rows that block on the
 * user; the clock ticks only for those rows.
 */
function useWaitTone(entry: FleetInboxEntry): WaitAgeTone {
  const since = entry.tier === "blocking" ? entry.item?.waitingSince : undefined;
  const now = useNow(Boolean(since), WAIT_AGE_TICK_MS);
  return classifyWaitAge(since, now);
}

/**
 * One inbox entry as a row: its kind, when it began, the task it names, where
 * that task lives and what it says — the same in Fleet and in the bell. The
 * surface adds what only it does: an inline answer (`body`), its actions, and
 * anything that opens under the row (`children`).
 */
export function InboxRow(props: {
  entry: FleetInboxEntry;
  triggerId: string;
  /** The trigger's accessible name; the row adds the unread state to it. */
  triggerLabel: string;
  onActivate: () => void;
  selected?: boolean;
  busy?: boolean;
  triggerProps?: {
    "aria-expanded"?: boolean;
    "aria-controls"?: string;
    "aria-keyshortcuts"?: string;
  };
  /** Hide the detail line when the body already says it. */
  hideDetail?: boolean;
  supplement?: ReactNode;
  body?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  rowRef?: Ref<HTMLLIElement>;
  /** Placement the list adds (a grid cell's rule, for example). */
  rowStyle?: StyleXValue;
  /**
   * One line: mark, title, where and what, age, then the body and actions on
   * the same line; anything that opens under the row takes the full width.
   * Fleet's decision rail uses it so several requests fit above the board.
   */
  compact?: boolean;
  onFocus?: (event: FocusEvent<HTMLLIElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLLIElement>) => void;
}) {
  const { t } = useTranslation(["fleet"]);
  const { entry } = props;
  const waitTone = useWaitTone(entry);
  const timeStyle = WAIT_TONE_STYLE[waitTone];
  const meta = [entry.workspaceName, entry.repositoryName].filter(
    (value): value is string => Boolean(value?.trim()),
  );
  if (props.compact) {
    const where = [entry.workspaceName, entry.detail].filter(
      (value): value is string => Boolean(value?.trim()),
    );
    return (
      <li
        ref={props.rowRef}
        className={sx(styles.row, styles.rowCompact, props.selected && styles.rowSelected, props.rowStyle)}
        data-fleet-attention-row={entry.item ? entry.id : undefined}
        data-inbox-entry={entry.id}
        data-unread={entry.unread ? "true" : undefined}
        onFocus={props.onFocus}
        onKeyDown={props.onKeyDown}
      >
        <AuiButton
          layout="host"
          id={props.triggerId}
          type="button"
          data-inbox-trigger=""
          xstyle={[styles.rowTrigger, styles.rowTriggerCompact, focusRing.ringInset]}
          aria-label={
            entry.unread
              ? t("fleet:inbox.unreadLabel", { label: props.triggerLabel })
              : props.triggerLabel
          }
          {...props.triggerProps}
          disabled={props.busy}
          onClick={props.onActivate}
        >
          {entry.unread ? <span aria-hidden="true" className={sx(styles.unreadDot)} /> : null}
          <span className={sx(styles.compactMark)} title={FLEET_ATTENTION_KIND_LABEL[entry.kind]}>
            <InboxEntryIcon kind={entry.kind} prStatus={entry.item?.prStatus} />
          </span>
          <span className={sx(styles.rowTitle, styles.compactTitle)}>{entry.title}</span>
          {where.length > 0 ? (
            <span className={sx(styles.compactWhere)}>{where.join(" · ")}</span>
          ) : null}
          {props.supplement ? (
            <span className={sx(styles.rowSupplement, styles.compactSupplement)}>{props.supplement}</span>
          ) : null}
          <span className={sx(styles.rowTime, styles.compactTime, timeStyle)} data-wait-tone={waitTone}>{formatAgeCompact(entry.at)}</span>
        </AuiButton>
        {props.body}
        {props.actions ? (
          <div className={sx(styles.rowActions, styles.rowActionsCompact)}>{props.actions}</div>
        ) : null}
        {props.children ? <div className={sx(styles.compactChildren)}>{props.children}</div> : null}
      </li>
    );
  }
  return (
    <li
      ref={props.rowRef}
      className={sx(styles.row, props.selected && styles.rowSelected, props.rowStyle)}
      data-fleet-attention-row={entry.item ? entry.id : undefined}
      data-inbox-entry={entry.id}
      data-unread={entry.unread ? "true" : undefined}
      onFocus={props.onFocus}
      onKeyDown={props.onKeyDown}
    >
      <AuiButton
        layout="host"
        id={props.triggerId}
        type="button"
        data-inbox-trigger=""
        xstyle={[styles.rowTrigger, focusRing.ringInset]}
        aria-label={
          entry.unread
            ? t("fleet:inbox.unreadLabel", { label: props.triggerLabel })
            : props.triggerLabel
        }
        {...props.triggerProps}
        disabled={props.busy}
        onClick={props.onActivate}
      >
        <span className={sx(styles.rowTop)}>
          {entry.unread ? <span aria-hidden="true" className={sx(styles.unreadDot)} /> : null}
          <Badge variant="outlined" tone={INBOX_KIND_TONE[entry.kind]} xstyle={styles.needBadge}>
            <InboxEntryIcon kind={entry.kind} prStatus={entry.item?.prStatus} />
            {FLEET_ATTENTION_KIND_LABEL[entry.kind]}
          </Badge>
          <span className={sx(styles.rowTime, timeStyle)} data-wait-tone={waitTone}>
            {formatTimeAgo(entry.at)}
          </span>
        </span>
        <span className={sx(styles.rowTitle)}>{entry.title}</span>
        {meta.length > 0 ? (
          <span className={sx(styles.rowMeta)}>
            {meta.map((part, index) => (
              <span className={sx(styles.rowMetaPart)} key={`${index}-${part}`}>
                {index > 0 ? <span aria-hidden="true">· </span> : null}
                {part}
              </span>
            ))}
          </span>
        ) : null}
        {entry.detail && !props.hideDetail ? (
          <span className={sx(styles.rowDetail)}>{entry.detail}</span>
        ) : null}
        {props.supplement ? (
          <span className={sx(styles.rowSupplement)}>{props.supplement}</span>
        ) : null}
      </AuiButton>
      {props.body}
      {props.actions ? <div className={sx(styles.rowActions)}>{props.actions}</div> : null}
      {props.children}
    </li>
  );
}
