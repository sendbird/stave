import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import { ChoiceButtons } from "@/components/layout/settings-dialog.shared";
import { AdvisorCheckIcon } from "@/components/session/AdvisorCheckIcon";
import {
  ADVISOR_VERDICT_OPTIONS,
  describeAdvisorConsultLogStatus,
  describeAdvisorVerdict,
  describeAdvisorVerdictTally,
  formatAdvisorSpend,
  resolveAdvisorConsultWorkItems,
  resolveAdvisorConsultLogStatus,
  resolveAdvisorPostConsultWorkItems,
  summarizeAdvisorTurnSpend,
  type AdvisorConsultLogStatus,
} from "@/components/session/advisor-consult-log.utils";
import {
  buildAdvisorChecks,
  describeAdvisorEffort,
  describeAdvisorIsolation,
  describeAdvisorParticipant,
  describeAdvisorPhase,
  formatAdvisorDuration,
} from "@/components/session/advisor-exchange.utils";
import { useScopedTaskId } from "@/components/session/task-scope-context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AdvisorExchangeSnapshot } from "@/lib/providers/advisor-activity";
import {
  advisorVerdictKey,
  selectAdvisorConsultLog,
  type AdvisorConsultLogEntry,
  type AdvisorConsultVerdict,
  type AdvisorVerdictTallyByModel,
} from "@/lib/providers/advisor-consult-log";
import type { ProviderTurnWorkItem } from "@/lib/providers/turn-status";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";

/**
 * Copy that the tests assert verbatim, because each line is the only thing
 * stopping the surface from being read as causal evidence it cannot provide.
 */
const ADVISOR_SPEND_FOOTNOTE =
  "Reported by the runtime for the advisor call only. Stave reports usage per message, not per turn, so this is not a share of the turn's total.";
const ADVISOR_POST_CONSULT_SUBLINE =
  "Tool calls in this turn that started after the consult settled, in order. Sequence only — Stave cannot tell whether the advice caused them.";
const ADVISOR_POST_CONSULT_EMPTY =
  "No tool calls from this turn are still in memory, so Stave cannot say what ran after.";
const ADVISOR_VERDICT_SUBLINE =
  "Your own judgement, recorded per consult. Stave does not infer this.";
const ADVISOR_QUESTION_EMPTY = "The runtime did not report the question.";
const ADVISOR_UNRESOLVED_DETAIL =
  "Its turn ended before the runtime reported an outcome, so this consult has no result and no cost to show.";
const ADVISOR_LOG_TITLE = "Advisor consults";
const ADVISOR_LOG_DESCRIPTION =
  "Every consult this session, with what was asked, what came back, and what it cost.";
const HEADER_CLASS = "border-b border-border/60 px-4 py-3";

const STATUS_CHIP_CLASS: Record<AdvisorConsultLogStatus, string> = {
  armed: "border-border/60 bg-muted/40 text-muted-foreground",
  pending: "border-info/40 bg-info/10 text-info",
  completed: "border-success/40 bg-success/10 text-success",
  failed: "border-warning/40 bg-warning/10 text-warning",
  timeout: "border-warning/40 bg-warning/10 text-warning",
  aborted: "border-warning/40 bg-warning/10 text-warning",
  skipped: "border-warning/40 bg-warning/10 text-warning",
  unresolved: "border-border/60 bg-muted/40 text-muted-foreground",
};

const VERDICT_DOT_CLASS: Record<AdvisorConsultVerdict, string> = {
  helpful: "bg-success",
  not_helpful: "bg-warning",
  ignored: "bg-muted-foreground/60",
};

function SectionLabel(props: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
      {props.children}
    </p>
  );
}

function ProseBlock(props: { children: React.ReactNode; muted?: boolean }) {
  return (
    <p
      className={cn(
        "mt-1 whitespace-pre-wrap break-words rounded-md border border-border/60 bg-background/55 px-2 py-1.5 text-[0.75rem] leading-[1.5]",
        props.muted ? "text-muted-foreground" : "text-foreground",
      )}
    >
      {props.children}
    </p>
  );
}

