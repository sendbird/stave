import * as stylex from "@stylexjs/stylex";
import type { ConversationWidth } from "@/store/app-settings";
import { useAppStore } from "@/store/app.store";
import { transcriptMeasure } from "./transcript-measure.stylex";

/*
 * The conversation width scale, shared by the task chat and Tars.
 *
 * The column steps up with the conversation surface's own width, not the
 * window's: a side panel, the Tars tray or a split pane leaves less room, and
 * the column should follow the room it actually has. Below the first step the
 * column is the surface minus its gutters, so a narrow surface never shows a
 * cap. Each step adds 4rem (2rem a side) to the default column; the wide
 * measure for tables and diagrams is always the column plus 8rem.
 *
 * | surface width | narrow | default | wide |
 * | below 64rem   | 44rem  | 48rem   | 56rem |
 * | 64rem–90rem   | 46rem  | 52rem   | 64rem |
 * | 90rem and up  | 48rem  | 56rem   | 72rem |
 *
 * The container is the surface that holds both the transcript and its
 * composer, so the two always take the same step. A container query cannot
 * style the container itself, so the theme goes on an element inside it.
 */
const STEP_REGULAR = "@container stave-transcript (min-width: 64rem)";
const STEP_LARGE = "@container stave-transcript (min-width: 90rem)";

export const transcriptWidthStyles = stylex.create({
  surface: {
    containerName: "stave-transcript",
    containerType: "inline-size",
  },
});

const narrow = stylex.createTheme(transcriptMeasure, {
  "--stave-transcript-column": { default: "44rem", [STEP_REGULAR]: "46rem", [STEP_LARGE]: "48rem" },
  "--stave-transcript-wide": { default: "52rem", [STEP_REGULAR]: "54rem", [STEP_LARGE]: "56rem" },
});

const standard = stylex.createTheme(transcriptMeasure, {
  "--stave-transcript-column": { default: "48rem", [STEP_REGULAR]: "52rem", [STEP_LARGE]: "56rem" },
  "--stave-transcript-wide": { default: "56rem", [STEP_REGULAR]: "60rem", [STEP_LARGE]: "64rem" },
});

const wide = stylex.createTheme(transcriptMeasure, {
  "--stave-transcript-column": { default: "56rem", [STEP_REGULAR]: "64rem", [STEP_LARGE]: "72rem" },
  "--stave-transcript-wide": { default: "64rem", [STEP_REGULAR]: "72rem", [STEP_LARGE]: "80rem" },
});

export const transcriptWidthThemes = { narrow, default: standard, wide } as const satisfies Record<ConversationWidth, unknown>;

/** The width theme for the reader's chosen conversation width; put it inside a `transcriptWidthStyles.surface`. */
export function useTranscriptWidthTheme() {
  const width = useAppStore((state) => state.settings.conversationWidth);
  return transcriptWidthThemes[width] ?? transcriptWidthThemes.default;
}
