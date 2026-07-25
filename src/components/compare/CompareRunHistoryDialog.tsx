import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  History,
  Search,
  SplitSquareHorizontal,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Button, Input } from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  COMPARE_RUN_HISTORY_STATUS_FILTERS,
  listCompareRunHistoryEntries,
  type CompareRunHistoryStatusFilter,
} from "@/lib/compare-run-history";
import type { CompareRun, CompareRunStatus } from "@/lib/compare-runs";
import { formatTaskUpdatedAt } from "@/lib/tasks";
import { cn } from "@/lib/utils";

interface CompareRunHistoryDialogProps {
  open: boolean;
  runsById: Record<string, CompareRun | undefined>;
  onOpenChange: (open: boolean) => void;
  onOpenRun: (compareRunId: string) => void;
}

function StatusIcon(props: { status: CompareRunStatus }) {
  if (props.status === "failed") {
    return <CircleAlert className="size-3.5 text-destructive" />;
  }
  if (props.status === "cancelled") {
    return <XCircle className="size-3.5 text-muted-foreground" />;
  }
  if (props.status === "completed") {
    return <CheckCircle2 className="size-3.5 text-success" />;
  }
  return <Clock3 className="size-3.5 text-primary" />;
}

function getStatusBadgeVariant(status: CompareRunStatus) {
  if (status === "failed") {
    return "destructive" as const;
  }
  if (status === "completed") {
    return "success" as const;
  }
  if (status === "starting" || status === "running") {
    return "secondary" as const;
  }
  return "outline" as const;
}

export function CompareRunHistoryDialog(props: CompareRunHistoryDialogProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<CompareRunHistoryStatusFilter>("all");
  const allEntries = useMemo(
    () => listCompareRunHistoryEntries({ runsById: props.runsById }),
    [props.runsById],
  );
  const visibleEntries = useMemo(
    () =>
      listCompareRunHistoryEntries({
        runsById: props.runsById,
        query,
        status,
      }),
    [props.runsById, query, status],
  );
  const statusCounts = useMemo(
    () =>
      Object.fromEntries(
        COMPARE_RUN_HISTORY_STATUS_FILTERS.map((option) => [
          option.value,
          option.value === "all"
            ? allEntries.length
            : allEntries.filter((entry) => entry.status === option.value)
                .length,
        ]),
      ),
    [allEntries],
  );
  const hasFilters = Boolean(query.trim()) || status !== "all";

  function clearFilters() {
    setQuery("");
    setStatus("all");
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="flex h-[min(82vh,44rem)] max-h-[82vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border/55 px-6 py-5 pr-16">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <SplitSquareHorizontal className="size-4.5" />
            </span>
            <div className="min-w-0 space-y-1.5">
              <DialogTitle className="text-lg font-semibold tracking-[-0.015em]">
                Compare history
              </DialogTitle>
              <DialogDescription>
                Search every saved comparison, then reopen its candidates, judge
                result, and final decision.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 border-b border-border/55 px-6 py-4">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search compare runs"
              placeholder="Search prompts, state, or judge result…"
              className="h-9 pl-9"
            />
          </div>
          <div
            className="flex gap-1 overflow-x-auto pb-0.5"
            role="group"
            aria-label="Filter compare runs by status"
          >
            {COMPARE_RUN_HISTORY_STATUS_FILTERS.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={status === option.value ? "secondary" : "ghost"}
                className={cn(
                  "h-7 shrink-0 gap-1.5 px-2.5 text-xs",
                  status === option.value && "text-foreground shadow-xs",
                )}
                aria-pressed={status === option.value}
                onClick={() => setStatus(option.value)}
              >
                {option.label}
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {statusCounts[option.value] ?? 0}
                </span>
              </Button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {visibleEntries.length > 0 ? (
            <ul aria-label="Compare runs">
              {visibleEntries.map((entry) => (
                <li
                  key={entry.id}
                  className="border-b border-border/45 last:border-b-0"
                >
                  <button
                    type="button"
                    className="group flex w-full items-start gap-3 rounded-lg px-4 py-3.5 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    aria-label={`Open compare run: ${entry.title}`}
                    onClick={() => {
                      props.onOpenRun(entry.id);
                      props.onOpenChange(false);
                    }}
                  >
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground transition-colors group-hover:text-foreground">
                      <StatusIcon status={entry.status} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                          {entry.title}
                        </span>
                        <Badge variant={getStatusBadgeVariant(entry.status)}>
                          {entry.stateLabel}
                        </Badge>
                      </span>
                      <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                        {entry.seedPrompt}
                      </span>
                      <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <span>{entry.progressLabel}</span>
                        {entry.judgeLabel ? (
                          <span>{entry.judgeLabel}</span>
                        ) : null}
                        <span>
                          Updated{" "}
                          {formatTaskUpdatedAt({ value: entry.updatedAt })}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div
              className="flex h-full min-h-56 flex-col items-center justify-center px-6 text-center"
              role="status"
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                <History className="size-4.5" />
              </span>
              <h3 className="mt-3 text-sm font-medium">No matching runs</h3>
              <p className="mt-1 max-w-sm text-sm leading-5 text-muted-foreground">
                Try another prompt or include more lifecycle states.
              </p>
              {hasFilters ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-4"
                  onClick={clearFilters}
                >
                  Clear filters
                </Button>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border/55 px-6 py-3 text-xs text-muted-foreground">
          <span>
            {visibleEntries.length} of {allEntries.length} saved runs
          </span>
          <span>Newest first</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
