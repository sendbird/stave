/**
 * StaveProcessingCard
 *
 * Displays the Stave Pre-processor routing decision inline in a chat message.
 * Shows the selected model + provider icon, strategy, and the Pre-processor's
 * reason, in the style of the AI SDK elements agent component.
 */

import { useState } from "react";
import { ChevronDown, Zap } from "lucide-react";
import type { StaveProcessingPart } from "@/types/chat";
import { inferProviderIdFromModel, toHumanModelName } from "@/lib/providers/model-catalog";
import { ModelIcon } from "@/components/ai-elements/model-icon";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ── Component ─────────────────────────────────────────────────────────────────

interface StaveProcessingCardProps {
  part: StaveProcessingPart;
  className?: string;
}

export function StaveProcessingCard({ part, className }: StaveProcessingCardProps) {
  const [open, setOpen] = useState(false);
  const { strategy, model, supervisorModel, reason, fastModeRequested, fastModeApplied } = part;
  const displayModel = strategy === "direct" ? model : supervisorModel;
  const providerForModel = displayModel ? inferProviderIdFromModel({ model: displayModel }) : "claude-code";
  const providerLabel = providerForModel === "codex" ? "Codex" : providerForModel === "stave" ? "Stave" : "Claude Code";
  const strategyLabel = strategy === "orchestrate" ? "Orchestrate" : "Direct";

  return (
    <section
      className={cn(
        "overflow-hidden rounded-md border border-border/50 bg-muted/25",
        className,
      )}
    >
      <div className="flex items-center gap-2.5 px-2.5 py-2 text-[0.875em]">
        <ModelIcon providerId="stave" className="size-[1.15em] shrink-0 opacity-80" />

        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          {displayModel ? (
            <>
              <ModelIcon providerId={providerForModel} className="size-[1.15em] shrink-0" />
              <span className="font-medium text-foreground/80">{toHumanModelName({ model: displayModel })}</span>
            </>
          ) : null}

          <span className="text-muted-foreground/40 select-none">·</span>
          <span className="truncate text-muted-foreground">{reason}</span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {strategy === "orchestrate" ? (
            <Badge variant="secondary" className="h-auto px-1.5 py-0.5 text-[0.8em] leading-none">
              orchestrate
            </Badge>
          ) : null}
          {fastModeApplied ? (
            <Badge variant="outline" className="h-auto gap-0.5 border-amber-400/50 px-1.5 py-0.5 text-[0.8em] leading-none text-amber-600">
              <Zap className="size-[0.85em]" />
              fast
            </Badge>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[0.8em] font-medium text-muted-foreground transition-colors hover:text-foreground"
            aria-expanded={open}
          >
            Details
            <ChevronDown className={cn("size-[1em] transition-transform", open ? "rotate-180" : "rotate-0")} />
          </button>
        </div>
      </div>

      {open ? (
        <div className="grid gap-2 border-t border-border/40 bg-background/70 px-3 py-2 text-[0.85em] text-muted-foreground sm:grid-cols-2">
          <div>
            <span className="font-medium text-foreground">Strategy:</span> {strategyLabel}
          </div>
          {displayModel ? (
            <div>
              <span className="font-medium text-foreground">Model:</span> {displayModel}
            </div>
          ) : null}
          <div>
            <span className="font-medium text-foreground">Provider:</span> {providerLabel}
          </div>
          <div>
            <span className="font-medium text-foreground">Fast requested:</span>{" "}
            {fastModeRequested ? "Yes" : "No"}
          </div>
          <div>
            <span className="font-medium text-foreground">Fast applied:</span>{" "}
            {fastModeApplied ? "Yes" : "No"}
          </div>
          <div className="sm:col-span-2">
            <span className="font-medium text-foreground">Reason:</span> {reason}
          </div>
        </div>
      ) : null}
    </section>
  );
}
