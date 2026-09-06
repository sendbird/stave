import { m } from "motion/react";
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import type * as React from "react";

import {
  TabsIndicator,
  TabsList,
  TabsPanel,
  TabsRoot,
  TabsTab,
  type TabsRootProps,
} from "../headless/tabs";
import { controlChrome } from "../recipes/control-chrome";
import { focusRing } from "../recipes/focus-ring";
import { transition } from "../recipes/transition";
import { springSmooth } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";
import { usePanelMount, type PanelMount } from "./Collapsible.panel-mount";
import { styles, tabHeightBySize } from "./Tabs.styles";

/**
 * `className` on a Base UI part may be a string or a `(state) => string`
 * callback. Merge Atelier's base styles with a caller-supplied `className` of
 * either shape, preserving the state argument.
 */
type ClassNameProp<State> =
  | string
  | undefined
  | ((state: State) => string | undefined);

function mergeClassName<State>(
  base: (state: State) => string,
  className: ClassNameProp<State>,
): (state: State) => string | undefined {
  return (state) =>
    cx(
      base(state),
      typeof className === "function" ? className(state) : className,
    );
}

// ---------------------------------------------------------------------------
// Compound parts (primary, compositional API)
// ---------------------------------------------------------------------------

export type TabsVariant = "pill" | "line";

/**
 * Tab height, off the shared control ramp (`controlHeightBySize`).
 *
 * The names sit one rung below the trigger heights they resolve to, and that
 * is deliberate rather than sloppy. What the eye measures against a Button
 * standing beside the strip is the LIST, not the tab inside it: the shipped
 * 28px (`xs`) tab plus the list's `space1` inset is exactly 36px, the baseline
 * control height. So the shipped strip is already the `md`-looking object, and
 * it is also the shortest one available — `xs` is the floor of the ramp
 * (design-direction §5) and the list cannot give back its inset without losing
 * the gutter the focus ring bleeds into. Naming today's strip `md` would have
 * forced `sm` onto a 24px trigger that does not exist. So today's strip is
 * `sm` — unchanged, still the default — and `md` is the new roomier rung
 * (32px trigger, 40px strip) for a page-level tab bar.
 */
export type TabsSize = "md" | "sm";

/** Base UI's own axis vocabulary, re-stated so callers can name it. */
export type TabsOrientation = "horizontal" | "vertical";

type TabsConfig = {
  orientation: TabsOrientation;
  size: TabsSize;
  variant: TabsVariant;
};

// One context for the three knobs the parts have to agree on. Three separate
// contexts would let a part read `variant` and forget `orientation`, which is
// exactly how the indicator ends up painting a bottom bar on a vertical rail.
const TabsConfigContext = createContext<TabsConfig>({
  orientation: "horizontal",
  size: "sm",
  variant: "pill",
});

export type TabsRootCompoundProps = React.ComponentProps<typeof TabsRoot> & {
  /**
   * Tab height. @default "sm" — today's geometry.
   */
  size?: TabsSize;
  /**
   * `pill` (default): enclosed list with a gliding pill indicator.
   * `line`: bare list with a bottom border and an underline indicator —
   * the conventional underlined tab-strip variant.
   */
  variant?: TabsVariant;
};

function Root({
  className,
  orientation = "horizontal",
  size = "sm",
  variant = "pill",
  ...props
}: TabsRootCompoundProps) {
  const vertical = orientation === "vertical";
  const config = useMemo(
    () => ({ orientation, size, variant }),
    [orientation, size, variant],
  );

  return (
    <TabsConfigContext.Provider value={config}>
      <TabsRoot
        {...props}
        orientation={orientation}
        // Remount the strip when the variant changes. `pill` and `line` are
        // different objects — a 28px chip inset inside a padded track vs. a 2px
        // bar pinned to a bare strip's baseline — and Base UI caches each tab's
        // measured offset for the indicator's `--active-tab-*` vars. Switching
        // on a live instance left those offsets at the OLD inset (the bar
        // rendered 4px below the strip, outside its own box) until something
        // else forced a re-measure, and Motion kept projecting the old
        // indicator box on top of that (a `scaleY(14)` correction that never
        // settled, so a 2px bar painted 28px tall). Keying the indicator alone
        // is not enough: the stale numbers come from the TABS, which that key
        // does not remount. Nothing could reach this while `variant` was fixed
        // at the call site; the docs Properties control makes it switchable.
        //
        // `orientation` and `size` join the key for the same reason: both move
        // the measured tab box (axis, and height), and both are switchable from
        // the docs Properties panel.
        key={`${variant}:${orientation}:${size}`}
        className={mergeClassName(
          () => sx(styles.root, vertical && styles.rootVertical),
          className,
        )}
      />
    </TabsConfigContext.Provider>
  );
}

