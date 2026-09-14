import * as stylex from "@stylexjs/stylex";
import { ChevronDown } from "lucide-react";
import type * as React from "react";

import {
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionRoot,
  AccordionTrigger,
  type AccordionRootProps,
} from "../headless/accordion";
import { focusRing } from "../recipes/focus-ring";
import { transition } from "../recipes/transition";
import {
  themeProps,
  themeSlotProps,
  themeTargetClassName,
} from "../theming/theme-props";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { usePanelMount, type PanelMount } from "./Collapsible.panel-mount";
import { mergeClassName } from "./merge-class-name";

// ---------------------------------------------------------------------------
// Compound parts (primary, compositional API)
// ---------------------------------------------------------------------------

export type AccordionRootCompoundProps = React.ComponentProps<
  typeof AccordionRoot
> &
  XstyleProp;

function Root({ className, xstyle, ...props }: AccordionRootCompoundProps) {
  const theme = themeProps("accordion");
  return (
    <AccordionRoot
      {...props}
      {...theme}
      className={mergeClassName(
        () => cx(sx(styles.root, xstyle), theme.className) ?? "",
        className,
      )}
    />
  );
}

export type AccordionItemProps = React.ComponentProps<typeof AccordionItem> &
  XstyleProp;

function Item({ className, xstyle, ...props }: AccordionItemProps) {
  return (
    <AccordionItem
      {...props}
      {...themeSlotProps("accordion", "item")}
      className={mergeClassName(() => sx(styles.item, xstyle), className)}
    />
  );
}

export type AccordionHeaderProps = React.ComponentProps<
  typeof AccordionHeader
> &
  XstyleProp;

function Header({ className, xstyle, ...props }: AccordionHeaderProps) {
  return (
    <AccordionHeader
      {...props}
      {...themeSlotProps("accordion", "header")}
      className={mergeClassName(() => sx(styles.header, xstyle), className)}
    />
  );
}

export type AccordionTriggerProps = React.ComponentProps<
  typeof AccordionTrigger
> &
  XstyleProp;

/**
 * Renders the clickable header button. Passes Base UI's `render` prop straight
 * through, so callers can render the trigger *as* their own element. When no
 * children are supplied the default chevron affordance is rendered.
 */
function Trigger({
  children,
  className,
  xstyle,
  ...props
}: AccordionTriggerProps) {
  return (
    <AccordionTrigger
      {...props}
      className={mergeClassName(
        (state) =>
          cx(
            sx(
              styles.trigger,
              transition.colors,
              transition.motionDurationNormal,
              focusRing.ring,
              state.disabled && styles.disabled,
              xstyle,
            ),
            "atelier-accordion-trigger",
            themeTargetClassName("accordion-trigger"),
          ) ?? "",
        className,
      )}
    >
      {children}
    </AccordionTrigger>
  );
}

export type AccordionPanelProps = React.ComponentProps<
  typeof AccordionPanel
> & {
  /**
   * When the panel's children enter the DOM. `eager` (default) keeps every
   * item's content mounted while closed — see `PanelMount` for why that stays
   * the default and what `lazy` costs and buys. An explicit `keepMounted`
   * still wins: it is the lower-level spelling of the same knob, and Base UI's
   * `hiddenUntilFound` overrides both.
   * @default "eager"
   */
  mount?: PanelMount;
} & XstyleProp;

function Panel({
  children,
  className,
  keepMounted,
  mount = "eager",
  xstyle,
  ...props
}: AccordionPanelProps) {
  const panelMount = usePanelMount(mount);

  return (
    <AccordionPanel
      {...props}
      {...themeSlotProps("accordion", "panel")}
      className={mergeClassName(
        () => cx(sx(styles.panel, xstyle), "atelier-motion-collapse") ?? "",
        className,
      )}
      keepMounted={keepMounted ?? panelMount.keepMounted}
    >
      {panelMount.probe}
      {children}
    </AccordionPanel>
  );
}

const compoundParts = {
  Root,
  Item,
  Header,
  Trigger,
  Panel,
} as const;

// ---------------------------------------------------------------------------
// Array (back-compat convenience) API — re-implemented on the compound parts
// ---------------------------------------------------------------------------

export type AccordionEntry = {
  content: React.ReactNode;
  disabled?: boolean;
  title: React.ReactNode;
  value: string;
};

export type AccordionProps = Omit<
  AccordionRootProps,
  "children" | "className"
> & {
  items: AccordionEntry[];
  /** Forwarded to every item's panel. @default "eager" */
  mount?: PanelMount;
} & XstyleProp;

