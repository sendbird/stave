import { useTranslation } from "@/i18n";
import { type LucideIcon } from "lucide-react";
import { StateMark } from "@/components/ads/components/StateMark";
import type { WorkState } from "@/components/ads/components/state-vocabulary";
import type { XstyleProp } from "@/components/ads/utils/stylex";
import type { StageState } from "@/lib/agent-runs/agent-run-view";

/** The shared work state each stage tone stands for (`state-vocabulary.ts`). */
export const STAGE_STATE_WORK_STATE: Record<StageState, WorkState> = {
  done: "ready",
  active: "working",
  waiting: "needs-you",
  attention: "halted", // blocked or stuck: nothing continues until the user acts
  idle: "queued",
  skipped: "skipped",
};

/**
 * The mark of a stage tone, drawn by `StateMark` in its state's color. Always
 * paired with text by the caller. It holds still in stage rows and cards, which
 * show activity in their text; the composer's run line passes `moving` so a
 * working run turns the arc round its working ring.
 */
export function StageStatusIcon({
  tone,
  icon,
  state,
  moving = false,
  xstyle,
}: {
  tone: StageState;
  /** Replaces the state's glyph, keeping its color. */
  icon?: LucideIcon;
  /** The work state to draw, when the tone alone is not specific enough (stopped). */
  state?: WorkState;
  /** Draws a working stage with its moving ring. */
  moving?: boolean;
} & XstyleProp) {
  useTranslation();
  return <StateMark state={state ?? STAGE_STATE_WORK_STATE[tone]} icon={icon} motion={moving ? "moving" : "still"} xstyle={xstyle} />;
}
