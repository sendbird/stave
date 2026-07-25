import { Bot, ChevronDown, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { toHumanModelName } from "@/lib/providers/model-catalog";
import type { WorkspaceTurnSummary as WorkspaceTurnSummaryValue } from "@/lib/workspace-information";

function SummaryEntry(props: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground/80">
          {props.icon}
        </span>
        <span>{props.label}</span>
      </div>
      <p className="pl-[22px] text-[13px] leading-5 text-foreground/85">
        {props.children}
      </p>
    </div>
  );
}

export function WorkspaceTurnSummary(props: {
  summary: WorkspaceTurnSummaryValue;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {props.summary.taskTitle ? (
          <p className="truncate text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            {props.summary.taskTitle}
          </p>
        ) : null}
        <p className="text-sm font-medium leading-6 text-foreground/95">
          {props.summary.workSummary}
        </p>
      </div>
      <details className="group">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-md py-1 pr-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 [&::-webkit-details-marker]:hidden">
          <span>Details</span>
          <ChevronDown className="size-3.5 transition-transform duration-150 group-open:rotate-180" />
        </summary>
        <div className="mt-2 space-y-3 border-l border-border/60 pl-3">
          <SummaryEntry
            icon={<UserRound className="size-3.5" />}
            label="Original request"
          >
            {props.summary.requestSummary}
          </SummaryEntry>
          <div className="flex items-center gap-2 pl-[22px] text-[11px] text-muted-foreground">
            <Bot className="size-3.5" />
            <span>
              Response by{" "}
              {toHumanModelName({
                model: props.summary.model,
              })}
            </span>
          </div>
        </div>
      </details>
    </div>
  );
}
