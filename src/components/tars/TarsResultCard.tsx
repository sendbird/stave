import { createContext, useContext, useMemo, type ReactNode } from "react";
import { Check, CircleCheck, CircleDashed, CircleX, type LucideIcon } from "lucide-react";
import { useTranslation } from "@/i18n";
import { formatDuration } from "@/i18n/format";
import { Button } from "@/components/ui";
import { sx } from "@/components/aui/utils/stylex";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import type { TarsActionRecord } from "@/lib/tars/conversation";
import { describeTarsResponsibilityDetail, describeTarsResponsibilityDiagnostic } from "@/lib/tars/detail";
import { selectTarsActivityNotices, tarsRunOf, type TarsActivityNotice } from "@/lib/tars/flow-model";
import { isTarsPublicationUnfinished } from "@/lib/tars/publication";
import { isTarsPublishable } from "@/lib/tars/publish-model";
import { projectTarsResult, tarsResultOutcome, type TarsResultCriterionKind, type TarsResultModel, type TarsResultOutcome } from "@/lib/tars/result-model";
import type { TarsSideViewTarget } from "@/lib/tars/side-view";
import type { TarsActivity, TarsResponsibility } from "@/lib/tars/types";
import { TarsBlockedNextSteps } from "./TarsBlockedNextSteps";
import { TarsDiagnosticDetail } from "./TarsDiagnosticDetail";
import { TarsPublishEntry } from "./TarsPublishEntry";
import { TarsRecordRow, TarsWorkChip, type TarsRecordState } from "./TarsRecord";
import type { TarsTrayActions } from "./TarsTray";
import { tarsResultStyles as styles } from "./tars-result.styles";

/** What a result card reads and acts through: the work and runs the view already holds, and the tray's own handlers. */
interface TarsResultContextValue {
  rowOf: (responsibilityId: string) => TarsResponsibility | undefined;
  runOf: (row: TarsResponsibility) => AgentRunDetail | undefined;
  /** The newest notice the conversation shows for a piece of work, by its activity id. */
  latestNoticeOf: (responsibilityId: string) => string | undefined;
  agentNameOf?: (agentId: string) => string | undefined;
  actions: TarsTrayActions;
}

const TarsResultContext = createContext<TarsResultContextValue | null>(null);

/**
 * Gives the conversation's notices the work they are about. Without it (a
 * notice drawn outside the Tars view) a notice stays one record row.
 */
export function TarsResultProvider({ responsibilities, runs, activity, records, actions, agentNameOf, children }: {
  responsibilities: readonly TarsResponsibility[];
  runs: Readonly<Record<string, AgentRunDetail>>;
  activity: readonly TarsActivity[] | undefined;
  records: readonly TarsActionRecord[] | undefined;
  /** The tray's handlers: a card's buttons open and control work exactly as the tray's do. */
  actions: TarsTrayActions;
  agentNameOf?: (agentId: string) => string | undefined;
  children: ReactNode;
}) {
  const latest = useMemo(() => new Map(selectTarsActivityNotices(activity ?? [], records ?? []).map((notice) => [notice.activity.responsibilityId, notice.activity.id])),
    [activity, records]);
  const value: TarsResultContextValue = {
    rowOf: (id) => responsibilities.find((row) => row.id === id), runOf: (row) => tarsRunOf(row, runs),
    latestNoticeOf: (id) => latest.get(id), agentNameOf, actions,
  };
  return <TarsResultContext value={value}>{children}</TarsResultContext>;
}

export interface TarsResultView {
  model: TarsResultModel;
  row: TarsResponsibility;
  /** The agent the work was delegated to, by name; null when the execution lead chose. */
  agentName: string | null;
  actions: TarsTrayActions;
}

/**
 * The result a notice shows as a card: completed, blocked or failed work the
 * view still holds, at the notice that is its newest and still its state.
 * Null for a cancel, for an older notice the work has moved on from, and for
 * work this window no longer reads: those stay one record row.
 */
