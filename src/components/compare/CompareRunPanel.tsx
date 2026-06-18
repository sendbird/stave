import {
  CheckCircle2,
  GitBranch,
  LoaderCircle,
  RefreshCw,
  SplitSquareHorizontal,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { buildSourceControlSummary } from "@/components/layout/editor-panel.utils";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  toast,
} from "@/components/ui";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import type { CompareRunVariant } from "@/lib/compare-runs";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import type { SourceControlStatusItem } from "@/lib/source-control-status";

interface VariantSourceControlState {
  status: "idle" | "loading" | "ready" | "error";
  branch?: string;
  items: SourceControlStatusItem[];
  error?: string;
}

const EMPTY_STATUS_ITEMS: SourceControlStatusItem[] = [];

function getVariantStatusLabel(status: CompareRunVariant["status"]) {
  switch (status) {
    case "creating":
      return "Creating";
    case "running":
      return "Running";
    case "failed":
      return "Failed";
    case "kept":
      return "Kept";
    case "discarded":
      return "Discarded";
    case "pending":
    default:
      return "Pending";
  }
}

function getVariantStatusClassName(status: CompareRunVariant["status"]) {
  if (status === "failed") {
    return "border-destructive/40 bg-destructive/10 text-destructive";
  }
  if (status === "kept") {
    return "border-success/40 bg-success/10 text-success";
  }
  if (status === "discarded") {
    return "border-muted-foreground/30 bg-muted text-muted-foreground";
  }
  if (status === "running" || status === "creating") {
    return "border-warning/40 bg-warning/10 text-warning";
  }
  return "border-border/70 bg-muted text-muted-foreground";
}

function VariantStatusIcon(props: { status: CompareRunVariant["status"] }) {
  if (props.status === "failed") {
    return <XCircle className="size-3.5" />;
  }
  if (props.status === "kept") {
    return <CheckCircle2 className="size-3.5" />;
  }
  if (props.status === "running" || props.status === "creating") {
    return <LoaderCircle className="size-3.5 animate-spin" />;
  }
  return <GitBranch className="size-3.5" />;
}

function formatVariantTitle(variant: CompareRunVariant, index: number) {
  return variant.label?.trim() || `Variant ${index + 1}`;
}

function truncatePath(path: string) {
  return path.length > 72 ? `...${path.slice(-69)}` : path;
}