function AccordionArray({
  defaultValue,
  items,
  mount,
  value,
  xstyle,
  ...props
}: AccordionProps) {
  const fallbackDefaultValue =
    defaultValue ?? [items[0]?.value].filter(Boolean);

  return (
    <Root
      xstyle={xstyle}
      {...props}
      defaultValue={value === undefined ? fallbackDefaultValue : undefined}
      value={value}
    >
      {items.map((item) => (
        <Item disabled={item.disabled} key={item.value} value={item.value}>
          <Header>
            <Trigger>
              <span className={sx(styles.title)}>{item.title}</span>
              <ChevronDown
                aria-hidden
                className={cx(
                  sx(styles.chevron, transition.transform),
                  "atelier-accordion-chevron",
                )}
                size={16}
              />
            </Trigger>
          </Header>
          <Panel mount={mount}>
            <div
              className={cx(
                sx(styles.panelInner),
                "atelier-motion-panel-inner",
              )}
            >
              {item.content}
            </div>
          </Panel>
        </Item>
      ))}
    </Root>
  );
}

/**
 * Accordion supports two coexisting APIs (non-breaking):
 *
 * - **Array (convenience):** `<Accordion items={[…]} />`
 * - **Compound (compositional):** `<Accordion.Root>…<Accordion.Trigger render={…}/>…</Accordion.Root>`
 *
 * The compound namespace is attached via `Object.assign`, so both call styles
 * resolve through the same `Accordion` export.
 */
export const Accordion = Object.assign(AccordionArray, compoundParts);

const styles = stylex.create({
  // A disclosure list is one reading sequence, not a table and not a grid of
  // repeated cards. Whitespace separates rows; expansion, content, and chevron
  // rotation communicate the open item without painting a persistent wash.
  root: {
    boxSizing: "border-box",
    display: "grid",
    gap: vars["--ads-space-4"],
    inlineSize: "100%",
    maxInlineSize: "100%",
    minInlineSize: 0,
  },
  item: {
    backgroundColor: "transparent",
    borderRadius: vars["--ads-radius-control"],
    boxSizing: "border-box",
    display: "grid",
    inlineSize: "100%",
    maxInlineSize: "100%",
    minInlineSize: 0,
  },
  header: {
    inlineSize: "100%",
    margin: 0,
    maxInlineSize: "100%",
    minInlineSize: 0,
  },
  trigger: {
    alignItems: "center",
    appearance: "none",
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderStyle: "solid",
    borderWidth: 0,
    borderRadius: vars["--ads-radius-control"],
    // Accordion is a reading sequence. A full-row wash makes every disclosure
    // look like another nested card, so hover changes the title ink while the
    // whole row remains the hit target. Press and focus still have their own
    // stronger feedback.
    color: {
      default: vars["--ads-color-text"],
      ":active": vars["--ads-color-accent-hover"],
      "@media (hover: hover) and (pointer: fine)": {
        default: vars["--ads-color-text"],
        ":active": vars["--ads-color-accent-hover"],
        ":hover": vars["--ads-color-accent"],
      },
    },
    cursor: "pointer",
    display: "grid",
    gap: vars["--ads-space-12"],
    gridTemplateColumns: "minmax(0, 1fr) auto",
    inlineSize: "100%",
    justifyContent: "stretch",
    maxInlineSize: "100%",
    minBlockSize: {
      default: vars["--ads-control-height-lg"],
      "@media (pointer: coarse)": vars["--ads-control-height-xl"],
    },
    minInlineSize: 0,
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
    textAlign: "start",
  },
  disabled: {
    cursor: "not-allowed",
    opacity: vars["--ads-opacity-disabled"],
  },
  title: {
    display: "block",
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    inlineSize: "100%",
    lineHeight: vars["--ads-line-height-normal"],
    maxInlineSize: "100%",
    minInlineSize: 0,
    overflowWrap: "anywhere",
  },
  // The rotation itself lives in `styles.css` (`[data-open]` descendant
  // selector); `transition.transform` supplies the timing at the call site.
  chevron: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
  },
  panel: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-regular"],
    inlineSize: "100%",
    lineHeight: vars["--ads-line-height-normal"],
    maxInlineSize: "100%",
    minInlineSize: 0,
  },
  panelInner: {
    display: "grid",
    gap: vars["--ads-space-8"],
    inlineSize: "100%",
    maxInlineSize: "100%",
    minInlineSize: 0,
    paddingBlockEnd: vars["--ads-space-12"],
    paddingBlockStart: vars["--ads-space-4"],
    paddingInline: vars["--ads-space-12"],
  },
});
