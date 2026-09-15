import { Button as AdsButton } from "@/components/ads/components/Button";
import { VisuallyHidden } from "@/components/ads/components/VisuallyHidden";
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import { ChoiceButtons } from "@/components/layout/settings-dialog.shared";
import {
  ExchangeDetail,
  ExchangeStatusBadge,
  KeyValueGrid,
} from "@/components/delegation";
import {
  ADVISOR_VERDICT_OPTIONS,
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
  describeAdvisorParticipant,
  formatAdvisorDuration,
} from "@/components/session/advisor-exchange.utils";
import { fromAdvisorSnapshot } from "@/lib/delegation/exchange";
import { exchangeStatusFromAdvisorOutcome } from "@/lib/delegation/format";
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
import { sx } from "@/components/ads/utils/stylex";
import {
  advisorConsultLogDialogStyles as styles,
  advisorConsultLogVerdictDot,
} from "./advisor-consult-log-dialog.styles";
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
const ADVISOR_UNRESOLVED_DETAIL =
  "Its turn ended before the runtime reported an outcome, so this consult has no result and no cost to show.";
const ADVISOR_LOG_TITLE = "Advisor consults";
const ADVISOR_LOG_DESCRIPTION =
  "Every consult this session, with what was asked, what came back, and what it cost.";

const VERDICT_DOT_STYLE: Record<
  AdvisorConsultVerdict,
  (typeof advisorConsultLogVerdictDot)[keyof typeof advisorConsultLogVerdictDot]
> = {
  helpful: advisorConsultLogVerdictDot.helpful,
  not_helpful: advisorConsultLogVerdictDot.not_helpful,
  ignored: advisorConsultLogVerdictDot.ignored,
};

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
    <AdsButton
      layout="host"
      type="button"
      data-testid="advisor-consult-log-row"
      data-consult-key={props.entry.key}
      aria-current={props.selected ? "true" : undefined}
      xstyle={[styles.row, props.selected && styles.rowSelected]}
      onClick={props.onSelect}
    >
      <span className={sx(styles.rowHeader)}>
        {props.entry.verdict ? (
          <>
            {/* Colour alone cannot carry the verdict. */}
            <VisuallyHidden>
              {describeAdvisorVerdict(props.entry.verdict)}
            </VisuallyHidden>
            <span
              aria-hidden="true"
              title={describeAdvisorVerdict(props.entry.verdict)}
              className={sx(
                styles.verdictDot,
                VERDICT_DOT_STYLE[props.entry.verdict],
              )}
            />
          </>
        ) : null}
        <span className={sx(styles.rowTitle)}>{consultLabel(snapshot)}</span>
        <ExchangeStatusBadge
          status={exchangeStatusFromAdvisorOutcome(props.status)}
          className={sx(styles.chip)}
        />
      </span>
      <span className={sx(styles.rowMeta)}>
        <span className={sx(styles.rowMetaLabel)}>
          {describeAdvisorParticipant({
            providerId: snapshot.advisorProviderId,
            model: snapshot.advisorModel,
            effort: snapshot.advisorEffort,
          })}
        </span>
        {props.isCurrentTurn ? (
          <span className={sx(styles.rowCurrentTurn)}>Current turn</span>
        ) : null}
        {snapshot.durationMs === undefined ? null : (
          <span className={sx(styles.rowDuration)}>
            {formatAdvisorDuration(snapshot.durationMs)}
          </span>
        )}
      </span>
    </AdsButton>
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
  const settled = snapshot.outcome !== "pending" && snapshot.outcome !== "armed";
  // The dialog has no clock: a pending consult of the live turn is the one
  // case that moves, and it is read for seconds, not minutes.
  const nowMs = useMemo(() => Date.now(), [props.entry]);
  const exchange = useMemo(
    () => fromAdvisorSnapshot(snapshot, { status: props.status }),
    [props.status, snapshot],
  );
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
    <div data-testid="advisor-consult-log-detail" className={sx(styles.detail)}>
      <ExchangeDetail
        exchange={exchange}
        nowMs={nowMs}
        // The checks read off `outcome`, which is still `pending`, so without
        // this they would say the advisor is being waited on — for a turn that
        // ended long ago.
        statusNote={
          props.status === "unresolved" ? ADVISOR_UNRESOLVED_DETAIL : undefined
        }
        spendFootnote={ADVISOR_SPEND_FOOTNOTE}
      >
        {turnSpend.consults > 1 ? (
          <div className={sx(styles.section)}>
            <KeyValueGrid
              items={[
                {
                  key: "turn-spend",
                  label: "This turn's consults",
                  value: formatAdvisorSpend(turnSpend),
                },
              ]}
            />
          </div>
        ) : null}

        {settled ? (
          <div
            className={sx(styles.section)}
            data-testid="advisor-consult-log-after"
          >
            <p className={sx(styles.sectionLabel)}>What ran after this consult</p>
            <p className={sx(styles.footnote)}>{ADVISOR_POST_CONSULT_SUBLINE}</p>
            {postConsult.length === 0 ? (
              <p className={sx(styles.footnote)}>{ADVISOR_POST_CONSULT_EMPTY}</p>
            ) : (
              <ol className={sx(styles.postConsultList)}>
                {postConsult.map((item) => (
                  <li key={item.id} className={sx(styles.postConsultItem)}>
                    <span className={sx(styles.postConsultAt)}>
                      +
                      {formatAdvisorDuration(
                        item.startedAt -
                          (snapshot.outcomeAt ?? snapshot.startedAt),
                      )}
                    </span>
                    <span className={sx(styles.postConsultTitle)}>
                      {item.title}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : null}

        {settled ? (
          <div className={sx(styles.section)}>
            <p className={sx(styles.sectionLabel)}>Your call</p>
            <p className={sx(styles.footnote)}>{ADVISOR_VERDICT_SUBLINE}</p>
            <div className={sx(styles.verdictControl)}>
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
              className={sx(styles.tally)}
            >
              {describeAdvisorVerdictTally(tally)}
            </p>
          </div>
        ) : null}
      </ExchangeDetail>
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
        <p className={sx(styles.emptyBody)}>
          No consults have been recorded for this task yet.
        </p>
      ) : (
        <div className={sx(styles.grid)}>
          <div className={sx(styles.listColumn)}>
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
      <div data-slot="dialog-content" className={sx(styles.staticContent)}>
        <div className={sx(styles.header)}>
          <h2 className={sx(styles.staticTitle)}>{ADVISOR_LOG_TITLE}</h2>
          <p className={sx(styles.staticDescription)}>
            {ADVISOR_LOG_DESCRIPTION}
          </p>
        </div>
        {body}
      </div>
    );
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent xstyle={styles.dialogContent}>
        <DialogHeader className={sx(styles.header)}>
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
