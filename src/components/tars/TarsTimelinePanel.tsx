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
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { projectAgentRunStages } from "@/lib/agent-runs/agent-run-view";
import { getStageDisplayTitle } from "@/lib/agent-runs/stage-display";
import type { TarsActionRecord } from "@/lib/tars/conversation";
import { TarsActionRecordLine } from "./TarsActionRecordLine";
import { tarsSideViewStyles as styles } from "./tars-side-view.styles";

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
export function TarsTimelinePanel({ detail, records, title, focusStageId }: {
  detail: AgentRunDetail | undefined; records: readonly TarsActionRecord[]; title: string; focusStageId?: string;
}) {
  const { t } = useTranslation(["shell"]);
  const rootRef = useRef<HTMLDivElement>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  // An ended run no longer moves, so its rows are read once per detail.
  // Stage rows carry translated labels, so a language switch reads them again.
  const language = i18n.language;
  const rows = useMemo(() => detail && language ? projectAgentRunStages(detail, new Date(detail.agentRun.updatedAt)) : [], [detail, language]);
  const runRecords = useMemo(() => detail ? collectTarsRunRecords(detail) : [], [detail]);
  useEffect(() => {
    if (!focusStageId) return;
    const header = rootRef.current?.querySelector<HTMLElement>(`[aria-controls="agent-run-stage-${CSS.escape(focusStageId)}"]`);
    header?.scrollIntoView({ block: "start" });
  }, [focusStageId, rows.length]);
  if (!detail) return <p className={sx(styles.meta)} role="status" data-tars-timeline="none">{t("shell:tars.side.timeline.none")}</p>;
  const commandCount = runRecords.reduce((sum, entry) => sum + entry.commands.length + entry.toolCalls.length, 0);
  return <div ref={rootRef} className={sx(styles.section)} data-tars-timeline={detail.agentRun.id}>
    <StepRail density="compact" role="list" aria-label={t("shell:tars.side.timeline.stages")}>
      {rows.map((row, index) => <StageCard key={`${row.stage.id}:${focusStageId === row.stage.id ? "focus" : ""}`} row={row}
        last={index === rows.length - 1} defaultExpanded={focusStageId ? focusStageId === row.stage.id : undefined} />)}
    </StepRail>
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
