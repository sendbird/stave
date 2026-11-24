import { useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Brain } from "lucide-react";
import { Button } from "@/components/aui/components/Button";
import { InlineDisclosureIcon } from "@/components/aui/components/inline-disclosure-icon";
import { controlHeights, controlIconSizes } from "@/components/aui/recipes/control-metrics";
import { focusRing } from "@/components/aui/recipes/focus-ring";
import { inlineDisclosure } from "@/components/aui/recipes/inline-disclosure";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { Loader } from "@/components/ui/loader";
import { useTranslation } from "@/i18n";
import { formatDuration, formatNumber } from "@/i18n/format";
import type { ChatMessage } from "@/types/chat";
import { getTraceElapsedMs } from "./assistant-trace-folding";

/**
 * The chain-of-thought header: the `reason` loader and the current activity
 * while the turn runs, a Brain mark and a one-line work summary once it ends.
 * Agents retry failed tool calls routinely, so a tool failure does not change
 * the header; it stays marked on its own row inside the history.
 */
export function AssistantTraceHeader({
  activity, isRunning, runFailed, history, timing,
}: {
  activity: string | null;
  isRunning: boolean;
  runFailed: boolean;
  history?: { id: string; open: boolean; toggle: () => void; stepCount: number };
  timing: Pick<ChatMessage, "startedAt" | "completedAt">;
}) {
  const { t } = useTranslation(["session", "ui"]);
  const elapsed = useElapsed(timing, isRunning);
  const glyph = isRunning
    ? <Loader aria-hidden cadence="reduced" size="xs" variant="reason" />
    : <Brain aria-hidden size={controlIconSizes.md} />;
  const label = isRunning
    ? activity ?? t("ui:thinking.thinking")
    : runFailed
      ? t("session:assistantTrace.completionLabel")
      : elapsed !== undefined
        ? t("session:assistantTrace.workedFor", { time: formatDuration(elapsed) })
        : t("session:assistantTrace.finished");
  const steps = history && history.stepCount > 0
    ? t("session:assistantTrace.foldedSteps", { count: history.stepCount, steps: formatNumber(history.stepCount) })
    : null;
  const content = (
    <>
      <InlineDisclosureIcon disclosure={Boolean(history)} open={history?.open ?? false}>{glyph}</InlineDisclosureIcon>
      <span
        className={sx(styles.label, isRunning && styles.running)}
        title={label}
        data-trace-streaming-part={isRunning ? "activity" : undefined}
        data-trace-streaming-label={isRunning ? "" : undefined}
      >
        {label}
      </span>
      {steps && !isRunning ? <span className={sx(styles.meta)}>{steps}</span> : null}
    </>
  );
  if (!history) {
    return <div className={sx(styles.header, styles.static)} data-trace-anchor="header">{content}</div>;
  }
  return (
    <Button
      layout="host"
      type="button"
      className="atelier-inline-disclosure-trigger"
      xstyle={[inlineDisclosure.trigger, controlHeights.sm, focusRing.ringInset, styles.header]}
      aria-controls={history.id}
      aria-expanded={history.open}
      onClick={history.toggle}
      data-trace-anchor="header"
    >
      {content}
    </Button>
  );
}

function useElapsed(timing: Pick<ChatMessage, "startedAt" | "completedAt">, isRunning: boolean) {
  const [nowMs, setNowMs] = useState(Date.now);
  const ticking = isRunning && Boolean(timing.startedAt) && !timing.completedAt;
  useEffect(() => {
    if (!ticking) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [ticking]);
  return getTraceElapsedMs(timing, ticking ? nowMs : undefined);
}

const styles = stylex.create({
  header: {
    color: vars["--aui-color-text"],
    flexWrap: "nowrap",
    fontSize: "0.875em",
    minWidth: 0,
  },
  static: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
  },
  label: {
    fontWeight: vars["--aui-font-weight-medium"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  running: {
    color: vars["--aui-color-text-muted"],
  },
  meta: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    marginInlineStart: "auto",
    whiteSpace: "nowrap",
  },
});
