import { useTranslation } from "@/i18n";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { EmptyState } from "@/components/ads/components/EmptyState";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  AlertTriangle,
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
import { PlansListStatus, PlansSearchField } from "./workspace-plans-list-controls";
import {
  EMPTY_FILE_PATHS,
  initialPlansListState,
  reducePlansList,
  resolvePlansListView,
  selectPlansListRows,
  shouldOfferPlansSearch,
  type WorkspaceDocumentFilePaths,
} from "./workspace-plans-list-state";

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

const EMPTY_DOCUMENT_SUMMARIES: Readonly<
  Record<string, WorkspaceDocumentSummary>
> = {};

/** The Markdown files in the workspace's document folders; throws when a folder could not be read. */
export async function listWorkspaceDocumentFilePaths(
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
  const markdownPaths = (result: typeof currentResult) => {
    // An absent folder holds no plans; any other failed read is a failure, not
    // "no plans", including a folder the OS refused to list.
    if (!result?.ok || result.unreadable) {
      if (!result?.ok && result?.missing) return [];
      throw new Error(result?.stderr || "The plans folder could not be read.");
    }
    return result.entries
      .filter((entry) => entry.type === "file" && entry.path.endsWith(".md"))
      .map((entry) => entry.path);
  };

  return {
    current: markdownPaths(currentResult),
    legacy: markdownPaths(legacyResult),
  };
}