export type TabsListProps = React.ComponentProps<typeof TabsList>;

function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref) {
    ref.current = value;
  }
}

function List({ className, ref, ...props }: TabsListProps) {
  const { orientation, variant } = useContext(TabsConfigContext);
  const vertical = orientation === "vertical";
  const listRef = useRef<HTMLDivElement>(null);
  const composedRef = useCallback(
    (node: HTMLDivElement | null) => {
      listRef.current = node;
      assignRef(ref, node);
    },
    [ref],
  );

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const revealActiveTab = () => {
      const active = list.querySelector<HTMLElement>(
        "[role='tab'][data-active]",
      );
      if (!active) return;

      if (vertical) {
        const start = active.offsetTop;
        const end = start + active.offsetHeight;
        if (start < list.scrollTop) list.scrollTop = start;
        else if (end > list.scrollTop + list.clientHeight) {
          list.scrollTop = end - list.clientHeight;
        }
        return;
      }

      const start = active.offsetLeft;
      const end = start + active.offsetWidth;
      if (start < list.scrollLeft) list.scrollLeft = start;
      else if (end > list.scrollLeft + list.clientWidth) {
        list.scrollLeft = end - list.clientWidth;
      }
    };

    revealActiveTab();
    const observer = new MutationObserver(revealActiveTab);
    observer.observe(list, {
      attributeFilter: ["data-active"],
      attributes: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [vertical]);

  return (
    <TabsList
      {...props}
      ref={composedRef}
      className={mergeClassName(
        () =>
          sx(
            styles.list,
            vertical && styles.listVertical,
            variant === "line" && styles.listLine,
            // After `listLine`, which paints the horizontal baseline rule this
            // one has to replace rather than join.
            variant === "line" && vertical && styles.listLineVertical,
          ),
        className,
      )}
    />
  );
}

export type TabsTabProps = React.ComponentProps<typeof TabsTab>;

function Tab({ className, ...props }: TabsTabProps) {
  const { orientation, size, variant } = useContext(TabsConfigContext);
  return (
    <TabsTab
      {...props}
      className={mergeClassName(
        (state) =>
          sx(
            styles.tab,
            transition.colors,
            tabHeightBySize[size],
            orientation === "vertical" && styles.tabVertical,
            focusRing.ring,
            // The list clips (`overflow-x: auto`, and per CSS the block axis
            // computes to `auto` with it), so the ring needs either a gutter on
            // the list or an inset ring here. `pill` gets the gutter for free —
            // its `space1` inset is exactly the ring's
            // `focusRingOffset + focusRingWidth` bleed. `line` has no inset and
            // cannot grow one: the list's padding box is where its baseline
            // rule and its active bar are both painted, so widening it would
            // drag the rule off the tabs. Before this the focused tab in a
            // `line` strip had NO visible focus indicator at all.
            //
            // Orientation does not change the answer, only the axis it is
            // wrong on: a vertical `line` rail has the same zero inset, so the
            // same inset ring is what keeps the focused tab visible.
            variant === "line" && focusRing.ringInset,
            state.active && styles.tabActive,
            state.disabled && styles.tabDisabled,
            state.disabled && controlChrome.disabled,
          ),
        className,
      )}
    />
  );
}

export type TabsIndicatorProps = React.ComponentProps<typeof TabsIndicator>;

/**
 * The active-tab indicator. Base UI keeps measuring the active tab via its
 * `--active-tab-*` CSS vars (so the box is positioned correctly even before
 * hydration / without the motion provider); Motion's `layout` then owns the
 * interpolating `transform`, gliding the pill on a spring when the active tab
 * changes — replacing the desync-prone CSS-var transition. Radius and shadow
 * live in the StyleX layer with every other visual declaration; they used to be
 * repeated inline on the `m.span`, where the inline copy silently won and the
 * StyleX one was dead code that still read as the source of truth.
 *
 * Without an `<AtelierMotionProvider>` the `m.span` renders statically and the
 * indicator simply snaps (the reduced-motion fallback). `MotionConfig` disables
 * the spring automatically when the user enabled OS "Reduce Motion".
 */
function Indicator({ className, ...props }: TabsIndicatorProps) {
  const { orientation, variant } = useContext(TabsConfigContext);
  return (
    <TabsIndicator
      {...props}
      className={mergeClassName(
        () =>
          sx(
            styles.indicator,
            variant === "line" ? styles.indicatorLine : styles.indicatorPill,
            // `pill` needs nothing for a vertical rail: Base UI publishes all
            // six `--active-tab-*` vars on both axes, so a box built from
            // top/left/width/height already follows the tab down a column. Only
            // the 2px bar is axis-specific, because it is the one shape that
            // deliberately collapses one of those dimensions.
            variant === "line" &&
              orientation === "vertical" &&
              styles.indicatorLineVertical,
          ),
        className,
      )}
      render={<m.span layout transition={springSmooth} />}
    />
  );
}

export type TabsPanelProps = React.ComponentProps<typeof TabsPanel> & {
  /**
   * When the panel's children enter the DOM.
   *
   * Deliberately has NO default, unlike `Accordion`/`Collapsible`. A tab panel
   * has never been eager here: Base UI's `keepMounted` defaults to `false`, so
   * an inactive panel is not in the DOM at all and is rebuilt on every switch
   * back. Defaulting this to `"eager"` would put every panel in the DOM for
   * every existing caller — a real change, not a no-op — so omitting `mount`
   * keeps exactly that behaviour and the two values are both opt-in:
   * `"eager"` to match Accordion, `"lazy"` for the middle ground (build on
   * first visit, then keep, so scroll position and form state survive a switch
   * away). An explicit `keepMounted` still wins.
   */
  mount?: PanelMount;
};

function Panel({
  children,
  className,
  keepMounted,
  mount,
  ...props
}: TabsPanelProps) {
  const panelMount = usePanelMount(mount);

  return (
    <TabsPanel
      {...props}
      className={mergeClassName(() => sx(styles.panel), className)}
      keepMounted={keepMounted ?? panelMount.keepMounted}
    >
      {panelMount.probe}
      {children}
    </TabsPanel>
  );
}

const compoundParts = {
  Root,
  List,
  Tab,
  Indicator,
  Panel,
} as const;

// ---------------------------------------------------------------------------
// Array (back-compat convenience) API — re-implemented on the compound parts
// ---------------------------------------------------------------------------

export type TabItem = {
  content: React.ReactNode;
  disabled?: boolean;
  label: React.ReactNode;
  value: string;
};

export type TabsProps = Omit<TabsRootProps, "children" | "className"> & {
  items: TabItem[];
  /** Forwarded to every panel. Omitted = Base UI's unmount-when-hidden. */
  mount?: PanelMount;
  /** Tab height. @default "sm" */
  size?: TabsSize;
  variant?: TabsVariant;
};

function TabsArray({ defaultValue, items, mount, value, ...props }: TabsProps) {
  const fallbackDefaultValue = defaultValue ?? items[0]?.value;

  return (
    <Root
      {...props}
      defaultValue={value === undefined ? fallbackDefaultValue : undefined}
      value={value}
    >
      <List>
        {items.map((item) => (
          <Tab disabled={item.disabled} key={item.value} value={item.value}>
            {item.label}
          </Tab>
        ))}
        <Indicator />
      </List>
      <div className={sx(styles.panelViewport)}>
        {items.map((item) => (
          <Panel key={item.value} mount={mount} value={item.value}>
            {item.content}
          </Panel>
        ))}
      </div>
    </Root>
  );
}

/**
 * Tabs supports two coexisting APIs (non-breaking):
 *
 * - **Array (convenience):** `<Tabs items={[…]} />`
 * - **Compound (compositional):** `<Tabs.Root>…<Tabs.Tab render={…}/>…</Tabs.Root>`
 *
 * The compound namespace is attached via `Object.assign`, so both call styles
 * resolve through the same `Tabs` export.
 */
export const Tabs = Object.assign(TabsArray, compoundParts);
