import { i18n, useTranslation } from "@/i18n";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { EmptyState } from "@/components/ads/components/EmptyState";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardCheck,
  FilePlus2,
  FolderOpen,
  GitCompare,
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
import type { WorkspaceDocumentSummary } from "@/lib/documents/workspace-document-schemas";
import { useAppStore } from "@/store/app.store";
import {
  openWorkspaceDocumentRevisionDiff,
  refreshWorkspaceDocumentActivity,
  useWorkspaceDocumentsStore,
} from "@/store/workspace-documents-store";
import { sx } from "@/components/ads/utils/stylex";
import { transition } from "@/components/ads/recipes/transition";
import { hostSurface } from "@/components/ui/host-surface.styles";
import { informationRow } from "./information-row.styles";
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

interface WorkspaceDocumentFilePaths {
  current: string[];
  legacy: string[];
}

const EMPTY_FILE_PATHS: WorkspaceDocumentFilePaths = { current: [], legacy: [] };
const EMPTY_DOCUMENT_SUMMARIES: Readonly<
  Record<string, WorkspaceDocumentSummary>
> = {};

async function listWorkspaceDocumentFilePaths(
  rootPath: string,
): Promise<WorkspaceDocumentFilePaths> {
  const listDirectory = window.api?.fs?.listDirectory;
  if (!listDirectory) {
    return EMPTY_FILE_PATHS;
  }

  const [currentResult, legacyResult] = await Promise.all([
    listDirectory({ rootPath, directoryPath: WORKSPACE_PLANS_DIRECTORY }),
    listDirectory({
      rootPath,
      directoryPath: LEGACY_WORKSPACE_PLANS_DIRECTORY,
    }),
  ]);
  const markdownPaths = (result: typeof currentResult) =>
    result?.ok
      ? result.entries
          .filter(
            (entry) => entry.type === "file" && entry.path.endsWith(".md"),
          )
          .map((entry) => entry.path)
      : [];

  return {
    current: markdownPaths(currentResult),
    legacy: markdownPaths(legacyResult),
  };
}

