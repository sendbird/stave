import { useEffect, useMemo, useRef, useState } from "react";
import { TerminalSquare } from "lucide-react";
import { i18n, useTranslation } from "@/i18n";
import { StepRail } from "@/components/aui/components/StepRail";
import { InlineDisclosureIcon } from "@/components/aui/components/inline-disclosure-icon";
import { CollapsiblePanel, CollapsibleRoot, CollapsibleTrigger } from "@/components/aui/headless/collapsible";
import { controlIconSizes } from "@/components/aui/recipes/control-metrics";
import { focusRing } from "@/components/aui/recipes/focus-ring";
import { inlineDisclosure } from "@/components/aui/recipes/inline-disclosure";
import { transition } from "@/components/aui/recipes/transition";
import { raisedPanel } from "@/components/aui/recipes/raised-panel";
import { cx, sx } from "@/components/aui/utils/stylex";
import { AgentRunDecisionLog } from "@/components/agent-runs/AgentRunDecisionLog";
import { StageCard } from "@/components/agent-runs/StageCard";
import { agentRunStyles } from "@/components/agent-runs/agent-runs.styles";
import { RUN_LINE_CLOCK_MS, useNow } from "@/components/agent-runs/useAgentRun";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { projectAgentRunStages } from "@/lib/agent-runs/agent-run-view";
import { getStageDisplayTitle } from "@/lib/agent-runs/stage-display";
import { isActiveAgentRunState } from "@/lib/agent-runs/domain";
import { isTarsResponsibilityTerminal } from "@/lib/tars/attention";
import type { TarsActionRecord } from "@/lib/tars/conversation";
import type { TarsResponsibility } from "@/lib/tars/types";
import { TarsActionRecordLine } from "./TarsActionRecordLine";
import { describeTarsLiveStage, TarsLiveLine, TarsRecentProgress } from "./TarsLiveProgress";
import { TarsStateTag } from "./TarsRunMonitor";
import { useTarsLiveProgress } from "./use-tars-live-progress";
import { tarsSideViewStyles as styles } from "./tars-side-view.styles";
import { tarsLiveStyles as liveStyles } from "./tars-live.styles";

/** How many of the run's recent changes the timeline's "Now" lists. */
const TIMELINE_RECENT_LIMIT = 8;

type TimelineRow = Pick<TarsResponsibility, "id" | "title" | "state" | "agentRunId" | "taskId">;

/**
 * Where the work stands before its history: its state, the stage the active
 * run is on, what Stave observed the run doing and how current that is, and
 * the run's recent progress, newest first. Everything comes from the run and
 * its turn as observed; nothing is inferred from the state alone.
 */
export function TarsTimelineNow({ row, detail }: { row: TimelineRow; detail: AgentRunDetail | undefined }) {
  const { t } = useTranslation(["shell"]);
  const { live, now } = useTarsLiveProgress(row, detail, { recentLimit: TIMELINE_RECENT_LIMIT });
  const stage = live.stage ? describeTarsLiveStage(live.stage) : null;
  return <section className={sx(liveStyles.now)} aria-label={t("shell:tars.side.timeline.now")} data-tars-timeline-now={live.freshness}>
    <h3 className={sx(styles.sectionTitle)}>{t("shell:tars.side.timeline.now")}</h3>
    <div className={sx(liveStyles.nowHead)}>
      <TarsStateTag state={row.state} />
      {stage ? <p className={sx(liveStyles.nowStage)} data-tars-timeline-now-stage={`${live.stage!.position}/${live.stage!.total}`}>{stage}</p> : null}
    </div>
    <TarsLiveLine row={row} live={live} now={now} />
    {live.recent.length ? <TarsRecentProgress entries={live.recent} now={now} title />
      : detail ? <p className={sx(styles.meta)} data-tars-timeline-recent="none">{t("shell:tars.live.noRecent")}</p> : null}
  </section>;
}

/** The commands and tool calls each stage's latest attempt recorded, for the folded record list. */
export function collectTarsRunRecords(detail: AgentRunDetail) {
  const rows = projectAgentRunStages(detail, new Date(detail.agentRun.updatedAt));
  return rows.flatMap((row) => {
    const facts = row.record?.facts;
    if (!facts || (!facts.commands.length && !facts.toolCalls.length)) return [];
    return [{ stageId: row.stage.id, title: getStageDisplayTitle(row.stage), commands: facts.commands, toolCalls: facts.toolCalls }];
  });
}

/**
 * The run's timeline: each stage with its attempts and what it produced (the
 * agent-run stage cards), the run's own decisions (routes, waits, retries,
 * account switches), the hand-offs and controls recorded in Tars, and the
 * commands and tool calls, folded. Long parts start folded.
 */
