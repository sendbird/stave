import { i18n } from "@/i18n";
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as stylex from "@stylexjs/stylex";
import { useSideQuestionComposerControl } from "@/components/session/side-chat/use-side-question-composer-control";
import {
  COMPOSER_CONTROL_LABELS,
  composerControlIsIconOnly,
  type ComposerControlId,
} from "@/lib/composer-controls";
import {
  COMPOSER_SIDE_QUESTION_SLOT,
  fitComposerToolbar,
} from "@/lib/composer-toolbar-fit";
import { sx } from "../ads/utils/stylex";
import type { ComposerControlMenuItem } from "./composer-control-menu";

/** Used for a control that has never been on the row (it arrived folded). */
const UNMEASURED_CONTROL_PX = 96;
/** The `⋯` trigger before it has been measured: an `icon` button. */
const UNMEASURED_TRAY_PX = 36;
/** The side question as a bare glyph before it has been measured. */
const UNMEASURED_COMPACT_PX = 40;
const COMPACT_KEY = (id: string) => `${id}:compact`;

const slotStyles = stylex.create({
  // A measuring hook, not a box: the lane rules still reach the control.
  slot: { display: "contents" },
});

/**
 * Marks one toolbar control so the fit can measure it. `display: contents`
 * keeps the control a direct flex item of the lane.
 */
export function ComposerToolbarSlot(props: { id: string; children: ReactNode }) {
  return (
    <span className={sx(slotStyles.slot)} data-composer-toolbar-slot={props.id}>
      {props.children}
    </span>
  );
}

function findSlot(row: HTMLElement, id: string) {
  return row.querySelector<HTMLElement>(`[data-composer-toolbar-slot="${id}"]`);
}

function slotWidth(row: HTMLElement, id: string): number | null {
  const slot = findSlot(row, id);
  if (!slot) {
    return null;
  }
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  for (const child of Array.from(slot.children)) {
    const rect = child.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      continue;
    }
    left = Math.min(left, rect.left);
    right = Math.max(right, rect.right);
  }
  return right > left ? right - left : 0;
}