export function useTarsResult(notice: TarsActivityNotice): TarsResultView | null {
  const context = useContext(TarsResultContext);
  const outcome = tarsResultOutcome(notice);
  if (!context || !outcome) return null;
  const { activity } = notice;
  const row = context.rowOf(activity.responsibilityId);
  if (!row || row.state !== activity.state || context.latestNoticeOf(row.id) !== activity.id) return null;
  return { model: projectTarsResult({ outcome, row, run: context.runOf(row) }), row, actions: context.actions,
    agentName: row.agentId ? context.agentNameOf?.(row.agentId) ?? row.agentId : null };
}

const ROW_STATE: Record<TarsResultOutcome, TarsRecordState> = { completed: "applied", blocked: "halted", failed: "failed" };

const CRITERION = {
  verifiedCheck: { icon: CircleCheck, tone: "toneVerified", label: "shell:tars.result.criteria.verifiedCheck" },
  verifiedReview: { icon: CircleCheck, tone: "toneVerified", label: "shell:tars.result.criteria.verifiedReview" },
  // A plain check in the quiet ink: met by the agent's word, so it never wears the verified mark.
  reported: { icon: Check, tone: "toneReported", label: "shell:tars.result.criteria.reported" },
  unmet: { icon: CircleX, tone: "toneUnmet", label: "shell:tars.result.criteria.unmet" },
  unverified: { icon: CircleDashed, tone: "toneReported", label: "shell:tars.result.criteria.unverified" },
  notReported: { icon: CircleDashed, tone: "toneReported", label: "shell:tars.result.criteria.notReported" },
} as const satisfies Record<TarsResultCriterionKind, { icon: LucideIcon; tone: "toneVerified" | "toneReported" | "toneUnmet"; label: string }>;

const REVIEW_KEY = { passed: "shell:tars.result.review.passed", "changes-requested": "shell:tars.result.review.changesRequested" } as const;

/**
 * Ended work in the conversation: its record row (state, work, agent, how
 * long, when) with a card under it for what the work came to. Completed: the
 * completion criteria with what backs each, the report's summary, the changed
 * files, the review and the draft pull request. Blocked or failed: why, the
 * run's own words folded, and the next steps that state admits. Every part
 * shows only when the run recorded it, and every button is one the tray or
 * the side view already offers.
 */
