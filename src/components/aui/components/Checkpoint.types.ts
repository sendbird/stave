import type * as React from "react";

import type { XstyleProp } from "../utils/stylex";

/** Where a checkpoint sits on its run's rail. */
export type CheckpointRailState = "done" | "current" | "running";

export type CheckpointProps = Omit<React.ComponentProps<"div">, "title"> & {
  /** Row variant: label of the branch action. @default `ui:checkpoint.branch` */
  branchLabel?: React.ReactNode;
  /** Row variant: glyph in the 24px tile. @default Bookmark */
  icon?: React.ReactNode;
  /** Row variant: the checkpoint's ordinal, e.g. "#3", in the machine register. */
  index?: React.ReactNode;
  /**
   * Row variant: re-run a new attempt from this boundary. The Branch action
   * renders only when this is supplied — never for a runtime that cannot.
   */
  onBranch?: React.MouseEventHandler<HTMLButtonElement>;
  /** Row variant: the rail dot — done, the selected stop, or still running. @default "done" */
  rail?: CheckpointRailState;
  /** Row variant: trims the rail line above the first stop or below the last. */
  railEdge?: "first" | "last";
  /** Row variant: the stop the reader is on; shows its actions. @default false */
  selected?: boolean;
  /**
   * `separator` is a restorable boundary inside a transcript; `row` is one
   * stop on a run's checkpoint rail (R2). @default "separator"
   */
  variant?: "separator" | "row";
  /** One sentence about what the boundary contains. Wraps; the title does not. */
  description?: React.ReactNode;
  disabled?: boolean;
  /** A machine value — a timestamp, a message count, a commit sha. */
  meta?: React.ReactNode;
  onRestore?: React.MouseEventHandler<HTMLButtonElement>;
  restoreLabel?: React.ReactNode;
  restoringLabel?: string;
  restoring?: boolean;
  title?: React.ReactNode;
} & XstyleProp;
