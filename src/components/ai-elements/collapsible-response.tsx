import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import { collapsibleResponseStyles as styles } from "./collapsible-response.styles";
import { shouldCollapseResponse } from "./collapsible-response.utils";
import { MessageResponse } from "./message";
import { MESSAGE_BODY_LINE_HEIGHT } from "./message-styles";
import {
  MessageTextScaleContext,
  scaleMessageFontSize,
} from "./message-text-scale";

/**
 * An answer quoted outside the conversation — a run's final answer, a
 * subagent's answer or assignment — rendered by the conversation's own
 * Markdown renderer at the panel scale. A long one opens collapsed behind
 * "Show all", so the panel leads with the start of the answer and the rows
 * after it stay in reach.
 */
export function CollapsibleResponse(props: {
  text: string;
  /** Names what "Show all" expands, for assistive technology. */
  label?: string;
}) {
  const collapsible = useMemo(
    () => shouldCollapseResponse(props.text),
    [props.text],
  );
  const [expanded, setExpanded] = useState(false);
  const bodyId = useId();
  // Set here rather than trusted to the renderer: outside `MessageContent`
  // the body would otherwise inherit whatever its host panel uses.
  const fontSize = scaleMessageFontSize(
    "panel",
    useAppStore((state) => state.settings.messageFontSize),
  );
  const collapsed = collapsible && !expanded;
  return (
    <MessageTextScaleContext.Provider value="panel">
      <div className={sx(styles.root)}>
        <div
          id={bodyId}
          className={sx(styles.body, collapsed && styles.bodyCollapsed)}
          style={{ fontSize: `${fontSize}px`, lineHeight: MESSAGE_BODY_LINE_HEIGHT }}
          data-collapsed={collapsed ? "true" : undefined}
        >
          <MessageResponse>{props.text}</MessageResponse>
        </div>
        {collapsible ? (
          <Button
            size="xs"
            variant="quiet"
            aria-expanded={expanded}
            aria-controls={bodyId}
            aria-label={
              props.label
                ? `${expanded ? "Show less of" : "Show all of"} ${props.label}`
                : undefined
            }
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Show less" : "Show all"}
          </Button>
        ) : null}
      </div>
    </MessageTextScaleContext.Provider>
  );
}
