import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { useShallow } from "zustand/react/shallow";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  Info,
  LoaderCircle,
  MessageSquare,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { ContinueWorkspaceDialog } from "@/components/layout/ContinueWorkspaceDialog";
import { PrContextDialog } from "@/components/layout/PrContextDialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
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
  isReasonablePullRequestTitle,
} from "@/lib/source-control-pr";
import {
  canApplyCreatePrDialogOpenChange,
  canSubmitCreatePr,
  buildDriftSelectedFilePaths,
  haveSameCreatePrFileScope,
  isConventionalCommitMessage,
  type CreatePrDialogStep,
  type CreatePrSubmitAction,
  buildCreatePrTargetBranchOptions,
  resolveCreatePrMergeState,
  type ConcretePrMergeMethod,
  type RepoMergeSettings,
  shouldShowCreatePrSubmitSpinner,
} from "@/components/layout/TopBarOpenPR.utils";
import {
  TOP_BAR_PR_ACTION_EVENT,
  type TopBarPrActionDetail,
} from "@/components/layout/top-bar-pr-events";
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
import {
  collectIntentContext,
  type PrePrReviewFinding,
} from "@/lib/source-control-review";
import { buildIntentGuardContextInput } from "@/lib/workspace-information";
import { deriveTurnVerificationStatus } from "@/lib/workspace-scripts";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import {
  reportUtilityInferenceError,
  reportUtilityInferenceOutcome,
} from "@/lib/providers/utility-inference-notice";
import { buildUtilityInferenceContext } from "@/store/provider-runtime-options";
import { cn } from "@/lib/utils";
import {
  collectMartinTriggerContext,
  notifyMartinPrOpened,
} from "@/lib/martin-sync/renderer-triggers";

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