function consultLabel(snapshot: AdvisorExchangeSnapshot) {
  if (snapshot.consultIndex === undefined) {
    return "Consult";
  }
  return snapshot.consultLimit === undefined
    ? `Consult ${snapshot.consultIndex}`
    : `Consult ${snapshot.consultIndex}/${snapshot.consultLimit}`;
}

function ConsultRow(props: {
  entry: AdvisorConsultLogEntry;
  selected: boolean;
  status: AdvisorConsultLogStatus;
  isCurrentTurn: boolean;
  onSelect: () => void;
}) {
  const { snapshot } = props.entry;
  return (
    <button
      type="button"
      data-testid="advisor-consult-log-row"
      data-consult-key={props.entry.key}
      aria-current={props.selected ? "true" : undefined}
      className={cn(
        "flex w-full min-w-0 flex-col gap-1 rounded-lg px-2 py-1.5 text-left transition-colors motion-reduce:transition-none",
        props.selected
          ? "bg-muted/70"
          : "hover:bg-muted/40 focus-visible:bg-muted/40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
      )}
      onClick={props.onSelect}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        {props.entry.verdict ? (
          <>
            {/* Colour alone cannot carry the verdict. */}
            <span className="sr-only">
              {describeAdvisorVerdict(props.entry.verdict)}
            </span>
            <span
              aria-hidden="true"
              title={describeAdvisorVerdict(props.entry.verdict)}
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                VERDICT_DOT_CLASS[props.entry.verdict],
              )}
            />
          </>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium">
          {consultLabel(snapshot)}
        </span>
        <span
          className={cn(
            "shrink-0 rounded border px-1 text-[10px] leading-4 font-medium tracking-wide",
            STATUS_CHIP_CLASS[props.status],
          )}
        >
          {describeAdvisorConsultLogStatus(props.status)}
        </span>
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-[11px] leading-4 text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">
          {describeAdvisorParticipant({
            providerId: snapshot.advisorProviderId,
            model: snapshot.advisorModel,
          })}
        </span>
        {props.isCurrentTurn ? (
          <span className="shrink-0 rounded border border-border/60 px-1 text-[10px] leading-4">
            Current turn
          </span>
        ) : null}
        {snapshot.durationMs === undefined ? null : (
          <span className="shrink-0 tabular-nums">
            {formatAdvisorDuration(snapshot.durationMs)}
          </span>
        )}
      </span>
    </button>
  );
}

