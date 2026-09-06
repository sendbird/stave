import * as stylex from "@stylexjs/stylex";
import { sx } from "@/components/ads/utils/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import {
  attachClosestEdge,
  extractClosestEdge,
  type Edge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { DropIndicator } from "@atlaskit/pragmatic-drag-and-drop-react-drop-indicator/box";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { pointerOutsideOfPreview } from "@atlaskit/pragmatic-drag-and-drop/element/pointer-outside-of-preview";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

export type { Edge };

/**
 * Shared sortable-list plumbing on top of
 * `@atlaskit/pragmatic-drag-and-drop` (element adapter):
 *
 * - Rows never shift while dragging — the intended destination is shown as a
 *   thin closest-edge indicator line instead of sibling transforms.
 * - The native drag preview is a compact fixed-size chip (title + icon)
 *   rendered via `setCustomNativeDragPreview`, so the dragged row is never
 *   stretched or squished.
 * - Touch is handled by the native HTML drag-and-drop long-press gesture, so
 *   no custom long-press sensor is needed.
 */

const SORTABLE_ROW_TYPE = "stave-sortable-row";

interface SortableRowData extends Record<string | symbol, unknown> {
  type: typeof SORTABLE_ROW_TYPE;
  listId: string;
  itemId: string;
}

function makeSortableRowData(args: {
  listId: string;
  itemId: string;
}): SortableRowData {
  return {
    type: SORTABLE_ROW_TYPE,
    listId: args.listId,
    itemId: args.itemId,
  };
}

function isSortableRowData(
  data: Record<string | symbol, unknown>,
): data is SortableRowData {
  return (
    data.type === SORTABLE_ROW_TYPE &&
    typeof data.listId === "string" &&
    typeof data.itemId === "string"
  );
}

/** Compact fixed-size chip rendered as the native drag preview. */
function DragPreviewChip(props: { icon?: ReactNode; title: string }) {
  return (
    <div className={sx(styles.preview)}>
      {props.icon ? (
        <span className={sx(styles.icon)}>
          {props.icon}
        </span>
      ) : null}
      <span className={sx(styles.title)}>{props.title}</span>
    </div>
  );
}

export interface SortableRowPreview {
  title: string;
  icon?: ReactNode;
}

/**
 * Makes a row draggable and a closest-edge drop target within a named list.
 *
 * Attach `setRowElement` to the row wrapper (it should be `position:
 * relative` so the drop-indicator line can anchor to it) and, optionally,
 * `setHandleElement` to a child that should act as the drag handle. Render
 * `<SortableDropIndicator edge={closestEdge} />` while `closestEdge` is set.
 */
export function useSortableRow(args: {
  /** Discriminates lists so rows only accept drops from their own list. */
  listId: string;
  itemId: string;
  disabled?: boolean;
  /** Content of the fixed-size native drag preview chip. */
  preview: SortableRowPreview;
}) {
  const [rowElement, setRowElement] = useState<HTMLElement | null>(null);
  const [handleElement, setHandleElement] = useState<HTMLElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);

  // Read at drag time only — keeps the registration effect's dependency list
  // free of the (frequently re-created) preview content.
  const previewRef = useRef(args.preview);
  useEffect(() => {
    previewRef.current = args.preview;
  });

  const { listId, itemId, disabled } = args;

  useEffect(() => {
    if (!rowElement || disabled) {
      setIsDragging(false);
      setClosestEdge(null);
      return;
    }

    const updateClosestEdge = (data: Record<string | symbol, unknown>) => {
      const edge = extractClosestEdge(data);
      setClosestEdge((current) => (current === edge ? current : edge));
    };

    return combine(
      draggable({
        element: rowElement,
        dragHandle: handleElement ?? undefined,
        getInitialData: () => makeSortableRowData({ listId, itemId }),
        onGenerateDragPreview: ({ nativeSetDragImage }) => {
          setCustomNativeDragPreview({
            nativeSetDragImage,
            // Keep the chip just off the pointer so the closest-edge
            // indicator line stays visible while dragging.
            getOffset: pointerOutsideOfPreview({ x: "12px", y: "10px" }),
            render: ({ container }) => {
              const root = createRoot(container);
              flushSync(() =>
                root.render(
                  <DragPreviewChip
                    icon={previewRef.current.icon}
                    title={previewRef.current.title}
                  />,
                ),
              );
              return () => root.unmount();
            },
          });
        },
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
      }),
      dropTargetForElements({
        element: rowElement,
        canDrop: ({ source }) =>
          isSortableRowData(source.data) && source.data.listId === listId,
        getData: ({ input, element }) =>
          attachClosestEdge(makeSortableRowData({ listId, itemId }), {
            element,
            input,
            allowedEdges: ["top", "bottom"],
          }),
        onDragEnter: ({ self, source }) => {
          if (isSortableRowData(source.data) && source.data.itemId !== itemId) {
            updateClosestEdge(self.data);
          }
        },
        onDrag: ({ self, source }) => {
          if (isSortableRowData(source.data) && source.data.itemId !== itemId) {
            updateClosestEdge(self.data);
          }
        },
        onDragLeave: () => setClosestEdge(null),
        onDrop: () => setClosestEdge(null),
      }),
    );
  }, [rowElement, handleElement, disabled, listId, itemId]);

  return { setRowElement, setHandleElement, isDragging, closestEdge };
}

