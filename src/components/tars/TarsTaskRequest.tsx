import { useMemo, useState } from "react";
import { ToggleGroup } from "@/components/aui/components/ToggleGroup";
import { useFleetAgentRunsStore } from "@/store/fleet-agent-runs-store";
import { projectTarsReport } from "@/lib/tars/report-model";
import { tarsRunOf } from "@/lib/tars/flow-model";
import { TarsReportPanel } from "./TarsReportPanel";
import { TarsPublishEntry } from "./TarsPublishEntry";
import { useTarsRunDetails } from "./use-tars-run-details";
import { useTarsTextScale } from "./TarsMessageChrome";
import { ScrollText } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tooltip } from "@/components/aui/components/Tooltip";
import { sx } from "@/components/aui/utils/stylex";
import { collectTarsAttention } from "@/lib/tars/attention";
import type { TarsResponsibility } from "@/lib/tars/types";
import { useTarsSnapshotStore, tarsBridge } from "@/store/tars-snapshot-store";
import { openTarsAt } from "@/store/tars-notification-focus-store";
import { TarsBriefView } from "./TarsBriefPanel";
import { tarsInsightsStyles as styles } from "./tars-insights.styles";

/** A task keeps access to its request even after Tars has handed it back or finished. */
export function TarsTaskRequest({ taskId }: { taskId: string }) {
  const { t } = useTranslation(["shell"]);
  const row = useTarsSnapshotStore(state => state.snapshot?.responsibilities.find(item => item.taskId === taskId));
  const [open, setOpen] = useState(false);
  if (!row) return null;
  return <>
    <Tooltip content={t("shell:tars.taskRequest.open")}><Button type="button" variant="ghost" size="icon-sm"
      data-tars-task-request={row.id} aria-label={t("shell:tars.taskRequest.open")} onClick={() => setOpen(true)}><ScrollText /></Button></Tooltip>
    {open && <TaskRequestSheet key={row.id} row={row} close={() => setOpen(false)} />}
  </>;
}

function TaskRequestSheet({ row, close }: { row: TarsResponsibility; close: () => void }) {
  const { t } = useTranslation(["shell"]);
  const snapshot = useTarsSnapshotStore(state => state.snapshot);
  const [tab, setTab] = useState<"brief" | "report">("brief");
  const textScale = useTarsTextScale();
  const decisions = collectTarsAttention(snapshot).filter(item => item.responsibilityId === row.id && item.decisionId);
  return <Sheet open onOpenChange={value => { if (!value) close(); }}><SheetContent xstyle={styles.sheet} style={textScale}>
    <SheetHeader><SheetTitle>{row.title}</SheetTitle><SheetDescription>{t(`shell:tars.states.${row.state}`)}</SheetDescription></SheetHeader>
    <div className={sx(styles.body)}>
      <div className={sx(styles.chips)}>
        <ToggleGroup density="compact" aria-label={t("shell:tars.side.switch")} value={[tab]}
          options={[{ value: "brief", label: t("shell:tars.side.kinds.brief") }, { value: "report", label: t("shell:tars.side.kinds.report") }]}
          onValueChange={values => { if (values[0] === "brief" || values[0] === "report") setTab(values[0]); }} />
        {decisions.map(item => <Button key={item.id} size="sm" variant="secondary" onClick={() => {
          close(); openTarsAt({ kind: "decision", responsibilityId: row.id, decisionId: item.decisionId! });
        }}>{item.prompt?.kind === "ask" ? item.prompt.question : item.decision ? t("shell:tars.taskRequest.reviewAction", { action: t(`shell:tars.record.operation.${item.decision.operation}`) }) : t("shell:tars.taskRequest.review")}</Button>)}
      </div>
      {tab === "brief" ? <TarsBriefView row={row} onNavigate={close} load={tarsBridge()?.getBrief} /> : <TaskResult row={row} close={close} />}
    </div>
  </SheetContent></Sheet>;
}

function TaskResult({ row, close }: { row: TarsResponsibility; close: () => void }) {
  const fleetRuns = useFleetAgentRunsStore(state => state.details);
  const runs = useTarsRunDetails([row], fleetRuns);
  const run = tarsRunOf(row, runs);
  const report = useMemo(() => projectTarsReport(row, run), [row, run]);
  const publish = tarsBridge()?.publish ? () => { close(); openTarsAt({ kind: "publish", responsibilityId: row.id }); } : undefined;
  return <TarsReportPanel model={report} row={row} publish={<TarsPublishEntry row={row} onPublish={publish} />} />;
}
