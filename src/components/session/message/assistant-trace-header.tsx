import { useEffect, useState, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/aui/components/Button";
import { StateMark } from "@/components/aui/components/StateMark";
import { controlIconSizes } from "@/components/aui/recipes/control-metrics";
import { focusRing } from "@/components/aui/recipes/focus-ring";
import { inlineDisclosure } from "@/components/aui/recipes/inline-disclosure";
import { transition } from "@/components/aui/recipes/transition";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { useTranslation } from "@/i18n";
import { formatDuration, formatNumber } from "@/i18n/format";
import type { ChatMessage } from "@/types/chat";
import { getTraceElapsedMs } from "./assistant-trace-folding";

export function AssistantTraceHeader({
  activity, isRunning, failureCount, runFailed, lastStepFailed, history, timing,
}: {
  activity: string | null;
  isRunning: boolean;
  failureCount: number;
  runFailed: boolean;
  lastStepFailed: boolean;
  history?: { id: string; open: boolean; toggle: () => void; stepCount: number };
  timing: Pick<ChatMessage, "startedAt" | "completedAt">;
}) {
  const { t } = useTranslation(["session", "ui"]);
  const status = isRunning
    ? activity ?? t(lastStepFailed ? "session:assistantTrace.runningAfterFailure" : "ui:thinking.thinking")
    : failureCount > 0
      ? t("session:assistantTrace.finishedWithFailures", {
          count: failureCount,
          steps: formatNumber(failureCount),
        })
      : t(runFailed ? "session:assistantTrace.completionLabel" : "session:assistantTrace.finished");
  const heading = (
    <>
      <StateMark state={isRunning ? "working" : failureCount || runFailed ? "failed" : "ready"} size="md" />
      <span className={sx(styles.status)} title={status} data-trace-streaming-part={isRunning ? "activity" : undefined} data-trace-streaming-label={isRunning ? "" : undefined}>
        {status}
      </span>
    </>
  );
  if (!history) {
    return <div className={sx(styles.header, styles.staticHeader)} data-trace-anchor="header">{heading}</div>;
  }
  const Chevron = history.open ? ChevronDown : ChevronRight;
  const steps = history.stepCount > 0
    ? t("session:assistantTrace.foldedSteps", { count: history.stepCount, steps: formatNumber(history.stepCount) })
    : t("session:assistantTrace.workHistory");
  return (
    <Button
      layout="host"
      type="button"
      xstyle={[inlineDisclosure.trigger, focusRing.ringInset, transition.colors, styles.header]}
      aria-controls={history.id}
      aria-expanded={history.open}
      onClick={history.toggle}
      data-trace-anchor="header"
    >
      {heading}
      <span className={sx(styles.summary)}>
        <HistoryLabel steps={steps} timing={timing} isRunning={isRunning} />
      </span>
      <Chevron aria-hidden size={controlIconSizes.sm} className={sx(styles.chevron)} />
    </Button>
  );
}

function HistoryLabel({ timing, isRunning, steps }: {
  timing: Pick<ChatMessage, "startedAt" | "completedAt">;
  isRunning: boolean;
  steps: string;
}): ReactNode {
  const { t } = useTranslation("session");
  const [nowMs, setNowMs] = useState(Date.now);
  const ticking = isRunning && Boolean(timing.startedAt) && !timing.completedAt;
  useEffect(() => {
    if (!ticking) return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [ticking]);
  const elapsed = getTraceElapsedMs(timing, ticking ? nowMs : undefined);
  return elapsed === undefined
    ? steps
    : t("assistantTrace.timedSteps", { steps, time: formatDuration(elapsed) });
}

const styles = stylex.create({
  header: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderRadius: vars["--aui-radius-control"],
    color: vars["--aui-color-text"],
    display: "grid",
    fontSize: "0.875em",
    gridTemplateColumns: "auto minmax(0, 1fr) auto auto",
  },
  staticHeader: {
    gap: vars["--aui-space-8"],
    minBlockSize: vars["--aui-control-height-sm"],
    paddingBlock: vars["--aui-space-4"],
    paddingInline: vars["--aui-space-8"],
  },
  status: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontWeight: vars["--aui-font-weight-medium"],
  },
  summary: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  chevron: {
    color: vars["--aui-color-text-muted"],
  },
});
