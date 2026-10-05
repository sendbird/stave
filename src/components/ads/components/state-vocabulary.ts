import { i18n } from "@/i18n";
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
  working: { get label() { return i18n.t("ui:stateVocabulary.working"); }, icon: CircleDot, tone: "accent", pulses: true },
  "needs-you": { get label() { return i18n.t("ui:stateVocabulary.needsYou"); }, icon: Hand, tone: "warning", pulses: false },
  approval: { get label() { return i18n.t("ui:stateVocabulary.awaitingApproval"); }, icon: ShieldQuestion, tone: "warning", pulses: false },
  ready: { get label() { return i18n.t("ui:stateVocabulary.ready"); }, icon: CircleCheck, tone: "success", pulses: false },
  failed: { get label() { return i18n.t("ui:stateVocabulary.failed"); }, icon: CircleX, tone: "danger", pulses: false },
  stopped: { get label() { return i18n.t("ui:stateVocabulary.stopped"); }, icon: Square, tone: "neutral", pulses: false },
  queued: { get label() { return i18n.t("ui:stateVocabulary.queued"); }, icon: CircleDashed, tone: "neutral", pulses: false },
  idle: { get label() { return i18n.t("ui:stateVocabulary.idle"); }, icon: CircleDashed, tone: "muted", pulses: false },
  skipped: { get label() { return i18n.t("ui:stateVocabulary.skipped"); }, icon: CircleMinus, tone: "neutral", pulses: false },
  unknown: { get label() { return i18n.t("ui:stateVocabulary.unknown"); }, icon: CircleHelp, tone: "muted", pulses: false },
};

export const WORK_STATES = Object.keys(WORK_STATE) as readonly WorkState[];
