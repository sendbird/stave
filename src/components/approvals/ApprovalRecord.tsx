import { i18n, useTranslation } from "@/i18n";
import { useMemo } from "react";
import * as stylex from "@stylexjs/stylex";
import { Bot, BotOff, CircleHelp, CircleSlash, Clock3, ShieldCheck, ShieldX, UserCheck, UserX, type LucideIcon } from "lucide-react";
import { ActivityFeed, type ActivityItem } from "@/components/ads/components/ActivityFeed";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { getToolTitle } from "@/components/session/message/assistant-trace.utils";
import { formatDate, formatTime } from "@/i18n/format";
import { summarizeApprovalRecord, type ApprovalRecordEntry, type ApprovalRecordSummary, type ApprovalStanding } from "@/lib/approvals/approval-record";
import type { ApprovalResolution } from "@/lib/approvals/approval-resolution";

/** The feed shows the latest requests; the counts always cover all of them. */
export const APPROVAL_RECORD_LIST_LIMIT = 50;

/** Who decided, as a noun the outcome and the card's audit line both use. */
export function describeApprovalDecider(resolution: Pick<ApprovalResolution, "source" | "reason">): string {
  if (resolution.source === "user") return i18n.t("session:approvalRecord.decider.user");
  switch (resolution.reason) {
    case "trusted-tool": return i18n.t("session:approvalRecord.decider.trustedTool");
    case "autonomy": return i18n.t("session:approvalRecord.decider.autonomy");
    case "permission-mode": return i18n.t("session:approvalRecord.decider.permissionMode");
    case "provider-reviewer": return i18n.t("session:approvalRecord.decider.providerReviewer");
    case "timeout": return i18n.t("session:approvalRecord.decider.timeout");
    case "stave-tool": return i18n.t("session:approvalRecord.decider.staveTool");
    case "provider-browser": return i18n.t("session:approvalRecord.decider.providerBrowser");
    case undefined:
      return resolution.source === "rule" ? i18n.t("session:approvalRecord.decider.rule") : i18n.t("session:approvalRecord.decider.provider");
  }
}

/** One request's outcome, as the feed says it after the request. */
export function describeApprovalOutcome(entry: Pick<ApprovalRecordEntry, "standing" | "decision" | "resolution">): string {
  const decider = entry.resolution ? describeApprovalDecider(entry.resolution) : "";
  switch (entry.standing) {
    case "allowed-by-you":
    case "allowed-by-rule":
    case "allowed-by-provider":
      return entry.resolution?.scope === "always"
        ? i18n.t("session:approvalRecord.outcome.alwaysAllowed", { decider })
        : i18n.t("session:approvalRecord.outcome.allowed", { decider });
    case "denied-by-you":
    case "denied-by-rule":
    case "denied-by-provider":
      return i18n.t("session:approvalRecord.outcome.denied", { decider });
    case "waiting": return i18n.t("session:approvalRecord.outcome.waiting");
    case "withdrawn": return i18n.t("session:approvalRecord.outcome.withdrawn");
    case "unrecorded":
      return entry.decision === "denied"
        ? i18n.t("session:approvalRecord.outcome.unrecordedDenied")
        : i18n.t("session:approvalRecord.outcome.unrecordedAllowed");
  }
}

/**
 * The counts, who allowed kept apart: you, a Stave rule and the provider's
 * decisions, always; denials, open, withdrawn and unrecorded requests when there
 * are any.
 */
export function describeApprovalCounts(summary: ApprovalRecordSummary): string[] {
  const denied = summary["denied-by-you"] + summary["denied-by-rule"] + summary["denied-by-provider"];
  return [
    i18n.t("session:approvalRecord.counts.allowedByYou", { count: summary["allowed-by-you"] }),
    i18n.t("session:approvalRecord.counts.allowedByRule", { count: summary["allowed-by-rule"] }),
    i18n.t("session:approvalRecord.counts.allowedByProvider", { count: summary["allowed-by-provider"] }),
    denied ? i18n.t("session:approvalRecord.counts.denied", { count: denied }) : null,
    summary.waiting ? i18n.t("session:approvalRecord.counts.waiting", { count: summary.waiting }) : null,
    summary.withdrawn ? i18n.t("session:approvalRecord.counts.withdrawn", { count: summary.withdrawn }) : null,
    summary.unrecorded ? i18n.t("session:approvalRecord.counts.unrecorded", { count: summary.unrecorded }) : null,
  ].filter((segment): segment is string => segment !== null);
}

