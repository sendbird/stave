import { createContext, useContext, type ReactNode } from "react";
import { sx } from "@/components/aui/utils/stylex";
import { transcriptWideStyles as styles } from "./transcript-wide.styles";

/**
 * Whether a block drawn here sits at the top level of an assistant reply in
 * the transcript column, where a table may claim the wide measure. Off
 * everywhere else: user bubbles, the turn trace's rail, list items and quotes
 * are offset from the column, so a centred breakout there would land
 * off-axis.
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

/**
 * A table: in a reply's top level it grows past the column only as far as its
 * columns need, centred on the column's axis and capped by the wide measure
 * and the transcript's gutters; elsewhere it is drawn as-is. Code blocks,
 * diagrams and cards never take this path: they keep the column's edges and
 * scroll or scale inside them.
 */
export function TranscriptWideBlock(props: { children?: ReactNode }) {
  const wide = useContext(TranscriptWideContext);
  if (!wide) {
    return <>{props.children}</>;
  }
  return (
    <div className={sx(styles.lane)} data-transcript-wide="">
      <div className={sx(styles.breakout)}>{props.children}</div>
    </div>
  );
}
