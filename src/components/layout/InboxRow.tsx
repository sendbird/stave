import { useTranslation } from "@/i18n";
import { formatRelativeTimeShort } from "@/i18n/format";
import { AlertTriangle, CheckCircle2, GitMerge } from "lucide-react";
import type { FocusEvent, KeyboardEvent, ReactNode, Ref } from "react";
import { Badge, type BadgeTone } from "@/components/ads/components/Badge";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { StateMark } from "@/components/ads/components/StateMark";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { sx, type StyleXValue } from "@/components/ads/utils/stylex";
import { FLEET_ATTENTION_WORK_STATE } from "@/components/layout/fleet-attention-marks";
import { PrStatusIcon } from "@/components/layout/PrStatusIcon";
import type { FleetAttentionKind } from "@/lib/fleet/attention-projection";
import { FLEET_ATTENTION_KIND_LABEL } from "@/lib/fleet/fleet-vocabulary";
import type { FleetInboxEntry } from "@/lib/fleet/inbox-model";
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

/**
 * Up and Down move between the rows of an inbox list, from any row control
 * that is not a text field, and wrap at the ends. The key is consumed so a
 * scroller does not also scroll.
 */
export function moveInboxFocus(event: KeyboardEvent<HTMLElement>) {
  if (
    (event.key !== "ArrowDown" && event.key !== "ArrowUp") ||
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
  const step = event.key === "ArrowDown" ? 1 : -1;
  const next =
    current === -1
      ? step === 1
        ? 0
        : triggers.length - 1
      : (current + step + triggers.length) % triggers.length;
  event.preventDefault();
  triggers[next]?.focus();
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
  onFocus?: (event: FocusEvent<HTMLLIElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLLIElement>) => void;
}) {
  const { t } = useTranslation(["fleet"]);
  const { entry } = props;
  const meta = [entry.workspaceName, entry.repositoryName].filter(
    (value): value is string => Boolean(value?.trim()),
  );
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
      <AdsButton
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
          <Badge variant="outline" tone={INBOX_KIND_TONE[entry.kind]} xstyle={styles.needBadge}>
            <InboxEntryIcon kind={entry.kind} prStatus={entry.item?.prStatus} />
            {FLEET_ATTENTION_KIND_LABEL[entry.kind]}
          </Badge>
          <span className={sx(styles.rowTime)}>
            {formatRelativeTimeShort(entry.at)}
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
      </AdsButton>
      {props.body}
      {props.actions ? <div className={sx(styles.rowActions)}>{props.actions}</div> : null}
      {props.children}
    </li>
  );
}
