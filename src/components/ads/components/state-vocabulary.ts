import {
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleHelp,
  CircleMinus,
  CircleX,
  Hand,
  ShieldQuestion,
  Square,
  type LucideIcon,
} from "lucide-react";
import type { StatusDotTone } from "./StatusDot";

/**
 * The one vocabulary for the state of agent work. Every surface that shows
 * state (`StatusDot`, the tool-run states in `agent-state.ts`, Fleet cards,
 * agent run and agent-run badges) reads its glyph, tone and word from here, so a
 * state never wears two shapes. The glyph is the redundant non-color cue: a
 * color-blind reader tells the states apart by shape alone.
 *
 * Only `working` moves. It is the one state with ongoing activity; every other
 * state is a settled shape, and reduced motion keeps the shape.
 */
export type WorkState =
  | "working"
  | "needs-you"
  | "approval"
  | "ready"
  | "failed"
  | "stopped"
  | "queued"
  | "idle"
  | "skipped"
  | "unknown";

export interface WorkStateVisual {
  label: string;
  /** The static glyph. `working` shows an activity mark instead where one fits. */
  icon: LucideIcon;
  tone: StatusDotTone;
  /** Only the working state pulses. */
  pulses: boolean;
}

export const WORK_STATE: Readonly<Record<WorkState, WorkStateVisual>> = {
  working: { label: "Working", icon: CircleDot, tone: "accent", pulses: true },
  "needs-you": { label: "Needs you", icon: Hand, tone: "warning", pulses: false },
  approval: { label: "Awaiting approval", icon: ShieldQuestion, tone: "warning", pulses: false },
  ready: { label: "Ready", icon: CircleCheck, tone: "success", pulses: false },
  failed: { label: "Failed", icon: CircleX, tone: "danger", pulses: false },
  stopped: { label: "Stopped", icon: Square, tone: "neutral", pulses: false },
  queued: { label: "Queued", icon: CircleDashed, tone: "neutral", pulses: false },
  idle: { label: "Idle", icon: CircleDashed, tone: "muted", pulses: false },
  skipped: { label: "Skipped", icon: CircleMinus, tone: "neutral", pulses: false },
  unknown: { label: "Unknown", icon: CircleHelp, tone: "muted", pulses: false },
};

export const WORK_STATES = Object.keys(WORK_STATE) as readonly WorkState[];