function WorkspacePlansSectionBody(args: WorkspacePlansSectionProps) {
  const { t: tI18n } = useTranslation(["workspace"]);
  const {
    workspacePath,
    refreshNonce,
    embedded = false,
    onOpenFile,
    onImportTodos,
    onPlanDeleted,
    onEntriesChange,
  } = args;
  const workspaceId = useAppStore((state) => state.activeWorkspaceId);
  const openDiffInEditor = useAppStore((state) => state.openDiffInEditor);
  const documentsByPath = useWorkspaceDocumentsStore(
    (state) =>
      state.activityByWorkspace[workspaceId]?.documentsByPath ??
      EMPTY_DOCUMENT_SUMMARIES,
  );
  const [filePaths, setFilePaths] =
    useState<WorkspaceDocumentFilePaths>(EMPTY_FILE_PATHS);
  const entries = useMemo<WorkspacePlanListEntry[]>(() => {
    const updatedAtByPath: Record<string, string> = {};
    for (const [filePath, summary] of Object.entries(documentsByPath)) {
      updatedAtByPath[filePath] = summary.latestCreatedAt;
    }
    return buildWorkspacePlanListEntries({
      currentFilePaths: filePaths.current,
      legacyFilePaths: filePaths.legacy,
      updatedAtByPath,
    });
  }, [documentsByPath, filePaths]);
  const [listLoading, setListLoading] = useState(Boolean(workspacePath));
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [deletingPlan, setDeletingPlan] = useState(false);
  const [deleteTarget, setDeleteTarget] =
    useState<WorkspacePlanListEntry | null>(null);
  const listRequestIdRef = useRef(0);

  const loadPlans = useCallback(async () => {
    const requestId = ++listRequestIdRef.current;
    if (!workspacePath) {
      setFilePaths(EMPTY_FILE_PATHS);
      setListLoading(false);
      return;
    }

    setListLoading(true);
    if (workspaceId) {
      void refreshWorkspaceDocumentActivity(workspaceId);
    }
    try {
      const nextFilePaths = await listWorkspaceDocumentFilePaths(workspacePath);
      if (listRequestIdRef.current === requestId) {
        setFilePaths(nextFilePaths);
      }
    } catch {
      if (listRequestIdRef.current === requestId) {
        setFilePaths(EMPTY_FILE_PATHS);
        toast.error(tI18n("workspace:workspacePlansSection.couldNotLoadPlans"));
      }
    } finally {
      if (listRequestIdRef.current === requestId) {
        setListLoading(false);
      }
    }
  }, [workspaceId, workspacePath]);

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
      toast.error(tI18n("workspace:workspacePlansSection.openATaskBeforeCreatingAPlan"));
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
        toast.error(tI18n("workspace:workspacePlansSection.couldNotCreateThePlanFile"));
        return;
      }
      await loadPlans();
      await onOpenFile({ filePath });
      toast.success(tI18n("workspace:workspacePlansSection.planCreated"));
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
      toast.error(tI18n("workspace:workspacePlansSection.couldNotRevealThePlansFolder"));
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
        toast.error(tI18n("workspace:workspacePlansSection.couldNotDeleteThePlan"));
        return;
      }

      setFilePaths((current) => ({
        current: current.current.filter((path) => path !== target.filePath),
        legacy: current.legacy.filter((path) => path !== target.filePath),
      }));
      setDeleteTarget(null);
      try {
        await onPlanDeleted?.({ filePath: target.filePath });
      } catch {
        toast.error(tI18n("workspace:workspacePlansSection.planDeletedButTheWorkspaceViewCould"));
      }
      await loadPlans();
      toast.success(tI18n("workspace:workspacePlansSection.planDeleted"), { description: target.label });
    } finally {
      setDeletingPlan(false);
    }
  }, [deleteTarget, deletingPlan, loadPlans, onPlanDeleted, workspacePath]);

  const compareWithPreviousRevision = useCallback(
    async (summary: WorkspaceDocumentSummary) => {
      const opened = await openWorkspaceDocumentRevisionDiff({
        workspaceId,
        filePath: summary.filePath,
        revision: summary.latestRevision,
        openDiffInEditor,
      });
      if (!opened) {
        toast.error(tI18n("workspace:workspacePlansSection.couldNotLoadRevision"));
      }
    },
    [openDiffInEditor, tI18n, workspaceId],
  );

  return (
    <>
      <div className={sx(planStyles.root)}>
        {!embedded ? (
          <div className={sx(planStyles.headerRow)}>
            <div className={sx(planStyles.headerText)}>
              <p className={sx(planStyles.headerTitle)}>{tI18n("workspace:workspacePlansSection.plans")}</p>
              <p className={sx(planStyles.headerHint)}>
                {tI18n("workspace:workspacePlansSection.openTheSavedPlanMarkdownDirectlyIn")}</p>
            </div>
            <div className={sx(planStyles.headerActions)}>
              <Badge variant="outline" className={sx(planStyles.headerBadge)}>
          {tI18n("workspace:workspacePlansSection.savedCount", { count: entries.length })}
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
                {tI18n("workspace:workspacePlansSection.refresh")}</Button>
            </div>
          </div>
        ) : null}

        {!workspacePath ? (
          <div className={sx(planStyles.unavailable)}>
            {tI18n("workspace:workspacePlansSection.workspacePathUnavailableSoPlansCannotBe")}</div>
        ) : listLoading && entries.length === 0 ? (
          <div className={sx(planStyles.loading)} role="status">
            <RefreshCcw
              className={sx(planStyles.smallIcon, planStyles.spinning)}
              aria-hidden="true"
            />
            {tI18n("workspace:workspacePlansSection.loadingPlans")}</div>
        ) : entries.length === 0 ? (
          // ADS `EmptyState`, composed: centered medallion over the copy
          // block over the actions. The hand-rolled version top-aligned the
          // medallion beside the text and indented the action row below it,
          // which read as three unrelated fragments.
          <EmptyState.Root
            data-workspace-plans-empty=""
            variant="plain"
          >
            <EmptyState.Media tone="accent">
              <ClipboardCheck className={sx(planStyles.emptyIcon)} />
            </EmptyState.Media>
            <EmptyState.Header>
              <EmptyState.Title>{tI18n("workspace:workspacePlansSection.startWithALightweightPlan")}</EmptyState.Title>
              <EmptyState.Description>
                {tI18n("workspace:workspacePlansSection.plansStayAsEditableMarkdownAndCan")}</EmptyState.Description>
            </EmptyState.Header>
            <EmptyState.Content xstyle={planStyles.emptyActions}>
              <Button
                type="button"
                size="sm"
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
                {tI18n("workspace:workspacePlansSection.createPlan")}</Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => void revealPlansFolder()}
              >
                <FolderOpen className={sx(planStyles.smallIcon)} />
                {tI18n("workspace:workspacePlansSection.revealFolder")}</Button>
            </EmptyState.Content>
          </EmptyState.Root>
        ) : (
          <div className={sx(informationRow.list)}>
            {entries.map((entry) => {
              const summary = documentsByPath[entry.filePath];
              return (
              <div
                key={entry.filePath}
                /* The shared Information-panel row: the same shape as a linked
                   pull request two sections up. The row owns the hover wash and
                   `--info-row-action-opacity`; its actions read that variable
                   rather than each carrying a hover rule. */
                className={sx(informationRow.root, transition.colors)}
              >
                <ClipboardCheck
                  className={sx(informationRow.mark, planStyles.rowMark)}
                  aria-hidden="true"
                />
                <div className={sx(informationRow.body)}>
                  <div className={sx(informationRow.titleLine)}>
                    <AdsButton
                      layout="host"
                      type="button"
                      onClick={() =>
                        void onOpenFile({ filePath: entry.filePath })
                      }
                      /* The row owns the wash; `inertChrome` stops ADS's
                         host-layout trigger recipe painting a second, square
                         one inside it. */
                      xstyle={[informationRow.title, hostSurface.inertChrome]}
                      title={entry.filePath}
                    >
                      {entry.label}
                    </AdsButton>
                    {entry.source === "legacy" ? (
                      <Badge variant="outline">{tI18n("workspace:workspacePlansSection.legacy")}</Badge>
                    ) : null}
                  </div>
                  <div className={sx(informationRow.meta)}>
                    {summary ? (
                      <span
                        className={sx(informationRow.metaText)}
                        title={tI18n("workspace:workspacePlansSection.revisionCount", { count: summary.revisionCount })}
                      >
                        {tI18n("workspace:workspacePlansSection.revision", { value1: summary.latestRevision })}
                      </span>
                    ) : null}
                    {entry.taskIdPrefix ? (
                      <span className={sx(informationRow.metaText)}>
                        {tI18n("workspace:workspacePlansSection.taskReference", { id: entry.taskIdPrefix })}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className={sx(informationRow.trail)}>
                  {summary && summary.latestRevision > 1 ? (
                    <AdsButton
                      layout="host"
                      type="button"
                      onClick={() => void compareWithPreviousRevision(summary)}
                      xstyle={planStyles.rowAction}
                      title={tI18n("workspace:workspacePlansSection.compareWithPreviousRevision")}
                      aria-label={tI18n("workspace:workspacePlansSection.compareValueWithPreviousRevision", { value1: entry.label })}
                    >
                      <GitCompare
                        className={sx(planStyles.rowActionIcon)}
                        aria-hidden="true"
                      />
                    </AdsButton>
                  ) : null}
                  {onImportTodos ? (
                    <AdsButton
                      layout="host"
                      type="button"
                      onClick={() =>
                        void onImportTodos({ filePath: entry.filePath })
                      }
                      xstyle={planStyles.rowAction}
                      title={tI18n("workspace:workspacePlansSection.importChecklistItemsAsTodos")}
                      aria-label={tI18n("workspace:workspacePlansSection.importChecklistItemsFromValueAsTodos", { value1: entry.label })}
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
                    title={tI18n("workspace:workspacePlansSection.deleteSavedPlan")}
                    aria-label={tI18n("workspace:workspacePlansSection.deletePlanValue", { value1: entry.label })}
                  >
                    <Trash2
                      className={sx(planStyles.rowActionIcon)}
                      aria-hidden="true"
                    />
                  </AdsButton>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={deleteTarget !== null}
        title={tI18n("workspace:workspacePlansSection.deleteSavedPlan2")}
        description={
          deleteTarget
            ? tI18n("workspace:workspacePlansSection.valueWillBePermanentlyRemovedFromThis", { value1: deleteTarget.label })
            : undefined
        }
        confirmLabel={tI18n("workspace:workspacePlansSection.deletePlan")}
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
