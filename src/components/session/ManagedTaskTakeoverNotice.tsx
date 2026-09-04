import { Hand, ShieldCheck } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { TaskControlOwner } from "@/types/chat";

export function ManagedTaskTakeoverNotice(props: {
  owner: TaskControlOwner;
  isTurnActive: boolean;
  canTakeOver: boolean;
  onTakeOver: () => void;
  className?: string;
}) {
  const ownerLabel =
    props.owner === "external" ? "Managed externally" : "Managed by Stave";
  const detail = props.isTurnActive
    ? "Take over to stop the current managed run and continue directly."
    : "The managed run ended. Take over to continue directly in this task.";

  return (
    <div
      data-managed-task-notice="true"
      data-testid="managed-task-takeover-notice"
      className={cn(
        // Same 0.75rem inset as the docked turn-activity shelf. Framed mode
        // with side tracks overrides this from the composer measure parent.
        "mx-3 mb-2 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2",
        props.className,
      )}
      role="status"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
        <ShieldCheck className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-48 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-foreground">{ownerLabel}</p>
          <Badge
            variant="secondary"
            className="rounded-sm text-[10px] uppercase tracking-[0.12em]"
          >
            Managed
          </Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!props.canTakeOver}
        aria-label="Take over managed task"
        onClick={props.onTakeOver}
      >
        <Hand className="size-3.5" aria-hidden="true" />
        Take Over
      </Button>
    </div>
  );
}
