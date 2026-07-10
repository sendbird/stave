import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useShallow } from "zustand/react/shallow";
import {
  ExternalLink,
  GitBranch,
  GitPullRequest,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { ContinueWorkspaceDialog } from "@/components/layout/ContinueWorkspaceDialog";
import {
  buildCreatePrShipPrompt,
  isCreatePrWorkspaceStateActive,
  resolveCreatePrShipAvailability,
} from "@/components/layout/TopBarOpenPR.utils";
import { PrStatusIcon } from "@/components/layout/PrStatusIcon";
import {
  TOP_BAR_PR_ACTION_EVENT,
  type TopBarPrActionDetail,
} from "@/components/layout/top-bar-pr-events";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
} from "@/components/ui";
import {
  PR_CREATE_BUTTON_CLASS,
  PR_STATUS_ACTIONS,
  PR_STATUS_VISUAL,
  PR_TONE_BADGE_CLASS,
  type PrAction,
  type WorkspacePrStatus,
} from "@/lib/pr-status";
import { normalizeComparablePath } from "@/lib/source-control-worktrees";
import { isTaskArchived } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";

interface WorkspaceOperation {
  id: number;
  workspaceId: string;
  label: string;
}

export function TopBarOpenPR(props: { noDragStyle: CSSProperties }) {
  const [activeOperation, setActiveOperation] =
    useState<WorkspaceOperation | null>(null);
  const [continueDialogWorkspaceId, setContinueDialogWorkspaceId] = useState<
    string | null
  >(null);
  const [continuingWorkspaceId, setContinuingWorkspaceId] = useState<
    string | null
  >(null);
  const operationSequenceRef = useRef(0);

  const [
    activeWorkspaceId,
    workspaceBranchById,
    workspacePathById,
    projectPath,
    defaultBranch,
    activeTaskId,
    tasks,
    activeTurnIdsByTask,
    workspacePrInfoById,
    skillCatalog,
    draftProvider,
    refreshSkillCatalog,
    fetchWorkspacePrStatus,
    continueWorkspaceFromSummary,
    sendUserMessage,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.activeWorkspaceId,
          state.workspaceBranchById,
          state.workspacePathById,
          state.projectPath,
          state.defaultBranch,
          state.activeTaskId,
          state.tasks,
          state.activeTurnIdsByTask,
          state.workspacePrInfoById,
          state.skillCatalog,
          state.draftProvider,
          state.refreshSkillCatalog,
          state.fetchWorkspacePrStatus,
          state.continueWorkspaceFromSummary,
          state.sendUserMessage,
        ] as const,
    ),
  );

  const workspaceCwd = workspacePathById[activeWorkspaceId] ?? "";
  const currentBranch = workspaceBranchById[activeWorkspaceId];
  const defaultBaseBranch = defaultBranch.trim() || "main";
  const continueBaseBranch = `origin/${defaultBaseBranch}`;
  const hasWorkspaceContext = Boolean(activeWorkspaceId && workspaceCwd);
  const isDefaultWorkspace =
    Boolean(projectPath) &&
    normalizeComparablePath(workspaceCwd) ===
      normalizeComparablePath(projectPath);
  const activeTask =
    tasks.find((task) => task.id === activeTaskId && !isTaskArchived(task)) ??
    null;
  const activeProvider = activeTask?.provider ?? draftProvider;

  const prInfo = workspacePrInfoById[activeWorkspaceId];
  const prStatus: WorkspacePrStatus = prInfo?.derived ?? "no_pr";
  const visual = PR_STATUS_VISUAL[prStatus];
  const actions = PR_STATUS_ACTIONS[prStatus];
  const badgeColorClass = PR_TONE_BADGE_CLASS[visual.tone];

  const createPrShipAvailability = useMemo(
    () =>
      resolveCreatePrShipAvailability({
        catalogStatus: skillCatalog.status,
        catalogWorkspacePath: skillCatalog.workspacePath,
        workspacePath: workspaceCwd,
        skills: skillCatalog.skills,
        providerId: activeProvider,
      }),
    [
      activeProvider,
      skillCatalog.skills,
      skillCatalog.status,
      skillCatalog.workspacePath,
      workspaceCwd,
    ],
  );

  const currentOperation = isCreatePrWorkspaceStateActive({
    activeWorkspaceId,
    stateWorkspaceId: activeOperation?.workspaceId,
  })
    ? activeOperation
    : null;
  const isBusy = currentOperation !== null;
  const isContinuingWorkspace = isCreatePrWorkspaceStateActive({
    activeWorkspaceId,
    stateWorkspaceId: continuingWorkspaceId,
  });
  const isContinueDialogOpen = isCreatePrWorkspaceStateActive({
    activeWorkspaceId,
    stateWorkspaceId: continueDialogWorkspaceId,
  });
  const hasRespondingTask = tasks.some((task) =>
    Boolean(activeTurnIdsByTask[task.id]),
  );
  const canContinueWorkspace =
    prStatus === "merged" || prStatus === "closed_unmerged";

  const beginWorkspaceOperation = useCallback(
    (label: string) => {
      const operation = {
        id: ++operationSequenceRef.current,
        workspaceId: activeWorkspaceId,
        label,
      };
      setActiveOperation(operation);
      return operation;
    },
    [activeWorkspaceId],
  );

  const finishWorkspaceOperation = useCallback(
    (operation: WorkspaceOperation) => {
      setActiveOperation((current) =>
        current?.id === operation.id ? null : current,
      );
    },
    [],
  );

  const fetchStatus = useCallback(() => {
    if (activeWorkspaceId && !isDefaultWorkspace) {
      void fetchWorkspacePrStatus({ workspaceId: activeWorkspaceId });
    }
  }, [activeWorkspaceId, fetchWorkspacePrStatus, isDefaultWorkspace]);

  useEffect(() => {
    fetchStatus();
    const interval = window.setInterval(fetchStatus, 60_000);
    return () => window.clearInterval(interval);
  }, [fetchStatus]);

  useEffect(() => {
    if (
      !workspaceCwd ||
      normalizeComparablePath(skillCatalog.workspacePath) ===
        normalizeComparablePath(workspaceCwd)
    ) {
      return;
    }
    void refreshSkillCatalog({ workspacePath: workspaceCwd });
  }, [refreshSkillCatalog, skillCatalog.workspacePath, workspaceCwd]);

  const handleCreateClick = useCallback(async () => {
    if (!workspaceCwd) {
      toast.error("Unable to create PR", {
        description: "The active workspace path is not available yet.",
      });
      return;
    }

    if (createPrShipAvailability.status !== "ready") {
      const description =
        createPrShipAvailability.status === "loading"
          ? "The ship workflow is still loading for this workspace."
          : createPrShipAvailability.status === "missing"
            ? "Install or enable the `ship` skill for the active provider."
            : "The skill catalog could not be loaded for this workspace.";
      toast.warning("Create PR is unavailable", { description });
      return;
    }

    const operation = beginWorkspaceOperation("Starting ship...");
    try {
      const result = await sendUserMessage({
        taskId: activeTask?.id ?? "",
        content: buildCreatePrShipPrompt(
          createPrShipAvailability.invocationToken,
        ),
      });

      if (result.status === "blocked") {
        toast.error("Unable to start ship workflow", {
          description:
            "Resolve the active task's pending approval or input, then try again.",
        });
        return;
      }

      if (result.status === "queued") {
        toast.info("Ship workflow queued", {
          description: "It will start after the current task turn completes.",
        });
        return;
      }

      if (result.status === "steer-unavailable") {
        toast.error("Unable to start ship workflow", {
          description: result.message,
        });
        return;
      }

      toast.success("Ship workflow started", {
        description:
          "Follow the active task for validation, commit, push, PR, and auto-merge progress.",
      });
    } catch (error) {
      toast.error("Unable to start ship workflow", {
        description:
          error instanceof Error
            ? error.message
            : "The task could not be started.",
      });
    } finally {
      finishWorkspaceOperation(operation);
    }
  }, [
    activeTask?.id,
    beginWorkspaceOperation,
    createPrShipAvailability,
    finishWorkspaceOperation,
    sendUserMessage,
    workspaceCwd,
  ]);

  const handleMarkReady = useCallback(async () => {
    const setPrReady = window.api?.sourceControl?.setPrReady;
    if (!setPrReady) {
      toast.error("Bridge unavailable");
      return;
    }

    const operation = beginWorkspaceOperation("Working...");
    try {
      const result = await setPrReady({ cwd: workspaceCwd });
      if (!result.ok) {
        toast.error("Failed to mark PR as ready", {
          description: result.stderr,
        });
        return;
      }
      toast.success("PR marked as ready for review");
      fetchStatus();
    } finally {
      finishWorkspaceOperation(operation);
    }
  }, [
    beginWorkspaceOperation,
    fetchStatus,
    finishWorkspaceOperation,
    workspaceCwd,
  ]);

  const handleMerge = useCallback(async () => {
    const mergePr = window.api?.sourceControl?.mergePr;
    if (!mergePr) {
      toast.error("Bridge unavailable");
      return;
    }

    const operation = beginWorkspaceOperation("Working...");
    try {
      const result = await mergePr({ method: "squash", cwd: workspaceCwd });
      if (!result.ok) {
        toast.error("Merge failed", { description: result.stderr });
        return;
      }
      toast.success("PR merged successfully");
      fetchStatus();
    } finally {
      finishWorkspaceOperation(operation);
    }
  }, [
    beginWorkspaceOperation,
    fetchStatus,
    finishWorkspaceOperation,
    workspaceCwd,
  ]);

  const handleUpdateBranch = useCallback(async () => {
    const updatePrBranch = window.api?.sourceControl?.updatePrBranch;
    if (!updatePrBranch) {
      toast.error("Bridge unavailable");
      return;
    }

    const operation = beginWorkspaceOperation("Working...");
    try {
      const result = await updatePrBranch({ cwd: workspaceCwd });
      if (!result.ok) {
        toast.error("Branch update failed", { description: result.stderr });
        return;
      }
      toast.success("Branch updated");
      fetchStatus();
    } finally {
      finishWorkspaceOperation(operation);
    }
  }, [
    beginWorkspaceOperation,
    fetchStatus,
    finishWorkspaceOperation,
    workspaceCwd,
  ]);

  const handleContinueWorkspace = useCallback(
    async (args: { name: string; baseBranch?: string }) => {
      const sourceWorkspaceId = activeWorkspaceId;
      setContinuingWorkspaceId(sourceWorkspaceId);
      try {
        const result = await continueWorkspaceFromSummary({
          name: args.name,
          baseBranch: args.baseBranch,
        });
        if (!result.ok) {
          toast.error("Unable to continue in a new workspace", {
            description:
              result.message ?? "The continuation brief could not be prepared.",
          });
          return result;
        }

        if (result.noticeLevel === "warning") {
          toast.warning("Workspace continued with warning", {
            description:
              result.message ??
              "The workspace was created, but part of the continuation brief setup needs attention.",
          });
        } else {
          toast.success("Workspace continued", {
            description:
              result.message ??
              "The new workspace is ready with a continuation brief attached.",
          });
        }
        return result;
      } finally {
        setContinuingWorkspaceId((current) =>
          current === sourceWorkspaceId ? null : current,
        );
      }
    },
    [activeWorkspaceId, continueWorkspaceFromSummary],
  );

  const handleOpenGitHub = useCallback(() => {
    const url = prInfo?.pr?.url;
    if (url) {
      void window.api?.shell?.openExternal?.({ url });
    }
  }, [prInfo?.pr?.url]);

  const handleAction = useCallback(
    (key: PrAction) => {
      switch (key) {
        case "create_pr":
          void handleCreateClick();
          break;
        case "mark_ready":
          void handleMarkReady();
          break;
        case "merge":
          void handleMerge();
          break;
        case "update_branch":
          void handleUpdateBranch();
          break;
        case "open_github":
          handleOpenGitHub();
          break;
        case "refresh":
          fetchStatus();
          break;
      }
    },
    [
      fetchStatus,
      handleCreateClick,
      handleMarkReady,
      handleMerge,
      handleOpenGitHub,
      handleUpdateBranch,
    ],
  );

  const isCreateDisabled =
    isBusy || hasRespondingTask || createPrShipAvailability.status !== "ready";
  const isContinueDisabled =
    isBusy || isContinuingWorkspace || hasRespondingTask;
  const createPrTooltip = hasRespondingTask
    ? "Pause or finish the running task before starting the ship workflow"
    : createPrShipAvailability.status === "loading"
      ? "Loading the ship workflow for this workspace"
      : createPrShipAvailability.status === "missing"
        ? "Install or enable the ship skill to create pull requests"
        : createPrShipAvailability.status === "error"
          ? "The skill catalog is unavailable for this workspace"
          : "Run the ship skill to validate, commit, push, open a ready PR, and enable auto-merge";
  const continueTooltip = hasRespondingTask
    ? "Pause or finish the running task before continuing into a new workspace"
    : "Create a new workspace and attach a continuation brief from this completed branch";

  useEffect(() => {
    const onTopBarPrAction = (event: Event) => {
      const detail = (event as CustomEvent<TopBarPrActionDetail>).detail;
      if (!detail || !hasWorkspaceContext || isDefaultWorkspace) {
        return;
      }

      if (detail.action === "create-pr") {
        if (isCreateDisabled) {
          toast.warning("Create PR is unavailable", {
            description: createPrTooltip,
          });
          return;
        }
        void handleCreateClick();
        return;
      }

      if (!canContinueWorkspace) {
        return;
      }

      if (isContinueDisabled) {
        toast.warning("Continue is unavailable", {
          description: continueTooltip,
        });
        return;
      }

      setContinueDialogWorkspaceId(activeWorkspaceId);
    };

    window.addEventListener(TOP_BAR_PR_ACTION_EVENT, onTopBarPrAction);
    return () =>
      window.removeEventListener(TOP_BAR_PR_ACTION_EVENT, onTopBarPrAction);
  }, [
    activeWorkspaceId,
    canContinueWorkspace,
    continueTooltip,
    createPrTooltip,
    handleCreateClick,
    hasWorkspaceContext,
    isContinueDisabled,
    isCreateDisabled,
    isDefaultWorkspace,
  ]);

  if (!hasWorkspaceContext || isDefaultWorkspace) {
    return null;
  }

  return (
    <>
      {prStatus === "no_pr" ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors disabled:opacity-50",
                PR_CREATE_BUTTON_CLASS,
              )}
              style={props.noDragStyle}
              onClick={() => void handleCreateClick()}
              disabled={isCreateDisabled}
            >
              {isBusy ? (
                <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
              ) : (
                <GitPullRequest className="size-3.5 shrink-0" />
              )}
              {currentOperation?.label ?? "Create PR"}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{createPrTooltip}</TooltipContent>
        </Tooltip>
      ) : (
        <div className="flex items-center gap-1.5">
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors disabled:opacity-50",
                        badgeColorClass,
                      )}
                      style={props.noDragStyle}
                      disabled={isBusy || isContinuingWorkspace}
                      aria-label="open-pr-status-menu"
                    >
                      {isBusy ? (
                        <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
                      ) : (
                        <PrStatusIcon status={prStatus} className="size-3.5" />
                      )}
                      {currentOperation?.label ?? visual.label}
                    </button>
                  </DropdownMenuTrigger>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                PR #{prInfo?.pr?.number ?? "?"}: {visual.label}
              </TooltipContent>
            </Tooltip>

            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="flex flex-col gap-0.5">
                <span className="truncate text-xs font-medium">
                  #{prInfo?.pr?.number} {prInfo?.pr?.title}
                </span>
                <span className="text-[10px] font-normal text-muted-foreground">
                  {currentBranch} &rarr;{" "}
                  {prInfo?.pr?.baseRefName ?? defaultBaseBranch}
                </span>
              </DropdownMenuLabel>

              <DropdownMenuSeparator />

              {actions.primary ? (
                <DropdownMenuItem
                  className="font-medium"
                  onSelect={() => handleAction(actions.primary!.key)}
                >
                  {actions.primary.label}
                </DropdownMenuItem>
              ) : null}

              {actions.secondary.map((action) => (
                <DropdownMenuItem
                  key={action.key}
                  onSelect={() => handleAction(action.key)}
                >
                  {action.key === "open_github" || action.key === "refresh" ? (
                    <span className="flex items-center gap-2">
                      {action.key === "open_github" ? (
                        <ExternalLink className="size-3.5 text-muted-foreground" />
                      ) : (
                        <RefreshCw className="size-3.5 text-muted-foreground" />
                      )}
                      {action.label}
                    </span>
                  ) : (
                    action.label
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {canContinueWorkspace ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background/80 px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                  style={props.noDragStyle}
                  onClick={() =>
                    setContinueDialogWorkspaceId(activeWorkspaceId)
                  }
                  disabled={isContinueDisabled}
                >
                  {isContinuingWorkspace ? (
                    <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
                  ) : (
                    <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  Continue
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{continueTooltip}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      )}

      <ContinueWorkspaceDialog
        open={isContinueDialogOpen}
        sourceBranch={currentBranch}
        sourceWorkspaceName={currentBranch}
        baseBranch={continueBaseBranch}
        cwd={workspaceCwd}
        defaultBranch={defaultBaseBranch}
        prTitle={prInfo?.pr?.title}
        onOpenChange={(open) =>
          setContinueDialogWorkspaceId(open ? activeWorkspaceId : null)
        }
        onContinue={handleContinueWorkspace}
      />
    </>
  );
}