function WorkspacePlansSectionBody(args: WorkspacePlansSectionProps) {
  const { t: tI18n } = useTranslation(["workspace", "common"]);
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
  const [listState, dispatchList] = useReducer(
    reducePlansList,
    Boolean(workspacePath),
    initialPlansListState,
  );
  const { filePaths, loading: listLoading, loadFailed } = listState;
  const entries = useMemo<WorkspacePlanListEntry[]>(() => {
    const updatedAtByPath: Record<string, string> = {};
    for (const [filePath, summary] of Object.entries(documentsByPath)) {
      updatedAtByPath[filePath] = summary.latestCreatedAt;
    }
    // Every document, newest first: the list draws the recent ten, all of
    // them, or a search's matches from this (`selectPlansListRows`).
    return buildWorkspacePlanListEntries({
      currentFilePaths: filePaths.current,
      legacyFilePaths: filePaths.legacy,
      updatedAtByPath,
      maxEntries: Number.POSITIVE_INFINITY,
    });
  }, [documentsByPath, filePaths]);
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showAll, setShowAll] = useState(false);
  const listRows = useMemo(
    () => selectPlansListRows({ entries, query, showAll }),
    [entries, query, showAll],
  );
  const offerSearch = shouldOfferPlansSearch({ total: entries.length, query });
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [deletingPlan, setDeletingPlan] = useState(false);
  const [deleteTarget, setDeleteTarget] =
    useState<WorkspacePlanListEntry | null>(null);
  const listRequestIdRef = useRef(0);

  const loadPlans = useCallback(async () => {
    const requestId = ++listRequestIdRef.current;
    if (!workspacePath) {
      dispatchList({ type: "no-workspace" });
      return;
    }

    dispatchList({ type: "load-started" });
    if (workspaceId) {
      void refreshWorkspaceDocumentActivity(workspaceId);
    }
    try {
      const nextFilePaths = await listWorkspaceDocumentFilePaths(workspacePath);
      if (listRequestIdRef.current === requestId) {
        dispatchList({ type: "load-succeeded", filePaths: nextFilePaths });
      }
    } catch {
      // Keep the last list: an empty one would read as "no plans". The
      // section shows the failure and a retry until a read succeeds.
      if (listRequestIdRef.current === requestId) {
        dispatchList({ type: "load-failed" });
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
  }, [args.taskId, loadPlans, onOpenFile, workspacePath, tI18n]);

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
  }, [workspacePath, tI18n]);

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

      dispatchList({ type: "plan-removed", filePath: target.filePath });
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
  }, [deleteTarget, deletingPlan, loadPlans, onPlanDeleted, workspacePath, tI18n]);

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

  const listView = resolvePlansListView({
    hasWorkspacePath: Boolean(workspacePath),
    loading: listLoading,
    loadFailed,
    entryCount: entries.length,
  });
  const retryButton = (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => void loadPlans()}
      disabled={listLoading}
    >
      <RefreshCcw
        className={sx(planStyles.smallIcon, listLoading && planStyles.spinning)}
        aria-hidden="true"
      />
      {tI18n("common:actions.retry")}
    </Button>
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

        {listView === "unavailable" ? (
          <div className={sx(planStyles.unavailable)}>
            {tI18n("workspace:workspacePlansSection.workspacePathUnavailableSoPlansCannotBe")}</div>
        ) : listView === "failed" ? (
          <EmptyState.Root
            data-workspace-plans-failed=""
            variant="plain"
            role="alert"
          >
            <EmptyState.Media tone="danger">
              <AlertTriangle className={sx(planStyles.emptyIcon)} />
            </EmptyState.Media>
            <EmptyState.Header>
              <EmptyState.Title>{tI18n("workspace:workspacePlansSection.couldNotLoadPlans")}</EmptyState.Title>
              <EmptyState.Description>
                {tI18n("workspace:workspacePlansSection.loadFailedNotEmpty")}</EmptyState.Description>
            </EmptyState.Header>
            <EmptyState.Content xstyle={planStyles.emptyActions}>
              {retryButton}
            </EmptyState.Content>
          </EmptyState.Root>
        ) : listView === "loading" ? (
          <div className={sx(planStyles.loading)} role="status">
            <RefreshCcw
              className={sx(planStyles.smallIcon, planStyles.spinning)}
              aria-hidden="true"
            />
            {tI18n("workspace:workspacePlansSection.loadingPlans")}</div>
        ) : listView === "empty" ? (
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
            {loadFailed ? (
              <div className={sx(planStyles.refreshFailed)} role="alert">
                <span>{tI18n("workspace:workspacePlansSection.refreshFailedListMayBeOutOfDate")}</span>
                {retryButton}
              </div>
            ) : null}
            {offerSearch ? <PlansSearchField query={query} onQueryChange={setQuery} inputRef={searchInputRef} /> : null}
            {listRows.rows.map((entry) => {
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
                    <Tooltip content={tI18n("workspace:workspacePlansSection.compareWithPreviousRevision")}>
                      <AdsButton
                        layout="host"
                        type="button"
                        onClick={() => void compareWithPreviousRevision(summary)}
                        xstyle={planStyles.rowAction}
                        aria-label={tI18n("workspace:workspacePlansSection.compareValueWithPreviousRevision", { value1: entry.label })}
                      >
                        <GitCompare
                          className={sx(planStyles.rowActionIcon)}
                          aria-hidden="true"
                        />
                      </AdsButton>
                    </Tooltip>
                  ) : null}
                  {onImportTodos ? (
                    <Tooltip content={tI18n("workspace:workspacePlansSection.importChecklistItemsAsTodos")}>
                      <AdsButton
                        layout="host"
                        type="button"
                        onClick={() =>
                          void onImportTodos({ filePath: entry.filePath })
                        }
                        xstyle={planStyles.rowAction}
                        aria-label={tI18n("workspace:workspacePlansSection.importChecklistItemsFromValueAsTodos", { value1: entry.label })}
                      >
                        <ListPlus
                          className={sx(planStyles.rowActionIcon)}
                          aria-hidden="true"
                        />
                      </AdsButton>
                    </Tooltip>
                  ) : null}
                  <Tooltip content={tI18n("workspace:workspacePlansSection.deleteSavedPlan")}>
                    <AdsButton
                      layout="host"
                      type="button"
                      onClick={() => setDeleteTarget(entry)}
                      xstyle={[planStyles.rowAction, planStyles.rowActionDanger]}
                      aria-label={tI18n("workspace:workspacePlansSection.deletePlanValue", { value1: entry.label })}
                    >
                      <Trash2
                        className={sx(planStyles.rowActionIcon)}
                        aria-hidden="true"
                      />
                    </AdsButton>
                  </Tooltip>
                </div>
              </div>
              );
            })}
            {offerSearch ? (
              <PlansListStatus
                view={listRows}
                showAll={showAll}
                onShowAllChange={setShowAll}
                onClearSearch={() => {
                  setQuery("");
                  searchInputRef.current?.focus();
                }}
              />
            ) : null}
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
