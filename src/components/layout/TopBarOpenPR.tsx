import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  Info,
  LoaderCircle,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { ContinueWorkspaceDialog } from "@/components/layout/ContinueWorkspaceDialog";
import { CreateWorkspaceBranchPicker } from "@/components/layout/CreateWorkspaceBranchPicker";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
} from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  buildPullRequestWorkspaceContext,
  generateFallbackPullRequestDraft,
} from "@/lib/source-control-pr";
import {
  canApplyCreatePrDialogOpenChange,
  canSubmitCreatePr,
  type CreatePrDialogStep,
  type CreatePrSubmitAction,
  buildCreatePrTargetBranchOptions,
  shouldShowCreatePrSubmitSpinner,
} from "@/components/layout/TopBarOpenPR.utils";
import { TOP_BAR_PR_ACTION_EVENT, type TopBarPrActionDetail } from "@/components/layout/top-bar-pr-events";
import { PrStatusIcon } from "@/components/layout/PrStatusIcon";
import { useAppStore } from "@/store/app.store";
import {
  type WorkspacePrStatus,
  PR_STATUS_VISUAL,
  PR_STATUS_ACTIONS,
  PR_CREATE_BUTTON_CLASS,
  PR_TONE_BADGE_CLASS,
} from "@/lib/pr-status";
import { isTaskArchived } from "@/lib/tasks";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PRE_COMMIT_HOOK_PATTERNS = [
  /pre-commit/i,
  /husky/i,
  /lint-staged/i,
  /hook failed/i,
  /eslint.*error/i,
  /prettier.*error/i,
];

/**
 * Heuristic: does the stderr from a failed `git commit` look like a
 * pre-commit hook (husky, lint-staged, eslint, prettier) rejection?
 */
function looksLikePreCommitHookFailure(stderr: string | undefined): boolean {
  if (!stderr) return false;
  return PRE_COMMIT_HOOK_PATTERNS.some((re) => re.test(stderr));
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScmStatusItem {
  path: string;
  code: string;
}

type InlineNoticeTone = "info" | "success" | "warning" | "error";

interface InlineNotice {
  tone: InlineNoticeTone;
  title: string;
  description?: string;
}

type Step = CreatePrDialogStep;

function InlineNoticeBanner(props: { notice: InlineNotice }) {
  const toneClassName =
    props.notice.tone === "success"
      ? "border-success/30 bg-success/10 text-success dark:bg-success/15"
      : props.notice.tone === "warning"
        ? "border-warning/40 bg-warning/10 text-warning dark:bg-warning/15"
        : props.notice.tone === "error"
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-border/70 bg-muted/30 text-foreground";

  const Icon =
    props.notice.tone === "success"
      ? CheckCircle2
      : props.notice.tone === "warning" || props.notice.tone === "error"
        ? TriangleAlert
        : Info;

  return (
    <div className={cn("flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm", toneClassName)} role="status" aria-live="polite">
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 space-y-1">
        <p className="break-words font-medium">{props.notice.title}</p>
        {props.notice.description ? (
          <p className="break-words text-xs leading-5 opacity-80">{props.notice.description}</p>
        ) : null}
      </div>
    </div>
  );
}

function CreatePrLoadingSplash(props: { currentBranch?: string; baseBranch: string }) {
  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/80">
            <LoaderCircle className="size-4 animate-spin text-primary" />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Preparing a PR draft</p>
            <p className="text-sm text-muted-foreground">
              Reviewing {props.currentBranch ?? "HEAD"} against {props.baseBranch}, recent commits, and workspace PR guidance.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-border/70 bg-background/80 p-4">
        <div className="space-y-2">
          <div className="h-3.5 w-14 animate-pulse rounded-full bg-muted" />
          <div className="h-9 w-full animate-pulse rounded-md bg-muted/80" />
        </div>

        <div className="space-y-2">
          <div className="h-3.5 w-24 animate-pulse rounded-full bg-muted" />
          <div className="space-y-2 rounded-md border border-border/60 bg-muted/25 p-3">
            <div className="h-3 w-11/12 animate-pulse rounded-full bg-muted/80" />
            <div className="h-3 w-4/5 animate-pulse rounded-full bg-muted/70" />
            <div className="h-3 w-3/5 animate-pulse rounded-full bg-muted/60" />
          </div>
        </div>
      </div>
    </div>
  );
}

