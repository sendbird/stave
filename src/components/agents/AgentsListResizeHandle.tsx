import { useTranslation } from "@/i18n";
import { useRef, type CSSProperties, type RefObject } from "react";
import { PanelResizeHandle } from "@/components/layout/PanelResizeHandle";
import { useAppStore } from "@/store/app.store";
import {
  AGENTS_LIST_DEFAULT_WIDTH,
  AGENTS_LIST_MAX_WIDTH,
  AGENTS_LIST_MIN_WIDTH,
} from "@/store/layout.utils";
import { agentStyles } from "./agents.styles";

/** The Agents tab's grid reads the list column from this variable (`agentStyles.tabResizable`). */
const AGENTS_LIST_WIDTH_VAR = "--agents-list-width";
/** The list never narrows the detail beside it below this; the grid's `clamp()` says the same. */
const AGENTS_DETAIL_MIN_WIDTH = 512;

/** The saved list width as the variable the tab's grid reads. */
export function useAgentsListWidthStyle(): CSSProperties {
  const width = useAppStore((state) => state.layout.agentsListWidth);
  return { [AGENTS_LIST_WIDTH_VAR]: `${width}px` } as CSSProperties;
}

/**
 * The drag handle on the Agents list's edge. A drag moves the column through
 * the variable on the tab directly, so the tab and its editor do not
 * re-render on every pointer move, and the width is saved to the layout once,
 * when the drag ends. A double-click puts the list back to its default width.
 */
export function AgentsListResizeHandle({
  tabRef,
  listRef,
}: {
  tabRef: RefObject<HTMLDivElement | null>;
  listRef: RefObject<HTMLElement | null>;
}) {
  useTranslation();
  const setLayout = useAppStore((state) => state.setLayout);
  const draggedWidth = useRef<number | null>(null);
  return (
    <PanelResizeHandle
      xstyle={agentStyles.listResizer}
      // The list as drawn, which a narrow tab may hold under the saved width.
      width={() => listRef.current?.offsetWidth ?? AGENTS_LIST_DEFAULT_WIDTH}
      clamp={(next) => {
        const tabWidth = tabRef.current?.offsetWidth ?? Number.POSITIVE_INFINITY;
        return Math.round(
          Math.max(
            AGENTS_LIST_MIN_WIDTH,
            Math.min(AGENTS_LIST_MAX_WIDTH, tabWidth - AGENTS_DETAIL_MIN_WIDTH - 1, next),
          ),
        );
      }}
      onResize={(next) => {
        draggedWidth.current = next;
        tabRef.current?.style.setProperty(AGENTS_LIST_WIDTH_VAR, `${next}px`);
      }}
      onResizeEnd={() => {
        if (draggedWidth.current !== null) {
          setLayout({ patch: { agentsListWidth: draggedWidth.current } });
        }
        draggedWidth.current = null;
      }}
      onReset={() => setLayout({ patch: { agentsListWidth: AGENTS_LIST_DEFAULT_WIDTH } })}
    />
  );
}
