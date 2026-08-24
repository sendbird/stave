import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";

const SCRATCH_PROVIDERS: readonly ProviderId[] = ["claude-code", "codex"];

export function ScratchProviderToggle(props: {
  provider: ProviderId;
  disabled: boolean;
  onSelect: (provider: ProviderId) => void;
}) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Provider">
      {SCRATCH_PROVIDERS.map((candidate) => {
        const selected = props.provider === candidate;
        return (
          <Button
            key={candidate}
            size="sm"
            variant={selected ? "secondary" : "ghost"}
            disabled={props.disabled}
            aria-pressed={selected}
            className={cn(
              "h-7 flex-1 text-xs",
              selected ? "" : "text-muted-foreground",
            )}
            onClick={() => props.onSelect(candidate)}
          >
            {getProviderLabel({ providerId: candidate, variant: "full" })}
          </Button>
        );
      })}
    </div>
  );
}
