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
import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";
import { usePanelMount, type PanelMount } from "./Collapsible.panel-mount";
import { mergeClassName } from "./merge-class-name";

// ---------------------------------------------------------------------------
// Compound parts (primary, compositional API)
// ---------------------------------------------------------------------------

export type AccordionRootCompoundProps = React.ComponentProps<
  typeof AccordionRoot
>;

function Root({ className, ...props }: AccordionRootCompoundProps) {
  return (
    <AccordionRoot
      {...props}
      className={mergeClassName(() => sx(styles.root), className)}
    />
  );
}

export type AccordionItemProps = React.ComponentProps<typeof AccordionItem>;

function Item({ className, ...props }: AccordionItemProps) {
  return (
    <AccordionItem
      {...props}
      className={mergeClassName(() => sx(styles.item), className)}
    />
  );
}

export type AccordionHeaderProps = React.ComponentProps<typeof AccordionHeader>;

function Header({ className, ...props }: AccordionHeaderProps) {
  return (
    <AccordionHeader
      {...props}
      className={mergeClassName(() => sx(styles.header), className)}
    />
  );
}

export type AccordionTriggerProps = React.ComponentProps<
  typeof AccordionTrigger
>;

/**
 * Renders the clickable header button. Passes Base UI's `render` prop straight
 * through, so callers can render the trigger *as* their own element. When no
 * children are supplied the default chevron affordance is rendered.
 */
function Trigger({ children, className, ...props }: AccordionTriggerProps) {
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
            ),
            "atelier-accordion-trigger",
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
};

function Panel({
  children,
  className,
  keepMounted,
  mount = "eager",
  ...props
}: AccordionPanelProps) {
  const panelMount = usePanelMount(mount);

  return (
    <AccordionPanel
      {...props}
      className={mergeClassName(
        () => cx(sx(styles.panel), "atelier-motion-collapse") ?? "",
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
};

function AccordionArray({
  defaultValue,
  items,
  mount,
  value,
  ...props
}: AccordionProps) {
  const fallbackDefaultValue =
    defaultValue ?? [items[0]?.value].filter(Boolean);

  return (
    <Root
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
    gap: vars.space4,
    inlineSize: "100%",
    maxInlineSize: "100%",
    minInlineSize: 0,
  },
  item: {
    backgroundColor: "transparent",
    borderRadius: vars.radiusControl,
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
    borderRadius: vars.radiusControl,
    // Accordion is a reading sequence. A full-row wash makes every disclosure
    // look like another nested card, so hover changes the title ink while the
    // whole row remains the hit target. Press and focus still have their own
    // stronger feedback.
    color: {
      default: vars.colorText,
      ":active": vars.colorAccentHover,
      "@media (hover: hover) and (pointer: fine)": {
        default: vars.colorText,
        ":active": vars.colorAccentHover,
        ":hover": vars.colorAccent,
      },
    },
    cursor: "pointer",
    display: "grid",
    gap: vars.space12,
    gridTemplateColumns: "minmax(0, 1fr) auto",
    inlineSize: "100%",
    justifyContent: "stretch",
    maxInlineSize: "100%",
    minBlockSize: {
      default: vars.controlHeightLg,
      "@media (pointer: coarse)": vars.controlHeightXl,
    },
    minInlineSize: 0,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
    textAlign: "start",
  },
  disabled: {
    cursor: "not-allowed",
    opacity: vars.opacityDisabled,
  },
  title: {
    display: "block",
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    inlineSize: "100%",
    lineHeight: vars.lineHeightNormal,
    maxInlineSize: "100%",
    minInlineSize: 0,
    overflowWrap: "anywhere",
  },
  // The rotation itself lives in `styles.css` (`[data-open]` descendant
  // selector); `transition.transform` supplies the timing at the call site.
  chevron: {
    color: vars.colorTextMuted,
    flexShrink: 0,
  },
  panel: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightRegular,
    inlineSize: "100%",
    lineHeight: vars.lineHeightNormal,
    maxInlineSize: "100%",
    minInlineSize: 0,
  },
  panelInner: {
    display: "grid",
    gap: vars.space8,
    inlineSize: "100%",
    maxInlineSize: "100%",
    minInlineSize: 0,
    paddingBlockEnd: vars.space12,
    paddingBlockStart: vars.space4,
    paddingInline: vars.space12,
  },
});