export interface SortableListDropEvent {
  listId: string;
  sourceId: string;
  targetId: string;
  /** Edge of the target row the pointer was closest to on drop. */
  closestEdge: Edge | null;
}

/**
 * Observes drops for one (or a family of) sortable lists and reports the
 * reorder intent. Registered once; callbacks always see the latest render's
 * values.
 */
export function useSortableListMonitor(args: {
  isListMatch: (listId: string) => boolean;
  onReorder: (event: SortableListDropEvent) => void;
}) {
  const argsRef = useRef(args);
  useEffect(() => {
    argsRef.current = args;
  });

  useEffect(() => {
    return monitorForElements({
      canMonitor: ({ source }) =>
        isSortableRowData(source.data) &&
        argsRef.current.isListMatch(source.data.listId),
      onDrop: ({ source, location }) => {
        const sourceData = source.data;
        if (!isSortableRowData(sourceData)) {
          return;
        }
        const target = location.current.dropTargets[0];
        if (!target) {
          return;
        }
        const targetData = target.data;
        if (
          !isSortableRowData(targetData) ||
          targetData.listId !== sourceData.listId ||
          targetData.itemId === sourceData.itemId
        ) {
          return;
        }
        argsRef.current.onReorder({
          listId: sourceData.listId,
          sourceId: sourceData.itemId,
          targetId: targetData.itemId,
          closestEdge: extractClosestEdge(targetData),
        });
      },
    });
  }, []);
}

const DROP_INDICATOR_THEME_STYLE = {
  // The Atlaskit drop indicator colors its line with the ADS token
  // `--ds-border-selected` (falling back to a hard-coded Atlassian blue).
  // Map it to the app's primary color; custom properties inherit through
  // `display: contents`, so this wrapper adds no box of its own.
  "--ds-border-selected": "var(--primary)",
} as CSSProperties;

/**
 * Thin closest-edge drop-indicator line, themed to the app's primary color.
 * The parent row must be `position: relative`.
 */
export function SortableDropIndicator(props: { edge: Edge; gap?: string }) {
  return (
    <span className={sx(styles.indicator)} style={DROP_INDICATOR_THEME_STYLE}>
      <DropIndicator
        edge={props.edge}
        gap={props.gap ?? "0px"}
        type="no-terminal"
      />
    </span>
  );
}

const styles = stylex.create({
preview: {display:"flex",maxWidth:240,alignItems:"center",gap:6,borderRadius:6,borderWidth:1,borderStyle:"solid",borderColor:vars.colorBorder,backgroundColor:vars.colorSurfaceRaised,paddingInline:10,paddingBlock:6,fontSize:12,fontWeight:500,color:vars.colorText,boxShadow:vars.elevationLift},
icon: {display:"flex",width:16,height:16,flexShrink:0,alignItems:"center",justifyContent:"center",color:vars.colorTextMuted},
title: {overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},
indicator: {display:"contents"}
});
