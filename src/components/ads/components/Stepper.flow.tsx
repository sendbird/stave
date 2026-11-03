import * as stylex from "@stylexjs/stylex";
import { Check, TriangleAlert } from "lucide-react";
import { createContext, useCallback, useContext, useState } from "react";
import type * as React from "react";

import { themeProps, themeSlotProps } from "../theming/theme-props";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";

export type StepperStatus = "complete" | "current" | "pending" | "error";

/**
 * Replacement content for a marker in a given state — a spinner while a step is
 * verifying, a domain glyph for a completed one. Only the states you name are
 * replaced; the rest keep the built-in ordinal/check/warning treatment.
 *
 * `loading` is not a `StepperStatus`: a step that is working is still the
 * *current* step, and giving it a fifth status would put "in flight" and
 * "where you are" on one axis. It is a per-item boolean instead.
 */
export type StepperIndicators = Partial<
  Record<StepperStatus | "loading", React.ReactNode>
>;

type StepperFlow = {
  /** 1-based active step, or `null` when the consumer sets `status` per item. */
  activeStep: number | null;
  goToStep: (step: number) => void;
  indicators: StepperIndicators;
  /** True when the root owns the active step, so items may derive their status. */
  owned: boolean;
};

const StepperFlowContext = createContext<StepperFlow>({
  activeStep: null,
  goToStep: () => undefined,
  indicators: {},
  owned: false,
});

export const StepperFlowProvider = StepperFlowContext.Provider;

export function useStepperFlow() {
  return useContext(StepperFlowContext);
}

/**
 * Resolves the root's active step from the controlled/uncontrolled pair.
 *
 * The point of the root owning it: a wizard used to have to compute
 * `complete | current | pending` for every step itself and keep that in sync
 * with whatever state drove the visible panel. Two derivations of one fact is
 * how a stepper ends up showing step 3 highlighted with step 2's content.
 */
export function useStepperValue({
  defaultValue,
  onValueChange,
  value,
}: {
  defaultValue?: number;
  onValueChange?: (step: number) => void;
  value?: number;
}): StepperFlow {
  const [uncontrolled, setUncontrolled] = useState(defaultValue ?? 1);
  const controlled = value != null;
  const activeStep = controlled
    ? value
    : defaultValue != null
      ? uncontrolled
      : null;

  const goToStep = useCallback(
    (step: number) => {
      if (!controlled) setUncontrolled(step);
      onValueChange?.(step);
    },
    [controlled, onValueChange],
  );

  return {
    activeStep,
    goToStep,
    indicators: {},
    owned: activeStep != null,
  };
}

/**
 * The status a step has when the root owns the active step. Before it is
 * complete, on it is current, after it is pending. `error` is never derived —
 * a failure is a fact about the step, not about its position — so an item that
 * needs it still passes `status="error"` explicitly and that wins.
 */
export function deriveStepperStatus(
  step: number,
  activeStep: number,
): StepperStatus {
  if (step < activeStep) return "complete";
  if (step === activeStep) return "current";
  return "pending";
}

export type StepperFlowRootProps = React.ComponentProps<"div"> & {
  /** Uncontrolled starting step (1-based). */
  defaultValue?: number;
  /** Replacement marker content per state. */
  indicators?: StepperIndicators;
  onValueChange?: (step: number) => void;
  /** Controlled active step (1-based). */
  value?: number;
} & XstyleProp;

/**
 * Owns the active step for a rail **and** its content panels.
 *
 * `Stepper.Root` is the rail itself (a `nav` wrapping an `ol`), so it cannot
 * also contain the step's content. `Stepper.Flow` is the wrapper that can: put
 * a `Stepper.Root` and a `Stepper.Panel` inside it and the active step is one
 * fact, held once. Without it every existing composition keeps working exactly
 * as before — items take an explicit `status` and the consumer owns its own
 * content switching.
 */
export function StepperFlow({
  children,
  className,
  defaultValue,
  indicators,
  onValueChange,
  value,
  xstyle,
  ...props
}: StepperFlowRootProps) {
  const flow = useStepperValue({ defaultValue, onValueChange, value });
  const theme = themeProps("stepper-flow");

  return (
    <StepperFlowProvider
      value={{ ...flow, indicators: indicators ?? emptyIndicators }}
    >
      <div
        {...props}
        {...theme}
        className={cx(sx(styles.flow, xstyle), theme.className, className)}
      >
        {children}
      </div>
    </StepperFlowProvider>
  );
}

/** Stable identity so the context value does not change on every render. */
const emptyIndicators: StepperIndicators = {};

export type StepperPanelProps = React.ComponentProps<"div"> & XstyleProp;

/**
 * The region the step's content lives in. It is a plain group rather than a
 * `tabpanel`: the rail is a `nav` of links/buttons, not a tablist, so borrowing
 * the tab pattern's roles would promise arrow-key semantics the rail does not
 * implement. What it does own is the visible/hidden switch, which is the part
 * every consumer was rewriting.
 */
export function StepperPanel({
  children,
  className,
  xstyle,
  ...props
}: StepperPanelProps) {
  return (
    <div
      {...props}
      {...themeSlotProps("stepper-flow", "panel")}
      className={cx(sx(styles.panel, xstyle), className)}
    >
      {children}
    </div>
  );
}

export type StepperPanelStepProps = React.ComponentProps<"div"> & {
  /**
   * Keep the content mounted while another step is active, so a half-filled
   * form is not thrown away by navigating back and forth. Hidden content is
   * `hidden`, which removes it from the accessibility tree and from tab order.
   */
  forceMount?: boolean;
  /** The 1-based step this content belongs to. */
  value: number;
} & XstyleProp;

/** One step's content, shown when the root's active step matches `value`. */
export function StepperPanelStep({
  children,
  className,
  forceMount = false,
  value,
  xstyle,
  ...props
}: StepperPanelStepProps) {
  const { activeStep } = useStepperFlow();
  const active = activeStep === value;

  if (!active && !forceMount) return null;

  return (
    <div
      {...props}
      {...themeSlotProps("stepper-flow", "panel-step")}
      className={cx(sx(styles.panelStep, xstyle), className)}
      data-step-active={active ? "true" : undefined}
      hidden={!active}
    >
      {children}
    </div>
  );
}

const styles = stylex.create({
  flow: {
    display: "grid",
    gap: vars["--ads-space-20"],
    minInlineSize: 0,
  },
  panel: {
    display: "grid",
    minInlineSize: 0,
  },
  panelStep: {
    minInlineSize: 0,
  },
});

/*
 * Finished and failed steps use semantic glyphs; current and pending steps use
 * their ordinal. The sequence therefore remains legible before color, while a
 * connector makes progress read as one route instead of isolated status dots.
 * These are the DEFAULTS behind `StepperIndicators` — a caller replacing one
 * state replaces only that state.
 */
export const statusIcons = {
  complete: Check,
  error: TriangleAlert,
} as const;

/** Read through `i18n.t` at render time; never translated at module scope. */
export const statusLabels = {
  complete: "ui:stepper.status.complete",
  current: "ui:stepper.status.current",
  error: "ui:stepper.status.error",
  pending: "ui:stepper.status.pending",
} as const satisfies Record<StepperStatus, string>;
