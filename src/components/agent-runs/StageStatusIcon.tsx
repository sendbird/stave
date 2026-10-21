import { useTranslation } from "@/i18n";
import { type LucideIcon } from "lucide-react";
import { StateMark } from "@/components/ads/components/StateMark";
import type { WorkState } from "@/components/ads/components/state-vocabulary";
import type { XstyleProp } from "@/components/ads/utils/stylex";
import type { StageTone } from "@/lib/agent-runs/agent-run-view";

/** The shared work state each stage tone stands for (`state-vocabulary.ts`). */
export const STAGE_TONE_WORK_STATE: Record<StageTone, WorkState> = {
  done: "ready",
  active: "working",
  waiting: "needs-you",
  attention: "halted", // blocked or stuck: nothing continues until the user acts
  idle: "queued",
  skipped: "skipped",
};

/**
 * The mark of a stage tone, drawn by `StateMark` in its state's color. Always
 * paired with text by the caller. It holds still: the run line and the stage
 * rows show activity in their text, so one thing moves.
 */
export function StageStatusIcon({
  tone,
  icon,
  state,
  xstyle,
}: {
  tone: StageTone;
  /** Replaces the state's glyph, keeping its color. */
  icon?: LucideIcon;
  /** The work state to draw, when the tone alone is not specific enough (stopped). */
  state?: WorkState;
} & XstyleProp) {
  useTranslation();
  return <StateMark state={state ?? STAGE_TONE_WORK_STATE[tone]} icon={icon} motion="still" xstyle={xstyle} />;
}
