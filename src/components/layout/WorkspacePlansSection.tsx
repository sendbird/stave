import { Button as AdsButton } from "@/components/ads/components/Button";
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
import { sx } from "@/components/ads/utils/stylex";
import { planStyles } from "./workspace-plans.styles";

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
      <div className={sx(planStyles.root)}>
        {!embedded ? (
          <div className={sx(planStyles.headerRow)}>
            <div className={sx(planStyles.headerText)}>
              <p className={sx(planStyles.headerTitle)}>Plans</p>
              <p className={sx(planStyles.headerHint)}>
                Open the saved plan markdown directly in the editor.
              </p>
            </div>
            <div className={sx(planStyles.headerActions)}>
              <Badge variant="outline" className={sx(planStyles.headerBadge)}>
                {entries.length} saved
              </Badge>
              <Button
                type="button"
                variant="outline"
                size="sm"
                xstyle={planStyles.refreshButton}
                onClick={() => void loadPlans()}
              >
                <RefreshCcw
                  className={sx(
                    planStyles.refreshIcon,
                    listLoading && planStyles.spinning,
                  )}
                />
                Refresh
              </Button>
            </div>
          </div>
        ) : null}

        {!workspacePath ? (
          <div className={sx(planStyles.unavailable)}>
            Workspace path unavailable, so plans cannot be listed here.
          </div>
        ) : listLoading && entries.length === 0 ? (
          <div className={sx(planStyles.loading)} role="status">
            <RefreshCcw
              className={sx(planStyles.smallIcon, planStyles.spinning)}
              aria-hidden="true"
            />
            Loading plans…
          </div>
        ) : entries.length === 0 ? (
          <div className={sx(planStyles.empty)} data-workspace-plans-empty="">
            <div className={sx(planStyles.emptyLead)}>
              <div className={sx(planStyles.emptyMark)}>
                <ClipboardCheck
                  className={sx(planStyles.emptyIcon)}
                  aria-hidden="true"
                />
              </div>
              <div className={sx(planStyles.emptyText)}>
                <p className={sx(planStyles.emptyTitle)}>
                  Start with a lightweight plan
                </p>
                <p className={sx(planStyles.emptyDescription)}>
                  Plans stay as editable markdown and can promote checklist
                  items into workspace todos.
                </p>
              </div>
            </div>
            <div className={sx(planStyles.emptyActions)}>
              <Button
                type="button"
                size="sm"
                xstyle={planStyles.emptyButton}
                onClick={() => void createPlan()}
                disabled={creatingPlan || !args.taskId}
              >
                {creatingPlan ? (
                  <RefreshCcw
                    className={sx(planStyles.smallIcon, planStyles.spinning)}
                  />
                ) : (
                  <FilePlus2 className={sx(planStyles.smallIcon)} />
                )}
                Create plan
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                xstyle={planStyles.emptyButton}
                onClick={() => void revealPlansFolder()}
              >
                <FolderOpen className={sx(planStyles.smallIcon)} />
                Reveal folder
              </Button>
            </div>
          </div>
        ) : (
          <div className={sx(planStyles.list)}>
            {entries.map((entry) => (
              <div key={entry.filePath} className={sx(planStyles.row)}>
                <AdsButton
                  layout="host"
                  type="button"
                  onClick={() => void onOpenFile({ filePath: entry.filePath })}
                  xstyle={planStyles.rowOpen}
                  title={entry.filePath}
                >
                  <ClipboardCheck
                    className={sx(planStyles.rowIcon)}
                    aria-hidden="true"
                  />
                  <div className={sx(planStyles.rowBody)}>
                    <div className={sx(planStyles.rowTitleLine)}>
                      <p className={sx(planStyles.rowTitle)}>{entry.label}</p>
                      {entry.source === "legacy" ? (
                        <Badge
                          variant="outline"
                          className={sx(planStyles.rowBadge)}
                        >
                          legacy
                        </Badge>
                      ) : null}
                    </div>
                    <p className={sx(planStyles.rowMeta)}>
                      Task {entry.taskIdPrefix || "unknown"}
                    </p>
                  </div>
                </AdsButton>
                {onImportTodos ? (
                  <AdsButton
                    layout="host"
                    type="button"
                    onClick={() =>
                      void onImportTodos({ filePath: entry.filePath })
                    }
                    xstyle={planStyles.rowAction}
                    title="Import checklist items as todos"
                    aria-label={`Import checklist items from ${entry.label} as todos`}
                  >
                    <ListPlus
                      className={sx(planStyles.rowActionIcon)}
                      aria-hidden="true"
                    />
                  </AdsButton>
                ) : null}
                <AdsButton
                  layout="host"
                  type="button"
                  onClick={() => setDeleteTarget(entry)}
                  xstyle={[planStyles.rowAction, planStyles.rowActionDanger]}
                  title="Delete saved plan"
                  aria-label={`Delete plan ${entry.label}`}
                >
                  <Trash2
                    className={sx(planStyles.rowActionIcon)}
                    aria-hidden="true"
                  />
                </AdsButton>
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
  // Keep async list results and destructive dialog state owned by one root.
  // Without this boundary, a workspace switch reuses the previous plan list
  // until the new root finishes loading.
  if (args.embedded) {
    return <WorkspacePlansSectionBody key={args.workspacePath} {...args} />;
  }

  return (
    <Card size="sm" className={sx(planStyles.card)}>
      <CardContent className={sx(planStyles.cardContent)}>
        <WorkspacePlansSectionBody key={args.workspacePath} {...args} />
      </CardContent>
    </Card>
  );
}
