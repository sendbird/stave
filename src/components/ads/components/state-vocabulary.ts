import { i18n } from "@/i18n";
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleHelp,
  CirclePause,
  CircleMinus,
  CircleX,
  Clock,
  Hand,
  ShieldQuestion,
  Square,
  type LucideIcon,
} from "lucide-react";
import type { StatusDotTone } from "./StatusDot";

/**
 * The one vocabulary for the state of agent work. Every surface that shows
 * state reads its glyph, color and word from here, so a state never wears two
 * shapes: `StateMark` draws it (Fleet rows and the inbox, run badges and run
 * lines, task tab and task panel marks, sidebar needs and task rows), and
 * `StatusDot` and the tool-run states in `agent-state.ts` take its tone. The glyph is the redundant non-color cue: a
 * color-blind reader tells the states apart by shape alone.
 *
 * Only `working` moves. It is the one state with ongoing activity: `StateMark`
 * turns a short arc round its ring, in the running state color. Every other
 * state is a settled shape, and reduced motion settles `working` on its glyph.
 * The working state's color is the state color; the run line and the sidebar
 * row draw who is working instead, in the provider's color, with their own
 * loaders (`AgentRunMark`).
 */
export type WorkState =
  | "waiting"
  | "working"
  | "needs-you"
  | "approval"
  | "paused"
  | "halted"
  | "ready"
  | "failed"
  | "stopped"
  | "queued"
  | "idle"
  | "skipped"
  | "unknown";

/**
 * The color a state is drawn in. The agent states use their theme state
 * colors (`--state-*`, see `src/lib/themes/state-colors.ts`), so running and
 * needing an answer never share a hue even where a theme's accent and warning
 * do; failed keeps the destructive role; the rest stay quiet text.
 */
export type WorkStateColor =
  | "running"
  | "needsAnswer"
  | "paused"
  | "halted"
  | "completed"
  | "stopped"
  | "failed"
  | "subtle"
  | "muted";

export interface WorkStateVisual {
  label: string;
  /** The static glyph. `working` shows an activity mark instead where one fits. */
  icon: LucideIcon;
  /** The ADS tone, for ADS components that take one (`StatusDot`, `Badge`). */
  tone: StatusDotTone;
  color: WorkStateColor;
  /** Only the working state moves (`StateMark` turns an arc round its ring). */
  pulses: boolean;
}

export const WORK_STATE: Readonly<Record<WorkState, WorkStateVisual>> = {
  // Waiting for an event or a time; a pause is the user's, and wears the pause glyph.
  waiting: { get label() { return i18n.t("ui:stateVocabulary.waiting"); }, icon: Clock, tone: "neutral", color: "subtle", pulses: false },
  working: { get label() { return i18n.t("ui:stateVocabulary.working"); }, icon: CircleDot, tone: "accent", color: "running", pulses: true },
  "needs-you": { get label() { return i18n.t("ui:stateVocabulary.needsYou"); }, icon: Hand, tone: "warning", color: "needsAnswer", pulses: false },
  approval: { get label() { return i18n.t("ui:stateVocabulary.awaitingApproval"); }, icon: ShieldQuestion, tone: "warning", color: "needsAnswer", pulses: false },
  paused: { get label() { return i18n.t("ui:stateVocabulary.paused"); }, icon: CirclePause, tone: "neutral", color: "paused", pulses: false },
  // Stopped short of the goal with no automatic continuation; not ended.
  halted: { get label() { return i18n.t("ui:stateVocabulary.halted"); }, icon: CircleAlert, tone: "warning", color: "halted", pulses: false },
  ready: { get label() { return i18n.t("ui:stateVocabulary.ready"); }, icon: CircleCheck, tone: "success", color: "completed", pulses: false },
  failed: { get label() { return i18n.t("ui:stateVocabulary.failed"); }, icon: CircleX, tone: "danger", color: "failed", pulses: false },
  stopped: { get label() { return i18n.t("ui:stateVocabulary.stopped"); }, icon: Square, tone: "neutral", color: "stopped", pulses: false },
  queued: { get label() { return i18n.t("ui:stateVocabulary.queued"); }, icon: CircleDashed, tone: "neutral", color: "subtle", pulses: false },
  idle: { get label() { return i18n.t("ui:stateVocabulary.idle"); }, icon: CircleDashed, tone: "muted", color: "muted", pulses: false },
  skipped: { get label() { return i18n.t("ui:stateVocabulary.skipped"); }, icon: CircleMinus, tone: "neutral", color: "subtle", pulses: false },
  unknown: { get label() { return i18n.t("ui:stateVocabulary.unknown"); }, icon: CircleHelp, tone: "muted", color: "muted", pulses: false },
};

export const WORK_STATES = Object.keys(WORK_STATE) as readonly WorkState[];
