import { useCallback, useEffect, useRef, useState } from "react";
import {
  ClipboardCheck,
  FilePlus2,
  FolderOpen,
  ListPlus,
  RefreshCcw,
  Trash2,
} from "lucide-react";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import { Badge, Button, Card, CardContent, toast } from "@/components/ui";
import {
  buildWorkspacePlanListEntries,
  deleteWorkspacePlanFile,
  persistWorkspacePlanFile,
  LEGACY_WORKSPACE_PLANS_DIRECTORY,
  WORKSPACE_PLANS_DIRECTORY,
  type WorkspacePlanListEntry,
} from "@/lib/plans";
import { cn } from "@/lib/utils";

interface WorkspacePlansSectionProps {
  workspacePath: string;
  refreshNonce: number;
  taskId?: string | null;
  embedded?: boolean;
  onOpenFile: (args: { filePath: string }) => Promise<void>;
  onImportTodos?: (args: { filePath: string }) => void | Promise<void>;
  onPlanDeleted?: (args: { filePath: string }) => void | Promise<void>;
  onEntriesChange?: (args: { count: number; loading: boolean }) => void;
}

async function listWorkspacePlanEntries(
  rootPath: string,
): Promise<WorkspacePlanListEntry[]> {
  const listDirectory = window.api?.fs?.listDirectory;
  if (!listDirectory) {
    return [];
  }

  const [currentResult, legacyResult] = await Promise.all([
    listDirectory({ rootPath, directoryPath: WORKSPACE_PLANS_DIRECTORY }),
    listDirectory({
      rootPath,
      directoryPath: LEGACY_WORKSPACE_PLANS_DIRECTORY,
    }),
  ]);

  return buildWorkspacePlanListEntries({
    currentFilePaths: currentResult?.ok
      ? currentResult.entries
          .filter(
            (entry) => entry.type === "file" && entry.path.endsWith(".md"),
          )
          .map((entry) => entry.path)
      : [],
    legacyFilePaths: legacyResult?.ok
      ? legacyResult.entries
          .filter(
            (entry) => entry.type === "file" && entry.path.endsWith(".md"),
          )
          .map((entry) => entry.path)
      : [],
  });
}