function ConsultDetail(props: {
  entry: AdvisorConsultLogEntry;
  entries: readonly AdvisorConsultLogEntry[];
  status: AdvisorConsultLogStatus;
  workItems: readonly ProviderTurnWorkItem[];
  tallyByModel: AdvisorVerdictTallyByModel;
  onSetVerdict: (verdict: AdvisorConsultVerdict) => void;
}) {
  const { snapshot } = props.entry;
  const checks = useMemo(() => buildAdvisorChecks(snapshot), [snapshot]);
  const settled = snapshot.outcome !== "pending" && snapshot.outcome !== "armed";
  const postConsult = useMemo(
    () =>
      resolveAdvisorPostConsultWorkItems({
        entry: props.entry,
        workItems: props.workItems,
      }),
    [props.entry, props.workItems],
  );
  const turnSpend = useMemo(
    () =>
      summarizeAdvisorTurnSpend({
        entries: props.entries,
        turnId: snapshot.turnId,
      }),
    [props.entries, snapshot.turnId],
  );
  const tallyKey = advisorVerdictKey({
    providerId: snapshot.advisorProviderId,
    model: snapshot.advisorModel,
  });
  const tally = tallyKey ? props.tallyByModel[tallyKey] : undefined;

  return (
    <div
      data-testid="advisor-consult-log-detail"
      className="min-h-0 overflow-y-auto overscroll-contain px-4 py-3"
    >
      <p className="text-[0.8125rem] font-medium text-foreground">
        {describeAdvisorConsultLogStatus(props.status)}
      </p>
      {props.status === "unresolved" ? (
        // The checks below read off `outcome`, which is still `pending`, so
        // without this they would say the advisor is being waited on — for a
        // turn that ended long ago.
        <p className="mt-0.5 text-[0.6875rem] leading-[1.45] text-muted-foreground">
          {ADVISOR_UNRESOLVED_DETAIL}
        </p>
      ) : null}

      <div className="mt-3">
        <SectionLabel>Did the advisor system work?</SectionLabel>
        <ul className="mt-1.5 space-y-1.5">
          {checks.map((check) => (
            <li key={check.id} className="flex items-start gap-2">
              <AdvisorCheckIcon status={check.status} />
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-[0.75rem] leading-[1.45]",
                    check.status === "fail"
                      ? "font-medium text-destructive"
                      : "text-foreground",
                  )}
                >
                  {check.label}
                </p>
                <p className="break-words text-[0.6875rem] leading-[1.45] text-muted-foreground">
                  {check.detail}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3">
        <SectionLabel>Question asked</SectionLabel>
        {snapshot.question ? (
          <ProseBlock>{snapshot.question}</ProseBlock>
        ) : (
          <ProseBlock muted>{ADVISOR_QUESTION_EMPTY}</ProseBlock>
        )}
      </div>

      {snapshot.advice ? (
        <div className="mt-3">
          <SectionLabel>Advice returned</SectionLabel>
          <ProseBlock>{snapshot.advice}</ProseBlock>
        </div>
      ) : null}

      <div className="mt-3">
        <SectionLabel>Lifecycle</SectionLabel>
        <ol className="mt-1 space-y-0.5">
          {snapshot.stages.map((stage, index) => (
            <li
              key={`${stage.phase}:${stage.at}:${index}`}
              className="flex items-baseline gap-2 text-[0.6875rem] leading-[1.5]"
            >
              <span className="shrink-0 tabular-nums text-muted-foreground/70">
                +{formatAdvisorDuration(stage.at - snapshot.startedAt)}
              </span>
              <span className="min-w-0 flex-1 text-muted-foreground">
                {describeAdvisorPhase(stage.phase)}
                {stage.detail ? ` — ${stage.detail}` : ""}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-3">
        <SectionLabel>Setup</SectionLabel>
        <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1.5">
          <div className="min-w-0">
            <dt className="truncate text-[0.6875rem] text-muted-foreground">
              Isolation
            </dt>
            <dd className="truncate text-[0.6875rem] text-foreground">
              {describeAdvisorIsolation(snapshot.isolation)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="truncate text-[0.6875rem] text-muted-foreground">
              Effort
            </dt>
            <dd className="truncate text-[0.6875rem] text-foreground">
              {describeAdvisorEffort(snapshot.advisorEffort)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="truncate text-[0.6875rem] text-muted-foreground">
              Deadline
            </dt>
            <dd className="truncate text-[0.6875rem] text-foreground">
              {snapshot.timeoutMs === undefined
                ? "Not reported"
                : formatAdvisorDuration(snapshot.timeoutMs)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="truncate text-[0.6875rem] text-muted-foreground">
              Duration
            </dt>
            <dd className="truncate text-[0.6875rem] text-foreground">
              {snapshot.durationMs === undefined
                ? "Not reported"
                : formatAdvisorDuration(snapshot.durationMs)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-3">
        <SectionLabel>Advisor spend</SectionLabel>
        <dl className="mt-1 space-y-1">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0 text-[0.6875rem] text-muted-foreground">
              This consult
            </dt>
            <dd className="min-w-0 truncate text-[0.6875rem] tabular-nums text-foreground">
              {formatAdvisorSpend({
                inputTokens: snapshot.inputTokens ?? 0,
                outputTokens: snapshot.outputTokens ?? 0,
                totalCostUsd: snapshot.totalCostUsd ?? null,
              })}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0 text-[0.6875rem] text-muted-foreground">
              This turn&apos;s consults
            </dt>
            <dd className="min-w-0 truncate text-[0.6875rem] tabular-nums text-foreground">
              {formatAdvisorSpend(turnSpend)}
            </dd>
          </div>
        </dl>
        <p className="mt-1 text-[0.6875rem] leading-[1.45] text-muted-foreground">
          {ADVISOR_SPEND_FOOTNOTE}
        </p>
      </div>

      {settled ? (
        <div className="mt-3" data-testid="advisor-consult-log-after">
          <SectionLabel>What ran after this consult</SectionLabel>
          <p className="mt-1 text-[0.6875rem] leading-[1.45] text-muted-foreground">
            {ADVISOR_POST_CONSULT_SUBLINE}
          </p>
          {postConsult.length === 0 ? (
            <ProseBlock muted>{ADVISOR_POST_CONSULT_EMPTY}</ProseBlock>
          ) : (
            <ol className="mt-1 space-y-0.5">
              {postConsult.map((item) => (
                <li
                  key={item.id}
                  className="flex items-baseline gap-2 text-[0.6875rem] leading-[1.5]"
                >
                  <span className="shrink-0 tabular-nums text-muted-foreground/70">
                    +
                    {formatAdvisorDuration(
                      item.startedAt -
                        (snapshot.outcomeAt ?? snapshot.startedAt),
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {item.title}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}

      {settled ? (
        <div className="mt-3">
          <SectionLabel>Your call</SectionLabel>
          <p className="mt-1 text-[0.6875rem] leading-[1.45] text-muted-foreground">
            {ADVISOR_VERDICT_SUBLINE}
          </p>
          <div className="mt-1.5">
            {/* The unrated state is a value outside the option set rather than
                a fourth "Not rated" button: the control is set-only, so an
                option the user can never legitimately choose would be dead. */}
            <ChoiceButtons<AdvisorConsultVerdict | "">
              aria-label="Was this consult helpful?"
              value={props.entry.verdict ?? ""}
              onChange={(value) => {
                if (value) {
                  props.onSetVerdict(value);
                }
              }}
              options={ADVISOR_VERDICT_OPTIONS}
            />
          </div>
          <p
            data-testid="advisor-consult-log-tally"
            className="mt-1.5 text-[0.6875rem] leading-[1.45] text-muted-foreground"
          >
            {describeAdvisorVerdictTally(tally)}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The session's consult log. Pure and prop-driven so the terminal states are
 * testable without a browser, and so the Lens harness can render it from real
 * snapshots.
 */
export function AdvisorConsultLogDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: readonly AdvisorConsultLogEntry[];
  selectedKey: string | null;
  onSelectEntry: (entryKey: string) => void;
  activeTurnId: string | null;
  workItems: readonly ProviderTurnWorkItem[];
  tallyByModel: AdvisorVerdictTallyByModel;
  onSetVerdict: (args: {
    entryKey: string;
    verdict: AdvisorConsultVerdict;
  }) => void;
}) {
  const selected =
    props.entries.find((entry) => entry.key === props.selectedKey) ??
    props.entries[0] ??
    null;

  const body = (
    <>
      {props.entries.length === 0 ? (
        <p className="px-4 py-6 text-[0.8125rem] text-muted-foreground">
          No consults have been recorded for this task yet.
        </p>
      ) : (
        <div className="grid max-h-[min(34rem,70vh)] min-h-0 md:grid-cols-[15rem_1fr]">
          <div className="min-h-0 overflow-y-auto overscroll-contain border-border/60 p-1.5 md:border-r">
            {props.entries.map((entry) => (
              <ConsultRow
                key={entry.key}
                entry={entry}
                selected={entry.key === selected?.key}
                status={resolveAdvisorConsultLogStatus({
                  entry,
                  activeTurnId: props.activeTurnId,
                })}
                isCurrentTurn={entry.snapshot.turnId === props.activeTurnId}
                onSelect={() => props.onSelectEntry(entry.key)}
              />
            ))}
          </div>
          {selected ? (
            <ConsultDetail
              entry={selected}
              entries={props.entries}
              status={resolveAdvisorConsultLogStatus({
                entry: selected,
                activeTurnId: props.activeTurnId,
              })}
              workItems={props.workItems}
              tallyByModel={props.tallyByModel}
              onSetVerdict={(verdict) =>
                props.onSetVerdict({ entryKey: selected.key, verdict })
              }
            />
          ) : null}
        </div>
      )}
    </>
  );

  // Static-render escape hatch, mirroring `WorkspaceSettingsDialog`: the dialog
  // primitive needs a portal target and its own context, neither of which
  // exists under `renderToStaticMarkup`, so the terminal states would be
  // untestable without a browser.
  if (props.open && (typeof document === "undefined" || !document.body)) {
    return (
      <div data-slot="dialog-content" className="max-w-3xl">
        <div className={HEADER_CLASS}>
          <h2 className="text-sm font-medium">{ADVISOR_LOG_TITLE}</h2>
          <p className="text-[0.75rem] text-muted-foreground">
            {ADVISOR_LOG_DESCRIPTION}
          </p>
        </div>
        {body}
      </div>
    );
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-3xl gap-0 p-0">
        <DialogHeader className={HEADER_CLASS}>
          <DialogTitle>{ADVISOR_LOG_TITLE}</DialogTitle>
          <DialogDescription>{ADVISOR_LOG_DESCRIPTION}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Store-connected host.
 *
 * Mounted once per chat area and rendered `null` unless the open view names
 * *this* task, which keeps exactly one dialog open across split panes. It lives
 * here rather than inside either trigger because both triggers are short-lived
 * — the floating card clears on its linger timer and the turn activity shelf is
 * keyed per turn — so a dialog owned by either would vanish mid-read.
 */
export function AdvisorConsultLogHost() {
  const taskId = useScopedTaskId();
  const [view, logByTask, tallyByModel, activeTurnId, activity, retained] =
    useAppStore(
      useShallow((state) => [
        state.advisorConsultLogView,
        state.advisorConsultLogByTask,
        state.advisorVerdictTallyByModel,
        state.activeTurnIdsByTask[taskId] ?? null,
        state.providerTurnActivityByTask[taskId] ?? null,
        state.retainedTurnActivityByTask[taskId] ?? null,
      ]),
    );
  const selectEntry = useAppStore((state) => state.selectAdvisorConsultLogEntry);
  const closeLog = useAppStore((state) => state.closeAdvisorConsultLog);
  const setVerdict = useAppStore((state) => state.setAdvisorConsultVerdict);

  const entries = selectAdvisorConsultLog(logByTask, taskId);
  const selectedEntry =
    entries.find((entry) => entry.key === view?.entryKey) ??
    entries[0] ??
    null;
  // Derived outside the selector on purpose: a selector that flattened the work
  // items would return a fresh array on every unrelated store write. The helper
  // also refuses to lend a newer turn's work items to an older consult.
  const workItems = useMemo(() => {
    if (view?.taskId !== taskId) {
      return [];
    }
    return resolveAdvisorConsultWorkItems({
      entry: selectedEntry,
      activity,
      retained,
    });
  }, [activity, retained, selectedEntry, taskId, view?.taskId]);

  if (view?.taskId !== taskId) {
    return null;
  }

  return (
    <AdvisorConsultLogDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          closeLog();
        }
      }}
      entries={entries}
      selectedKey={view.entryKey}
      onSelectEntry={(entryKey) => selectEntry({ entryKey })}
      activeTurnId={activeTurnId}
      workItems={workItems}
      tallyByModel={tallyByModel}
      onSetVerdict={({ entryKey, verdict }) =>
        setVerdict({ taskId, entryKey, verdict })
      }
    />
  );
}
