import { createContext, useContext, type ReactNode } from "react";
import { sx } from "@/components/aui/utils/stylex";
import { transcriptWideStyles as styles } from "./transcript-wide.styles";

/**
 * Whether a block drawn here sits at the top level of an assistant reply in
 * the transcript column, where code, tables and diffs may claim the wide
 * measure. Off everywhere else: user bubbles, the turn trace's rail, list
 * items and quotes are offset from the column, so a centred breakout there
 * would land off-axis.
 */
const TranscriptWideContext = createContext(false);

export function TranscriptWideScope(props: {
  enabled: boolean;
  children?: ReactNode;
}) {
  return (
    <TranscriptWideContext.Provider value={props.enabled}>
      {props.children}
    </TranscriptWideContext.Provider>
  );
}

/** A code block, table or diff: wide in a reply's top level, as-is elsewhere. */
export function TranscriptWideBlock(props: { children?: ReactNode }) {
  const wide = useContext(TranscriptWideContext);
  if (!wide) {
    return <>{props.children}</>;
  }
  return (
    <div className={sx(styles.breakout)} data-transcript-wide="">
      {props.children}
    </div>
  );
}