function gapOf(element: Element | null): number {
  if (!element) {
    return 0;
  }
  const value = Number.parseFloat(getComputedStyle(element).columnGap);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Keeps the classic composer's control row on one line by moving the controls
 * that do not fit into the `⋯` menu (see `fitComposerToolbar`). Returns the row
 * ref, the toolbar controls that left the row, the menu items for them, and
 * the side question action while it still fits beside Attach and Send.
 */
export function useComposerToolbarFit(args: {
  /** Only the classic in-card row folds; the framed wings have their own room. */
  enabled: boolean;
  toolbarIds: readonly ComposerControlId[];
  nodes: Partial<Record<ComposerControlId, ReactNode>>;
  /** Controls the user demoted: the `⋯` is on the row whatever fits. */
  demotedCount: number;
  activeIds: readonly ComposerControlId[];
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const widthsRef = useRef(new Map<string, number>());
  // "collapsed ids|compacted ids": one state, so a fit lands in one render.
  const [fitKey, setFitKey] = useState("|");
  const [collapsedKey, compactedKey] = fitKey.split("|") as [string, string];
  const sideQuestionCompact = compactedKey.split(" ").includes(COMPOSER_SIDE_QUESTION_SLOT);
  const sideQuestion = useSideQuestionComposerControl({ iconOnly: sideQuestionCompact });
  const itemIds = useMemo(
    () => [
      ...args.toolbarIds.filter((id) => Boolean(args.nodes[id])),
      ...(sideQuestion ? [COMPOSER_SIDE_QUESTION_SLOT] : []),
    ],
    [args.toolbarIds, args.nodes, sideQuestion],
  );
  const itemKey = itemIds.join(" ");
  const activeKey = args.activeIds.join(" ");
  const inputsRef = useRef({ itemIds, demotedCount: args.demotedCount, activeIds: args.activeIds });
  inputsRef.current = { itemIds, demotedCount: args.demotedCount, activeIds: args.activeIds };

  const measure = useCallback(() => {
    const row = rowRef.current;
    if (!row) {
      return;
    }
    const availableWidth = row.clientWidth;
    if (availableWidth <= 0) {
      return;
    }
    const widths = widthsRef.current;
    const { itemIds: ids, demotedCount, activeIds } = inputsRef.current;
    for (const id of [...ids, "model"]) {
      const width = slotWidth(row, id);
      if (width != null && width > 0) {
        // A control drawn without its label marks itself `data-compact`.
        const compact = findSlot(row, id)?.querySelector('[data-compact="true"]') != null;
        widths.set(compact ? COMPACT_KEY(id) : id, width);
      }
    }
    const tray = row.querySelector<HTMLElement>('[data-composer-tray-trigger="true"]');
    if (tray) {
      widths.set("tray", tray.getBoundingClientRect().width);
    }
    const lane = row.querySelector<HTMLElement>('[data-composer-toolbar="true"]');
    const actions = row.querySelector<HTMLElement>("[data-composer-toolbar-actions]");
    const laneGap = gapOf(lane);
    const sideQuestionOnRow = slotWidth(row, COMPOSER_SIDE_QUESTION_SLOT);
    const actionsWidth =
      (actions?.getBoundingClientRect().width ?? 0) -
      (sideQuestionOnRow ? sideQuestionOnRow + gapOf(actions) : 0);
    const fit = fitComposerToolbar({
      availableWidth,
      fixedWidth: (widths.get("model") ?? 0) + gapOf(row) + actionsWidth,
      gap: laneGap,
      items: ids.map((id) => ({
        id,
        width: widths.get(id) ?? UNMEASURED_CONTROL_PX,
        ...(id === COMPOSER_SIDE_QUESTION_SLOT
          ? { compactWidth: widths.get(COMPACT_KEY(id)) ?? UNMEASURED_COMPACT_PX }
          : {}),
      })),
      trayWidth: widths.get("tray") ?? UNMEASURED_TRAY_PX,
      trayAlwaysShown: demotedCount > 0,
      activeIds,
    });
    const next = `${fit.collapsed.join(" ")}|${fit.compacted.join(" ")}`;
    setFitKey((current) => (current === next ? current : next));
  }, []);

  // Before paint, so a narrow column never shows the wrapped or clipped row.
  useLayoutEffect(() => {
    if (!args.enabled) {
      setFitKey("|");
      return;
    }
    measure();
  }, [args.enabled, itemKey, activeKey, args.demotedCount, fitKey, measure]);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!args.enabled || !row || typeof ResizeObserver === "undefined") {
      return;
    }
    // The row's width, and the natural width of whatever is on it (a longer
    // model name, a control that changed its label).
    const observer = new ResizeObserver(() => measure());
    observer.observe(row);
    for (const element of row.querySelectorAll(
      "[data-composer-toolbar-slot] > *, [data-composer-toolbar-actions]",
    )) {
      observer.observe(element);
    }
    return () => observer.disconnect();
  }, [args.enabled, itemKey, fitKey, measure]);

  const collapsedIds = useMemo(
    () => new Set(collapsedKey ? collapsedKey.split(" ") : []),
    [collapsedKey],
  );
  const sideQuestionCollapsed = collapsedIds.has(COMPOSER_SIDE_QUESTION_SLOT);
  const overflowItems = useMemo<ComposerControlMenuItem[]>(
    () =>
      itemIds
        .filter((id) => collapsedIds.has(id))
        .map((id) =>
          id === COMPOSER_SIDE_QUESTION_SLOT
            ? { id, label: i18n.t("session:sideChat.title"), node: sideQuestion }
            : {
                id,
                label: COMPOSER_CONTROL_LABELS[id as ComposerControlId],
                node: args.nodes[id as ComposerControlId],
                iconOnly: composerControlIsIconOnly(id as ComposerControlId),
              },
        ),
    [itemIds, collapsedIds, sideQuestion, args.nodes],
  );

  return {
    rowRef,
    collapsedIds: collapsedIds as ReadonlySet<string>,
    overflowItems,
    sideQuestion: sideQuestionCollapsed ? null : sideQuestion,
    sideQuestionCompact,
  };
}
