import { useTranslation } from "@/i18n";
import { type LucideIcon } from "lucide-react";
import { WORK_STATE, type WorkState } from "@/components/ads/components/state-vocabulary";
import { sx, type XstyleProp } from "@/components/ads/utils/stylex";
import type { StageTone } from "@/lib/agent-runs/agent-run-view";
import { agentRunStyles as styles } from "./agent-runs.styles";

/** The shared work state each stage tone stands for (`state-vocabulary.ts`). */
export const STAGE_TONE_WORK_STATE: Record<StageTone, WorkState> = {
  done: "ready",
  active: "working",
  waiting: "needs-you",
  attention: "needs-you", // blocked or stuck: the user decides next
  idle: "queued",
  skipped: "skipped",
};

export const STAGE_TONE_STYLES = {
  done: styles.toneDone,
  active: styles.toneActive,
  waiting: styles.toneWaiting,
  attention: styles.toneAttention,
  idle: styles.toneIdle,
  skipped: styles.toneSkipped,
} as const;

/** An icon for a stage tone. Always paired with text by the caller. */
export function StageStatusIcon({
  tone,
  icon,
  state,
  xstyle,
}: {
  tone: StageTone;
  /** Replaces the tone's glyph, keeping its color. */
  icon?: LucideIcon;
  /** The work state whose glyph to draw, when the tone alone is not specific enough (stopped). */
  state?: WorkState;
} & XstyleProp) {
  useTranslation();
  const Icon = icon ?? WORK_STATE[state ?? STAGE_TONE_WORK_STATE[tone]].icon;
  return <Icon aria-hidden className={sx(styles.icon, STAGE_TONE_STYLES[tone], xstyle)} />;
}
