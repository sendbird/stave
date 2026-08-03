import { memo } from "react";
import { cn } from "@/lib/utils";

export interface ThinkingOrbProps {
  /** Elapsed turn time. Rendered as a `tabular-nums` readout when provided. */
  elapsedSeconds?: number;
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
 * Streaming indicator for the trace trigger — a soft orb with a breathing halo
 * and an orbiting glint.
 *
 * Every layer paints from `currentColor` (the glint mixes toward white) so the
 * orb inherits the trigger's text colour and needs no theme tokens of its own.
 * Sized in `em` so it scales with `messageFontSize` like the rest of the trace.
 *
 * The core is fully opaque at rest, so `prefers-reduced-motion` leaves a legible
 * static dot rather than a blank slot.
 */
function ThinkingOrbComponent({ elapsedSeconds, className }: ThinkingOrbProps) {
  return (
    <span className={cn("inline-flex items-center gap-[0.4em]", className)}>
      <span aria-hidden="true" className="relative inline-block size-[1.15em] shrink-0">
        {/* Halo — blurred bloom that breathes outward. */}
        <span className="absolute inset-0 rounded-full bg-current opacity-30 blur-[0.14em] motion-safe:animate-thinking-orb-halo" />
        {/* Core — the orb body. */}
        <span className="absolute inset-[0.16em] rounded-full bg-current motion-safe:animate-thinking-orb-core" />
        {/*
         * Glint — a bright arc sweeping around the rim. The radial mask keeps it
         * on the outer ring so it reads as light travelling over a sphere rather
         * than a pie slice rotating.
         */}
        <span
          className={cn(
            "absolute inset-0 rounded-full motion-safe:animate-thinking-orb-spin",
            "bg-[conic-gradient(from_0deg,transparent_0deg,color-mix(in_srgb,currentColor,white_75%)_55deg,transparent_110deg)]",
            "[mask-image:radial-gradient(closest-side,transparent_48%,black_62%)]",
            "motion-reduce:hidden",
          )}
        />
      </span>
      {elapsedSeconds != null ? (
        <span className="text-[0.85em] tabular-nums text-muted-foreground/70">
          {formatElapsed(elapsedSeconds)}
        </span>
      ) : null}
    </span>
  );
}

export const ThinkingOrb = memo(ThinkingOrbComponent);