export function TarsResultCard({ notice, result }: { notice: TarsActivityNotice; result: TarsResultView }) {
  const { t } = useTranslation(["shell"]);
  const { model, row, actions, agentName } = result;
  const { activity } = notice;
  const stopped = model.outcome !== "completed";
  const reason = stopped ? describeTarsResponsibilityDetail(activity) : null;
  const diagnostic = stopped ? describeTarsResponsibilityDiagnostic(activity) : null;
  const meta = [agentName, model.durationMs === null ? null : formatDuration(model.durationMs)].filter(Boolean).join(" · ");
  const openSide = actions.onOpenSide;
  const open = (target: Omit<TarsSideViewTarget, "responsibilityId">) => openSide?.({ responsibilityId: row.id, ...target });
  const publication = row.publication;
  const publishes = !stopped && ((publication?.state === "opened" && Boolean(publication.url)) || isTarsPublicationUnfinished(publication)
    || (isTarsPublishable(row) && Boolean(actions.onPublish)));
  const review = model.review ? [
    model.review.blocked ? t("shell:tars.result.review.blocked") : model.review.verdict ? t(REVIEW_KEY[model.review.verdict]) : t("shell:tars.result.review.recorded"),
    ...(model.review.findings ? [t("shell:tars.result.review.findings", { count: model.review.findings })] : []),
  ].join(" · ") : null;
  const views = openSide ? [
    // The report exists once the run ended; before that the timeline is what there is to read.
    ...(model.report === "frozen" ? [<Button key="report" type="button" size="xs" variant="outline" data-tars-result-open="report"
      aria-label={t("shell:tars.result.openReportFor", { title: row.title })}
      onClick={() => open({ kind: "report", ...(stopped ? { focus: { unmet: true as const } } : {}) })}>{t("shell:tars.result.openReport")}</Button>] : []),
    ...(model.changes ? [<Button key="changes" type="button" size="xs" variant="outline" data-tars-result-open="changes"
      aria-label={t("shell:tars.result.openChangesFor", { title: row.title })} onClick={() => open({ kind: "changes" })}>{t("shell:tars.result.openChanges")}</Button>] : []),
    ...(stopped && model.report !== "unavailable" ? [<Button key="timeline" type="button" size="xs" variant="outline" data-tars-result-open="timeline"
      aria-label={t("shell:tars.result.openTimelineFor", { title: row.title })} onClick={() => open({ kind: "timeline" })}>{t("shell:tars.result.openTimeline")}</Button>] : []),
  ] : [];
  const facts = model.changes || review || publishes;
  const body = reason || diagnostic || model.criteria.length || model.summary || facts || views.length || stopped;
  return <TarsRecordRow state={ROW_STATE[model.outcome]} at={activity.createdAt} data-tars-activity={notice.kind} data-tars-result={model.outcome}
    lead={model.outcome === "failed" ? t("shell:tars.result.outcome.failed") : t(`shell:tars.states.${notice.kind}`)}
    values={<>
      <TarsWorkChip title={activity.title} responsibilityId={activity.responsibilityId} />
      {meta ? <span className={sx(styles.meta)} data-tars-result-meta="">{meta}</span> : null}
    </>}
    detail={body ? <div role="group" aria-label={t("shell:tars.result.label", { title: row.title })} className={sx(styles.card)} data-tars-result-card={row.id}>
      {reason ? <p className={sx(styles.reason)} data-tars-result-reason="">{reason}</p> : null}
      {diagnostic ? <TarsDiagnosticDetail text={diagnostic} /> : null}
      {model.criteria.length ? <div className={sx(styles.group)}>
        <p className={sx(styles.groupLabel)}>{t("shell:tars.result.criteria.title")}</p>
        <ul className={sx(styles.criteria)} aria-label={t("shell:tars.result.criteria.title")}>
          {model.criteria.map((criterion) => {
            const { icon: Icon, tone, label } = CRITERION[criterion.kind];
            return <li key={criterion.text} className={sx(styles.criterion)} data-tars-result-criterion={criterion.kind}>
              <span className={sx(styles.criterionMark, styles[tone])}><Icon aria-hidden="true" className={sx(styles.criterionIcon)} /></span>
              <span className={sx(styles.criterionText)}>{criterion.text}</span>
              <span className={sx(styles.criterionState, styles[tone])}>{t(label)}</span>
            </li>;
          })}
        </ul>
        {model.staveChecks.length ? <p className={sx(styles.checks)} data-tars-result-stave-checks="">
          <span className={sx(styles.criterionMark, styles.toneVerified)}><CircleCheck aria-hidden="true" className={sx(styles.criterionIcon)} /></span>
          <span className={sx(styles.fact)}>{t("shell:tars.result.criteria.staveChecks", { checks: model.staveChecks.join(" · ") })}</span>
        </p> : null}
      </div> : null}
      {model.summary ? <p className={sx(styles.summary)} data-tars-result-summary="">{model.summary}</p> : null}
      {facts ? <div className={sx(styles.facts)} data-tars-result-facts="">
        {model.changes ? <span className={sx(styles.fact)} data-tars-result-changes="">
          {model.changes.files === null ? t("shell:tars.result.changesUncounted") : t("shell:tars.result.changes", { count: model.changes.files })}
          {model.changes.lines ? <>{" "}<span className={sx(styles.added)}>+{model.changes.lines.insertions}</span>{" "}
            <span className={sx(styles.removed)}>−{model.changes.lines.deletions}</span></> : null}
        </span> : null}
        {review ? <span className={sx(styles.fact)} data-tars-result-review={model.review!.blocked ? "blocked" : model.review!.verdict ?? "recorded"}>{review}</span> : null}
        {publishes ? <span className={sx(styles.fact)} data-tars-result-publish=""><TarsPublishEntry row={row} onPublish={actions.onPublish} /></span> : null}
      </div> : null}
      {/* What the state admits next, through the tray's own handlers; then the views that explain it. */}
      {stopped ? <TarsBlockedNextSteps row={row} decision={undefined} actions={actions} /> : null}
      {views.length ? <div className={sx(styles.actions)} role="group" aria-label={t("shell:tars.result.views", { title: row.title })}>{views}</div> : null}
    </div> : null} />;
}
