import { createContext, useContext } from "react";
import { DEFAULT_TARS_TRANSCRIPT_LAYOUT, type TarsRecordStyle, type TarsTranscriptLayout } from "@/lib/tars/transcript-layout";

/**
 * The transcript layout the Tars view renders. The app never provides it, so
 * it is the default; the development gallery provides the option under review.
 */
export const TarsTranscriptLayoutContext = createContext<TarsTranscriptLayout>(DEFAULT_TARS_TRANSCRIPT_LAYOUT);

export function useTarsTranscriptLayout(): TarsTranscriptLayout {
  return useContext(TarsTranscriptLayoutContext);
}

/**
 * The record style rows and lists draw in. The conversation provides it
 * around its transcript only, so records elsewhere (the side view, the tray)
 * keep the default whatever the transcript shows.
 */
export const TarsRecordStyleContext = createContext<TarsRecordStyle>("current");

/** The record style in effect: an explicit `variant` wins over the surrounding transcript's. */
export function useTarsRecordStyle(variant?: TarsRecordStyle): TarsRecordStyle {
  const inherited = useContext(TarsRecordStyleContext);
  return variant ?? inherited;
}