const STANDING_ICONS: Record<ApprovalStanding, LucideIcon> = {
  "allowed-by-you": UserCheck,
  "denied-by-you": UserX,
  "allowed-by-rule": ShieldCheck,
  "denied-by-rule": ShieldX,
  "allowed-by-provider": Bot,
  "denied-by-provider": BotOff,
  waiting: Clock3,
  withdrawn: CircleSlash,
  unrecorded: CircleHelp,
};

function toFeedItem(entry: ApprovalRecordEntry, byDay: boolean): ActivityItem {
  const Icon = STANDING_ICONS[entry.standing];
  const title = getToolTitle(entry.toolName);
  const decidedAt = entry.resolution?.decidedAt;
  return {
    id: entry.id,
    actor: entry.target ? `${title} · ${entry.target}` : title,
    verb: describeApprovalOutcome(entry),
    timestamp: decidedAt ? formatTime(decidedAt, { timeStyle: "medium" }) : undefined,
    ...(byDay && decidedAt ? { day: formatDate(decidedAt) } : {}),
    icon: <Icon aria-hidden className={sx(styles.icon, iconTones[entry.standing])} />,
  };
}

/** Day headers only when the requests span more than one day. */
function spansDays(entries: readonly ApprovalRecordEntry[]): boolean {
  const days = new Set(entries.flatMap((entry) => (entry.resolution ? [formatDate(entry.resolution.decidedAt)] : [])));
  return days.size > 1;
}

/**
 * The approval record of a run: how many requests were allowed by you, by a
 * Stave rule and by the provider, then the latest requests one per line —
 * what was asked, who decided and when.
 */
export function ApprovalRecordView(props: {
  entries: readonly ApprovalRecordEntry[];
  emptyText: string;
  /** `false` where the host already shows the counts (a folded summary line). */
  showCounts?: boolean;
  testId?: string;
}) {
  useTranslation();
  const summary = useMemo(() => summarizeApprovalRecord(props.entries), [props.entries]);
  // Translate at render time so a locale change refreshes verbs and timestamps
  // even when the persisted approval entries keep their identity.
  const latest = props.entries.slice(-APPROVAL_RECORD_LIST_LIMIT);
  const byDay = spansDays(latest);
  const items = latest.map((entry) => toFeedItem(entry, byDay));
  return (
    <div className={sx(styles.record)} data-testid={props.testId}>
      {summary.total && props.showCounts !== false ? <p className={sx(styles.counts)} data-testid="approval-record-counts">{describeApprovalCounts(summary).join(" · ")}</p> : null}
      <ActivityFeed density="compact" items={items} emptyText={props.emptyText} />
      {summary.total > APPROVAL_RECORD_LIST_LIMIT ? (
        <p className={sx(styles.note)}>{i18n.t("session:approvalRecord.truncated", { shown: APPROVAL_RECORD_LIST_LIMIT, count: summary.total })}</p>
      ) : null}
    </div>
  );
}

const styles = stylex.create({
  record: { display: "flex", flexDirection: "column", gap: vars["--ads-space-8"], minWidth: 0 },
  counts: { margin: 0, fontSize: vars["--ads-font-size-caption"], color: vars["--ads-color-text"], overflowWrap: "anywhere" },
  note: { margin: 0, fontSize: vars["--ads-font-size-caption"], color: vars["--ads-color-text-muted"] },
  icon: { width: 14, height: 14 },
  allowed: { color: vars["--ads-color-success"] },
  denied: { color: vars["--ads-color-danger"] },
  waiting: { color: vars["--ads-color-warning"] },
  quiet: { color: vars["--ads-color-text-muted"] },
});

const iconTones = {
  "allowed-by-you": styles.allowed,
  "allowed-by-rule": styles.allowed,
  "allowed-by-provider": styles.allowed,
  "denied-by-you": styles.denied,
  "denied-by-rule": styles.denied,
  "denied-by-provider": styles.denied,
  waiting: styles.waiting,
  withdrawn: styles.quiet,
  unrecorded: styles.quiet,
} as const satisfies Record<ApprovalStanding, unknown>;