function PullRequestBranchFields(props: {
  currentBranch?: string;
  defaultBranch: string;
  disabled?: boolean;
  loading?: boolean;
  onTargetBranchChange: (branch: string) => void;
  targetBranch: string;
  targetBranchOptions: string[];
}) {
  const headBranch = props.currentBranch?.trim() || "HEAD";

  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="min-w-0 space-y-2">
        <p className="pl-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          From Branch
        </p>
        <div className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background/80 px-3 text-sm shadow-xs">
          <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{headBranch}</span>
        </div>
      </div>

      <div className="min-w-0 space-y-2">
        <p className="pl-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Target Branch
        </p>
        <CreateWorkspaceBranchPicker
          value={props.targetBranch}
          defaultBranch={props.defaultBranch}
          disabled={props.disabled}
          localBranches={[]}
          loading={props.loading}
          remoteBranches={props.targetBranchOptions}
          onChange={props.onTargetBranchChange}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TopBarOpenPR(props: { noDragStyle: CSSProperties }) {
  const [step, setStep] = useState<Step>("idle");
  const [activeSubmitAction, setActiveSubmitAction] = useState<CreatePrSubmitAction | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [continueDialogOpen, setContinueDialogOpen] = useState(false);
  const [continuingWorkspace, setContinuingWorkspace] = useState(false);
  const [targetBranch, setTargetBranch] = useState("");
  const [targetBranchOptions, setTargetBranchOptions] = useState<string[]>([]);
  const [loadingTargetBranches, setLoadingTargetBranches] = useState(false);

  // PR fields
  const [prTitle, setPrTitle] = useState("");
  const [prBody, setPrBody] = useState("");
  const [inlineNotice, setInlineNotice] = useState<InlineNotice | null>(null);

  // Uncommitted changes section
  const [changedFiles, setChangedFiles] = useState<ScmStatusItem[]>([]);
  const [commitMessage, setCommitMessage] = useState("");
  const [changesExpanded, setChangesExpanded] = useState(true);
  const suggestionRequestIdRef = useRef(0);

  const [
    activeWorkspaceId,
    workspaceDefaultById,
    workspaceBranchById,
    workspacePathById,
    projectPath,
    defaultBranch,
    activeTaskId,
    promptDraftByTask,
    workspaceInformation,
    tasks,
    activeTurnIdsByTask,
    workspacePrInfoById,
    fetchWorkspacePrStatus,
    continueWorkspaceFromSummary,
  ] = useAppStore(useShallow((state) => [
    state.activeWorkspaceId,
    state.workspaceDefaultById,
    state.workspaceBranchById,
    state.workspacePathById,
    state.projectPath,
    state.defaultBranch,
    state.activeTaskId,
    state.promptDraftByTask,
    state.workspaceInformation,
    state.tasks,
    state.activeTurnIdsByTask,
    state.workspacePrInfoById,
    state.fetchWorkspacePrStatus,
    state.continueWorkspaceFromSummary,
  ] as const));

  const isDefaultWorkspace = Boolean(workspaceDefaultById[activeWorkspaceId]);
  const workspaceCwd = workspacePathById[activeWorkspaceId] ?? projectPath ?? "";
  const hasWorkspaceContext = Boolean(activeWorkspaceId && workspaceCwd);
  const currentBranch = workspaceBranchById[activeWorkspaceId];
  const defaultBaseBranch = defaultBranch.trim() || "main";
  const continueBaseBranch = `origin/${defaultBaseBranch}`;
  const activeTask = tasks.find((task) => task.id === activeTaskId && !isTaskArchived(task)) ?? null;
  const activeTaskDraft = activeTask?.id ? (promptDraftByTask[activeTask.id] ?? null) : null;

  const prInfo = workspacePrInfoById[activeWorkspaceId];
  const prStatus: WorkspacePrStatus = prInfo?.derived ?? "no_pr";
  const visual = PR_STATUS_VISUAL[prStatus];
  const actions = PR_STATUS_ACTIONS[prStatus];

  // -------------------------------------------------------------------------
  // Polling – fetch PR status for active workspace
  // -------------------------------------------------------------------------

  const fetchStatus = useCallback(() => {
    if (activeWorkspaceId && !isDefaultWorkspace) {
      void fetchWorkspacePrStatus({ workspaceId: activeWorkspaceId });
    }
  }, [activeWorkspaceId, isDefaultWorkspace, fetchWorkspacePrStatus]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 60_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function generateFallbackCommitMessage(files: ScmStatusItem[]) {
    const added = files.filter((f) => f.code === "?" || f.code === "A").length;
    const modified = files.filter((f) => f.code === "M").length;
    const deleted = files.filter((f) => f.code === "D").length;
    const parts: string[] = [];
    if (added > 0) parts.push(`${added} added`);
    if (modified > 0) parts.push(`${modified} modified`);
    if (deleted > 0) parts.push(`${deleted} deleted`);
    return `chore: update ${parts.join(", ") || `${files.length} changes`}`;
  }

  function generateFallbackPRDraft(files: ScmStatusItem[]) {
    const baseBranch = targetBranch.trim() || defaultBaseBranch;
    return generateFallbackPullRequestDraft({
      baseBranch,
      headBranch: currentBranch,
      fileList: files.map((file) => `${file.code} ${file.path}`).join("\n"),
    });
  }

  const resetCreatePrDialogState = useCallback((args?: { closeDialog?: boolean }) => {
    suggestionRequestIdRef.current += 1;
    if (args?.closeDialog) {
      setDialogOpen(false);
    }
    setStep("idle");
    setActiveSubmitAction(null);
    setTargetBranch(defaultBaseBranch);
    setTargetBranchOptions([]);
    setLoadingTargetBranches(false);
    setPrTitle("");
    setPrBody("");
    setInlineNotice(null);
    setChangedFiles([]);
    setCommitMessage("");
    setChangesExpanded(true);
  }, [defaultBaseBranch]);

  async function buildWorkspaceContextForPrDraft() {
    const readFile = window.api?.fs?.readFile;
    const attachedContextSnippets: Array<{ label: string; content: string }> = [];

    if (readFile && workspaceCwd && activeTaskDraft?.attachedFilePaths.length) {
      const snippetResults = await Promise.all(
        activeTaskDraft.attachedFilePaths.slice(0, 2).map(async (filePath) => {
          try {
            const result = await readFile({ rootPath: workspaceCwd, filePath });
            if (!result.ok || !result.content.trim()) {
              return null;
            }
            return { label: filePath, content: result.content };
          } catch {
            return null;
          }
        }),
      );

      for (const snippet of snippetResults) {
        if (snippet) {
          attachedContextSnippets.push(snippet);
        }
      }
    }

    return buildPullRequestWorkspaceContext({
      activeTaskTitle: activeTask?.title,
      taskPrompt: activeTaskDraft?.text,
      attachedContextSnippets,
      notes: workspaceInformation.notes,
      openTodos: workspaceInformation.todos
        .filter((todo) => !todo.completed && todo.text.trim().length > 0)
        .map((todo) => todo.text.trim()),
    });
  }

  // -------------------------------------------------------------------------
  // PR Creation flow
  // -------------------------------------------------------------------------

  const previousWorkspaceIdRef = useRef(activeWorkspaceId);

  useEffect(() => {
    if (previousWorkspaceIdRef.current === activeWorkspaceId) {
      return;
    }
    previousWorkspaceIdRef.current = activeWorkspaceId;
    resetCreatePrDialogState({ closeDialog: true });
  }, [activeWorkspaceId, resetCreatePrDialogState]);

  async function handleCreateClick() {
    const getStatus = window.api?.sourceControl?.getStatus;
    const listBranches = window.api?.sourceControl?.listBranches;
    const suggestPRDescription = window.api?.provider?.suggestPRDescription;
    if (!getStatus) {
      toast.error("Unable to create PR", { description: "Source Control bridge unavailable." });
      return;
    }

    // Guard: ensure the cwd comes from the workspace's own worktree path,
    // not a fallback to the project root.  Using the project root for a
    // non-default workspace would cause git commands to return data from
    // the wrong branch, producing stale or cross-workspace PR drafts.
    if (!workspacePathById[activeWorkspaceId]) {
      toast.error("Unable to create PR", {
        description: "Workspace path is not available yet. Try switching away and back.",
      });
      return;
    }

    const requestId = suggestionRequestIdRef.current + 1;
    suggestionRequestIdRef.current = requestId;

    setStep("loading");
    setDialogOpen(true);
    setPrTitle("");
    setPrBody("");
    setTargetBranch(defaultBaseBranch);
    setTargetBranchOptions([defaultBaseBranch]);
    setLoadingTargetBranches(Boolean(listBranches));
    setActiveSubmitAction(null);
    setCommitMessage("");
    setChangedFiles([]);
    setChangesExpanded(true);
    setInlineNotice({
      tone: "info",
      title: "Preparing PR draft",
      description: "Reviewing the branch diff, recent commits, and workspace PR guidance.",
    });

    const statusPromise = getStatus({ cwd: workspaceCwd });
    const branchPromise = listBranches
      ? listBranches({ cwd: workspaceCwd }).catch(() => undefined)
      : Promise.resolve(undefined);
    const workspaceContextPromise = buildWorkspaceContextForPrDraft();
    const promptPrDescription = useAppStore.getState().settings.promptPrDescription || undefined;
    const descPromise = suggestPRDescription
      ? workspaceContextPromise
        .then((workspaceContext) => suggestPRDescription({
          cwd: workspaceCwd,
          baseBranch: defaultBaseBranch,
          headBranch: currentBranch || undefined,
          promptTemplate: promptPrDescription,
          workspaceContext: workspaceContext || undefined,
        }))
        .catch(() => undefined)
      : undefined;

    const [status, descResult, branchResult] = await Promise.all([
      statusPromise,
      descPromise ?? Promise.resolve(undefined),
      branchPromise,
    ]);
    if (suggestionRequestIdRef.current !== requestId) {
      return;
    }

    if (!status.ok) {
      toast.error("Unable to check status", { description: status.stderr || "git status failed." });
      resetCreatePrDialogState({ closeDialog: true });
      return;
    }

    const nextTargetBranchOptions = branchResult?.ok
      ? buildCreatePrTargetBranchOptions({
        defaultBranch: defaultBaseBranch,
        headBranch: currentBranch,
        remoteBranches: branchResult.remoteBranches ?? [],
      })
      : [defaultBaseBranch];
    const nextTargetBranch = nextTargetBranchOptions.includes(defaultBaseBranch)
      ? defaultBaseBranch
      : nextTargetBranchOptions[0] ?? defaultBaseBranch;
    setTargetBranchOptions(nextTargetBranchOptions);
    setTargetBranch(nextTargetBranch);
    setLoadingTargetBranches(false);

    setChangedFiles(status.items);
    const fallbackDraft = generateFallbackPullRequestDraft({
      baseBranch: nextTargetBranch,
      headBranch: currentBranch,
      fileList: status.items.map((file) => `${file.code} ${file.path}`).join("\n"),
    });
    const nextTitle = descResult?.ok && descResult.title?.trim()
      ? descResult.title.trim()
      : fallbackDraft.title;
    const nextBody = descResult?.ok && descResult.body?.trim()
      ? descResult.body.trim()
      : fallbackDraft.body;

    setPrTitle(nextTitle);
    setPrBody(nextBody);
    setStep("ready");
    setInlineNotice(
      suggestPRDescription && !descResult?.ok
        ? {
          tone: "warning",
          title: "Using fallback PR draft",
          description: "Could not generate a tailored title and description. Review the suggested draft before creating the PR.",
        }
        : null,
    );
  }

  async function handleSubmit(options: { draft: boolean }) {
    const submitAction: CreatePrSubmitAction = options.draft ? "draft" : "pr";
    const getStatus = window.api?.sourceControl?.getStatus;
    const runCommand = window.api?.terminal?.runCommand;
    const createPR = window.api?.sourceControl?.createPR;
    const openExternal = window.api?.shell?.openExternal;
    const runScriptHook = window.api?.scripts?.runHook;
    const selectedTargetBranch = targetBranch.trim() || defaultBaseBranch;
    setActiveSubmitAction(submitAction);

    if (!runCommand || !createPR) {
      setInlineNotice({
        tone: "error",
        title: "Unable to create PR",
        description: "The source control bridge is unavailable in this workspace.",
      });
      setStep("ready");
      return;
    }

    let pendingFiles = changedFiles;
    if (getStatus) {
      const statusResult = await getStatus({ cwd: workspaceCwd });
      if (!statusResult.ok) {
        setInlineNotice({
          tone: "error",
          title: "Unable to refresh workspace changes",
          description: statusResult.stderr || "git status failed.",
        });
        setStep("ready");
        setActiveSubmitAction(null);
        return;
      }
      pendingFiles = statusResult.items;
      setChangedFiles(pendingFiles);
      setChangesExpanded(pendingFiles.length > 0);
    }

    const fallbackDraft = generateFallbackPullRequestDraft({
      baseBranch: selectedTargetBranch,
      headBranch: currentBranch,
      fileList: pendingFiles.map((file) => `${file.code} ${file.path}`).join("\n"),
    });
    let title = prTitle.trim() || fallbackDraft.title;

    // Step 1: Commit uncommitted changes if any
    if (pendingFiles.length > 0) {
      const stageAll = window.api?.sourceControl?.stageAll;
      const commit = window.api?.sourceControl?.commit;
      if (!stageAll || !commit) {
        setInlineNotice({
          tone: "error",
          title: "Automatic commit is unavailable",
          description: "The source control bridge cannot stage and commit the pending files.",
        });
        setStep("ready");
        return;
      }

      setStep("committing");
      setInlineNotice({
        tone: "info",
        title: "Preparing automatic commit",
        description: "Uncommitted workspace changes will be staged and committed before the PR is created.",
      });

      let message = commitMessage.trim();
      if (!message) {
        const suggestCommitMessage = window.api?.provider?.suggestCommitMessage;
        setInlineNotice({
          tone: "info",
          title: "Generating commit message",
          description: "Creating a Conventional Commit message from the current diff.",
        });
        if (suggestCommitMessage) {
          try {
            const result = await suggestCommitMessage({ cwd: workspaceCwd });
            if (result.ok && result.message) {
              message = result.message;
            }
          } catch {
            // fall through
          }
        }
        if (!message) {
          message = generateFallbackCommitMessage(pendingFiles);
        }
      }
      setCommitMessage(message);

      setInlineNotice({
        tone: "info",
        title: "Staging changes",
        description: `Adding ${pendingFiles.length} pending file${pendingFiles.length !== 1 ? "s" : ""} to the automatic commit.`,
      });
      const stageResult = await stageAll({ cwd: workspaceCwd });
      if (!stageResult.ok) {
        setInlineNotice({
          tone: "error",
          title: "Staging failed",
          description: stageResult.stderr || "git add failed.",
        });
        setStep("ready");
        return;
      }

      setInlineNotice({
        tone: "info",
        title: "Creating commit",
        description: message,
      });
      let commitResult = await commit({ message, cwd: workspaceCwd });

      // When a pre-commit hook (husky/lint-staged/eslint) fails, try to
      // auto-fix lint errors and retry the commit once before giving up.
      if (!commitResult.ok && looksLikePreCommitHookFailure(commitResult.stderr)) {
        const tryAutoFixLint = window.api?.sourceControl?.tryAutoFixLint;
        if (tryAutoFixLint) {
          setInlineNotice({
            tone: "info",
            title: "Pre-commit hook failed — attempting auto-fix",
            description: "Running eslint --fix and prettier --write on staged files…",
          });
          const fixResult = await tryAutoFixLint({ cwd: workspaceCwd });
          if (fixResult.fixAttempted) {
            // Re-stage and retry the commit
            await stageAll({ cwd: workspaceCwd });
            setInlineNotice({
              tone: "info",
              title: "Retrying commit after auto-fix",
              description: message,
            });
            commitResult = await commit({ message, cwd: workspaceCwd });
          }
        }
      }

      if (!commitResult.ok) {
        setInlineNotice({
          tone: "error",
          title: "Commit failed",
          description: commitResult.stderr || "git commit failed.",
        });
        setStep("ready");
        return;
      }

      setChangedFiles([]);
      setChangesExpanded(false);
      setInlineNotice({
        tone: "success",
        title: "Changes committed automatically",
        description: message,
      });
    }

    if (runScriptHook && activeWorkspaceId && projectPath) {
      setStep("action");
      setInlineNotice({
        tone: "info",
        title: "Running PR preflight",
        description: "Executing configured `pr.beforeOpen` scripts before push and PR creation.",
      });
      const hookResult = await runScriptHook({
        workspaceId: activeWorkspaceId,
        trigger: "pr.beforeOpen",
        projectPath,
        workspacePath: workspaceCwd,
        workspaceName: currentBranch ?? "workspace",
        branch: currentBranch ?? selectedTargetBranch,
      });
      if (!hookResult.ok) {
        setInlineNotice({
          tone: "error",
          title: "PR preflight failed",
          description: hookResult.error
            ?? hookResult.summary?.failures.map((failure) => `${failure.scriptId}: ${failure.message}`).join(" ")
            ?? "Configured pre-open scripts failed.",
        });
        setStep("ready");
        return;
      }
    }

    // Step 2: Push
    setStep("pushing");
    setInlineNotice({
      tone: "info",
      title: "Pushing branch",
      description: `Updating ${currentBranch ?? "HEAD"} on origin before creating the pull request.`,
    });
    const pushResult = await runCommand({ command: "git push -u origin HEAD", cwd: workspaceCwd });
    if (!pushResult.ok) {
      setInlineNotice({
        tone: "error",
        title: "Push failed",
        description: pushResult.stderr || "git push failed.",
      });
      setStep("ready");
      return;
    }

    // Step 3: Create PR
    setStep("creating-pr");
    setInlineNotice({
      tone: "info",
      title: options.draft ? "Creating draft PR" : "Creating pull request",
      description: `Submitting the prepared title and description to GitHub (target: ${selectedTargetBranch}).`,
    });
    const prResult = await createPR({
      title,
      body: prBody.trim() || undefined,
      baseBranch: selectedTargetBranch,
      draft: options.draft,
      cwd: workspaceCwd,
    });

    if (!prResult.ok) {
      setInlineNotice({
        tone: "error",
        title: "PR creation failed",
        description: prResult.stderr || "gh pr create failed.",
      });
      setStep("ready");
      return;
    }

    // Success – close dialog, refresh status
    setDialogOpen(false);
    setStep("idle");
    setInlineNotice(null);
    setActiveSubmitAction(null);

    const label = options.draft ? "Draft PR created" : "PR created";
    toast.success(label, { description: prResult.prUrl ?? "Pull request created successfully." });

    // Refresh PR status to pick up the new PR
    fetchStatus();

    if (runScriptHook && activeWorkspaceId && projectPath) {
      const hookResult = await runScriptHook({
        workspaceId: activeWorkspaceId,
        trigger: "pr.afterOpen",
        projectPath,
        workspacePath: workspaceCwd,
        workspaceName: currentBranch ?? "workspace",
        branch: currentBranch ?? selectedTargetBranch,
      });
      if (!hookResult.ok) {
        toast.warning("Post-PR scripts reported failures", {
          description: hookResult.error
            ?? hookResult.summary?.failures.map((failure) => `${failure.scriptId}: ${failure.message}`).join(" ")
            ?? "Configured `pr.afterOpen` scripts failed.",
        });
      }
    }

    if (prResult.prUrl && openExternal) {
      try {
        await openExternal({ url: prResult.prUrl });
      } catch {
        // non-critical
      }
    }
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step !== "ready") return;
    void handleSubmit({ draft: false });
  }

  // -------------------------------------------------------------------------
  // PR Action handlers
  // -------------------------------------------------------------------------

  async function handleMarkReady() {
    const setPrReady = window.api?.sourceControl?.setPrReady;
    if (!setPrReady) { toast.error("Bridge unavailable"); return; }

    setStep("action");
    const result = await setPrReady({ cwd: workspaceCwd });
    setStep("idle");

    if (!result.ok) {
      toast.error("Failed to mark PR as ready", { description: result.stderr });
      return;
    }
    toast.success("PR marked as ready for review");
    fetchStatus();
  }

  async function handleMerge() {
    const mergePr = window.api?.sourceControl?.mergePr;
    if (!mergePr) { toast.error("Bridge unavailable"); return; }

    setStep("action");
    const result = await mergePr({ method: "squash", cwd: workspaceCwd });
    setStep("idle");

    if (!result.ok) {
      toast.error("Merge failed", { description: result.stderr });
      return;
    }
    toast.success("PR merged successfully");
    fetchStatus();
  }

  async function handleUpdateBranch() {
    const updatePrBranch = window.api?.sourceControl?.updatePrBranch;
    if (!updatePrBranch) { toast.error("Bridge unavailable"); return; }

    setStep("action");
    const result = await updatePrBranch({ cwd: workspaceCwd });
    setStep("idle");

    if (!result.ok) {
      toast.error("Branch update failed", { description: result.stderr });
      return;
    }
    toast.success("Branch updated");
    fetchStatus();
  }

  async function handleContinueWorkspace(args: { name: string; baseBranch?: string }) {
    setContinuingWorkspace(true);
    try {
      const result = await continueWorkspaceFromSummary({ name: args.name, baseBranch: args.baseBranch });
      if (!result.ok) {
        toast.error("Unable to continue in a new workspace", {
          description: result.message ?? "The continuation brief could not be prepared.",
        });
        return result;
      }

      if (result.noticeLevel === "warning") {
        toast.warning("Workspace continued with warning", {
          description: result.message ?? "The workspace was created, but part of the continuation brief setup needs attention.",
        });
      } else {
        toast.success("Workspace continued", {
          description: result.message ?? "The new workspace is ready with a continuation brief attached.",
        });
      }
      return result;
    } finally {
      setContinuingWorkspace(false);
    }
  }

  function handleOpenGitHub() {
    const url = prInfo?.pr?.url;
    if (url) {
      void window.api?.shell?.openExternal?.({ url });
    }
  }

  function handleAction(key: string) {
    switch (key) {
      case "create_pr":     void handleCreateClick(); break;
      case "create_draft":  void handleCreateClick(); break;
      case "mark_ready":    void handleMarkReady(); break;
      case "merge":         void handleMerge(); break;
      case "update_branch": void handleUpdateBranch(); break;
      case "open_github":   handleOpenGitHub(); break;
      case "refresh":       fetchStatus(); break;
    }
  }

  // -------------------------------------------------------------------------
  // Derived UI state
  // -------------------------------------------------------------------------

  const isBusy = step !== "idle" && step !== "ready";
  const isDialogBusy = step === "committing" || step === "pushing" || step === "creating-pr";
  const isCreateDraftSubmitting = shouldShowCreatePrSubmitSpinner({
    step,
    activeSubmitAction,
    buttonAction: "draft",
  });
  const isCreatePrSubmitting = shouldShowCreatePrSubmitSpinner({
    step,
    activeSubmitAction,
    buttonAction: "pr",
  });
  const effectiveTitle = prTitle.trim() || generateFallbackPRDraft(changedFiles).title;
  const canSubmitPr = canSubmitCreatePr({
    step,
    title: effectiveTitle,
  });
  const statusLabel =
    step === "loading" ? "Loading..." :
    step === "committing" ? "Committing..." :
    step === "pushing" ? "Pushing..." :
    step === "creating-pr" ? "Creating..." :
    step === "action" ? "Working..." :
    null;
  const hasRespondingTask = tasks.some((task) => Boolean(activeTurnIdsByTask[task.id]));
  const isCreateDisabled = isBusy || hasRespondingTask;
  const canContinueWorkspace = prStatus === "merged" || prStatus === "closed_unmerged";
  const isContinueDisabled = isBusy || continuingWorkspace || hasRespondingTask;
  const effectiveTargetBranch = targetBranch.trim() || defaultBaseBranch;
  const createPrTooltip = hasRespondingTask
    ? "Pause or finish the running task before creating a pull request"
    : "Create a pull request on GitHub";
  const continueTooltip = hasRespondingTask
    ? "Pause or finish the running task before continuing into a new workspace"
    : "Create a new workspace and attach a continuation brief from this completed branch";

  const badgeColorClass = PR_TONE_BADGE_CLASS[visual.tone];

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

      setContinueDialogOpen(true);
    };

    window.addEventListener(TOP_BAR_PR_ACTION_EVENT, onTopBarPrAction);
    return () => window.removeEventListener(TOP_BAR_PR_ACTION_EVENT, onTopBarPrAction);
  }, [
    canContinueWorkspace,
    continueTooltip,
    createPrTooltip,
    handleCreateClick,
    hasWorkspaceContext,
    isContinueDisabled,
    isCreateDisabled,
    isDefaultWorkspace,
  ]);

  // -------------------------------------------------------------------------
  // Hide on default workspace
  // -------------------------------------------------------------------------

  if (!hasWorkspaceContext || isDefaultWorkspace) return null;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <>
      {/* --- Trigger button: "Create PR" or PR status dropdown --- */}
      {prStatus === "no_pr" ? (
        /* No PR – show "Create PR" button */
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
              {statusLabel ?? "Create PR"}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{createPrTooltip}</TooltipContent>
        </Tooltip>
      ) : (
        /* Has PR – show status dropdown */
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
                      disabled={isBusy || continuingWorkspace}
                      aria-label="open-pr-status-menu"
                    >
                      {isBusy ? (
                        <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
                      ) : (
                        <PrStatusIcon status={prStatus} className="size-3.5" />
                      )}
                      {statusLabel ?? visual.label}
                    </button>
                  </DropdownMenuTrigger>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                PR #{prInfo?.pr?.number ?? "?"}: {visual.label}
              </TooltipContent>
            </Tooltip>

            <DropdownMenuContent align="end" className="w-64">
              {/* PR info header */}
              <DropdownMenuLabel className="flex flex-col gap-0.5">
                <span className="truncate text-xs font-medium">
                  #{prInfo?.pr?.number} {prInfo?.pr?.title}
                </span>
                <span className="text-[10px] font-normal text-muted-foreground">
                  {currentBranch} &rarr; {prInfo?.pr?.baseRefName ?? defaultBaseBranch}
                </span>
              </DropdownMenuLabel>

              <DropdownMenuSeparator />

              {/* Primary action */}
              {actions.primary ? (
                <DropdownMenuItem
                  className="font-medium"
                  onSelect={() => handleAction(actions.primary!.key)}
                >
                  {actions.primary.label}
                </DropdownMenuItem>
              ) : null}

              {/* Secondary actions */}
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
                  onClick={() => setContinueDialogOpen(true)}
                  disabled={isContinueDisabled}
                >
                  {continuingWorkspace ? (
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

      {/* --- PR Creation Dialog --- */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!canApplyCreatePrDialogOpenChange({ open, isDialogBusy })) {
            return;
          }
          if (open) {
            setDialogOpen(true);
            return;
          }
          resetCreatePrDialogState({ closeDialog: true });
        }}
      >
        <DialogContent
          className="min-w-0 sm:max-w-lg"
          showCloseButton={!isDialogBusy}
          onEscapeKeyDown={(event) => {
            if (isDialogBusy) {
              event.preventDefault();
            }
          }}
          onInteractOutside={(event) => {
            if (isDialogBusy) {
              event.preventDefault();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Create Pull Request</DialogTitle>
            <DialogDescription className="sr-only">
              Create a pull request from {currentBranch ?? "HEAD"} into {effectiveTargetBranch}
            </DialogDescription>
          </DialogHeader>

          {step === "loading" ? (
            <div className="min-w-0 pr-1">
              <CreatePrLoadingSplash currentBranch={currentBranch} baseBranch={effectiveTargetBranch} />
            </div>
          ) : (
            <form className="min-w-0 space-y-4" onSubmit={handleFormSubmit}>
              <div className="min-w-0 space-y-4 pr-1">
                <PullRequestBranchFields
                  currentBranch={currentBranch}
                  defaultBranch={defaultBaseBranch}
                  disabled={isDialogBusy}
                  loading={loadingTargetBranches}
                  targetBranch={effectiveTargetBranch}
                  targetBranchOptions={targetBranchOptions}
                  onTargetBranchChange={(nextBranch) => {
                    setTargetBranch(nextBranch);
                  }}
                />

                {inlineNotice ? <InlineNoticeBanner notice={inlineNotice} /> : null}

                {/* PR Title */}
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="pr-title-input">
                    Title
                  </label>
                  <Input
                    autoFocus
                    id="pr-title-input"
                    className="h-9 text-sm"
                    placeholder="PR title"
                    value={prTitle}
                    onChange={(e) => {
                      setPrTitle(e.target.value);
                    }}
                    disabled={isDialogBusy}
                  />
                </div>

                {/* PR Description */}
                <div className="min-w-0 space-y-2">
                  <label className="text-sm font-medium" htmlFor="pr-body-input">
                    Description
                  </label>
                  <Textarea
                    id="pr-body-input"
                    className="min-h-24 max-h-80 min-w-0 resize-y whitespace-pre-wrap break-words [field-sizing:fixed] [overflow-wrap:anywhere] text-sm"
                    rows={6}
                    wrap="soft"
                    placeholder="Describe your changes..."
                    value={prBody}
                    onChange={(e) => {
                      setPrBody(e.target.value);
                    }}
                    disabled={isDialogBusy}
                  />
                </div>

                {/* Uncommitted Changes */}
                {changedFiles.length > 0 && (
                  <div className="space-y-2">
                    <button
                      type="button"
                      className="flex w-full items-center gap-1 text-sm font-medium text-amber-500"
                      onClick={() => setChangesExpanded((v) => !v)}
                    >
                      {changesExpanded ? (
                        <ChevronDown className="size-3.5" />
                      ) : (
                        <ChevronRight className="size-3.5" />
                      )}
                      {changedFiles.length} uncommitted file{changedFiles.length !== 1 ? "s" : ""}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        (will be committed before creating PR)
                      </span>
                    </button>

                    {changesExpanded && (
                      <>
                        <div className="max-h-32 overflow-y-auto rounded-md border border-border bg-muted/30 p-2 text-xs">
                          {changedFiles.map((file) => (
                            <div key={file.path} className="flex items-center gap-2 py-0.5">
                              <span className="w-5 shrink-0 text-center font-mono font-medium text-muted-foreground">{file.code}</span>
                              <span className="truncate font-mono">{file.path}</span>
                            </div>
                          ))}
                        </div>

                        <Input
                          id="commit-message-input"
                          className="h-9 text-sm"
                          placeholder={generateFallbackCommitMessage(changedFiles)}
                          value={commitMessage}
                          onChange={(e) => setCommitMessage(e.target.value)}
                          disabled={isDialogBusy}
                        />
                      </>
                    )}
                  </div>
                )}
              </div>

              <DialogFooter className="shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canSubmitPr || isDialogBusy}
                  onClick={() => void handleSubmit({ draft: true })}
                >
                  {isCreateDraftSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : null}
                  Create Draft
                </Button>
                <Button
                  type="submit"
                  disabled={!canSubmitPr || isDialogBusy}
                >
                  {isCreatePrSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : null}
                  Create PR
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <ContinueWorkspaceDialog
        open={continueDialogOpen}
        sourceBranch={currentBranch}
        sourceWorkspaceName={currentBranch}
        baseBranch={continueBaseBranch}
        cwd={workspaceCwd}
        defaultBranch={defaultBaseBranch}
        prTitle={prInfo?.pr?.title}
        onOpenChange={setContinueDialogOpen}
        onContinue={handleContinueWorkspace}
      />
    </>
  );
}
