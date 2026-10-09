import { i18n, useTranslation } from "@/i18n";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import * as stylex from "@stylexjs/stylex";
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
  ExternalLink,
  GitBranch,
  GitPullRequest,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { ContinueWorkspaceDialog } from "@/components/layout/ContinueWorkspaceDialog";
import { PrContextDialog } from "@/components/layout/PrContextDialog";
import { CreatePullRequestDialog } from "@/components/layout/pull-request/CreatePullRequestDialog";
import {
  FIELD_LABEL_CLASS,
  InlineNoticeBanner,
  type InlineNotice,
  type ScmStatusItem,
} from "@/components/layout/pull-request/create-pr-dialog-panels";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Loader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
import { isAccountUsageBlockingFromState } from "@/store/account-usage-guard";
import {
  type WorkspacePrStatus,
  PR_STATUS_VISUAL,
  PR_STATUS_ACTIONS,
  describePrStatusHint,
} from "@/lib/pr-status";
import {
  prCreateButtonStyles,
  prToneBadgeStyles,
} from "./pr-status.styles";
import { layoutShellStyles } from "./layout-shell.styles";
import { topBarControlStyles } from "./top-bar.styles";
import { openPrStyles } from "./top-bar-open-pr.styles";
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
import {
  buildReadOnlyAuxRuntimeOptions,
  resolveAuxLaneRuntime,
} from "@/lib/providers/auxiliary-inference-policy";
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
    return i18n.t("sourceControl:topBarOpenPR.gitHubCLIIsNotInstalledInstallGh");
  }
  return i18n.t("sourceControl:topBarOpenPR.gitHubCLIIsNotAuthenticatedRunGh");
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = CreatePrDialogStep;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TopBarOpenPR(props: { noDragStyle: CSSProperties }) {
  useTranslation();
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
  // Merge PR confirmation
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeDialogLoading, setMergeDialogLoading] = useState(false);
  const [mergeDialogMethod, setMergeDialogMethod] =
    useState<ConcretePrMergeMethod>("squash");
  const [mergeDialogRepoSettings, setMergeDialogRepoSettings] =
    useState<RepoMergeSettings>();
  const [mergeDialogError, setMergeDialogError] = useState<string | null>(
    null,
  );
  const prActionOperationIdRef = useRef(0);
  const suggestionRequestIdRef = useRef(0);
  const submitOperationIdRef = useRef(0);
  const userDeselectedPathsRef = useRef(new Set<string>());

  const [
    activeWorkspaceId,
    workspaceDefaultById,
    workspaceBranchById,
    workspacePathById,
    repositoryPath,
    defaultBranch,
    activeTaskId,
    promptDraftByTask,
    workspaceInformation,
    tasks,
    activeTurnIdsByTask,
    workspacePrInfoById,
    prePrReviewEnabled,
    prePrReviewClaudeModel,
    prePrReviewCodexModel,
    prePrReviewCodexBinaryPath,
    prePrReviewCodexReasoningEffort,
    createPrAutoMergeEnabled,
    createPrMergeMethod,
    auxiliaryInferencePolicy,
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
          state.repositoryPath,
          state.defaultBranch,
          state.activeTaskId,
          state.promptDraftByTask,
          state.workspaceInformation,
          state.tasks,
          state.activeTurnIdsByTask,
          state.workspacePrInfoById,
          state.settings.prePrReviewEnabled,
          state.settings.modelClaude,
          state.settings.modelCodex,
          state.settings.codexBinaryPath,
          state.settings.codexReasoningEffort,
          state.settings.createPrAutoMergeEnabled,
          state.settings.createPrMergeMethod,
          state.settings.auxiliaryInferencePolicy,
          state.fetchWorkspacePrStatus,
          state.continueWorkspaceFromSummary,
        ] as const,
    ),
  );

  const isDefaultWorkspace = Boolean(workspaceDefaultById[activeWorkspaceId]);
  const workspaceCwd =
    workspacePathById[activeWorkspaceId] ?? repositoryPath ?? "";
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
    // i18n-ignore: generated Conventional Commit content remains canonical English
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
      toast.error(i18n.t("sourceControl:topBarOpenPR.unableToCreatePR"), {
        description: i18n.t("sourceControl:topBarOpenPR.sourceControlBridgeUnavailable"),
      });
      return;
    }

    // Guard: ensure the cwd comes from the workspace's own worktree path,
    // not a fallback to the project root.  Using the project root for a
    // non-default workspace would cause git commands to return data from
    // the wrong branch, producing stale or cross-workspace PR drafts.
    if (!workspacePathById[activeWorkspaceId]) {
      toast.error(i18n.t("sourceControl:topBarOpenPR.unableToCreatePR"), {
        description:
          i18n.t("sourceControl:topBarOpenPR.workspacePathIsNotAvailableYetTry"),
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
      title: i18n.t("sourceControl:topBarOpenPR.preparingPRDraft"),
      description:
        i18n.t("sourceControl:topBarOpenPR.reviewingTheBranchDiffRecentCommitsAnd"),
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
    const prDescriptionLane = resolveAuxLaneRuntime({
      lane: "prDescription",
      policy: auxiliaryInferencePolicy,
      shared: useAppStore.getState().settings.auxiliaryInferenceDefault,
      activeProviderId: activeTask?.provider ?? null,
    });
    // Off keeps the deterministic fallback draft, which is why the lane can be
    // disabled without breaking PR creation.
    const shouldSuggestPrDescription = Boolean(
      suggestPRDescription &&
        promptPrDescription &&
        prDescriptionLane.enabled &&
        !isAccountUsageBlockingFromState({
          providerId: prDescriptionLane.providerId,
          model: prDescriptionLane.model,
          state: useAppStore.getState(),
        }),
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
                // The lane owns the provider *and* the model. Routing to the
                // task's provider while passing the lane's model would send an
                // unknown model id whenever the two differ, and the caller's
                // catch would swallow it into a silent fallback draft.
                providerId: prDescriptionLane.providerId,
                promptTemplate: promptPrDescription,
                workspaceContext: workspaceContext || undefined,
                runtimeOptions: {
                  ...buildReadOnlyAuxRuntimeOptions({ accountSelection: useAppStore.getState().settings,
                    providerId: prDescriptionLane.providerId,
                    model: prDescriptionLane.model,
                    effortOverrides: prDescriptionLane.effortOverrides,
                  }),
                  ...(prDescriptionLane.providerId === "codex"
                    ? {
                        codexBinaryPath:
                          prePrReviewCodexBinaryPath.trim() || undefined,
                      }
                    : {}),
                },
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
      toast.error(i18n.t("sourceControl:topBarOpenPR.unableToCheckStatus"), {
        description: status.stderr || i18n.t("sourceControl:topBarOpenPR.gitStatusFailed"),
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
            title: i18n.t("sourceControl:topBarOpenPR.gitHubAuthenticationIsRequired"),
            description: describeGitHubAuthFailure(mergeSettingsResult),
          }
        : shouldSuggestPrDescription && !descResult?.ok
          ? {
              tone: "warning",
              title: i18n.t("sourceControl:topBarOpenPR.usingFallbackPRDraft"),
              description:
                i18n.t("sourceControl:topBarOpenPR.couldNotGenerateATailoredTitleAnd"),
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
        title: i18n.t("sourceControl:topBarOpenPR.unableToCreatePR"),
        description:
          i18n.t("sourceControl:topBarOpenPR.theSourceControlBridgeIsUnavailableIn"),
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
          title: i18n.t("sourceControl:topBarOpenPR.unableToRefreshWorkspaceChanges"),
          description: statusResult.stderr || i18n.t("sourceControl:topBarOpenPR.gitStatusFailed"),
        });
        setStep("ready");
        setActiveSubmitAction(null);
        return;
      }
      if (statusResult.hasConflicts) {
        setInlineNotice({
          tone: "error",
          title: i18n.t("sourceControl:topBarOpenPR.cannotCreatePRWithUnresolvedConflicts"),
          description:
            i18n.t("sourceControl:topBarOpenPR.resolveTheMergeConflictsInThisWorkspace"),
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
          title: i18n.t("sourceControl:topBarOpenPR.workspaceChangesChanged"),
          description:
            i18n.t("sourceControl:topBarOpenPR.theFileListChangedWhileTheDialog"),
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
          title: i18n.t("sourceControl:topBarOpenPR.selectFilesToCommit"),
          description:
            i18n.t("sourceControl:topBarOpenPR.chooseAtLeastOneCurrentWorkspaceFile"),
        });
        setStep("ready");
        setActiveSubmitAction(null);
        return;
      }
    } else if (changedFiles.length > 0 && pendingFiles.length === 0) {
      setInlineNotice({
        tone: "error",
        title: i18n.t("sourceControl:topBarOpenPR.unableToVerifyFileScope"),
        description:
          i18n.t("sourceControl:topBarOpenPR.theSourceControlBridgeCannotRefreshWorkspace"),
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
        title: i18n.t("sourceControl:topBarOpenPR.pRTitleMustUseTheRepositoryConvention"),
        description:
          i18n.t("sourceControl:topBarOpenPR.useALowercaseConventionalCommitTitleSuch"),
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

    const prePrReviewLane = resolveAuxLaneRuntime({
      lane: "prePrReview",
      policy: auxiliaryInferencePolicy,
      shared: useAppStore.getState().settings.auxiliaryInferenceDefault,
    });
    if (
      prePrReviewEnabled &&
      prePrReviewLane.enabled &&
      reviewDiff &&
      !options.skipReview &&
      !isAccountUsageBlockingFromState({
        providerId: prePrReviewLane.providerId,
        model: prePrReviewLane.model,
        state: useAppStore.getState(),
      })
    ) {
      const reviewProviderLabel = getProviderLabel({
        providerId: prePrReviewLane.providerId,
      });
      // The lane owns the model. Without it this fell back to the user's
      // primary model, so a background review silently cost a real turn.
      const reviewModel =
        prePrReviewLane.model ??
        (prePrReviewLane.providerId === "codex"
          ? prePrReviewCodexModel
          : prePrReviewClaudeModel);
      const reviewRuntimeOptions = {
        ...buildReadOnlyAuxRuntimeOptions({ accountSelection: useAppStore.getState().settings,
          providerId: prePrReviewLane.providerId,
          model: reviewModel,
          effortOverrides: prePrReviewLane.effortOverrides,
        }),
        ...(prePrReviewLane.providerId === "codex"
          ? {
              codexBinaryPath: prePrReviewCodexBinaryPath.trim() || undefined,
              ...(prePrReviewLane.config.effort
                ? {}
                : { codexReasoningEffort: prePrReviewCodexReasoningEffort }),
            }
          : {}),
      };
      setStep("reviewing");
      setInlineNotice({
        tone: "info",
        title: i18n.t("sourceControl:topBarOpenPR.runningAIPrePRReview"),
        description: i18n.t("sourceControl:topBarOpenPR.isCheckingTheBranchDiffFor", { value1: reviewProviderLabel }),
      });

      try {
        const reviewArgs = {
          cwd: submitWorkspaceCwd,
          baseBranch: selectedTargetBranch,
          headBranch: currentBranch || undefined,
          providerId: prePrReviewLane.providerId,
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
            title: i18n.t("sourceControl:topBarOpenPR.runningAIIntentGuard"),
            description: i18n.t("sourceControl:topBarOpenPR.isCheckingTheChangeAgainstThe", { value1: reviewProviderLabel }),
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
            providerId: reviewResult.providerId ?? prePrReviewLane.providerId,
          });
          setReviewFindings(findings);
          setReviewDiffTruncated(truncated);
          setInlineNotice({
            tone: "warning",
            title: i18n.t("sourceControl:topBarOpenPR.reviewFindingsNeedADecision"),
            description: i18n.t("sourceControl:topBarOpenPR.foundIssuesStopToFixThem", { value1: resultProviderLabel }),
          });
          return;
        }

        setReviewFindings([]);
        setReviewDiffTruncated(false);
        if (!reviewResult.ok) {
          setInlineNotice({
            tone: "warning",
            title: i18n.t("sourceControl:topBarOpenPR.aIPrePRReviewWasSkipped"),
            description: i18n.t("sourceControl:topBarOpenPR.reviewFailedSoStaveWillContinue", { value1: reviewProviderLabel }),
          });
        }
      } catch {
        if (!isCurrentOperation()) return;
        setInlineNotice({
          tone: "warning",
          title: i18n.t("sourceControl:topBarOpenPR.aIPrePRReviewWasSkipped"),
          description: i18n.t("sourceControl:topBarOpenPR.reviewFailedSoStaveWillContinue", { value1: reviewProviderLabel }),
        });
      }
    }

    if (
      runScriptHook &&
      submitWorkspaceId &&
      repositoryPath &&
      !options.skipVerification
    ) {
      setStep("action");
      setInlineNotice({
        tone: "info",
        title: i18n.t("sourceControl:topBarOpenPR.runningPRPreflight"),
        description:
          i18n.t("sourceControl:topBarOpenPR.executingConfiguredPrBeforeOpenVerificationBeforeAnyFiles"),
      });
      const hookResult = await runScriptHook({
        workspaceId: submitWorkspaceId,
        trigger: "pr.beforeOpen",
        repositoryPath,
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
            title: i18n.t("sourceControl:topBarOpenPR.pRPreflightFailed"),
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
            ? i18n.t("sourceControl:topBarOpenPR.verificationFailed")
            : i18n.t("sourceControl:topBarOpenPR.verificationReportedWarnings"),
          description: blocking
            ? i18n.t("sourceControl:topBarOpenPR.blockingPrBeforeOpenChecksFailedFixThemBefore")
            : i18n.t("sourceControl:topBarOpenPR.nonBlockingPrBeforeOpenChecksFailedReviewThemThen"),
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
          title: i18n.t("sourceControl:topBarOpenPR.automaticCommitIsUnavailable"),
          description:
            i18n.t("sourceControl:topBarOpenPR.theSourceControlBridgeCannotIntentionallyStage"),
        });
        setStep("ready");
        setActiveSubmitAction(null);
        return;
      }

      setStep("committing");
      setInlineNotice({
        tone: "info",
        title: i18n.t("sourceControl:topBarOpenPR.preparingAutomaticCommit"),
        description:
          i18n.t("sourceControl:topBarOpenPR.theExplicitlySelectedWorkspaceChangesWillBe"),
      });

      let message = commitMessage.trim();
      if (!message) {
        setInlineNotice({
          tone: "info",
          title: i18n.t("sourceControl:topBarOpenPR.generatingCommitMessage"),
          description:
            i18n.t("sourceControl:topBarOpenPR.creatingAConventionalCommitMessageFromThe"),
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
          title: i18n.t("sourceControl:topBarOpenPR.commitMessageMustUseConventionalCommits"),
          description:
            i18n.t("sourceControl:topBarOpenPR.useAMessageSuchAsFixTopbarStabilize"),
        });
        setStep("ready");
        setActiveSubmitAction(null);
        return;
      }
      setCommitMessage(message);

      setInlineNotice({
        tone: "info",
        title: i18n.t("sourceControl:topBarOpenPR.stagingChanges"),
        description: i18n.t("sourceControl:topBarOpenPR.reviewingAndStagingExplicitlySelectedWorkspaceFile", { count: pendingFiles.length }),
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
          title: i18n.t("sourceControl:topBarOpenPR.stagingFailed"),
          description: stageResult.stderr || i18n.t("sourceControl:topBarOpenPR.gitAddFailed"),
        });
        setStep("ready");
        return;
      }

      setInlineNotice({
        tone: "info",
        title: i18n.t("sourceControl:topBarOpenPR.creatingCommit"),
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
            title: i18n.t("sourceControl:topBarOpenPR.preCommitHookFailedAttemptingAutoFix"),
            description:
              i18n.t("sourceControl:topBarOpenPR.runningEslintFixAndPrettierWriteOn"),
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
                title: i18n.t("sourceControl:topBarOpenPR.reStagingAfterAutoFixFailed"),
                description: stageResult.stderr || i18n.t("sourceControl:topBarOpenPR.gitAddFailed"),
              });
              setStep("ready");
              return;
            }
            setInlineNotice({
              tone: "info",
              title: i18n.t("sourceControl:topBarOpenPR.retryingCommitAfterAutoFix"),
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
          title: i18n.t("sourceControl:topBarOpenPR.commitFailed"),
          description: commitResult.stderr || i18n.t("sourceControl:topBarOpenPR.gitCommitFailed"),
        });
        setStep("ready");
        return;
      }

      setChangedFiles([]);
      setSelectedFilePaths([]);
      setChangesExpanded(false);
      setInlineNotice({
        tone: "success",
        title: i18n.t("sourceControl:topBarOpenPR.changesCommittedAutomatically"),
        description: message,
      });
    }

    // Step 2: Push
    setStep("pushing");
    setInlineNotice({
      tone: "info",
      title: i18n.t("sourceControl:topBarOpenPR.pushingBranch"),
      description: i18n.t("sourceControl:topBarOpenPR.updatingOnOriginBeforeCreatingThePull", { value1: currentBranch ?? "HEAD" }),
    });
    const pushResult = await runCommand({
      command: "git push -u origin HEAD",
      cwd: submitWorkspaceCwd,
    });
    if (!isCurrentOperation()) return;
    if (!pushResult.ok) {
      setInlineNotice({
        tone: "error",
        title: i18n.t("sourceControl:topBarOpenPR.pushFailed"),
        description: pushResult.stderr || i18n.t("sourceControl:topBarOpenPR.gitPushFailed"),
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
      title: i18n.t("sourceControl:topBarOpenPR.creatingReadyPullRequest"),
      description: dialogAutoMerge
        ? i18n.t("sourceControl:topBarOpenPR.submittingThePreparedTitleAndDescriptionTo", { value1: mergeMethodLabel.toLowerCase(), value2: selectedTargetBranch })
        : i18n.t("sourceControl:topBarOpenPR.submittingThePreparedTitleAndDescriptionTo2", { value1: selectedTargetBranch }),
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

    if (!prResult.ok && prResult.existingPrUrl) {
      // The cached status was stale: GitHub already has a PR for this branch.
      resetCreatePrDialogState({ closeDialog: true });
      toast.info(i18n.t("sourceControl:topBarOpenPR.aPullRequestAlreadyExistsForThis"), {
        description: prResult.existingPrUrl,
      });
      fetchStatus();
      if (openExternal) {
        void openExternal({ url: prResult.existingPrUrl }).catch(() => {});
      }
      return;
    }

    if (!prResult.ok) {
      setInlineNotice({
        tone: "error",
        title: prResult.prUrl
          ? i18n.t("sourceControl:topBarOpenPR.pRCreatedButAutoMergeFailed")
          : i18n.t("sourceControl:topBarOpenPR.pRCreationFailed"),
        description: [
          prResult.stderr || i18n.t("sourceControl:topBarOpenPR.ghPrCreateFailed"),
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
      ? i18n.t("sourceControl:topBarOpenPR.readyPRCreatedAndMergedWith", { value1: mergeMethodLabel.toLowerCase() })
      : dialogAutoMerge
        ? i18n.t("sourceControl:topBarOpenPR.readyPRCreatedAndAutoMergeQueued", { value1: mergeMethodLabel.toLowerCase() })
        : i18n.t("sourceControl:topBarOpenPR.readyPRCreated");
    const autoMergeNotConfirmed =
      dialogAutoMerge &&
      !prResult.merged &&
      !prResult.autoMergeUnsupported &&
      prResult.autoMergeEnabled !== true;
    if (prResult.autoMergeUnsupported) {
      toast.success(i18n.t("sourceControl:topBarOpenPR.pRCreated"), {
        description: [
          i18n.t("sourceControl:topBarOpenPR.autoMergeIsUnavailableForThisRepositorySo"),
          prResult.prUrl,
        ]
          .filter(Boolean)
          .join(" "),
      });
    } else if (prResult.stderr || autoMergeNotConfirmed) {
      toast.warning(i18n.t("sourceControl:topBarOpenPR.pRCreatedButAutoMergeIsNotEnabled"), {
        description: [
          prResult.stderr ||
            i18n.t("sourceControl:topBarOpenPR.staveCouldNotConfirmThatAutoMergeWas"),
          prResult.prUrl,
        ]
          .filter(Boolean)
          .join(" "),
      });
    } else {
      toast.success(i18n.t("sourceControl:topBarOpenPR.pRCreated"), {
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

    if (runScriptHook && submitWorkspaceId && repositoryPath) {
      const hookResult = await runScriptHook({
        workspaceId: submitWorkspaceId,
        trigger: "pr.afterOpen",
        repositoryPath,
        workspacePath: submitWorkspaceCwd,
        workspaceName: currentBranch ?? "workspace",
        branch: currentBranch ?? selectedTargetBranch,
      });
      if (!isCurrentOperation()) return;
      if (!hookResult.ok) {
        toast.warning(i18n.t("sourceControl:topBarOpenPR.postPRScriptsReportedFailures"), {
          description:
            hookResult.error ??
            hookResult.summary?.failures
              .map((failure) => `${failure.scriptId}: ${failure.message}`)
              .join(" ") ??
            i18n.t("sourceControl:topBarOpenPR.configuredPrAfterOpenScriptsFailed"),
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
      title: i18n.t("sourceControl:topBarOpenPR.pRCreationPaused"),
      description:
        i18n.t("sourceControl:topBarOpenPR.fixTheReviewFindingsThenCreateThe"),
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
      title: i18n.t("sourceControl:topBarOpenPR.pRCreationPaused"),
      description:
        i18n.t("sourceControl:topBarOpenPR.fixTheVerificationFailuresThenCreateThe"),
    });
  }

  function handleCreatePrFileChecked(path: string, checked: boolean) {
    if (checked) {
      userDeselectedPathsRef.current.delete(path);
    } else {
      userDeselectedPathsRef.current.add(path);
    }
    setSelectedFilePaths((paths) =>
      checked
        ? [...new Set([...paths, path])]
        : paths.filter((selectedPath) => selectedPath !== path),
    );
  }

  // -------------------------------------------------------------------------
  // PR Action handlers
  // -------------------------------------------------------------------------

  /**
   * Pins a PR action to the workspace it started in. Switching workspaces
   * while `gh` runs must not paint the other workspace's badge or refresh
   * the wrong PR.
   */
  function beginPrAction() {
    const operationId = prActionOperationIdRef.current + 1;
    prActionOperationIdRef.current = operationId;
    const workspaceId = activeWorkspaceId;
    const cwd = workspaceCwd;
    return {
      cwd,
      isCurrent: () =>
        prActionOperationIdRef.current === operationId &&
        activeWorkspaceIdRef.current === workspaceId &&
        workspaceCwdRef.current === cwd,
      refresh: () => {
        if (workspaceId) {
          void fetchWorkspacePrStatus({ workspaceId });
        }
      },
    };
  }

  async function handleMarkReady() {
    const setPrReady = window.api?.sourceControl?.setPrReady;
    if (!setPrReady) {
      toast.error(i18n.t("sourceControl:topBarOpenPR.bridgeUnavailable"));
      return;
    }

    const action = beginPrAction();
    setStep("action");
    let result: Awaited<ReturnType<typeof setPrReady>>;
    try {
      result = await setPrReady({ cwd: action.cwd });
    } finally {
      // The PR may have changed either way; never leave the badge stale.
      action.refresh();
      if (action.isCurrent()) setStep("idle");
    }
    if (!action.isCurrent()) return;

    if (!result.ok) {
      toast.error(i18n.t("sourceControl:topBarOpenPR.failedToMarkPRAsReady"), { description: result.stderr });
      return;
    }
    toast.success(i18n.t("sourceControl:topBarOpenPR.pRMarkedAsReadyForReview"));
  }

  async function openMergeDialog() {
    const mergePr = window.api?.sourceControl?.mergePr;
    if (!mergePr) {
      toast.error(i18n.t("sourceControl:topBarOpenPR.bridgeUnavailable"));
      return;
    }
    const action = beginPrAction();
    const configured = resolveCreatePrMergeState({
      preferredMethod: createPrMergeMethod,
      autoMergeEnabled: false,
    });
    setMergeDialogMethod(configured.mergeMethod);
    setMergeDialogRepoSettings(undefined);
    setMergeDialogError(null);
    setMergeDialogLoading(true);
    setMergeDialogOpen(true);

    const getRepoMergeSettings =
      window.api?.sourceControl?.getRepoMergeSettings;
    const settingsResult = getRepoMergeSettings
      ? await getRepoMergeSettings({ cwd: action.cwd }).catch(() => undefined)
      : undefined;
    if (!action.isCurrent()) return;
    const repoSettings = settingsResult?.ok
      ? {
          squashMergeAllowed: settingsResult.squashMergeAllowed === true,
          mergeCommitAllowed: settingsResult.mergeCommitAllowed === true,
          rebaseMergeAllowed: settingsResult.rebaseMergeAllowed === true,
          autoMergeAllowed: settingsResult.autoMergeAllowed === true,
        }
      : undefined;
    setMergeDialogRepoSettings(repoSettings);
    setMergeDialogMethod(
      resolveCreatePrMergeState({
        preferredMethod: createPrMergeMethod,
        autoMergeEnabled: false,
        repoSettings,
      }).mergeMethod,
    );
    setMergeDialogLoading(false);
  }

  async function handleConfirmMerge() {
    const mergePr = window.api?.sourceControl?.mergePr;
    if (!mergePr) {
      toast.error(i18n.t("sourceControl:topBarOpenPR.bridgeUnavailable"));
      return;
    }

    const action = beginPrAction();
    const expectedHeadOid = prInfo?.pr?.headRefOid ?? null;
    setMergeDialogError(null);
    setStep("action");
    let result: Awaited<ReturnType<typeof mergePr>>;
    try {
      // The dialog already resolved the method against repository settings;
      // the host re-checks and pins the merge to the head commit shown here.
      result = await mergePr({
        method: mergeDialogMethod,
        expectedHeadOid,
        cwd: action.cwd,
      });
    } catch (error) {
      if (!action.isCurrent()) return;
      setStep("idle");
      setMergeDialogError(
        error instanceof Error ? error.message : i18n.t("sourceControl:topBarOpenPR.mergeRequestFailed"),
      );
      action.refresh();
      return;
    }
    action.refresh();
    if (!action.isCurrent()) return;
    setStep("idle");

    if (!result.ok) {
      setMergeDialogError(result.stderr || i18n.t("sourceControl:topBarOpenPR.ghPrMergeFailed"));
      return;
    }
    setMergeDialogOpen(false);
    if (result.warning) {
      toast.warning(i18n.t("sourceControl:topBarOpenPR.pRMergedWithWarnings"), {
        description: result.warning,
      });
    } else {
      toast.success(i18n.t("sourceControl:topBarOpenPR.pRMergedSuccessfully"), {
        description: result.remoteBranchDeleted
          ? i18n.t("sourceControl:topBarOpenPR.mergedWithRemoteBranchDeleted", { value1: result.mergeMethod ?? mergeDialogMethod })
          : i18n.t("sourceControl:topBarOpenPR.mergedWith", { value1: result.mergeMethod ?? mergeDialogMethod }),
      });
    }
  }

  async function handleUpdateBranch() {
    const updatePrBranch = window.api?.sourceControl?.updatePrBranch;
    if (!updatePrBranch) {
      toast.error(i18n.t("sourceControl:topBarOpenPR.bridgeUnavailable"));
      return;
    }

    const action = beginPrAction();
    setStep("action");
    let result: Awaited<ReturnType<typeof updatePrBranch>>;
    try {
      result = await updatePrBranch({ cwd: action.cwd });
    } finally {
      action.refresh();
      if (action.isCurrent()) setStep("idle");
    }
    if (!action.isCurrent()) return;

    if (!result.ok) {
      toast.error(i18n.t("sourceControl:topBarOpenPR.branchUpdateFailed"), { description: result.stderr });
      return;
    }
    if (result.warning) {
      toast.warning(i18n.t("sourceControl:topBarOpenPR.branchUpdatedOnGitHub"), {
        description: result.warning,
      });
      return;
    }
    toast.success(
      result.remoteUpdated
        ? i18n.t("sourceControl:topBarOpenPR.branchUpdated")
        : i18n.t("sourceControl:topBarOpenPR.branchAlreadyUpToDate"),
      {
        description: result.localSynced
          ? i18n.t("sourceControl:topBarOpenPR.thePRBranchAndThisWorktreeNow")
          : undefined,
      },
    );
  }

  async function handleContinueWorkspace(args: {
    name: string;
    baseBranch?: string;
    target: "here" | "new-workspace";
  }) {
    setContinuingWorkspace(true);
    try {
      const result = await continueWorkspaceFromSummary(args);
      if (!result.ok) {
        toast.error(args.target === "here" ? i18n.t("sourceControl:topBarOpenPR.unableToContinueHere") : i18n.t("sourceControl:topBarOpenPR.unableToContinueInANewWorkspace"), {
          description:
            result.message ?? i18n.t("sourceControl:topBarOpenPR.theContinuationBriefCouldNotBePrepared"),
        });
        return result;
      }

      if (result.noticeLevel === "warning") {
        toast.warning(i18n.t("sourceControl:topBarOpenPR.workspaceContinuedWithWarning"), {
          description:
            result.message ??
            i18n.t("sourceControl:topBarOpenPR.theWorkspaceWasCreatedButPartOf"),
        });
      } else {
        toast.success(i18n.t("sourceControl:topBarOpenPR.workspaceContinued"), {
          description:
            result.message ??
            i18n.t("sourceControl:topBarOpenPR.theNewWorkspaceIsReadyWithA"),
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
        void openMergeDialog();
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
  const fallbackCommitMessage = generateFallbackCommitMessage(
    selectedFilePaths.length > 0
      ? changedFiles.filter((file) => selectedFilePaths.includes(file.path))
      : changedFiles,
  );
  const statusLabel =
    step === "loading"
      ? i18n.t("sourceControl:topBarOpenPR.loading")
      : step === "committing"
        ? i18n.t("sourceControl:topBarOpenPR.committing")
        : step === "reviewing"
          ? i18n.t("sourceControl:topBarOpenPR.reviewing")
          : step === "pushing"
            ? i18n.t("sourceControl:topBarOpenPR.pushing")
            : step === "creating-pr"
              ? i18n.t("sourceControl:topBarOpenPR.creating")
              : step === "action"
                ? i18n.t("sourceControl:topBarOpenPR.working")
                : null;
  const hasRespondingTask = tasks.some((task) =>
    Boolean(activeTurnIdsByTask[task.id]),
  );
  const isCreateDisabled = isBusy || hasRespondingTask;
  const canContinueWorkspace =
    prStatus === "merged" || prStatus === "closed_unmerged";
  const isContinueDisabled = isBusy || continuingWorkspace || hasRespondingTask;
  const effectiveTargetBranch = targetBranch.trim() || defaultBaseBranch;
  const prStatusError = prInfo?.lastError ?? null;
  const prStatusHint = prInfo?.pr ? describePrStatusHint(prInfo.pr) : null;
  const createPrTooltip = hasRespondingTask
    ? i18n.t("sourceControl:topBarOpenPR.pauseOrFinishTheRunningTaskBefore")
    : prStatusError
      ? i18n.t("sourceControl:topBarOpenPR.pRStatusCouldNotBeRefreshed", { value1: prStatusError })
      : i18n.t("sourceControl:topBarOpenPR.createAPullRequestOnGitHub");
  const mergeDialogAllowedMethods = resolveCreatePrMergeState({
    preferredMethod: mergeDialogMethod,
    autoMergeEnabled: false,
    repoSettings: mergeDialogRepoSettings,
  }).allowedMethods;
  const mergeDialogHeadOid = prInfo?.pr?.headRefOid ?? null;
  const continueTooltip = hasRespondingTask
    ? i18n.t("sourceControl:topBarOpenPR.pauseOrFinishTheRunningTaskBefore2")
    : i18n.t("sourceControl:topBarOpenPR.createANewWorkspaceAndAttachA");

  const badgeToneStyle = prToneBadgeStyles[visual.tone];

  useEffect(() => {
    const onTopBarPrAction = (event: Event) => {
      const detail = (event as CustomEvent<TopBarPrActionDetail>).detail;
      if (!detail || !hasWorkspaceContext || isDefaultWorkspace) {
        return;
      }

      if (detail.action === "attach-context") {
        if (!prInfo?.pr?.url) {
          toast.warning(i18n.t("sourceControl:topBarOpenPR.noPullRequestToAttachContextFrom"), {
            description: i18n.t("sourceControl:topBarOpenPR.createAPullRequestForThisBranch"),
          });
          return;
        }
        setPrContextDialogOpen(true);
        return;
      }

      if (detail.action === "create-pr") {
        if (isCreateDisabled) {
          toast.warning(i18n.t("sourceControl:topBarOpenPR.createPRIsUnavailable"), {
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
        toast.warning(i18n.t("sourceControl:topBarOpenPR.continueIsUnavailable"), {
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
              <AdsButton
                layout="host"
                size="sm"
                type="button"
                xstyle={[
                  topBarControlStyles.control,
                  openPrStyles.trigger,
                  prCreateButtonStyles.trigger,
                ]}
                style={props.noDragStyle}
                onClick={() => void handleCreateClick()}
                disabled={isCreateDisabled}
              />
            }
          >
            {isBusy ? (
              <Loader
                aria-hidden
                className={sx(openPrStyles.flexNone)}
                size="xs"
                variant="persist"
              />
            ) : (
              <GitPullRequest
                aria-hidden
                className={sx(openPrStyles.triggerIcon)}
              />
            )}
            {statusLabel ?? i18n.t("sourceControl:topBarOpenPR.createPR")}
          </TooltipTrigger>
          <TooltipContent side="bottom">{createPrTooltip}</TooltipContent>
        </Tooltip>
      ) : (
        /* Has PR – show status dropdown */
        <div className={sx(openPrStyles.triggerGroup)}>
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger
                render={
                  <span {...stylex.props(layoutShellStyles.inlineFlex)} />
                }
              >
                <DropdownMenuTrigger
                  render={
                    <AdsButton
                      layout="host"
                      size="sm"
                      type="button"
                      xstyle={[
                        topBarControlStyles.control,
                        openPrStyles.trigger,
                        // Draft is the neutral tone. A badge fill here is a
                        // different chip from the branch switcher and Commit
                        // graph beside it; those share `surface`. Colored
                        // tones keep the status fill.
                        visual.tone === "neutral"
                          ? topBarControlStyles.surface
                          : badgeToneStyle,
                      ]}
                      style={props.noDragStyle}
                      disabled={isBusy || continuingWorkspace}
                      aria-label={i18n.t("sourceControl:topBarOpenPR.statusMenu")}
                    />
                  }
                >
                  {isBusy ? (
                    <Loader
                      aria-hidden
                      className={sx(openPrStyles.flexNone)}
                      size="xs"
                      variant="scan"
                    />
                  ) : (
                    <PrStatusIcon
                      status={prStatus}
                      className={sx(openPrStyles.statusIcon)}
                    />
                  )}
                  {statusLabel ?? visual.label}
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {i18n.t("sourceControl:topBarOpenPR.pR")}{prInfo?.pr?.number ?? "?"}: {visual.label}
                {prStatusHint ? ` — ${prStatusHint}` : ""}
                {prStatusError
                  ? i18n.t("sourceControl:topBarOpenPR.statusMayBeStale", { value1: prStatusError })
                  : ""}
              </TooltipContent>
            </Tooltip>

            <DropdownMenuContent
              align="end"
              xstyle={openPrStyles.statusMenu}
            >
              {/* PR info header */}
              <DropdownMenuLabel
                className={sx(openPrStyles.statusMenuLabel)}
              >
                <span className={sx(openPrStyles.statusMenuTitle)}>
                  #{prInfo?.pr?.number} {prInfo?.pr?.title}
                </span>
                <span className={sx(openPrStyles.statusMenuSubtitle)}>
                  {i18n.t("sourceControl:topBarOpenPR.branchDirection", { head: currentBranch, base: prInfo?.pr?.baseRefName ?? defaultBaseBranch })}
                </span>
              </DropdownMenuLabel>

              <DropdownMenuSeparator />

              {/* Primary action */}
              {actions.primary ? (
                <DropdownMenuItem
                  className={sx(openPrStyles.menuItemStrong)}
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
                    <span className={sx(openPrStyles.menuItemRow)}>
                      {action.key === "open_github" ? (
                        <ExternalLink
                          {...stylex.props(openPrStyles.menuItemIcon)}
                        />
                      ) : (
                        <RefreshCw
                          {...stylex.props(openPrStyles.menuItemIcon)}
                        />
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
                    <span className={sx(openPrStyles.menuItemRow)}>
                      <MessageSquare
                        {...stylex.props(openPrStyles.menuItemIcon)}
                      />
                      {i18n.t("sourceControl:topBarOpenPR.attachPRContext")}
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
                  <AdsButton
                    layout="host"
                    size="sm"
                    type="button"
                    xstyle={[
                      topBarControlStyles.control,
                      openPrStyles.trigger,
                      openPrStyles.continueTrigger,
                    ]}
                    style={props.noDragStyle}
                    onClick={() => setContinueDialogOpen(true)}
                    disabled={isContinueDisabled}
                  />
                }
              >
                {continuingWorkspace ? (
                  <Loader
                    aria-hidden
                    className={sx(openPrStyles.flexNone)}
                    size="xs"
                    variant="sync"
                  />
                ) : (
                  <GitBranch />
                )}
                {i18n.t("sourceControl:topBarOpenPR.continue")}
              </TooltipTrigger>
              <TooltipContent side="bottom">{continueTooltip}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      )}

      <CreatePullRequestDialog
        dialog={{
          open: dialogOpen,
          step,
          busy: isDialogBusy,
          onOpen: () => setDialogOpen(true),
          onClose: () => resetCreatePrDialogState({ closeDialog: true }),
        }}
        branch={{
          currentBranch,
          defaultBranch: defaultBaseBranch,
          targetBranch: effectiveTargetBranch,
          options: targetBranchOptions,
          loading: loadingTargetBranches,
          onTargetBranchChange: setTargetBranch,
        }}
        merge={{
          method: dialogMergeMethod,
          autoMerge: dialogAutoMerge,
          repoSettings: repoMergeSettings,
          onMethodChange: setDialogMergeMethod,
          onAutoMergeChange: setDialogAutoMerge,
        }}
        draft={{
          title: prTitle,
          body: prBody,
          notice: inlineNotice,
          titleInvalid: isTitleInvalid,
          onTitleChange: setPrTitle,
          onBodyChange: setPrBody,
        }}
        changes={{
          files: changedFiles,
          selectedFilePaths,
          expanded: changesExpanded,
          commitMessage,
          commitMessageInvalid: isCommitMessageInvalid,
          fallbackCommitMessage,
          onExpandedChange: setChangesExpanded,
          onFileCheckedChange: handleCreatePrFileChecked,
          onCommitMessageChange: setCommitMessage,
        }}
        review={{
          findings: reviewFindings,
          diffTruncated: reviewDiffTruncated,
          verificationFailures,
          verificationBlocking,
          onStopAfterReview: handleStopAfterReview,
          onProceedAfterReview: handleProceedAfterReview,
          onStopAfterVerification: handleStopAfterVerification,
          onProceedAfterVerification: handleProceedAfterVerification,
        }}
        submit={{
          canSubmit: canSubmitPr,
          submitting: isCreatePrSubmitting,
          onSubmit: handleFormSubmit,
        }}
      />

      {/* --- Merge PR confirmation --- */}
      <Dialog
        open={mergeDialogOpen}
        onOpenChange={(open, eventDetails) => {
          if (!open && step === "action") {
            eventDetails.cancel();
            return;
          }
          setMergeDialogOpen(open);
        }}
      >
        <DialogContent showCloseButton={step !== "action"}>
          <DialogHeader>
            <DialogTitle>{i18n.t("sourceControl:topBarOpenPR.mergePullRequest")}</DialogTitle>
            <DialogDescription>
              #{prInfo?.pr?.number} {prInfo?.pr?.title}
            </DialogDescription>
          </DialogHeader>

          <div className={sx(openPrStyles.formBody)}>
            <div className={sx(openPrStyles.branchCard)}>
              <div className={sx(openPrStyles.branchGrid)}>
                <div className={sx(openPrStyles.branchField)}>
                  <p className={FIELD_LABEL_CLASS}>{i18n.t("sourceControl:topBarOpenPR.from")}</p>
                  <div className={sx(openPrStyles.branchReadout)}>
                    <GitBranch
                      {...stylex.props(openPrStyles.branchReadoutIcon)}
                    />
                    <span className={sx(openPrStyles.truncate)}>
                      {prInfo?.pr?.headRefName || currentBranch || i18n.t("sourceControl:topBarOpenPR.hEAD")}
                    </span>
                  </div>
                </div>
                <ArrowRight
                  {...stylex.props(openPrStyles.branchArrow)}
                  aria-hidden="true"
                />
                <div className={sx(openPrStyles.branchField)}>
                  <p className={FIELD_LABEL_CLASS}>{i18n.t("sourceControl:topBarOpenPR.into")}</p>
                  <div className={sx(openPrStyles.branchReadout)}>
                    <GitBranch
                      {...stylex.props(openPrStyles.branchReadoutIcon)}
                    />
                    <span className={sx(openPrStyles.truncate)}>
                      {prInfo?.pr?.baseRefName || defaultBaseBranch}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className={sx(openPrStyles.mergeCard)}>
              <p className={FIELD_LABEL_CLASS}>{i18n.t("sourceControl:topBarOpenPR.mergeBehavior")}</p>
              <div className={sx(openPrStyles.settingRow)}>
                <div className={sx(openPrStyles.minWidthZero)}>
                  <label
                    className={sx(openPrStyles.settingLabel)}
                    htmlFor="merge-pr-method"
                  >
                    {i18n.t("sourceControl:topBarOpenPR.mergeMethod")}
                  </label>
                  <p className={sx(openPrStyles.settingHint)}>
                    {mergeDialogLoading
                      ? i18n.t("sourceControl:topBarOpenPR.checkingWhichMethodsTheRepositoryAllows")
                      : mergeDialogRepoSettings
                        ? i18n.t("sourceControl:topBarOpenPR.limitedToMethodsTheRepositoryAllows")
                        : i18n.t("sourceControl:topBarOpenPR.repositorySettingsUnavailableGitHubDecides")}
                  </p>
                </div>
                <Select
                  value={mergeDialogMethod}
                  onValueChange={(value) =>
                    setMergeDialogMethod(value as ConcretePrMergeMethod)
                  }
                  disabled={mergeDialogLoading || step === "action"}
                >
                  <SelectTrigger
                    id="merge-pr-method"
                    className={sx(openPrStyles.mergeMethodTrigger)}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      value="squash"
                      disabled={!mergeDialogAllowedMethods.squash}
                    >
                      {i18n.t("sourceControl:topBarOpenPR.squash")}
                      {mergeDialogAllowedMethods.squash ? "" : i18n.t("sourceControl:topBarOpenPR.notAllowed")}
                    </SelectItem>
                    <SelectItem
                      value="merge"
                      disabled={!mergeDialogAllowedMethods.merge}
                    >
                      {i18n.t("sourceControl:topBarOpenPR.mergeCommit")}
                      {mergeDialogAllowedMethods.merge ? "" : i18n.t("sourceControl:topBarOpenPR.notAllowed")}
                    </SelectItem>
                    <SelectItem
                      value="rebase"
                      disabled={!mergeDialogAllowedMethods.rebase}
                    >
                      {i18n.t("sourceControl:topBarOpenPR.rebase")}
                      {mergeDialogAllowedMethods.rebase ? "" : i18n.t("sourceControl:topBarOpenPR.notAllowed")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div
                {...stylex.props(openPrStyles.divider)}
                aria-hidden="true"
              />
              <p className={sx(openPrStyles.settingHint)}>
                {mergeDialogHeadOid
                  ? i18n.t("sourceControl:topBarOpenPR.mergesOnlyIfThePRHeadIs", { value1: mergeDialogHeadOid.slice(0, 7) })
                  : i18n.t("sourceControl:topBarOpenPR.headCommitUnknownTheMergeWillNot")}
              </p>
            </div>

            {mergeDialogError ? (
              <InlineNoticeBanner
                notice={{
                  tone: "error",
                  title: i18n.t("sourceControl:topBarOpenPR.mergeFailed"),
                  description: mergeDialogError,
                }}
              />
            ) : null}
          </div>

          <DialogFooter className={sx(openPrStyles.dialogFooter)}>
            <Button
              type="button"
              variant="outline"
              onClick={() => setMergeDialogOpen(false)}
              disabled={step === "action"}
            >
              {i18n.t("sourceControl:topBarOpenPR.cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => void handleConfirmMerge()}
              disabled={mergeDialogLoading || step === "action"}
            >
              {step === "action" ? (
                <Loader aria-hidden size="xs" variant="persist" />
              ) : null}
              {i18n.t("sourceControl:topBarOpenPR.mergePR")}
            </Button>
          </DialogFooter>
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
