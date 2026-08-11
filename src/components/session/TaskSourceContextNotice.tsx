import { AlertTriangle, ChevronDown, FileText, X } from "lucide-react";
import {
  isPrContextSourceId,
  partitionStalePrContexts,
} from "@/lib/pr-context";
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

const SUPPORTED_SOURCE_PREFIXES = ["crane:", "pr:"] as const;

function resolveNoticeTitle(parts: readonly TaskSourceContext[]): string {
  const first = parts[0];
  if (!first) {
    return "Attached context";
  }
  if (first.title) {
    return first.title;
  }
  return isPrContextSourceId(first.sourceId)
    ? "Pull request context"
    : "Crane issue context";
}

/**
 * The composer's read-out of everything attached to this task, and the only
 * place a user can see that a PR attachment has gone stale. Staleness is
 * decided by `partitionStalePrContexts`, the same function the turn assembly in
 * `src/store/app.store.ts` uses — the banner and the wire agree by construction.
 */
export function TaskSourceContextNotice(props: {
  sourceContexts: readonly TaskSourceContext[];
  /** Current-branch PR URL and head, for the staleness check. */
  currentPrUrl?: string | null;
  currentPrHeadSha?: string | null;
  onRemove?: (sourceId: string) => void;
  onClear?: () => void;
  onRefreshPrContext?: () => void;
}) {
  const attached = props.sourceContexts.filter((part) =>
    SUPPORTED_SOURCE_PREFIXES.some((prefix) => part.sourceId.startsWith(prefix)),
  );
  if (attached.length === 0) {
    return null;
  }

  const { stale } = partitionStalePrContexts({
    parts: attached,
    currentPrUrl: props.currentPrUrl,
    currentHeadSha: props.currentPrHeadSha,
  });
  const staleSourceIds = new Set(stale.map((part) => part.sourceId));

  return (
    <div className="mb-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
      <div className="flex items-center gap-2">
        <FileText
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {resolveNoticeTitle(attached)}
          </p>
          <p className="text-xs text-muted-foreground">
            Stored locally with this task · Attached to every turn
          </p>
        </div>
        {props.onClear ? (
          <button
            type="button"
            aria-label="Remove all attached context"
            className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
            onClick={props.onClear}
          >
            Clear all
          </button>
        ) : null}
      </div>

      {stale.length > 0 ? (
        <div
          role="status"
          className="mt-2 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-xs text-foreground dark:bg-warning/15"
        >
          <AlertTriangle
            className="mt-0.5 size-3.5 shrink-0 text-warning"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p>
              The pull request moved to a new commit. This evidence is held back
              from further turns until you refresh it.
            </p>
            {props.onRefreshPrContext ? (
              <button
                type="button"
                className="mt-1 rounded-md text-xs font-medium underline underline-offset-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
                onClick={props.onRefreshPrContext}
              >
                Refresh PR context
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <details className="group mt-1.5">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-md py-1 text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 [&::-webkit-details-marker]:hidden">
          View attached context
          <ChevronDown
            className="size-3.5 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="mt-1.5 max-h-56 space-y-3 overflow-y-auto border-l border-border/60 pl-3">
          {attached.map((part) => (
            <section key={part.sourceId} aria-label={part.title ?? part.sourceId}>
              {attached.length > 1 || props.onRemove ? (
                <div className="mb-1 flex items-start gap-2">
                  <p className="min-w-0 flex-1 text-xs font-medium text-foreground">
                    {part.title ?? part.sourceId}
                    {staleSourceIds.has(part.sourceId) ? (
                      <span className="ml-1.5 text-[10px] font-normal text-warning">
                        stale
                      </span>
                    ) : null}
                  </p>
                  {props.onRemove ? (
                    <button
                      type="button"
                      aria-label={`Remove ${part.title ?? part.sourceId}`}
                      className="shrink-0 rounded-md p-0.5 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
                      onClick={() => props.onRemove?.(part.sourceId)}
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
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