function WorkspacePlansSectionBody(args: WorkspacePlansSectionProps) {
  const {
    workspacePath,
    refreshNonce,
    embedded = false,
    onOpenFile,
    onImportTodos,
    onPlanDeleted,
    onEntriesChange,
  } = args;
  const [entries, setEntries] = useState<WorkspacePlanListEntry[]>([]);
  const [listLoading, setListLoading] = useState(Boolean(workspacePath));
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [deletingPlan, setDeletingPlan] = useState(false);
  const [deleteTarget, setDeleteTarget] =
    useState<WorkspacePlanListEntry | null>(null);
  const listRequestIdRef = useRef(0);

  const loadPlans = useCallback(async () => {
    const requestId = ++listRequestIdRef.current;
    if (!workspacePath) {
      setEntries([]);
      setListLoading(false);
      return;
    }

    setListLoading(true);
    try {
      const nextEntries = await listWorkspacePlanEntries(workspacePath);
      if (listRequestIdRef.current === requestId) {
        setEntries(nextEntries);
      }
    } catch {
      if (listRequestIdRef.current === requestId) {
        setEntries([]);
        toast.error("Could not load plans.");
      }
    } finally {
      if (listRequestIdRef.current === requestId) {
        setListLoading(false);
      }
    }
  }, [workspacePath]);

  useEffect(() => {
    void loadPlans();
    return () => {
      listRequestIdRef.current += 1;
    };
  }, [loadPlans, refreshNonce]);

  useEffect(() => {
    onEntriesChange?.({ count: entries.length, loading: listLoading });
  }, [entries.length, listLoading, onEntriesChange]);

  const createPlan = useCallback(async () => {
    if (!workspacePath || !args.taskId) {
      toast.error("Open a task before creating a plan.");
      return;
    }
    setCreatingPlan(true);
    try {
      const filePath = await persistWorkspacePlanFile({
        rootPath: workspacePath,
        taskId: args.taskId,
        planText:
          "# Plan\n\n## Outcome\n\nDescribe the intended result.\n\n## Work\n\n- [ ] First action\n\n## Verification\n\n- [ ] Confirm the outcome\n",
      });
      if (!filePath) {
        toast.error("Could not create the plan file.");
        return;
      }
      await loadPlans();
      await onOpenFile({ filePath });
      toast.success("Plan created");
    } finally {
      setCreatingPlan(false);
    }
  }, [args.taskId, loadPlans, onOpenFile, workspacePath]);

  const revealPlansFolder = useCallback(async () => {
    if (!workspacePath) {
      return;
    }
    await window.api?.fs?.createDirectory?.({
      rootPath: workspacePath,
      directoryPath: WORKSPACE_PLANS_DIRECTORY,
    });
    const normalizedRoot = workspacePath.replace(/[\\/]+$/u, "");
    const result = await window.api?.shell?.showInFinder?.({
      path: `${normalizedRoot}/${WORKSPACE_PLANS_DIRECTORY}`,
    });
    if (result && !result.ok) {
      toast.error("Could not reveal the plans folder.");
    }
  }, [workspacePath]);

  const confirmDeletePlan = useCallback(async () => {
    if (!workspacePath || !deleteTarget || deletingPlan) {
      return;
    }

    const target = deleteTarget;
    setDeletingPlan(true);
    try {
      const deleted = await deleteWorkspacePlanFile({
        rootPath: workspacePath,
        filePath: target.filePath,
      });
      if (!deleted) {
        toast.error("Could not delete the plan.");
        return;
      }

      setEntries((current) =>
        current.filter((entry) => entry.filePath !== target.filePath),
      );
      setDeleteTarget(null);
      try {
        await onPlanDeleted?.({ filePath: target.filePath });
      } catch {
        toast.error("Plan deleted, but the workspace view could not refresh.");
      }
      await loadPlans();
      toast.success("Plan deleted", { description: target.label });
    } finally {
      setDeletingPlan(false);
    }
  }, [deleteTarget, deletingPlan, loadPlans, onPlanDeleted, workspacePath]);

  return (
    <>
      <div className="space-y-3">
        {!embedded ? (
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">Plans</p>
              <p className="text-xs leading-4 text-muted-foreground">
                Open the saved plan markdown directly in the editor.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="rounded-sm">
                {entries.length} saved
              </Badge>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-sm"
                onClick={() => void loadPlans()}
              >
                <RefreshCcw
                  className={cn("mr-1 size-4", listLoading && "animate-spin")}
                />
                Refresh
              </Button>
            </div>
          </div>
        ) : null}

        {!workspacePath ? (
          <div className="rounded-lg border border-dashed border-border/70 bg-muted/15 px-3 py-2 text-xs leading-5 text-muted-foreground">
            Workspace path unavailable, so plans cannot be listed here.
          </div>
        ) : listLoading && entries.length === 0 ? (
          <div
            className="flex items-center gap-2 px-2 py-4 text-xs text-muted-foreground"
            role="status"
          >
            <RefreshCcw className="size-3.5 animate-spin" aria-hidden="true" />
            Loading plans…
          </div>
        ) : entries.length === 0 ? (
          <div className="bg-muted/18 px-3 py-4" data-workspace-plans-empty="">
            <div className="flex items-start gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-background text-primary shadow-sm ring-1 ring-border/65">
                <ClipboardCheck className="size-4" aria-hidden="true" />
              </div>
              <div className="min-w-0 space-y-0">
                <p className="text-sm leading-4 font-medium text-foreground">
                  Start with a lightweight plan
                </p>
                <p className="text-xs leading-[1.25] text-muted-foreground">
                  Plans stay as editable markdown and can promote checklist
                  items into workspace todos.
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                className="h-8"
                onClick={() => void createPlan()}
                disabled={creatingPlan || !args.taskId}
              >
                {creatingPlan ? (
                  <RefreshCcw className="size-3.5 animate-spin" />
                ) : (
                  <FilePlus2 className="size-3.5" />
                )}
                Create plan
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8"
                onClick={() => void revealPlansFolder()}
              >
                <FolderOpen className="size-3.5" />
                Reveal folder
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div
                key={entry.filePath}
                className="group flex w-full items-stretch gap-1 overflow-hidden rounded-lg border border-border/70 bg-muted/20 transition-colors hover:bg-muted/35"
              >
                <button
                  type="button"
                  onClick={() => void onOpenFile({ filePath: entry.filePath })}
                  className="flex min-w-0 flex-1 items-start gap-3 px-3 py-2.5 text-left"
                  title={entry.filePath}
                >
                  <ClipboardCheck
                    className="mt-0.5 size-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">
                        {entry.label}
                      </p>
                      {entry.source === "legacy" ? (
                        <Badge
                          variant="outline"
                          className="rounded-sm px-1.5 py-0 text-[10px]"
                        >
                          legacy
                        </Badge>
                      ) : null}
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground/80">
                      Task {entry.taskIdPrefix || "unknown"}
                    </p>
                  </div>
                </button>
                {onImportTodos ? (
                  <button
                    type="button"
                    onClick={() =>
                      void onImportTodos({ filePath: entry.filePath })
                    }
                    className="flex w-9 shrink-0 items-center justify-center text-muted-foreground/60 transition-colors hover:bg-muted/50 hover:text-foreground"
                    title="Import checklist items as todos"
                    aria-label={`Import checklist items from ${entry.label} as todos`}
                  >
                    <ListPlus className="size-4" aria-hidden="true" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setDeleteTarget(entry)}
                  className="flex w-9 shrink-0 items-center justify-center text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:text-destructive"
                  title="Delete saved plan"
                  aria-label={`Delete plan ${entry.label}`}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete saved plan?"
        description={
          deleteTarget
            ? `${deleteTarget.label} will be permanently removed from this workspace and closed if it is open. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete plan"
        loading={deletingPlan}
        onConfirm={() => void confirmDeletePlan()}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}

export function WorkspacePlansSection(args: WorkspacePlansSectionProps) {
  if (args.embedded) {
    return <WorkspacePlansSectionBody {...args} />;
  }

  return (
    <Card size="sm" className="border border-border/70 bg-background/80">
      <CardContent className="pt-4">
        <WorkspacePlansSectionBody {...args} />
      </CardContent>
    </Card>
  );
}
