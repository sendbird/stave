import { useState } from "react";
import { Check, ChevronDown, Circle, Loader2, Network, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { OrchestrationProgressPart, OrchestrationSubtaskState } from "@/types/chat";
import { ModelIcon } from "@/components/ai-elements/model-icon";
import type { ProviderId } from "@/lib/providers/provider.types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveProviderIdForModel(model: string): ProviderId {
  const codexModels = new Set(["gpt-5.4", "gpt-5.3-codex"]);
  return codexModels.has(model) ? "codex" : "claude-code";
}

function SubtaskStatusIcon({ status }: { status: OrchestrationSubtaskState["status"] }) {
  switch (status) {
    case "pending":
      return <Circle className="size-[1.15em] text-muted-foreground" />;
    case "running":
      return <Loader2 className="size-[1.15em] animate-spin text-primary" />;
    case "done":
      return <Check className="size-[1.15em] text-green-500" />;
    case "error":
      return <X className="size-[1.15em] text-destructive" />;
  }
}

function getOrchestrationStatusBadge(status: OrchestrationProgressPart["status"]) {
  switch (status) {
    case "planning":
      return <Badge variant="secondary">Planning</Badge>;
    case "executing":
      return <Badge variant="secondary">Orchestrating</Badge>;
    case "synthesizing":
      return <Badge variant="secondary">Synthesizing</Badge>;
    case "done":
      return <Badge variant="outline">Done</Badge>;
  }
}

// ── Main component ────────────────────────────────────────────────────────────

interface OrchestrationCardProps {
  part: OrchestrationProgressPart;
  className?: string;
}

export function OrchestrationCard({ className, part }: OrchestrationCardProps) {
  const [open, setOpen] = useState(true);
  const { subtasks, supervisorModel, status } = part;

  return (
    <section
      className={cn("overflow-hidden rounded-md border border-primary/25 bg-primary/5", className)}
    >
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left"
        onClick={() => setOpen((current) => !current)}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[0.875em] font-semibold text-foreground">
            <Network className="size-[1.15em] text-primary" />
            Orchestrated
          </span>
          <Badge variant="secondary">{subtasks.length} {subtasks.length === 1 ? "subtask" : "subtasks"}</Badge>
        </div>
        <span className="inline-flex shrink-0 items-center gap-2">
          {getOrchestrationStatusBadge(status)}
          <ChevronDown className={cn("size-[1.15em] transition-transform", open ? "rotate-180" : "rotate-0")} />
        </span>
      </button>

      {open ? (
        <div className="border-t border-primary/15 bg-background/70 px-3 py-2 space-y-1.5">
          <p className="pb-1 text-[0.75em] text-muted-foreground">
            Supervisor: <span className="font-medium text-foreground">{supervisorModel}</span>
          </p>
          {subtasks.map((subtask) => (
            <div key={subtask.id} className="flex items-center gap-2 py-1">
              <SubtaskStatusIcon status={subtask.status} />
              <ModelIcon
                providerId={resolveProviderIdForModel(subtask.model)}
                className="size-[1.15em] shrink-0"
              />
              <span className="min-w-[9rem] shrink-0 text-[0.75em] font-medium text-muted-foreground">
                {subtask.model}
              </span>
              <span className="min-w-0 flex-1 truncate text-[0.875em] text-foreground">
                {subtask.title}
              </span>
              {subtask.status === "running" ? (
                <span className="shrink-0 text-[0.75em] text-muted-foreground">running...</span>
              ) : subtask.status === "pending" ? (
                <span className="shrink-0 text-[0.75em] text-muted-foreground">pending</span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