function describeGitHubAuthFailure(result: {
  stdout?: string;
  stderr: string;
}) {
  const detail = `${result.stderr}\n${result.stdout ?? ""}`.trim();
  if (
    /command not found|not recognized|spawn gh ENOENT|no such file/i.test(
      detail,
    )
  ) {
    return "GitHub CLI is not installed. Install `gh` before creating a pull request.";
  }
  return "GitHub CLI is not authenticated. Run `gh auth login` before creating a pull request.";
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

/**
 * Single label language for every field inside the Create PR dialog so labels,
 * controls, and card padding line up on one grid.
 */
const FIELD_LABEL_CLASS =
  "block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground";

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
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm",
        toneClassName,
      )}
      role="status"
      aria-live="polite"
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 space-y-1">
        <p className="break-words font-medium">{props.notice.title}</p>
        {props.notice.description ? (
          <p className="break-words text-xs leading-5 opacity-80">
            {props.notice.description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function CreatePrLoadingSplash(props: {
  currentBranch?: string;
  baseBranch: string;
}) {
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
              Reviewing {props.currentBranch ?? "HEAD"} against{" "}
              {props.baseBranch}, recent commits, and workspace PR guidance.
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

function formatReviewFindingLocation(finding: PrePrReviewFinding) {
  return finding.line ? `${finding.file}:${finding.line}` : finding.file;
}

function formatReviewFindingKind(kind: PrePrReviewFinding["kind"]) {
  return kind.replace(/_/g, " ");
}

function getReviewSeverityClassName(severity: PrePrReviewFinding["severity"]) {
  if (severity === "critical" || severity === "high") {
    return "border-destructive/40 bg-destructive/10 text-destructive";
  }
  if (severity === "medium") {
    return "border-warning/40 bg-warning/10 text-warning";
  }
  return "border-border/70 bg-muted text-muted-foreground";
}

function PrePrReviewFindingsPanel(props: {
  findings: PrePrReviewFinding[];
  truncated?: boolean;
}) {
  if (props.findings.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
      <div className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-foreground">
            AI review found {props.findings.length} issue
            {props.findings.length === 1 ? "" : "s"}
          </p>
          <p className="text-xs leading-5 text-muted-foreground">
            Stop to fix these before opening the PR, or proceed if they are not
            relevant.
            {props.truncated ? " The review used a truncated diff." : ""}
          </p>
        </div>
      </div>

      <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
        {props.findings.map((finding, index) => (
          <div
            key={`${finding.file}:${finding.line ?? "file"}:${index}`}
            className="rounded-md border border-border/70 bg-background/80 p-2"
          >
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  "rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase",
                  getReviewSeverityClassName(finding.severity),
                )}
              >
                {finding.severity}
              </span>
              <span className="rounded-sm border border-border/70 bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                {formatReviewFindingKind(finding.kind)}
              </span>
              <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
                {formatReviewFindingLocation(finding)}
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-5 text-foreground">
              {finding.message}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PrePrVerificationPanel(props: {
  failures: Array<{ scriptId: string; message: string; blocking: boolean }>;
  blocking: boolean;
}) {
  if (props.failures.length === 0) {
    return null;
  }

  const containerClass = props.blocking
    ? "border-destructive/40 bg-destructive/5"
    : "border-warning/40 bg-warning/5";
  const iconClass = props.blocking ? "text-destructive" : "text-warning";

  return (
    <div className={cn("space-y-2 rounded-lg border p-3", containerClass)}>
      <div className="flex items-start gap-2">
        <TriangleAlert className={cn("mt-0.5 size-4 shrink-0", iconClass)} />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-foreground">
            Verification {props.blocking ? "failed" : "reported warnings"} —{" "}
            {props.failures.length} check
            {props.failures.length === 1 ? "" : "s"}
          </p>
          <p className="text-xs leading-5 text-muted-foreground">
            {props.blocking
              ? "Blocking pr.beforeOpen checks failed. Fix them before opening the PR."
              : "These pr.beforeOpen checks are non-blocking — proceed anyway, or stop to fix them first."}
          </p>
        </div>
      </div>

      <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
        {props.failures.map((failure, index) => (
          <div
            key={`${failure.scriptId}:${index}`}
            className="rounded-md border border-border/70 bg-background/80 p-2"
          >
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="rounded-sm border border-border/70 bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                {failure.scriptId}
              </span>
              <span
                className={cn(
                  "rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase",
                  failure.blocking
                    ? "border-destructive/40 text-destructive"
                    : "border-warning/40 text-warning",
                )}
              >
                {failure.blocking ? "blocking" : "non-blocking"}
              </span>
            </div>
            <p className="mt-1.5 break-words text-xs leading-5 text-foreground">
              {failure.message}
            </p>
          </div>
        ))}
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
    <div className="min-w-0 rounded-xl border border-border/70 bg-muted/20 p-3">
      <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-end">
        <div className="min-w-0 space-y-1.5">
          <p className={FIELD_LABEL_CLASS}>From</p>
          <div className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background/80 px-3 text-sm shadow-xs">
            <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{headBranch}</span>
          </div>
        </div>

        <ArrowRight
          className="hidden size-4 shrink-0 text-muted-foreground sm:mb-2.5 sm:block"
          aria-hidden="true"
        />

        <div className="min-w-0 space-y-1.5">
          <p className={FIELD_LABEL_CLASS}>Into</p>
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TopBarOpenPR(props: { noDragStyle: CSSProperties }) {
  const [step, setStep] = useState<Step>("idle");
  const [activeSubmitAction, setActiveSubmitAction] =
    useState<CreatePrSubmitAction | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [continueDialogOpen, setContinueDialogOpen] = useState(false);
  const [prContextDialogOpen, setPrContextDialogOpen] = useState(false);
  const [continuingWorkspace, setContinuingWorkspace] = useState(false);
  const [targetBranch, setTargetBranch] = useState("");
  const [targetBranchOptions, setTargetBranchOptions] = useState<string[]>([]);
  const [loadingTargetBranches, setLoadingTargetBranches] = useState(false);

  // PR fields
  const [prTitle, setPrTitle] = useState("");
  const [prBody, setPrBody] = useState("");
  const [inlineNotice, setInlineNotice] = useState<InlineNotice | null>(null);
  const [reviewFindings, setReviewFindings] = useState<PrePrReviewFinding[]>(
    [],
  );
  const [reviewDiffTruncated, setReviewDiffTruncated] = useState(false);
  const [verificationFailures, setVerificationFailures] = useState<
    Array<{ scriptId: string; message: string; blocking: boolean }>
  >([]);
  const [verificationBlocking, setVerificationBlocking] = useState(false);

  // Uncommitted changes section
  const [changedFiles, setChangedFiles] = useState<ScmStatusItem[]>([]);
  const [selectedFilePaths, setSelectedFilePaths] = useState<string[]>([]);
  const [commitMessage, setCommitMessage] = useState("");
  const [changesExpanded, setChangesExpanded] = useState(true);
  const [repoMergeSettings, setRepoMergeSettings] =
    useState<RepoMergeSettings>();
  const [dialogMergeMethod, setDialogMergeMethod] =
    useState<ConcretePrMergeMethod>("squash");
  const [dialogAutoMerge, setDialogAutoMerge] = useState(false);
  const suggestionRequestIdRef = useRef(0);
  const submitOperationIdRef = useRef(0);
  const userDeselectedPathsRef = useRef(new Set<string>());

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
    prePrReviewEnabled,
    prePrReviewProvider,
    prePrReviewClaudeModel,
    prePrReviewCodexModel,
    prePrReviewCodexBinaryPath,
    prePrReviewCodexReasoningEffort,
    createPrAutoMergeEnabled,
    createPrMergeMethod,
    fetchWorkspacePrStatus,
    continueWorkspaceFromSummary,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
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
          state.settings.prePrReviewEnabled,
          state.settings.prePrReviewProvider,
          state.settings.modelClaude,
          state.settings.modelCodex,
          state.settings.codexBinaryPath,
          state.settings.codexReasoningEffort,
          state.settings.createPrAutoMergeEnabled,
          state.settings.createPrMergeMethod,
          state.fetchWorkspacePrStatus,
          state.continueWorkspaceFromSummary,
        ] as const,
    ),
  );

  const isDefaultWorkspace = Boolean(workspaceDefaultById[activeWorkspaceId]);
  const workspaceCwd =
    workspacePathById[activeWorkspaceId] ?? projectPath ?? "";
  const hasWorkspaceContext = Boolean(activeWorkspaceId && workspaceCwd);
  const currentBranch = workspaceBranchById[activeWorkspaceId];
  const defaultBaseBranch = defaultBranch.trim() || "main";
  const continueBaseBranch = `origin/${defaultBaseBranch}`;
  const activeTask =
    tasks.find((task) => task.id === activeTaskId && !isTaskArchived(task)) ??
    null;
  const activeTaskDraft = activeTask?.id
    ? (promptDraftByTask[activeTask.id] ?? null)
    : null;

  const activeWorkspaceIdRef = useRef(activeWorkspaceId);
  const workspaceCwdRef = useRef(workspaceCwd);
  activeWorkspaceIdRef.current = activeWorkspaceId;
  workspaceCwdRef.current = workspaceCwd;

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

  const resetCreatePrDialogState = useCallback(
    (args?: { closeDialog?: boolean }) => {
      suggestionRequestIdRef.current += 1;
      submitOperationIdRef.current += 1;
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
      setReviewFindings([]);
      setReviewDiffTruncated(false);
      setVerificationFailures([]);
      setVerificationBlocking(false);
      setChangedFiles([]);
      setSelectedFilePaths([]);
      userDeselectedPathsRef.current.clear();
      setCommitMessage("");
      setChangesExpanded(true);
      setRepoMergeSettings(undefined);
      const nextMergeState = resolveCreatePrMergeState({
        preferredMethod: createPrMergeMethod,
        autoMergeEnabled: createPrAutoMergeEnabled,
      });
      setDialogMergeMethod(nextMergeState.mergeMethod);
      setDialogAutoMerge(nextMergeState.autoMergeEnabled);
    },
    [createPrAutoMergeEnabled, createPrMergeMethod, defaultBaseBranch],
  );

  async function buildWorkspaceContextForPrDraft() {
    const readFile = window.api?.fs?.readFile;
    const attachedContextSnippets: Array<{ label: string; content: string }> =
      [];

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
    const getRepoMergeSettings =
      window.api?.sourceControl?.getRepoMergeSettings;
    const suggestPRDescription = window.api?.provider?.suggestPRDescription;
    if (!getStatus) {
      toast.error("Unable to create PR", {
        description: "Source Control bridge unavailable.",
      });
      return;
    }

    // Guard: ensure the cwd comes from the workspace's own worktree path,
    // not a fallback to the project root.  Using the project root for a
    // non-default workspace would cause git commands to return data from
    // the wrong branch, producing stale or cross-workspace PR drafts.
    if (!workspacePathById[activeWorkspaceId]) {
      toast.error("Unable to create PR", {
        description:
          "Workspace path is not available yet. Try switching away and back.",
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
    setSelectedFilePaths([]);
    userDeselectedPathsRef.current.clear();
    setRepoMergeSettings(undefined);
    const configuredMergeState = resolveCreatePrMergeState({
      preferredMethod: createPrMergeMethod,
      autoMergeEnabled: createPrAutoMergeEnabled,
    });
    setDialogMergeMethod(configuredMergeState.mergeMethod);
    setDialogAutoMerge(configuredMergeState.autoMergeEnabled);
    setChangesExpanded(true);
    setReviewFindings([]);
    setReviewDiffTruncated(false);
    setInlineNotice({
      tone: "info",
      title: "Preparing PR draft",
      description:
        "Reviewing the branch diff, recent commits, and workspace PR guidance.",
    });

    const statusPromise = getStatus({ cwd: workspaceCwd });
    const branchPromise = listBranches
      ? listBranches({ cwd: workspaceCwd }).catch(() => undefined)
      : Promise.resolve(undefined);
    const mergeSettingsPromise = getRepoMergeSettings
      ? getRepoMergeSettings({ cwd: workspaceCwd }).catch(() => undefined)
      : Promise.resolve(undefined);
    const promptPrDescription = useAppStore
      .getState()
      .settings.promptPrDescription.trim();
    const shouldSuggestPrDescription = Boolean(
      suggestPRDescription && promptPrDescription,
    );
    const workspaceContextPromise = shouldSuggestPrDescription
      ? buildWorkspaceContextForPrDraft()
      : Promise.resolve("");
    const descPromise =
      shouldSuggestPrDescription && suggestPRDescription
        ? workspaceContextPromise
            .then((workspaceContext) =>
              suggestPRDescription({
                cwd: workspaceCwd,
                baseBranch: defaultBaseBranch,
                headBranch: currentBranch || undefined,
                providerId: activeTask?.provider,
                promptTemplate: promptPrDescription,
                workspaceContext: workspaceContext || undefined,
                runtimeOptions:
                  activeTask?.provider === "codex"
                    ? {
                        model: prePrReviewCodexModel,
                        codexApprovalPolicy: "never",
                        codexBinaryPath:
                          prePrReviewCodexBinaryPath.trim() || undefined,
                        codexFileAccess: "read-only",
                        codexNetworkAccess: false,
                        codexReasoningEffort: prePrReviewCodexReasoningEffort,
                        codexWebSearch: "disabled",
                      }
                    : { model: prePrReviewClaudeModel },
              }),
            )
            .catch(() => undefined)
        : undefined;

    const [status, descResult, branchResult, mergeSettingsResult] =
      await Promise.all([
        statusPromise,
        descPromise ?? Promise.resolve(undefined),
        branchPromise,
        mergeSettingsPromise,
      ]);
    if (suggestionRequestIdRef.current !== requestId) {
      return;
    }

    if (!status.ok) {
      toast.error("Unable to check status", {
        description: status.stderr || "git status failed.",
      });
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
      : (nextTargetBranchOptions[0] ?? defaultBaseBranch);
    setTargetBranchOptions(nextTargetBranchOptions);
    setTargetBranch(nextTargetBranch);
    setLoadingTargetBranches(false);

    setChangedFiles(status.items);
    setSelectedFilePaths(status.items.map((file) => file.path));
    setChangesExpanded(status.items.length > 0);
    const nextRepoMergeSettings = mergeSettingsResult?.ok
      ? {
          squashMergeAllowed: mergeSettingsResult.squashMergeAllowed === true,
          mergeCommitAllowed: mergeSettingsResult.mergeCommitAllowed === true,
          rebaseMergeAllowed: mergeSettingsResult.rebaseMergeAllowed === true,
          autoMergeAllowed: mergeSettingsResult.autoMergeAllowed === true,
        }
      : undefined;
    setRepoMergeSettings(nextRepoMergeSettings);
    const nextMergeState = resolveCreatePrMergeState({
      preferredMethod: createPrMergeMethod,
      autoMergeEnabled: createPrAutoMergeEnabled,
      repoSettings: nextRepoMergeSettings,
    });
    setDialogMergeMethod(nextMergeState.mergeMethod);
    setDialogAutoMerge(nextMergeState.autoMergeEnabled);
    const fallbackDraft = generateFallbackPullRequestDraft({
      baseBranch: nextTargetBranch,
      headBranch: currentBranch,
      fileList: status.items
        .map((file) => `${file.code} ${file.path}`)
        .join("\n"),
    });
    const nextTitle =
      descResult?.ok && descResult.title?.trim()
        ? descResult.title.trim()
        : fallbackDraft.title;
    const nextBody =
      descResult?.ok && descResult.body?.trim()
        ? descResult.body.trim()
        : fallbackDraft.body;

    setPrTitle(nextTitle);
    setPrBody(nextBody);
    setStep("ready");
    const mergeSettingsAuthFailure =
      mergeSettingsResult &&
      !mergeSettingsResult.ok &&
      /not authenticated|gh auth login|not installed|spawn gh enoent/i.test(
        mergeSettingsResult.stderr,
      );
    setInlineNotice(
      mergeSettingsAuthFailure
        ? {
            tone: "error",
            title: "GitHub authentication is required",
            description: describeGitHubAuthFailure(mergeSettingsResult),
          }
        : shouldSuggestPrDescription && !descResult?.ok
          ? {
              tone: "warning",
              title: "Using fallback PR draft",
              description:
                "Could not generate a tailored title and description. Review the suggested draft before creating the PR.",
            }
          : null,
    );
  }

  async function handleSubmit(options: {
    skipReview?: boolean;
    skipVerification?: boolean;
  }) {
    const getStatus = window.api?.sourceControl?.getStatus;
    const runCommand = window.api?.terminal?.runCommand;
    const createPR = window.api?.sourceControl?.createPR;
    const reviewDiff = window.api?.provider?.reviewDiff;
    const openExternal = window.api?.shell?.openExternal;
    const runScriptHook = window.api?.scripts?.runHook;
    const selectedTargetBranch = targetBranch.trim() || defaultBaseBranch;
    const submitWorkspaceId = activeWorkspaceId;
    const submitWorkspaceCwd = workspaceCwd;
    const submitWorkspaceInformation = workspaceInformation;
    const operationId = submitOperationIdRef.current + 1;
    submitOperationIdRef.current = operationId;
    const isCurrentOperation = () =>
      submitOperationIdRef.current === operationId &&
      activeWorkspaceIdRef.current === submitWorkspaceId &&
      workspaceCwdRef.current === submitWorkspaceCwd;

    setActiveSubmitAction("pr");
    if (!options.skipReview) {
      setReviewFindings([]);
      setReviewDiffTruncated(false);
    }
    if (!options.skipVerification) {
      setVerificationFailures([]);
      setVerificationBlocking(false);
    }

    if (!runCommand || !createPR) {
      setInlineNotice({
        tone: "error",
        title: "Unable to create PR",
        description:
          "The source control bridge is unavailable in this workspace.",
      });
      setStep("ready");
      setActiveSubmitAction(null);
      return;
    }

    let pendingFiles = changedFiles.filter((file) =>
      selectedFilePaths.includes(file.path),
    );
    if (getStatus) {
      const statusResult = await getStatus({ cwd: submitWorkspaceCwd });
      if (!isCurrentOperation()) return;
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
      if (statusResult.hasConflicts) {
        setInlineNotice({
          tone: "error",
          title: "Cannot create PR with unresolved conflicts",
          description:
            "Resolve the merge conflicts in this workspace, then refresh and try again.",
        });
        setStep("ready");
        setActiveSubmitAction(null);
        return;
      }

      const initialPaths = changedFiles.map((file) => file.path);
      const currentPaths = statusResult.items.map((file) => file.path);
      if (
        !haveSameCreatePrFileScope({ left: initialPaths, right: currentPaths })
      ) {
        setChangedFiles(statusResult.items);
        setSelectedFilePaths(
          buildDriftSelectedFilePaths({
            currentPaths,
            userDeselectedPaths: userDeselectedPathsRef.current,
          }),
        );
        setChangesExpanded(statusResult.items.length > 0);
        setInlineNotice({
          tone: "warning",
          title: "Workspace changes changed",
          description:
            "The file list changed while the dialog was open. Review the scope and submit again.",
        });
        setStep("ready");
        setActiveSubmitAction(null);
        return;
      }

      pendingFiles = statusResult.items.filter((file) =>
        selectedFilePaths.includes(file.path),
      );
      setChangedFiles(statusResult.items);
      setChangesExpanded(statusResult.items.length > 0);
      if (statusResult.items.length > 0 && pendingFiles.length === 0) {
        setInlineNotice({
          tone: "warning",
          title: "Select files to commit",
          description:
            "Choose at least one current workspace file before creating the PR.",
        });
        setStep("ready");
        setActiveSubmitAction(null);
        return;
      }
    } else if (changedFiles.length > 0 && pendingFiles.length === 0) {
      setInlineNotice({
        tone: "error",
        title: "Unable to verify file scope",
        description:
          "The source control bridge cannot refresh workspace changes safely.",
      });
      setStep("ready");
      setActiveSubmitAction(null);
      return;
    }

    const fallbackDraft = generateFallbackPullRequestDraft({
      baseBranch: selectedTargetBranch,
      headBranch: currentBranch,
      fileList: pendingFiles
        .map((file) => `${file.code} ${file.path}`)
        .join("\n"),
    });
    const title = prTitle.trim() || fallbackDraft.title;
    if (!isReasonablePullRequestTitle(title)) {
      setInlineNotice({
        tone: "error",
        title: "PR title must use the project convention",
        description:
          "Use a lowercase Conventional Commit title such as `fix(topbar): stabilize create pr flow`.",
      });
      setStep("ready");
      setActiveSubmitAction(null);
      return;
    }

    const suggestCommitMessage = window.api?.provider?.suggestCommitMessage;
    const utilitySettings = useAppStore.getState().settings;
    const utilityActiveProvider = activeTask?.provider ?? "claude-code";
    const commitMessageSuggestionPromise =
      pendingFiles.length > 0 && !commitMessage.trim() && suggestCommitMessage
        ? suggestCommitMessage({
            ...buildUtilityInferenceContext({
              cwd: submitWorkspaceCwd,
              provider: utilityActiveProvider,
              model:
                utilityActiveProvider === "codex"
                  ? utilitySettings.modelCodex
                  : utilitySettings.modelClaude,
              settings: utilitySettings,
            }),
          })
            .then((result) => {
              reportUtilityInferenceOutcome({
                feature: "commit-message",
                ok: result.ok,
                utility: result.utility,
              });
              return result;
            })
            .catch((error) => {
              reportUtilityInferenceError({
                feature: "commit-message",
                error,
              });
              return undefined;
            })
        : undefined;

    if (prePrReviewEnabled && reviewDiff && !options.skipReview) {
      const reviewProviderLabel = getProviderLabel({
        providerId: prePrReviewProvider,
      });
      const reviewModel =
        prePrReviewProvider === "codex"
          ? prePrReviewCodexModel
          : prePrReviewClaudeModel;
      const reviewRuntimeOptions =
        prePrReviewProvider === "codex"
          ? {
              model: reviewModel,
              codexApprovalPolicy: "never" as const,
              codexBinaryPath: prePrReviewCodexBinaryPath.trim() || undefined,
              codexFileAccess: "read-only" as const,
              codexNetworkAccess: false,
              codexReasoningEffort: prePrReviewCodexReasoningEffort,
              codexWebSearch: "disabled" as const,
            }
          : { model: reviewModel };
      setStep("reviewing");
      setInlineNotice({
        tone: "info",
        title: "Running AI pre-PR review",
        description: `${reviewProviderLabel} is checking the branch diff for concrete bugs, races, and security issues before any files are staged.`,
      });

      try {
        const reviewArgs = {
          cwd: submitWorkspaceCwd,
          baseBranch: selectedTargetBranch,
          headBranch: currentBranch || undefined,
          providerId: prePrReviewProvider,
          model: reviewModel,
          runtimeOptions: reviewRuntimeOptions,
        };
        const reviewResult = await reviewDiff(reviewArgs);
        if (!isCurrentOperation()) return;

        const findings: PrePrReviewFinding[] = reviewResult.ok
          ? [...reviewResult.findings]
          : [];
        let truncated = Boolean(reviewResult.truncated);

        // Intent guard: a second single-turn check that compares the diff
        // against the pinned product intent (PRD / spec / design). Only runs
        // when the workspace has intent pinned, so it is a no-op otherwise.
        const intentContext = collectIntentContext(
          buildIntentGuardContextInput(submitWorkspaceInformation),
        );
        if (intentContext) {
          setInlineNotice({
            tone: "info",
            title: "Running AI intent guard",
            description: `${reviewProviderLabel} is checking the change against the pinned product intent (PRD / spec / design).`,
          });
          try {
            const intentResult = await reviewDiff({
              ...reviewArgs,
              mode: "intent",
              intentContext,
            });
            if (!isCurrentOperation()) return;
            if (intentResult.ok) {
              findings.push(...intentResult.findings);
              truncated = truncated || Boolean(intentResult.truncated);
            }
          } catch {
            if (!isCurrentOperation()) return;
            // Intent guard is best-effort; ignore failures.
          }
        }

        if (findings.length > 0) {
          const resultProviderLabel = getProviderLabel({
            providerId: reviewResult.providerId ?? prePrReviewProvider,
          });
          setReviewFindings(findings);
          setReviewDiffTruncated(truncated);
          setInlineNotice({
            tone: "warning",
            title: "Review findings need a decision",
            description: `${resultProviderLabel} found issues. Stop to fix them, or proceed anyway if they are acceptable for this PR.`,
          });
          return;
        }

        setReviewFindings([]);
        setReviewDiffTruncated(false);
        if (!reviewResult.ok) {
          setInlineNotice({
            tone: "warning",
            title: "AI pre-PR review was skipped",
            description: `${reviewProviderLabel} review failed, so Stave will continue creating the PR.`,
          });
        }
      } catch {
        if (!isCurrentOperation()) return;
        setInlineNotice({
          tone: "warning",
          title: "AI pre-PR review was skipped",
          description: `${reviewProviderLabel} review failed, so Stave will continue creating the PR.`,
        });
      }
    }

    if (
      runScriptHook &&
      submitWorkspaceId &&
      projectPath &&
      !options.skipVerification
    ) {
      setStep("action");
      setInlineNotice({
        tone: "info",
        title: "Running PR preflight",
        description:
          "Executing configured `pr.beforeOpen` verification before any files are staged or committed.",
      });
      const hookResult = await runScriptHook({
        workspaceId: submitWorkspaceId,
        trigger: "pr.beforeOpen",
        projectPath,
        workspacePath: submitWorkspaceCwd,
        workspaceName: currentBranch ?? "workspace",
        branch: currentBranch ?? selectedTargetBranch,
      });
      if (!isCurrentOperation()) return;
      if (!hookResult.summary) {
        // Infra error (invalid config / spawn failure) — hard stop.
        if (hookResult.error) {
          setInlineNotice({
            tone: "error",
            title: "PR preflight failed",
            description: hookResult.error,
          });
          setStep("ready");
          setActiveSubmitAction(null);
          return;
        }
      } else if (hookResult.summary.failures.length > 0) {
        // Gate on verification: blocking failures stop hard, non-blocking
        // failures warn and allow an explicit "Proceed anyway".
        const blocking =
          deriveTurnVerificationStatus(hookResult.summary) === "fail";
        setVerificationFailures(hookResult.summary.failures);
        setVerificationBlocking(blocking);
        setInlineNotice({
          tone: blocking ? "error" : "warning",
          title: blocking
            ? "Verification failed"
            : "Verification reported warnings",
          description: blocking
            ? "Blocking pr.beforeOpen checks failed. Fix them before opening the PR."
            : "Non-blocking pr.beforeOpen checks failed. Review them, then proceed or fix.",
        });
        setStep("ready");
        return;
      }
    }

    // Commit only after all preflight checks have passed. This keeps a
    // stop-and-fix result from leaving an automatic commit behind.
    if (pendingFiles.length > 0) {
      const stageFile = window.api?.sourceControl?.stageFile;
      const stageFiles = window.api?.sourceControl?.stageFiles;
      const commit = window.api?.sourceControl?.commit;
      if ((!stageFiles && !stageFile) || !commit) {
        setInlineNotice({
          tone: "error",
          title: "Automatic commit is unavailable",
          description:
            "The source control bridge cannot intentionally stage and commit the selected files.",
        });
        setStep("ready");
        setActiveSubmitAction(null);
        return;
      }

      setStep("committing");
      setInlineNotice({
        tone: "info",
        title: "Preparing automatic commit",
        description:
          "The explicitly selected workspace changes will be staged and committed before the PR is created.",
      });

      let message = commitMessage.trim();
      if (!message) {
        setInlineNotice({
          tone: "info",
          title: "Generating commit message",
          description:
            "Creating a Conventional Commit message from the selected diff.",
        });
        if (commitMessageSuggestionPromise) {
          try {
            const result = await commitMessageSuggestionPromise;
            if (!isCurrentOperation()) return;
            if (result?.ok && result.message) {
              message = result.message.trim();
            }
          } catch {
            if (!isCurrentOperation()) return;
            // fall through
          }
        }
        if (!isConventionalCommitMessage(message)) {
          message = generateFallbackCommitMessage(pendingFiles);
        }
      }
      if (!isConventionalCommitMessage(message)) {
        setInlineNotice({
          tone: "error",
          title: "Commit message must use Conventional Commits",
          description:
            "Use a message such as `fix(topbar): stabilize create pr flow`.",
        });
        setStep("ready");
        setActiveSubmitAction(null);
        return;
      }
      setCommitMessage(message);

      setInlineNotice({
        tone: "info",
        title: "Staging changes",
        description: `Reviewing and staging ${pendingFiles.length} explicitly selected workspace file${pendingFiles.length !== 1 ? "s" : ""} for the commit.`,
      });
      const stagePendingFiles = async () => {
        if (stageFiles) {
          return stageFiles({
            paths: pendingFiles.map((file) => file.path),
            cwd: submitWorkspaceCwd,
          });
        }
        for (const file of pendingFiles) {
          const stageResult = await stageFile!({
            path: file.path,
            cwd: submitWorkspaceCwd,
          });
          if (!stageResult.ok) {
            return stageResult;
          }
        }
        return { ok: true, code: 0, stdout: "", stderr: "" };
      };
      let stageResult = await stagePendingFiles();
      if (!isCurrentOperation()) return;
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
      let commitResult = await commit({ message, cwd: submitWorkspaceCwd });
      if (!isCurrentOperation()) return;

      // When a pre-commit hook (husky/lint-staged/eslint) fails, try to
      // auto-fix lint errors and retry the commit once before giving up.
      if (
        !commitResult.ok &&
        looksLikePreCommitHookFailure(commitResult.stderr)
      ) {
        const tryAutoFixLint = window.api?.sourceControl?.tryAutoFixLint;
        if (tryAutoFixLint) {
          setInlineNotice({
            tone: "info",
            title: "Pre-commit hook failed — attempting auto-fix",
            description:
              "Running eslint --fix and prettier --write on the selected files…",
          });
          const fixResult = await tryAutoFixLint({
            cwd: submitWorkspaceCwd,
            paths: pendingFiles.map((file) => file.path),
          });
          if (!isCurrentOperation()) return;
          if (fixResult.fixAttempted) {
            stageResult = await stagePendingFiles();
            if (!isCurrentOperation()) return;
            if (!stageResult.ok) {
              setInlineNotice({
                tone: "error",
                title: "Re-staging after auto-fix failed",
                description: stageResult.stderr || "git add failed.",
              });
              setStep("ready");
              return;
            }
            setInlineNotice({
              tone: "info",
              title: "Retrying commit after auto-fix",
              description: message,
            });
            commitResult = await commit({ message, cwd: submitWorkspaceCwd });
            if (!isCurrentOperation()) return;
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
      setSelectedFilePaths([]);
      setChangesExpanded(false);
      setInlineNotice({
        tone: "success",
        title: "Changes committed automatically",
        description: message,
      });
    }

    // Step 2: Push
    setStep("pushing");
    setInlineNotice({
      tone: "info",
      title: "Pushing branch",
      description: `Updating ${currentBranch ?? "HEAD"} on origin before creating the pull request.`,
    });
    const pushResult = await runCommand({
      command: "git push -u origin HEAD",
      cwd: submitWorkspaceCwd,
    });
    if (!isCurrentOperation()) return;
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
    const mergeMethodLabel =
      dialogMergeMethod.charAt(0).toUpperCase() + dialogMergeMethod.slice(1);
    setStep("creating-pr");
    setInlineNotice({
      tone: "info",
      title: "Creating ready pull request",
      description: dialogAutoMerge
        ? `Submitting the prepared title and description to GitHub, then queueing ${mergeMethodLabel.toLowerCase()} auto-merge (target: ${selectedTargetBranch}).`
        : `Submitting the prepared title and description to GitHub (target: ${selectedTargetBranch}).`,
    });
    const prResult = await createPR({
      title,
      body: prBody.trim() || undefined,
      baseBranch: selectedTargetBranch,
      draft: false,
      autoMerge: dialogAutoMerge,
      mergeMethod: dialogMergeMethod,
      cwd: submitWorkspaceCwd,
    });
    if (!isCurrentOperation()) return;

    if (!prResult.ok) {
      setInlineNotice({
        tone: "error",
        title: prResult.prUrl
          ? "PR created, but auto-merge failed"
          : "PR creation failed",
        description: [
          prResult.stderr || "gh pr create failed.",
          prResult.prUrl ? `PR URL: ${prResult.prUrl}` : "",
        ]
          .filter(Boolean)
          .join(" "),
      });
      setStep("ready");
      return;
    }

    // Success – close dialog, refresh status
    setDialogOpen(false);
    setStep("idle");
    setInlineNotice(null);
    setActiveSubmitAction(null);

    const autoMergeDescription = prResult.merged
      ? `Ready PR created and merged with ${mergeMethodLabel.toLowerCase()}.`
      : dialogAutoMerge
        ? `Ready PR created and ${mergeMethodLabel.toLowerCase()} auto-merge queued.`
        : "Ready PR created.";
    const autoMergeNotConfirmed =
      dialogAutoMerge &&
      !prResult.merged &&
      !prResult.autoMergeUnsupported &&
      prResult.autoMergeEnabled !== true;
    if (prResult.autoMergeUnsupported) {
      toast.success("PR created", {
        description: [
          "Auto-merge is unavailable for this repository, so the PR remains ready for review.",
          prResult.prUrl,
        ]
          .filter(Boolean)
          .join(" "),
      });
    } else if (prResult.stderr || autoMergeNotConfirmed) {
      toast.warning("PR created, but auto-merge is not enabled", {
        description: [
          prResult.stderr ||
            "Stave could not confirm that auto-merge was queued.",
          prResult.prUrl,
        ]
          .filter(Boolean)
          .join(" "),
      });
    } else {
      toast.success("PR created", {
        description: prResult.prUrl
          ? `${autoMergeDescription} ${prResult.prUrl}`
          : autoMergeDescription,
      });
    }

    if (prResult.prUrl && submitWorkspaceId) {
      const state = useAppStore.getState();
      notifyMartinPrOpened({
        context: collectMartinTriggerContext(state, submitWorkspaceId),
        settings: state.settings.martinSync,
        prUrl: prResult.prUrl,
        prTitle: title,
      });
    }

    // Refresh PR status to pick up the new PR
    fetchStatus();

    if (runScriptHook && submitWorkspaceId && projectPath) {
      const hookResult = await runScriptHook({
        workspaceId: submitWorkspaceId,
        trigger: "pr.afterOpen",
        projectPath,
        workspacePath: submitWorkspaceCwd,
        workspaceName: currentBranch ?? "workspace",
        branch: currentBranch ?? selectedTargetBranch,
      });
      if (!isCurrentOperation()) return;
      if (!hookResult.ok) {
        toast.warning("Post-PR scripts reported failures", {
          description:
            hookResult.error ??
            hookResult.summary?.failures
              .map((failure) => `${failure.scriptId}: ${failure.message}`)
              .join(" ") ??
            "Configured `pr.afterOpen` scripts failed.",
        });
      }
    }

    if (prResult.prUrl && openExternal) {
      try {
        await openExternal({ url: prResult.prUrl });
        if (!isCurrentOperation()) return;
      } catch {
        if (!isCurrentOperation()) return;
        // non-critical
      }
    }
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step !== "ready") return;
    void handleSubmit({});
  }

  function handleProceedAfterReview() {
    setReviewFindings([]);
    setReviewDiffTruncated(false);
    void handleSubmit({
      skipReview: true,
    });
  }

  function handleStopAfterReview() {
    setStep("ready");
    setActiveSubmitAction(null);
    setInlineNotice({
      tone: "warning",
      title: "PR creation paused",
      description:
        "Fix the review findings, then create the PR again when ready.",
    });
  }

  function handleProceedAfterVerification() {
    setVerificationFailures([]);
    setVerificationBlocking(false);
    void handleSubmit({
      skipReview: true,
      skipVerification: true,
    });
  }

  function handleStopAfterVerification() {
    setVerificationFailures([]);
    setVerificationBlocking(false);
    setStep("ready");
    setActiveSubmitAction(null);
    setInlineNotice({
      tone: "warning",
      title: "PR creation paused",
      description:
        "Fix the verification failures, then create the PR again when ready.",
    });
  }

  // -------------------------------------------------------------------------
  // PR Action handlers
  // -------------------------------------------------------------------------

  async function handleMarkReady() {
    const setPrReady = window.api?.sourceControl?.setPrReady;
    if (!setPrReady) {
      toast.error("Bridge unavailable");
      return;
    }

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
    if (!mergePr) {
      toast.error("Bridge unavailable");
      return;
    }

    setStep("action");
    // "default" is resolved to a repository-allowed strategy in the host
    // service: `gh pr merge` requires an explicit --merge/--rebase/--squash
    // flag because it runs without a TTY here.
    const result = await mergePr({
      method: createPrMergeMethod,
      cwd: workspaceCwd,
    });
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
    if (!updatePrBranch) {
      toast.error("Bridge unavailable");
      return;
    }

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

  async function handleContinueWorkspace(args: {
    name: string;
    baseBranch?: string;
  }) {
    setContinuingWorkspace(true);
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
  }

  // -------------------------------------------------------------------------
  // Derived UI state
  // -------------------------------------------------------------------------

  const isBusy = step !== "idle" && step !== "ready";
  const isDialogBusy =
    step === "action" ||
    step === "committing" ||
    step === "reviewing" ||
    step === "pushing" ||
    step === "creating-pr";
  const isCreatePrSubmitting = shouldShowCreatePrSubmitSpinner({
    step,
    activeSubmitAction,
    buttonAction: "pr",
  });
  const effectiveTitle =
    prTitle.trim() || generateFallbackPRDraft(changedFiles).title;
  const isTitleInvalid =
    prTitle.trim().length > 0 && !isReasonablePullRequestTitle(prTitle);
  const isCommitMessageInvalid =
    commitMessage.trim().length > 0 &&
    !isConventionalCommitMessage(commitMessage);
  const canSubmitPr = canSubmitCreatePr({
    step,
    title: effectiveTitle,
    hasUncommittedChanges: changedFiles.length > 0,
    selectedFileCount: selectedFilePaths.length,
    commitMessage,
  });
  const statusLabel =
    step === "loading"
      ? "Loading..."
      : step === "committing"
        ? "Committing..."
        : step === "reviewing"
          ? "Reviewing..."
          : step === "pushing"
            ? "Pushing..."
            : step === "creating-pr"
              ? "Creating..."
              : step === "action"
                ? "Working..."
                : null;
  const hasRespondingTask = tasks.some((task) =>
    Boolean(activeTurnIdsByTask[task.id]),
  );
  const isCreateDisabled = isBusy || hasRespondingTask;
  const canContinueWorkspace =
    prStatus === "merged" || prStatus === "closed_unmerged";
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

      if (detail.action === "attach-context") {
        if (!prInfo?.pr?.url) {
          toast.warning("No pull request to attach context from", {
            description: "Create a pull request for this branch first.",
          });
          return;
        }
        setPrContextDialogOpen(true);
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
    return () =>
      window.removeEventListener(TOP_BAR_PR_ACTION_EVENT, onTopBarPrAction);
  }, [
    canContinueWorkspace,
    continueTooltip,
    createPrTooltip,
    handleCreateClick,
    hasWorkspaceContext,
    prInfo?.pr?.url,
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
          <TooltipTrigger
            render={
              <button
                type="button"
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors disabled:opacity-50",
                  PR_CREATE_BUTTON_CLASS,
                )}
                style={props.noDragStyle}
                onClick={() => void handleCreateClick()}
                disabled={isCreateDisabled}
              />
            }
          >
            {isBusy ? (
              <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
            ) : (
              <GitPullRequest className="size-3.5 shrink-0" />
            )}
            {statusLabel ?? "Create PR"}
          </TooltipTrigger>
          <TooltipContent side="bottom">{createPrTooltip}</TooltipContent>
        </Tooltip>
      ) : (
        /* Has PR – show status dropdown */
        <div className="flex items-center gap-1.5">
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger render={<span className="inline-flex" />}>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      className={cn(
                        "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors disabled:opacity-50",
                        badgeColorClass,
                      )}
                      style={props.noDragStyle}
                      disabled={isBusy || continuingWorkspace}
                      aria-label="open-pr-status-menu"
                    />
                  }
                >
                  {isBusy ? (
                    <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
                  ) : (
                    <PrStatusIcon status={prStatus} className="size-3.5" />
                  )}
                  {statusLabel ?? visual.label}
                </DropdownMenuTrigger>
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
                  {currentBranch} &rarr;{" "}
                  {prInfo?.pr?.baseRefName ?? defaultBaseBranch}
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

              {/* Attach review threads / failed-check evidence to the task. */}
              {prInfo?.pr?.url && activeTask ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => setPrContextDialogOpen(true)}
                  >
                    <span className="flex items-center gap-2">
                      <MessageSquare className="size-3.5 text-muted-foreground" />
                      Attach PR context&hellip;
                    </span>
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>

          {canContinueWorkspace ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border/70 bg-background/80 px-2.5 text-xs text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                    style={props.noDragStyle}
                    onClick={() => setContinueDialogOpen(true)}
                    disabled={isContinueDisabled}
                  />
                }
              >
                {continuingWorkspace ? (
                  <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
                ) : (
                  <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                Continue
              </TooltipTrigger>
              <TooltipContent side="bottom">{continueTooltip}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      )}

      {/* --- PR Creation Dialog --- */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open, eventDetails) => {
          if (!canApplyCreatePrDialogOpenChange({ open, isDialogBusy })) {
            eventDetails.cancel();
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
        >
          <DialogHeader>
            <DialogTitle>Create Pull Request</DialogTitle>
            <DialogDescription className="sr-only">
              Create a pull request from {currentBranch ?? "HEAD"} into{" "}
              {effectiveTargetBranch}
            </DialogDescription>
          </DialogHeader>

          {step === "loading" ? (
            <div className="min-w-0 pr-1">
              <CreatePrLoadingSplash
                currentBranch={currentBranch}
                baseBranch={effectiveTargetBranch}
              />
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

                <div className="min-w-0 space-y-3 rounded-xl border border-border/70 bg-muted/20 p-3">
                  <p className={FIELD_LABEL_CLASS}>Merge behavior</p>

                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                    <div className="min-w-0">
                      <label
                        className="block text-sm font-medium leading-5"
                        htmlFor="create-pr-merge-method"
                      >
                        Merge method
                      </label>
                      <p className="text-xs leading-4 text-muted-foreground">
                        Used when the PR is merged.
                      </p>
                    </div>
                    <Select
                      value={dialogMergeMethod}
                      onValueChange={(value) =>
                        setDialogMergeMethod(value as ConcretePrMergeMethod)
                      }
                      disabled={isDialogBusy}
                    >
                      <SelectTrigger
                        id="create-pr-merge-method"
                        className="h-9 w-40 shrink-0 justify-self-end"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          value="squash"
                          disabled={
                            repoMergeSettings?.squashMergeAllowed === false
                          }
                        >
                          Squash
                          {repoMergeSettings?.squashMergeAllowed === false
                            ? " (not allowed)"
                            : ""}
                        </SelectItem>
                        <SelectItem
                          value="merge"
                          disabled={
                            repoMergeSettings?.mergeCommitAllowed === false
                          }
                        >
                          Merge commit
                          {repoMergeSettings?.mergeCommitAllowed === false
                            ? " (not allowed)"
                            : ""}
                        </SelectItem>
                        <SelectItem
                          value="rebase"
                          disabled={
                            repoMergeSettings?.rebaseMergeAllowed === false
                          }
                        >
                          Rebase
                          {repoMergeSettings?.rebaseMergeAllowed === false
                            ? " (not allowed)"
                            : ""}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="h-px bg-border/60" aria-hidden="true" />

                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                    <div className="min-w-0">
                      <label
                        className="block text-sm font-medium leading-5"
                        htmlFor="create-pr-auto-merge"
                      >
                        Auto-merge
                      </label>
                      <p className="text-xs leading-4 text-muted-foreground">
                        {repoMergeSettings?.autoMergeAllowed === false
                          ? "Disabled by repository settings."
                          : "Merge automatically after required checks pass."}
                      </p>
                    </div>
                    <Switch
                      id="create-pr-auto-merge"
                      className="shrink-0 justify-self-end"
                      checked={dialogAutoMerge}
                      onCheckedChange={setDialogAutoMerge}
                      disabled={
                        isDialogBusy ||
                        repoMergeSettings?.autoMergeAllowed === false
                      }
                    />
                  </div>
                </div>

                {inlineNotice ? (
                  <InlineNoticeBanner notice={inlineNotice} />
                ) : null}
                <PrePrReviewFindingsPanel
                  findings={reviewFindings}
                  truncated={reviewDiffTruncated}
                />
                <PrePrVerificationPanel
                  failures={verificationFailures}
                  blocking={verificationBlocking}
                />

                {/* PR Title */}
                <div className="space-y-2">
                  <label
                    className="block text-sm font-medium leading-5"
                    htmlFor="pr-title-input"
                  >
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
                    aria-invalid={isTitleInvalid}
                  />
                  {isTitleInvalid ? (
                    <p className="text-xs text-destructive">
                      Use a lowercase Conventional Commit title, for example{" "}
                      <code>fix(topbar): stabilize create pr flow</code>.
                    </p>
                  ) : null}
                </div>

                {/* PR Description */}
                <div className="min-w-0 space-y-2">
                  <label
                    className="block text-sm font-medium leading-5"
                    htmlFor="pr-body-input"
                  >
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
                      className="flex w-full min-w-0 items-center gap-1.5 text-left text-sm font-medium leading-5 text-warning"
                      onClick={() => setChangesExpanded((v) => !v)}
                      aria-expanded={changesExpanded}
                      aria-controls="create-pr-changed-files"
                    >
                      {changesExpanded ? (
                        <ChevronDown className="size-3.5 shrink-0" />
                      ) : (
                        <ChevronRight className="size-3.5 shrink-0" />
                      )}
                      <span className="shrink-0">
                        {changedFiles.length} uncommitted file
                        {changedFiles.length !== 1 ? "s" : ""}
                      </span>
                      <span className="min-w-0 truncate text-xs font-normal text-muted-foreground">
                        all files selected by default
                      </span>
                    </button>

                    <div id="create-pr-changed-files" className="min-w-0">
                      {changesExpanded && (
                        <div className="min-w-0 space-y-2">
                          <div className="max-h-40 min-w-0 overflow-y-auto rounded-md border border-border/70 bg-muted/30 p-2 text-xs">
                            {changedFiles.map((file) => (
                              <label
                                key={file.path}
                                className="flex min-w-0 items-center gap-2 rounded-sm px-1 py-1 hover:bg-muted/50"
                              >
                                <input
                                  type="checkbox"
                                  className="size-3.5 shrink-0 accent-primary"
                                  checked={selectedFilePaths.includes(
                                    file.path,
                                  )}
                                  onChange={(event) => {
                                    if (event.target.checked) {
                                      userDeselectedPathsRef.current.delete(
                                        file.path,
                                      );
                                    } else {
                                      userDeselectedPathsRef.current.add(
                                        file.path,
                                      );
                                    }
                                    setSelectedFilePaths((paths) =>
                                      event.target.checked
                                        ? [...new Set([...paths, file.path])]
                                        : paths.filter(
                                            (path) => path !== file.path,
                                          ),
                                    );
                                  }}
                                  disabled={isDialogBusy}
                                  aria-label={`Include ${file.path} in the automatic commit`}
                                />
                                <span className="w-5 shrink-0 text-center font-mono font-medium text-muted-foreground">
                                  {file.code}
                                </span>
                                <span className="min-w-0 truncate font-mono">
                                  {file.path}
                                </span>
                              </label>
                            ))}
                          </div>

                          {selectedFilePaths.length === 0 ? (
                            <p className="text-xs leading-4 text-muted-foreground">
                              Select at least one file to enable automatic
                              commit. Unselected files will remain untouched.
                            </p>
                          ) : null}

                          <div className="min-w-0 space-y-2">
                            <label
                              className={FIELD_LABEL_CLASS}
                              htmlFor="commit-message-input"
                            >
                              Commit message
                            </label>
                            <Input
                              id="commit-message-input"
                              className="h-9 text-sm"
                              placeholder={generateFallbackCommitMessage(
                                selectedFilePaths.length > 0
                                  ? changedFiles.filter((file) =>
                                      selectedFilePaths.includes(file.path),
                                    )
                                  : changedFiles,
                              )}
                              value={commitMessage}
                              onChange={(e) => setCommitMessage(e.target.value)}
                              disabled={isDialogBusy}
                              aria-invalid={isCommitMessageInvalid}
                            />
                            {isCommitMessageInvalid ? (
                              <p className="text-xs leading-4 text-destructive">
                                Use a Conventional Commit message such as{" "}
                                <code>
                                  fix(topbar): stabilize create pr flow
                                </code>
                                .
                              </p>
                            ) : null}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {step === "reviewing" && reviewFindings.length > 0 ? (
                <DialogFooter className="shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleStopAfterReview}
                  >
                    Stop and fix
                  </Button>
                  <Button type="button" onClick={handleProceedAfterReview}>
                    Proceed anyway
                  </Button>
                </DialogFooter>
              ) : verificationFailures.length > 0 ? (
                <DialogFooter className="shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleStopAfterVerification}
                  >
                    Stop and fix
                  </Button>
                  {verificationBlocking ? null : (
                    <Button
                      type="button"
                      onClick={handleProceedAfterVerification}
                    >
                      Proceed anyway
                    </Button>
                  )}
                </DialogFooter>
              ) : (
                <DialogFooter className="shrink-0">
                  <Button type="submit" disabled={!canSubmitPr || isDialogBusy}>
                    {isCreatePrSubmitting ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : null}
                    Create PR
                  </Button>
                </DialogFooter>
              )}
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

      <PrContextDialog
        open={prContextDialogOpen}
        onOpenChange={setPrContextDialogOpen}
        prUrl={prInfo?.pr?.url ?? null}
        cwd={workspaceCwd}
        taskId={activeTask?.id ?? null}
      />
    </>
  );
}
