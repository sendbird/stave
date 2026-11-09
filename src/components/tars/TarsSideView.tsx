import { useEffect, useId, useMemo, useRef, type KeyboardEvent, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { ChartNoAxesGantt, FileDiff, FileText, ScrollText, SearchCheck, X, type LucideIcon } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui";
import { ToggleGroup } from "@/components/aui/components/ToggleGroup";
import { sx } from "@/components/aui/utils/stylex";
import { panelBarStyles } from "@/components/layout/panel-bar.constants";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import type { TarsActionRecord } from "@/lib/tars/conversation";
import { projectTarsReport, projectTarsReview } from "@/lib/tars/report-model";
import { isTarsSideViewEscape, TARS_SIDE_VIEW_KINDS, type TarsSideViewKind, type TarsSideViewTarget } from "@/lib/tars/side-view";
import type { TarsResponsibility } from "@/lib/tars/types";
import { TarsBriefView } from "./TarsBriefPanel";
import { TarsChangesPanel } from "./TarsChangesPanel";
import { TarsReportPanel } from "./TarsReportPanel";
import { TarsReviewPanel } from "./TarsReviewPanel";
import { TarsTimelinePanel } from "./TarsTimelinePanel";
import type { TarsBriefLoader } from "./use-tars-brief";
import { tarsSideViewStyles as styles } from "./tars-side-view.styles";
import { tarsTrayStyles } from "./tars-tray.styles";

/** Each view's mark in its title bar; the request and the timeline keep the marks of the buttons that open them. */
const KIND_ICON: Record<TarsSideViewKind, LucideIcon> = { brief: ScrollText, report: FileText, changes: FileDiff, timeline: ChartNoAxesGantt, review: SearchCheck };

export interface TarsSideViewProps {
  target: TarsSideViewTarget;
  row: TarsResponsibility;
  run: AgentRunDetail | undefined;
  /** `column` beside the conversation (wide), `inline` above the composer (narrow) with its height cap. */
  placement: { placement: "column" } | { placement: "inline"; maxHeight: number };
  /** Tars's records about this responsibility: its hand-offs and controls. */
  records: readonly TarsActionRecord[];
  /** The execution workspace's folder, when this window knows it. */
  cwd: string | null;
  /** Take the side view's focus on open; a view opened by words leaves focus in the composer. */
  takeFocus: boolean;
  /** The next steps a blocked responsibility admits, shown in its report. */
  blockedActions?: ReactNode;
  /** Completed work's draft pull request link or the button that opens its confirmation card, in the report. */
  publishAction?: ReactNode;
  /** Reads the request view's saved message and instruction; absent on bridges that cannot. */
  loadBrief?: TarsBriefLoader;
  onKind: (kind: TarsSideViewKind) => void;
  onClose: () => void;
  onQuote: (text: string) => void;
}

/**
 * One panel beside the conversation for a responsibility's request, report,
 * changes, timeline or review. Opening, switching and closing are view-only and never
 * recorded in the conversation. Esc closes it; the view returns focus.
 */
export function TarsSideView(props: TarsSideViewProps) {
  const { t } = useTranslation(["shell"]);
  const { target, row, run, placement } = props;
  const titleId = useId();
  const subjectId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const report = useMemo(() => target.kind === "report" ? projectTarsReport(row, run) : null, [row, run, target.kind]);
  const review = useMemo(() => target.kind === "review" ? projectTarsReview(run) : null, [run, target.kind]);
  useEffect(() => {
    if (props.takeFocus) headingRef.current?.focus({ preventScroll: true });
    // Each new target is a new opening; switching kinds keeps focus on the switcher.
  }, [props.takeFocus, target.responsibilityId]);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!isTarsSideViewEscape({ key: event.key, defaultPrevented: event.defaultPrevented, isComposing: event.nativeEvent.isComposing, keyCode: event.keyCode })) return;
    event.preventDefault();
    props.onClose();
  };
  const body = target.kind === "brief" ? <TarsBriefView row={row} load={props.loadBrief} />
    : target.kind === "report" ? <TarsReportPanel model={report!} row={row} focusUnmet={target.focus !== undefined && "unmet" in target.focus} actions={props.blockedActions} publish={props.publishAction} />
    : target.kind === "changes" ? <TarsChangesPanel detail={run} cwd={props.cwd} onQuote={props.onQuote} />
      : target.kind === "timeline" ? <TarsTimelinePanel detail={run} records={props.records} title={row.title} row={row}
        focusStageId={target.focus && "stageId" in target.focus ? target.focus.stageId : undefined} />
        : <TarsReviewPanel review={review} />;
  // Wide, it is the tray's own column at the tray's width. The narrow cap is measured, so it travels as a dynamic style (class plus inline variable).
  const frame = placement.placement === "column" ? stylex.props(tarsTrayStyles.panel, styles.column) : stylex.props(styles.inline, styles.inlineCap(placement.maxHeight));
  const KindIcon = KIND_ICON[target.kind];
  return <section aria-labelledby={`${titleId} ${subjectId}`} onKeyDown={onKeyDown} data-tars-side-view={target.kind} data-tars-side-placement={placement.placement}
    className={frame.className} style={frame.style}>
    <header className={sx(styles.header)}>
      <div className={sx(styles.bar, panelBarStyles.bar)} data-tars-side-bar="">
        <h2 ref={headingRef} id={titleId} tabIndex={-1} className={sx(panelBarStyles.headerTitle, styles.heading)}>
          <KindIcon aria-hidden className={sx(panelBarStyles.headerIcon)} />
          <span className={sx(styles.headingText)}>{t(`shell:tars.side.kinds.${target.kind}`)}</span>
        </h2>
        <Button variant="ghost" size="icon-sm" aria-label={t("shell:tars.side.close")} title={t("shell:tars.side.closeHint")} onClick={props.onClose}><X /></Button>
      </div>
      <div className={sx(styles.context)}>
        <p id={subjectId} className={sx(styles.subject)} title={row.title} data-tars-side-subject="">{row.title}</p>
        <ToggleGroup density="compact" aria-label={t("shell:tars.side.switch")} value={[target.kind]} xstyle={styles.switcher}
          options={TARS_SIDE_VIEW_KINDS.map((kind) => ({ value: kind, label: t(`shell:tars.side.kindsShort.${kind}`) }))}
          onValueChange={(value) => { const next = value[0] as TarsSideViewKind | undefined; if (next && next !== target.kind) props.onKind(next); }} />
      </div>
    </header>
    <div className={sx(styles.body)} data-tars-side-body="">{body}</div>
  </section>;
}
