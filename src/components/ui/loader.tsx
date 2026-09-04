import type * as React from "react";
import { cn } from "@/lib/utils";
import { LoaderMark } from "./loader.marks";
import type { LoaderSize, LoaderTone, LoaderVariant } from "./loader.types";
import "./loader.css";

export type { LoaderSize, LoaderTone, LoaderVariant } from "./loader.types";

export type LoaderProps = Omit<React.ComponentProps<"span">, "children"> & {
  /** Reduce visual updates for indicators that can remain mounted for minutes. */
  cadence?: "full" | "reduced";
  /** Status text; used as the accessible name when it is visually hidden. */
  label?: string;
  /** Freeze the current frame without removing the status mark. @default false */
  paused?: boolean;
  /** Render the label beside the indicator. @default false */
  showLabel?: boolean;
  /** Indicator footprint: 16 / 20 / 24 / 32px. @default "sm" */
  size?: LoaderSize;
  /** `inherit` works inside a button or semantic status word. @default "inherit" */
  tone?: LoaderTone;
  /**
   * Activity cadence, selected by work shape rather than decoration:
   *
   * - `spinner`: ordinary indeterminate wait
   * - `dots`: conversational hand-off or queue
   * - `matrix`: generative inference
   * - `pulse`: continuous stream
   * - `steps`: staged tool execution
   * - `orbit`: synthesis around stable context
   * - `ripple`: retrieval or retry spreading outward
   * - `signal`: remote I/O or reconnection
   * - `scan`: inspection or indexing pass
   * - `parallel`: concurrent work lanes
   * - `cascade`: dependent pipeline stages
   * - `decode`: token or response resolution
   * - `compile`: build or bundle transformation
   * - `route`: orchestration path
   * - `handoff`: work transferred between agents
   * - `vision`: image or media processing
   * - `explore`: branching alternatives
   * - `sync`: bidirectional state reconciliation
   * - `verify`: validation across checkpoints
   * - `persist`: durable write or commit
   *
   * @default "spinner"
   */
  variant?: LoaderVariant;
};

/**
 * General-purpose indeterminate activity mark. Variants share one size, color,
 * accessibility, and reduced-motion contract so product chrome can name the
 * work shape instead of inventing a one-off spinner.
 */
export function Loader({
  cadence = "full",
  className,
  label = "Loading",
  paused = false,
  showLabel = false,
  size = "sm",
  tone = "inherit",
  variant = "spinner",
  ...props
}: LoaderProps) {
  const hidden =
    props["aria-hidden"] === true || props["aria-hidden"] === "true";

  return (
    <span
      {...props}
      aria-label={
        hidden || showLabel
          ? props["aria-label"]
          : (props["aria-label"] ?? label)
      }
      aria-live={hidden ? undefined : (props["aria-live"] ?? "polite")}
      className={cn("stave-loader", className)}
      data-loader-cadence={cadence}
      data-loader-labeled={showLabel ? "true" : "false"}
      data-loader-paused={paused ? "true" : "false"}
      data-loader-tone={tone}
      data-loader-variant={variant}
      role={hidden ? undefined : (props.role ?? "status")}
    >
      <LoaderMark size={size} variant={variant} />
      {showLabel ? <span className="stave-loader-label">{label}</span> : null}
    </span>
  );
}
