import { ChevronDown, FileText } from "lucide-react";
import type { TaskControlOwner, TaskSourceContext } from "@/types/chat";

export function resolveManagedTaskComposerAccess(args: {
  managedTaskOwner: TaskControlOwner | null;
  isTurnActive: boolean;
  canSteerActiveTurn: boolean;
}) {
  if (args.managedTaskOwner) {
    return {
      disabled: true,
      submitMode: "send" as const,
    };
  }
  if (!args.isTurnActive) {
    return {
      disabled: false,
      submitMode: "send" as const,
    };
  }
  return {
    disabled: false,
    submitMode: args.canSteerActiveTurn
      ? ("steer-or-queue" as const)
      : ("queue-next" as const),
  };
}

export function TaskSourceContextNotice(props: {
  sourceContexts: readonly TaskSourceContext[];
}) {
  const craneContexts = props.sourceContexts.filter((part) =>
    part.sourceId.startsWith("crane:"),
  );
  if (craneContexts.length === 0) {
    return null;
  }

  return (
    <div className="mb-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
      <div className="flex items-center gap-2">
        <FileText
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {craneContexts[0]?.title ?? "Crane issue context"}
          </p>
          <p className="text-xs text-muted-foreground">
            Stored locally with this task · Attached to every turn
          </p>
        </div>
      </div>
      <details className="group mt-1.5">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-md py-1 text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 [&::-webkit-details-marker]:hidden">
          View attached context
          <ChevronDown
            className="size-3.5 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="mt-1.5 max-h-56 space-y-3 overflow-y-auto border-l border-border/60 pl-3">
          {craneContexts.map((part) => (
            <section
              key={part.sourceId}
              aria-label={part.title ?? part.sourceId}
            >
              {craneContexts.length > 1 ? (
                <p className="mb-1 text-xs font-medium text-foreground">
                  {part.title ?? part.sourceId}
                </p>
              ) : null}
              <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-5 text-muted-foreground">
                {part.content}
              </pre>
            </section>
          ))}
        </div>
      </details>
    </div>
  );
}
