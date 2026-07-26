import { Hand, ShieldCheck } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import type { TaskControlOwner } from "@/types/chat";

export function ManagedTaskTakeoverNotice(props: {
  owner: TaskControlOwner;
  isTurnActive: boolean;
  canTakeOver: boolean;
  onTakeOver: () => void;
}) {
  const ownerLabel =
    props.owner === "external" ? "Managed externally" : "Managed by Stave";
  const detail = props.isTurnActive
    ? "The current run is still active. Take Over unlocks when it stops."
    : "The managed run ended. Take over to continue directly in this task.";

  return (
    <div
      className="mb-2 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2"
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