export function TarsTimelinePanel({ detail, records, title, focusStageId, row }: {
  detail: AgentRunDetail | undefined; records: readonly TarsActionRecord[]; title: string; focusStageId?: string;
  /** The responsibility the timeline is about; its "Now" section and empty state read it. */
  row?: TimelineRow;
}) {
  const { t } = useTranslation(["shell"]);
  const rootRef = useRef<HTMLDivElement>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  // An active run's current stage keeps counting; an ended run no longer moves, so its rows are read once per detail.
  const active = Boolean(detail && isActiveAgentRunState(detail.agentRun.state));
  const now = useNow(active, RUN_LINE_CLOCK_MS);
  const at = active ? now : detail ? Date.parse(detail.agentRun.updatedAt) : 0;
  // Stage rows carry translated labels, so a language switch reads them again.
  const language = i18n.language;
  const rows = useMemo(() => detail && language ? projectAgentRunStages(detail, new Date(at)) : [], [detail, language, at]);
  const runRecords = useMemo(() => detail ? collectTarsRunRecords(detail) : [], [detail]);
  useEffect(() => {
    if (!focusStageId) return;
    const header = rootRef.current?.querySelector<HTMLElement>(`[aria-controls="agent-run-stage-${CSS.escape(focusStageId)}"]`);
    header?.scrollIntoView({ block: "start" });
  }, [focusStageId, rows.length]);
  // No run: say whether one has not started yet, never existed, or is not loaded in this window.
  const empty = !row?.agentRunId ? row && isTarsResponsibilityTerminal(row) ? "noRun" : "notStarted" : "none";
  if (!detail) return <div className={sx(styles.stack)}>
    {row ? <TarsTimelineNow row={row} detail={undefined} /> : null}
    <p className={sx(styles.meta)} role="status" data-tars-timeline={empty}>{t(`shell:tars.side.timeline.${row ? empty : "none"}`)}</p>
  </div>;
  const commandCount = runRecords.reduce((sum, entry) => sum + entry.commands.length + entry.toolCalls.length, 0);
  // Now, the stages, the hand-offs, the run's decisions and its commands: each a part of its own on the section rhythm.
  return <div ref={rootRef} className={sx(styles.stack)} data-tars-timeline={detail.agentRun.id}>
    {row ? <TarsTimelineNow row={row} detail={detail} /> : null}
    {/* A grouping only: the stage list below already carries the "Stages" name. */}
    <div className={sx(styles.section)} data-tars-timeline-stages={rows.length}>
      <h3 className={sx(styles.sectionTitle)}>{t("shell:tars.side.timeline.stages")}</h3>
      <StepRail density="compact" role="list" aria-label={t("shell:tars.side.timeline.stages")}>
        {rows.map((row, index) => <StageCard key={`${row.stage.id}:${focusStageId === row.stage.id ? "focus" : ""}`} row={row}
          last={index === rows.length - 1} defaultExpanded={focusStageId ? focusStageId === row.stage.id : undefined} />)}
      </StepRail>
    </div>
    {records.length ? <section className={sx(styles.section)} aria-label={t("shell:tars.side.timeline.handOffs")} data-tars-timeline-records="">
      <h3 className={sx(styles.sectionTitle)}>{t("shell:tars.side.timeline.handOffs")}</h3>
      <ul className={sx(raisedPanel.panel, styles.panelList)}>
        {records.map((record) => <li key={record.requestId} className={sx(raisedPanel.row)}><TarsActionRecordLine record={record} title={title} /></li>)}
      </ul>
    </section> : null}
    <AgentRunDecisionLog detail={detail} />
    {commandCount ? <CollapsibleRoot className={sx(inlineDisclosure.root)} open={toolsOpen} onOpenChange={setToolsOpen} data-tars-timeline-tools="">
      <CollapsibleTrigger className={cx(sx(inlineDisclosure.trigger, inlineDisclosure.triggerIntrinsic, toolsOpen && inlineDisclosure.triggerOpen,
        transition.colors, focusRing.ring), "atelier-inline-disclosure-trigger")}>
        <InlineDisclosureIcon open={toolsOpen}><TerminalSquare size={controlIconSizes.md} /></InlineDisclosureIcon>
        <span>{t("shell:tars.side.timeline.tools", { count: commandCount })}</span>
      </CollapsibleTrigger>
      <CollapsiblePanel className={cx(sx(inlineDisclosure.panel), "atelier-motion-collapse")}>
        <div className={cx(sx(inlineDisclosure.body), "atelier-motion-panel-inner")}>
          {runRecords.map((entry) => <section key={entry.stageId} className={sx(styles.section)} aria-label={entry.title}>
            <p className={sx(styles.meta)}>{entry.title}</p>
            <ul className={sx(agentRunStyles.checkList)}>
              {entry.commands.map((command, index) => <li key={`c:${index}`} className={sx(styles.row)}>
                <code className={sx(agentRunStyles.mono, styles.text)}>{command.command}</code>
                <span className={sx(styles.meta)}>{command.exitCode === null ? t("shell:tars.side.timeline.exitUnknown")
                  : t("shell:tars.side.timeline.exit", { code: command.exitCode })}</span>
              </li>)}
              {entry.toolCalls.map((call) => <li key={call.toolCallId} className={sx(styles.row)}>
                <span className={sx(styles.text)}>{call.name}</span>
                <span className={sx(styles.meta)}>{t(call.ok ? "shell:tars.side.timeline.toolOk" : "shell:tars.side.timeline.toolFailed")}</span>
              </li>)}
            </ul>
          </section>)}
        </div>
      </CollapsiblePanel>
    </CollapsibleRoot> : null}
  </div>;
}
