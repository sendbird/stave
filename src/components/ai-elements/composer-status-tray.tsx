import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Ellipsis } from "lucide-react";
import { statusTrayStyles } from "./composer-status-tray.styles";
import { sx } from "../ads/utils/stylex";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui";
import { ComposerControlDensityProvider } from "@/components/ai-elements/composer-control-density";
import {
  COMPOSER_CONTROL_MENU_CONTENT,
  ComposerControlMenuList,
  type ComposerControlMenuItem,
} from "@/components/ai-elements/composer-control-menu";

/** The shelf tray always knows whether a control is a bare glyph. */
export interface ComposerStatusTrayItem extends ComposerControlMenuItem {
  iconOnly: boolean;
}

/** Used only before the row has ever been measured. */
const STATUS_TRAY_ITEM_ESTIMATE_PX = 96;
/** Gap kept between the workspace line and the control row. */
const STATUS_TRAY_ROW_GAP_PX = 12;

/**
 * Whether the status bar is too narrow to keep its controls on the row.
 *
 * The trigger is the workspace line being squeezed rather than an arbitrary
 * width: the controls fold away exactly when the branch name would start
 * truncating. `leadingWidthPx` is that line's natural, unclipped width, which
 * does not change when the row folds — so the decision cannot oscillate.
 */
export function shouldCollapseStatusTray(args: {
  innerWidthPx: number;
  leadingWidthPx: number;
  /** Natural width of the labelled row; `null` until it has been measured. */
  rowWidthPx: number | null;
  itemCount: number;
}): boolean {
  if (args.itemCount === 0) {
    return false;
  }
  const rowWidthPx =
    args.rowWidthPx ?? args.itemCount * STATUS_TRAY_ITEM_ESTIMATE_PX;
  return (
    args.leadingWidthPx + STATUS_TRAY_ROW_GAP_PX + rowWidthPx >
    args.innerWidthPx
  );
}

/**
 * The width the workspace line wants, whether or not it currently gets it.
 *
 * The line is content-sized, so its own box gives the width when there is room;
 * when it is being squeezed, each truncating span still reports its full text
 * in `scrollWidth`, and the shortfall adds back up to the same number. That
 * makes the measurement independent of whether the tray is currently folded.
 */
function measureLeadingNaturalWidth(bar: HTMLElement): number {
  const leading = bar.querySelector<HTMLElement>(
    '[data-composer-status-leading="true"]',
  );
  if (!leading) {
    return 0;
  }
  let clipped = 0;
  for (const node of leading.querySelectorAll<HTMLElement>(".truncate")) {
    clipped += Math.max(0, node.scrollWidth - node.clientWidth);
  }
  return leading.clientWidth + clipped;
}

function useStatusTrayCollapsed(itemCount: number): {
  ref: (node: HTMLElement | null) => void;
  collapsed: boolean;
} {
  // Starts expanded so a server-rendered bar is the full row; the first layout
  // pass corrects it before paint matters.
  const [collapsed, setCollapsed] = useState(false);
  const nodeRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const mutationObserverRef = useRef<MutationObserver | null>(null);
  const itemCountRef = useRef(itemCount);
  itemCountRef.current = itemCount;
  // The labelled row only exists while expanded, so its width is remembered:
  // the decision to fold has to be reversible from the folded state.
  const rowWidthRef = useRef<number | null>(null);

  const measure = useCallback(() => {
    const bar = nodeRef.current?.closest<HTMLElement>(
      '[data-composer-frame-status-bar="true"]',
    );
    if (!bar) {
      return;
    }
    const style = getComputedStyle(bar);
    const innerWidthPx =
      bar.clientWidth -
      Number.parseFloat(style.paddingLeft || "0") -
      Number.parseFloat(style.paddingRight || "0");
    if (innerWidthPx <= 0) {
      return;
    }
    const row = nodeRef.current?.querySelector<HTMLElement>(
      '[data-composer-status-row="true"]',
    );
    if (row) {
      rowWidthRef.current = row.scrollWidth;
    }
    setCollapsed(
      shouldCollapseStatusTray({
        innerWidthPx,
        leadingWidthPx: measureLeadingNaturalWidth(bar),
        rowWidthPx: rowWidthRef.current,
        itemCount: itemCountRef.current,
      }),
    );
  }, []);

  const ref = useCallback(
    (node: HTMLElement | null) => {
      nodeRef.current = node;
      observerRef.current?.disconnect();
      observerRef.current = null;
      mutationObserverRef.current?.disconnect();
      mutationObserverRef.current = null;
      if (!node || typeof ResizeObserver === "undefined") {
        return;
      }
      measure();
      const bar = node.closest<HTMLElement>(
        '[data-composer-frame-status-bar="true"]',
      );
      if (!bar) {
        return;
      }
      const observer = new ResizeObserver(() => measure());
      observer.observe(bar);
      const leading = bar.querySelector<HTMLElement>(
        '[data-composer-status-leading="true"]',
      );
      if (leading) {
        // Switching to a workspace with a longer branch name changes what the
        // line wants without necessarily changing the box it already fills, so
        // the text itself has to be watched as well as the geometry.
        observer.observe(leading);
        const mutationObserver = new MutationObserver(() => measure());
        mutationObserver.observe(leading, {
          characterData: true,
          childList: true,
          subtree: true,
        });
        mutationObserverRef.current = mutationObserver;
      }
      observerRef.current = observer;
    },
    [measure],
  );

  useEffect(() => {
    measure();
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      mutationObserverRef.current?.disconnect();
      mutationObserverRef.current = null;
    };
  }, [measure, itemCount]);

  return { ref, collapsed };
}

