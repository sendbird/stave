import { Children, createContext, Fragment, isValidElement } from "react";
import type * as React from "react";

import type { StepperStatus } from "./Stepper.flow";

export type StepperOrientation = "horizontal" | "vertical";
export type StepperDistribution = "content" | "fill";
export type StepperSize = "xs" | "sm" | "md";
export type StepperVariant = "navigation" | "track";

/**
 * The three internal contexts the compound parts read, split out of
 * `Stepper.tsx` so the flow layer (`Stepper.flow.tsx`) and the parts can both
 * reach them without either importing the other — and so `Stepper.tsx` stays
 * under the 500-line file cap while the contract grows.
 */
export const StepperItemContext = createContext<{
  disabled: boolean;
  loading: boolean;
  status: StepperStatus;
  step: number;
}>({ disabled: false, loading: false, status: "pending", step: 1 });

export const StepperRootContext = createContext<{
  distribution: StepperDistribution;
  orientation: StepperOrientation;
  /** Host extension: a navigation step shows its description on screen. */
  showDescriptions: boolean;
  size: StepperSize;
  variant: StepperVariant;
}>({
  distribution: "content",
  orientation: "horizontal",
  showDescriptions: false,
  size: "md",
  variant: "track",
});

export const StepperPositionContext = createContext({ count: 1, index: 0 });

/**
 * Flattens fragments so `{steps.map(...)}` inside a `<>…</>` still yields one
 * item per step — the position context needs a real index per child, and a
 * fragment would otherwise count as one.
 */
export function flattenStepperChildren(
  children: React.ReactNode,
): React.ReactElement[] {
  const items: React.ReactElement[] = [];

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === Fragment) {
      const fragment = child as React.ReactElement<{
        children?: React.ReactNode;
      }>;
      items.push(...flattenStepperChildren(fragment.props.children));
      return;
    }
    items.push(child);
  });

  return items;
}
