import { memo } from "react";
import { ThinkingOrb as CanvasThinkingOrb, type OrbState } from "thinking-orbs";
import { cn } from "@/lib/utils";

export interface ThinkingOrbProps {
  /** Elapsed turn time. Rendered as a `tabular-nums` readout when provided. */
  elapsedSeconds?: number;
  /** Animation state from the shared thinking-orbs renderer. */
  state?: OrbState;
  className?: string;
}

function formatElapsed(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) {
    return `${total}s`;
  }
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}m ${remainder}s`;
}

/**
 * Trace-friendly adapter around the shared canvas orb.
 *
 * The state controls the animation vocabulary while the wrapper keeps the
 * existing inline layout and optional elapsed-time readout used by AI Elements.
 */
function ThinkingOrbComponent({ elapsedSeconds, state = "working", className }: ThinkingOrbProps) {
  return (
    <span className={cn("inline-flex items-center gap-[0.4em]", className)}>
      <CanvasThinkingOrb
        state={state}
        size={20}
        theme="auto"
        aria-hidden="true"
      />
      {elapsedSeconds != null ? (
        <span className="text-[0.85em] tabular-nums text-muted-foreground/70">
          {formatElapsed(elapsedSeconds)}
        </span>
      ) : null}
    </span>
  );
}

export const ThinkingOrb = memo(ThinkingOrbComponent);
