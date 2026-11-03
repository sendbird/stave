import { i18n, useTranslation } from "@/i18n";
import type * as React from "react";

import { StepperFlow, StepperPanel, StepperPanelStep } from "./Stepper.flow";
import {
  StepperContent,
  StepperDescription,
  StepperIndicator,
  StepperItem,
  StepperRoot,
  StepperTitle,
  StepperTrigger,
} from "./Stepper.parts";
import type { StepperStatus } from "./Stepper.flow";
import type {
  StepperDistribution,
  StepperOrientation,
  StepperSize,
  StepperVariant,
} from "./Stepper.context";
import type { XstyleProp } from "../utils/stylex";

export type {
  StepperContentProps,
  StepperDescriptionProps,
  StepperIndicatorProps,
  StepperItemProps,
  StepperRootProps,
  StepperTitleProps,
  StepperTriggerProps,
} from "./Stepper.parts";

export type {
  StepperFlowRootProps,
  StepperIndicators,
  StepperPanelProps,
  StepperPanelStepProps,
  StepperStatus,
} from "./Stepper.flow";

export type {
  StepperDistribution,
  StepperOrientation,
  StepperSize,
  StepperVariant,
} from "./Stepper.context";

const compoundParts = {
  Root: StepperRoot,
  Item: StepperItem,
  Indicator: StepperIndicator,
  Content: StepperContent,
  Title: StepperTitle,
  Description: StepperDescription,
  Trigger: StepperTrigger,
  /**
   * Step ownership: `Flow` holds the active step for a `Root` rail plus a
   * `Panel`, so a wizard stops deriving the same fact twice. Without it every
   * existing composition is unchanged.
   */
  Flow: StepperFlow,
  Panel: StepperPanel,
  PanelStep: StepperPanelStep,
} as const;

// ---------------------------------------------------------------------------
// Array (back-compat convenience) API — re-implemented on the compound parts
// ---------------------------------------------------------------------------

export type StepperStep = {
  description?: React.ReactNode;
  disabled?: boolean;
  label: React.ReactNode;
  /** Show this step as working; it stays the current step. */
  loading?: boolean;
  /**
   * Optional inside a `Stepper.Flow`, which derives it from the active step.
   * Pass it to override — an `error` step is never derived.
   */
  status?: StepperStatus;
};

export type StepperProps = React.ComponentProps<"nav"> & {
  distribution?: StepperDistribution;
  label?: string;
  onStepChange?: (index: number) => void;
  orientation?: StepperOrientation;
  /** Host extension; see `StepperRootProps.showDescriptions`. */
  showDescriptions?: boolean;
  size?: StepperSize;
  steps: StepperStep[];
  variant?: StepperVariant;
} & XstyleProp;

function StepperArray({
  distribution = "content",
  label = i18n.t("ui:stepper.progress"),
  onStepChange,
  orientation = "horizontal",
  showDescriptions = false,
  size = "md",
  steps,
  variant = "track",
  xstyle,
  ...props
}: StepperProps) {
  useTranslation();
  return (
    <StepperRoot
      xstyle={xstyle}
      {...props}
      aria-label={label}
      distribution={distribution}
      orientation={orientation}
      showDescriptions={showDescriptions}
      size={size}
      variant={variant}
    >
      {steps.map((step, index) => {
        const anatomy = (
          <>
            <StepperIndicator />
            <StepperContent>
              <StepperTitle>{step.label}</StepperTitle>
              {step.description ? (
                <StepperDescription>{step.description}</StepperDescription>
              ) : null}
            </StepperContent>
          </>
        );

        return (
          <StepperItem
            disabled={step.disabled}
            loading={step.loading}
            key={typeof step.label === "string" ? step.label : index}
            status={step.status}
          >
            {onStepChange ? (
              <StepperTrigger onClick={() => onStepChange(index)}>
                {anatomy}
              </StepperTrigger>
            ) : (
              anatomy
            )}
          </StepperItem>
        );
      })}
    </StepperRoot>
  );
}

/**
 * Stepper supports two coexisting APIs (non-breaking):
 *
 * - **Array (convenience):** `<Stepper steps={[…]} />`
 * - **Compound (compositional):**
 *   `<Stepper.Root><Stepper.Item status="current"><Stepper.Indicator/>…</Stepper.Item></Stepper.Root>`
 *
 * The compound namespace is attached via `Object.assign`, so both call styles
 * resolve through the same `Stepper` export.
 */
export const Stepper = Object.assign(StepperArray, compoundParts);