/**
 * Stave's own composer tooling as it rides the bottom status bar: an icon row
 * while there is room for it, a single `⋯` tray once there is not.
 *
 * Controls keep their labels on the row; only the runtime readout is a bare
 * glyph, because it is checked rather than operated. Once the row would crowd
 * the workspace line, the whole set folds into the tray instead of shrinking.
 */
export function ComposerStatusTray(props: {
  items: readonly ComposerStatusTrayItem[];
  /**
   * Controls the user demoted. On the row they stay behind their own `⋯`,
   * placed before Runtime; once the row folds there is one tray for both sets,
   * because two `⋯` buttons side by side name nothing.
   */
  overflowItems?: readonly ComposerControlMenuItem[];
  overflowTray?: ReactNode;
  /** Appended to the folded tray, which then stands in for the demoted one. */
  overflowFooter?: ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const overflowItems = props.overflowItems ?? [];
  const { ref, collapsed } = useStatusTrayCollapsed(
    props.items.length + (props.overflowTray ? 1 : 0),
  );

  if (props.items.length === 0) {
    return null;
  }

  // Runtime closes the shelf — it describes the workspace line it sits with —
  // so the demoted tray takes the slot in front of it rather than the end.
  const runtimeIndex = props.items.findIndex((item) => item.id === "runtime");
  const trayIndex = runtimeIndex === -1 ? props.items.length : runtimeIndex;

  return (
    <div
      ref={ref}
      data-composer-status-tray={collapsed ? "collapsed" : "row"}
      className={sx(statusTrayStyles.row)}
    >
      {collapsed ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={props.disabled}
                className={sx(statusTrayStyles.trigger, statusTrayStyles.triggerHover)}
                aria-label={`More composer controls (${props.items.length + overflowItems.length})`}
                title="More composer controls"
              />
            }
          >
            <Ellipsis className={sx(statusTrayStyles.icon)} />
          </PopoverTrigger>
          <PopoverContent
            align="end"
            side="top"
            sideOffset={10}
            // Same band as the toolbar tray: these controls portal dialogs of
            // their own, and composer-anchored chrome must not paint over them.
            layer="floatingChrome"
            xstyle={COMPOSER_CONTROL_MENU_CONTENT}
          >
            <ComposerControlMenuList
              items={[...props.items, ...overflowItems]}
            />
            {props.overflowFooter}
          </PopoverContent>
        </Popover>
      ) : (
        // Default density: every control keeps its label here. Runtime is the
        // exception and stays a glyph, because its own label is wing-only.
        <ComposerControlDensityProvider value="default">
          <div
            data-composer-status-row="true"
            className={sx(statusTrayStyles.row)}
          >
            {props.items.slice(0, trayIndex).map((item) => (
              <Fragment key={item.id}>{item.node}</Fragment>
            ))}
            {props.overflowTray}
            {props.items.slice(trayIndex).map((item) => (
              <Fragment key={item.id}>{item.node}</Fragment>
            ))}
          </div>
        </ComposerControlDensityProvider>
      )}
    </div>
  );
}