export function CompareRunPanel() {
  const activeCompareRunId = useAppStore((state) =>
    state.activeSurface.kind === "compare-run"
      ? state.activeSurface.compareRunId
      : state.activeCompareRunId,
  );
  const compareRun = useAppStore((state) =>
    activeCompareRunId ? (state.compareRunsById[activeCompareRunId] ?? null) : null,
  );
  const openCompareVariant = useAppStore((state) => state.openCompareVariant);
  const keepCompareVariant = useAppStore((state) => state.keepCompareVariant);
  const cancelCompareRun = useAppStore((state) => state.cancelCompareRun);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [statusByVariantId, setStatusByVariantId] = useState<
    Record<string, VariantSourceControlState | undefined>
  >({});
  const [keepTarget, setKeepTarget] = useState<CompareRunVariant | null>(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const variants = compareRun?.variants ?? [];
  const seedPreview = useMemo(() => {
    const seedPrompt = compareRun?.seedPrompt.trim() ?? "";
    return seedPrompt.length > 180
      ? `${seedPrompt.slice(0, 177).trimEnd()}...`
      : seedPrompt;
  }, [compareRun?.seedPrompt]);

  useEffect(() => {
    if (!compareRun) {
      setStatusByVariantId({});
      return;
    }

    let cancelled = false;
    setStatusByVariantId((current) => {
      const next = { ...current };
      for (const variant of compareRun.variants) {
        if (!variant.workspacePath || variant.status === "discarded") {
          continue;
        }
        next[variant.id] = {
          status: "loading",
          items: next[variant.id]?.items ?? EMPTY_STATUS_ITEMS,
          branch: next[variant.id]?.branch,
        };
      }
      return next;
    });

    void Promise.all(
      compareRun.variants.map(async (variant) => {
        if (!variant.workspacePath || variant.status === "discarded") {
          return;
        }
        const getStatus = window.api?.sourceControl?.getStatus;
        if (!getStatus) {
          if (!cancelled) {
            setStatusByVariantId((current) => ({
              ...current,
              [variant.id]: {
                status: "error",
                items: EMPTY_STATUS_ITEMS,
                error: "Source control bridge is unavailable.",
              },
            }));
          }
          return;
        }
        try {
          const result = await getStatus({ cwd: variant.workspacePath });
          if (cancelled) {
            return;
          }
          setStatusByVariantId((current) => ({
            ...current,
            [variant.id]: result.ok
              ? {
                  status: "ready",
                  branch: result.branch,
                  items: result.items,
                }
              : {
                  status: "error",
                  items: EMPTY_STATUS_ITEMS,
                  error: result.stderr || "Unable to read source status.",
                },
          }));
        } catch (error) {
          if (cancelled) {
            return;
          }
          setStatusByVariantId((current) => ({
            ...current,
            [variant.id]: {
              status: "error",
              items: EMPTY_STATUS_ITEMS,
              error:
                error instanceof Error
                  ? error.message
                  : "Unable to read source status.",
            },
          }));
        }
      }),
    );

    return () => {
      cancelled = true;
    };
  }, [compareRun, refreshNonce]);

  if (!compareRun) {
    return (
      <div className="flex h-full items-center justify-center bg-background p-6">
        <Empty className="border-none bg-transparent p-0">
          <EmptyHeader className="gap-3">
            <EmptyMedia
              variant="icon"
              className="size-14 rounded-2xl bg-primary/10 text-primary [&_svg:not([class*='size-'])]:size-7"
            >
              <SplitSquareHorizontal className="size-7" strokeWidth={1.6} />
            </EmptyMedia>
            <div className="flex flex-col gap-1">
              <EmptyTitle className="text-xl font-semibold">
                No compare run selected
              </EmptyTitle>
              <EmptyDescription className="max-w-md text-sm">
                Start a compare run from the command palette.
              </EmptyDescription>
            </div>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  async function confirmKeepVariant() {
    if (!compareRun || !keepTarget) {
      return;
    }
    setPendingAction(`keep:${keepTarget.id}`);
    try {
      const result = await keepCompareVariant({
        compareRunId: compareRun.id,
        variantId: keepTarget.id,
      });
      if (!result.ok) {
        toast.error("Unable to keep compare variant", {
          description: result.message,
        });
      } else {
        toast.success("Compare variant kept");
      }
      setKeepTarget(null);
    } finally {
      setPendingAction(null);
    }
  }

  async function confirmCancelRun() {
    if (!compareRun) {
      return;
    }
    setPendingAction(`cancel:${compareRun.id}`);
    try {
      const result = await cancelCompareRun({ compareRunId: compareRun.id });
      if (!result.ok) {
        toast.error("Unable to cancel compare run", {
          description: result.message,
        });
      } else {
        toast.success("Compare run cancelled");
      }
      setCancelConfirmOpen(false);
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <ConfirmDialog
        open={Boolean(keepTarget)}
        title="Keep this variant?"
        description="The selected workspace will stay open. Other compare variant workspaces will be closed and cleaned up."
        confirmLabel="Keep variant"
        cancelLabel="Cancel"
        loading={pendingAction?.startsWith("keep:")}
        onCancel={() => setKeepTarget(null)}
        onConfirm={() => void confirmKeepVariant()}
      />
      <ConfirmDialog
        open={cancelConfirmOpen}
        title="Cancel compare run?"
        description="All compare variant workspaces will be closed and cleaned up."
        confirmLabel="Cancel run"
        cancelLabel="Keep running"
        loading={pendingAction?.startsWith("cancel:")}
        onCancel={() => setCancelConfirmOpen(false)}
        onConfirm={() => void confirmCancelRun()}
      />

      <div className="shrink-0 border-b border-border/80 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <SplitSquareHorizontal className="size-4 text-primary" />
              <h2 className="truncate text-sm font-semibold text-foreground">
                Compare Run
              </h2>
              <Badge variant="outline" className="rounded-sm text-[11px]">
                {compareRun.status}
              </Badge>
            </div>
            <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
              {seedPreview}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => setRefreshNonce((value) => value + 1)}
            >
              <RefreshCw className="size-3.5" />
              Refresh
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={
                compareRun.status === "completed" ||
                compareRun.status === "cancelled"
              }
              onClick={() => setCancelConfirmOpen(true)}
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="grid min-w-[760px] grid-cols-2 gap-3 xl:grid-cols-3">
          {variants.map((variant, index) => {
            const sourceState = statusByVariantId[variant.id];
            const items = sourceState?.items ?? EMPTY_STATUS_ITEMS;
            const summary = buildSourceControlSummary({ items });
            const pending = pendingAction === `keep:${variant.id}`;
            const title = formatVariantTitle(variant, index);

            return (
              <section
                key={variant.id}
                className="flex min-h-[22rem] min-w-0 flex-col rounded-md border border-border/80 bg-card"
              >
                <div className="border-b border-border/70 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-foreground">
                          {title}
                        </h3>
                        <span
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[11px] font-medium",
                            getVariantStatusClassName(variant.status),
                          )}
                        >
                          <VariantStatusIcon status={variant.status} />
                          {getVariantStatusLabel(variant.status)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {getProviderLabel({ providerId: variant.provider })}
                        {variant.model ? ` / ${variant.model}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                    {variant.branchName || sourceState?.branch ? (
                      <span className="rounded-sm border border-border/70 bg-background px-1.5 py-0.5">
                        {sourceState?.branch ?? variant.branchName}
                      </span>
                    ) : null}
                    <span className="rounded-sm border border-border/70 bg-background px-1.5 py-0.5">
                      {summary.workingTreeCount + summary.stagedCount} changed
                    </span>
                    {summary.conflictCount > 0 ? (
                      <span className="rounded-sm border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-destructive">
                        {summary.conflictCount} conflicts
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
                  {variant.error ? (
                    <p className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-2 text-xs text-destructive">
                      {variant.error}
                    </p>
                  ) : sourceState?.status === "loading" ? (
                    <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
                      <LoaderCircle className="size-3.5 animate-spin" />
                      Loading changes
                    </div>
                  ) : sourceState?.status === "error" ? (
                    <p className="rounded-md border border-warning/30 bg-warning/10 px-2 py-2 text-xs text-warning">
                      {sourceState.error}
                    </p>
                  ) : items.length === 0 ? (
                    <p className="py-6 text-xs text-muted-foreground">
                      No changed files yet.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {items.map((item) => (
                        <div
                          key={`${item.code}:${item.path}`}
                          className="flex min-w-0 items-center gap-2 rounded-sm border border-border/60 bg-background/70 px-2 py-1.5"
                        >
                          <span className="w-8 shrink-0 rounded-sm bg-muted px-1 py-0.5 text-center text-[10px] font-medium text-muted-foreground">
                            {item.code.trim() || "??"}
                          </span>
                          <span className="min-w-0 truncate text-xs text-foreground">
                            {truncatePath(item.path)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-border/70 px-3 py-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    disabled={!variant.workspaceId || !variant.taskId}
                    onClick={() =>
                      void openCompareVariant({
                        compareRunId: compareRun.id,
                        variantId: variant.id,
                      })
                    }
                  >
                    Open
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8"
                    disabled={
                      !variant.workspaceId ||
                      !variant.taskId ||
                      variant.status === "discarded" ||
                      pending
                    }
                    onClick={() => setKeepTarget(variant)}
                  >
                    Keep
                  </Button>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
