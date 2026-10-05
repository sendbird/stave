import { i18n, useTranslation } from "@/i18n";
import { Button as AdsButton } from "@/components/ads/components/Button";
import * as stylex from "@stylexjs/stylex";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Download,
  GitBranch,
  GitBranchPlus,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Input,
  Loader,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
} from "@/components/ui";
import {
  DETACHED_HEAD_BRANCH,
  formatBranchLabel,
  isDetachedHead,
} from "@/lib/source-control-branch-label";
import { isBranchAttachedElsewhere } from "@/lib/source-control-worktrees";
import { sx } from "@/components/ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import { layoutShellStyles } from "./layout-shell.styles";
import { branchDropdownStyles } from "./top-bar-branch-dropdown.styles";
import { topBarControlStyles } from "./top-bar.styles";
import { formatWorkspacePathLabel } from "@/store/repository.utils";
import {
  buildTopBarBranchGroups,
  resolveDefaultBranchDrift,
  resolveOriginDefaultBranchLabel,
  validateNewBranchName,
  type TopBarBranchOption,
} from "@/components/layout/TopBarBranchDropdown.utils";
import type { CSSProperties } from "react";

interface BranchStatusSummary {
  dirtyCount: number;
  hasConflicts: boolean;
}

const CLEAN_BRANCH_STATUS: BranchStatusSummary = {
  dirtyCount: 0,
  hasConflicts: false,
};

export function TopBarBranchDropdown(props: { noDragStyle: CSSProperties }) {
  useTranslation();
  const [branchOpen, setBranchOpen] = useState(false);
  const [branchFilter, setBranchFilter] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [remoteBranches, setRemoteBranches] = useState<string[]>([]);
  const [worktreePathByBranch, setWorktreePathByBranch] = useState<
    Record<string, string>
  >({});
  const [detectedCurrentBranch, setDetectedCurrentBranch] = useState<{
    workspaceId: string;
    branch: string | null;
  }>({ workspaceId: "", branch: null });
  const [branchError, setBranchError] = useState("");
  const [branchStatus, setBranchStatus] =
    useState<BranchStatusSummary>(CLEAN_BRANCH_STATUS);
  const [isBusy, setIsBusy] = useState(false);
  const [branchOperation, setBranchOperation] = useState<
    "fetch" | "pull" | "detach" | null
  >(null);
  const branchRequestIdRef = useRef(0);
  const branchDetectionRequestIdRef = useRef(0);
  const statusRequestIdRef = useRef(0);
  const lastBranchDriftWarningRef = useRef("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [
    activeWorkspaceId,
    defaultBranch,
    workspaceDefaultById,
    workspaceBranchById,
    workspacePathById,
    repositoryPath,
    setWorkspaceBranch,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.activeWorkspaceId,
          state.defaultBranch,
          state.workspaceDefaultById,
          state.workspaceBranchById,
          state.workspacePathById,
          state.repositoryPath,
          state.setWorkspaceBranch,
        ] as const,
    ),
  );

  const isDefaultWorkspace = Boolean(workspaceDefaultById[activeWorkspaceId]);
  const activeWorkspaceBranch = workspaceBranchById[activeWorkspaceId];
  const workspaceCwd =
    workspacePathById[activeWorkspaceId] ?? repositoryPath ?? "";
  const hasWorkspaceContext = Boolean(activeWorkspaceId && workspaceCwd);
  const detectedActualBranch =
    detectedCurrentBranch.workspaceId === activeWorkspaceId
      ? detectedCurrentBranch.branch
      : null;
  const currentBranch = isDefaultWorkspace
    ? (detectedActualBranch ?? activeWorkspaceBranch ?? null)
    : (activeWorkspaceBranch ?? detectedActualBranch ?? null);
  const isDetachedCheckout = isDetachedHead(currentBranch);
  const currentBranchLabel = currentBranch
    ? formatBranchLabel(currentBranch)
    : currentBranch;
  const originDefaultRef = useMemo(
    () => resolveOriginDefaultBranchLabel({ remoteBranches }),
    [remoteBranches],
  );
  const branchDrift = useMemo(
    () =>
      resolveDefaultBranchDrift({
        isDefaultWorkspace,
        expectedBranch: defaultBranch,
        actualBranch: detectedActualBranch,
      }),
    [defaultBranch, detectedActualBranch, isDefaultWorkspace],
  );
  const createBranchError = useMemo(
    () =>
      validateNewBranchName({
        value: newBranchName,
        existingBranches: branches,
      }),
    [branches, newBranchName, i18n.language],
  );
  const canCreateBranch = Boolean(
    newBranchName.trim() && !createBranchError && currentBranch && !isBusy,
  );

  const refreshBranchStatus = useCallback(async () => {
    if (!hasWorkspaceContext) {
      setBranchStatus(CLEAN_BRANCH_STATUS);
      return;
    }

    const getStatus = window.api?.sourceControl?.getStatus;
    if (!getStatus) {
      return;
    }

    statusRequestIdRef.current += 1;
    const requestId = statusRequestIdRef.current;
    try {
      const result = await getStatus({ cwd: workspaceCwd });
      if (statusRequestIdRef.current !== requestId || !result.ok) {
        return;
      }
      setBranchStatus({
        dirtyCount: result.items.length,
        hasConflicts: result.hasConflicts,
      });
    } catch {
      if (statusRequestIdRef.current === requestId) {
        setBranchStatus(CLEAN_BRANCH_STATUS);
      }
    }
  }, [hasWorkspaceContext, workspaceCwd]);

  const refreshDetectedBranch = useCallback(async () => {
    if (!hasWorkspaceContext) {
      return;
    }
    const listBranches = window.api?.sourceControl?.listBranches;
    if (!listBranches) {
      return;
    }

    branchDetectionRequestIdRef.current += 1;
    const requestId = branchDetectionRequestIdRef.current;
    try {
      const result = await listBranches({ cwd: workspaceCwd });
      if (
        branchDetectionRequestIdRef.current !== requestId ||
        !result.ok ||
        !result.current
      ) {
        return;
      }
      setDetectedCurrentBranch({
        workspaceId: activeWorkspaceId,
        branch: result.current,
      });
      setBranches(result.branches);
      setRemoteBranches(result.remoteBranches ?? []);
      setWorktreePathByBranch(result.worktreePathByBranch ?? {});
    } catch {
      // Branch detection is a background integrity check. The explicit menu
      // refresh path reports actionable errors.
    }
  }, [activeWorkspaceId, hasWorkspaceContext, workspaceCwd]);

  useEffect(() => {
    branchRequestIdRef.current += 1;
    branchDetectionRequestIdRef.current += 1;

    if (!hasWorkspaceContext) {
      setDetectedCurrentBranch({ workspaceId: "", branch: null });
      setBranches([]);
      setRemoteBranches([]);
      setWorktreePathByBranch({});
      setBranchError("");
      setBranchStatus(CLEAN_BRANCH_STATUS);
      setIsBusy(false);
      setBranchOperation(null);
      return;
    }

    setDetectedCurrentBranch((previous) =>
      previous.workspaceId === activeWorkspaceId
        ? previous
        : { workspaceId: activeWorkspaceId, branch: null },
    );
    setBranches([]);
    setRemoteBranches([]);
    setWorktreePathByBranch({});
    setBranchError("");
    setIsBusy(false);
    setBranchOperation(null);

    void refreshDetectedBranch();
    void refreshBranchStatus();
  }, [
    activeWorkspaceId,
    hasWorkspaceContext,
    refreshDetectedBranch,
    refreshBranchStatus,
    workspaceCwd,
  ]);

  useEffect(() => {
    if (!hasWorkspaceContext || !isDefaultWorkspace) {
      return;
    }
    const refreshWhenVisible = () => {
      if (document.visibilityState === "hidden") {
        return;
      }
      void refreshDetectedBranch();
    };
    const timer = window.setInterval(refreshWhenVisible, 15_000);
    window.addEventListener("focus", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [hasWorkspaceContext, isDefaultWorkspace, refreshDetectedBranch]);

  useEffect(() => {
    if (!branchDrift) {
      lastBranchDriftWarningRef.current = "";
      return;
    }
    const warningKey = `${activeWorkspaceId}:${branchDrift.expectedBranch}:${branchDrift.actualBranch}`;
    if (lastBranchDriftWarningRef.current === warningKey) {
      return;
    }
    lastBranchDriftWarningRef.current = warningKey;
    toast.warning(i18n.t("shell:topBarBranchDropdown.defaultWorkspaceChangedBranches"), {
      description: i18n.t("shell:topBarBranchDropdown.gitIsOnOpenTheBranch", { value1: branchDrift.actualBranch, value2: branchDrift.expectedBranch }),
      position: "bottom-right",
    });
  }, [activeWorkspaceId, branchDrift]);

  const loadBranches = useCallback(
    async (args?: { refreshRemote?: boolean }) => {
      if (!hasWorkspaceContext) {
        setBranchError(i18n.t("shell:topBarBranchDropdown.noWorkspaceSelected"));
        return false;
      }

      const listBranches = window.api?.sourceControl?.listBranches;
      if (!listBranches) {
        setBranchError(i18n.t("shell:topBarBranchDropdown.sourceControlBridgeUnavailable"));
        return false;
      }

      branchRequestIdRef.current += 1;
      const requestId = branchRequestIdRef.current;
      setIsBusy(true);
      try {
        const result = await listBranches({
          cwd: workspaceCwd,
          refreshRemote: args?.refreshRemote,
        });
        if (branchRequestIdRef.current !== requestId) {
          return false;
        }
        if (!result.ok) {
          setBranchError(result.stderr || i18n.t("shell:topBarBranchDropdown.failedToLoadBranches"));
          return false;
        }
        setDetectedCurrentBranch({
          workspaceId: activeWorkspaceId,
          branch: result.current || activeWorkspaceBranch || null,
        });
        setBranches(result.branches);
        setRemoteBranches(result.remoteBranches ?? []);
        setWorktreePathByBranch(result.worktreePathByBranch ?? {});
        setBranchError("");
        await refreshBranchStatus();
        return true;
      } catch (err) {
        if (branchRequestIdRef.current === requestId) {
          setBranchError(
            err instanceof Error ? err.message : i18n.t("shell:topBarBranchDropdown.failedToLoadBranches"),
          );
        }
        return false;
      } finally {
        if (branchRequestIdRef.current === requestId) {
          setIsBusy(false);
        }
      }
    },
    [
      activeWorkspaceBranch,
      activeWorkspaceId,
      hasWorkspaceContext,
      refreshBranchStatus,
      workspaceCwd,
    ],
  );

  const handleFetchCurrentBranch = useCallback(async () => {
    if (!currentBranch) return;
    const fetchBranch = window.api?.sourceControl?.fetchBranch;
    if (!fetchBranch) {
      const message = i18n.t("shell:topBarBranchDropdown.fetchBridgeUnavailable");
      setBranchError(message);
      toast.error(i18n.t("shell:topBarBranchDropdown.branchFetchFailed"), { description: message });
      return;
    }

    setIsBusy(true);
    setBranchOperation("fetch");
    setBranchError("");
    try {
      const result = await fetchBranch({
        cwd: workspaceCwd,
        branch: currentBranch,
      });
      if (!result.ok) {
        const message = formatScmCommandError(result, i18n.t("shell:topBarBranchDropdown.branchFetchFailed2"));
        setBranchError(message);
        toast.error(i18n.t("shell:topBarBranchDropdown.branchFetchFailed"), { description: message });
        return;
      }
      toast.success(i18n.t("shell:topBarBranchDropdown.branchFetched"), { description: currentBranch });
      await loadBranches();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : i18n.t("shell:topBarBranchDropdown.branchFetchFailed2");
      setBranchError(message);
      toast.error(i18n.t("shell:topBarBranchDropdown.branchFetchFailed"), { description: message });
    } finally {
      setBranchOperation(null);
      setIsBusy(false);
    }
  }, [currentBranch, loadBranches, workspaceCwd]);

  const handlePullCurrentBranch = useCallback(async () => {
    if (!currentBranch) return;
    const pullBranch = window.api?.sourceControl?.pullBranch;
    if (!pullBranch) {
      const message = i18n.t("shell:topBarBranchDropdown.pullBridgeUnavailable");
      setBranchError(message);
      toast.error(i18n.t("shell:topBarBranchDropdown.branchPullFailed"), { description: message });
      return;
    }

    if (branchStatus.dirtyCount > 0) {
      toast.warning(i18n.t("shell:topBarBranchDropdown.workingTreeHasLocalChanges"), {
        description: i18n.t("shell:topBarBranchDropdown.gitMayBlockPullIfLocalEdits"),
      });
    }

    setIsBusy(true);
    setBranchOperation("pull");
    setBranchError("");
    try {
      const result = await pullBranch({
        cwd: workspaceCwd,
        branch: currentBranch,
      });
      if (!result.ok) {
        const message = formatScmCommandError(result, i18n.t("shell:topBarBranchDropdown.branchPullFailed2"));
        setBranchError(message);
        toast.error(i18n.t("shell:topBarBranchDropdown.branchPullFailed"), { description: message });
        return;
      }
      toast.success(i18n.t("shell:topBarBranchDropdown.branchPulled"), { description: currentBranch });
      await loadBranches();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : i18n.t("shell:topBarBranchDropdown.branchPullFailed2");
      setBranchError(message);
      toast.error(i18n.t("shell:topBarBranchDropdown.branchPullFailed"), { description: message });
    } finally {
      setBranchOperation(null);
      setIsBusy(false);
    }
  }, [branchStatus.dirtyCount, currentBranch, loadBranches, workspaceCwd]);

  const handleDetachOriginDefaultBranch = useCallback(async () => {
    const checkoutDefaultBranchDetached =
      window.api?.sourceControl?.checkoutDefaultBranchDetached;
    if (!checkoutDefaultBranchDetached) {
      const message = i18n.t("shell:topBarBranchDropdown.detachedCheckoutBridgeUnavailable");
      setBranchError(message);
      toast.error(i18n.t("shell:topBarBranchDropdown.detachedCheckoutFailed"), { description: message });
      return;
    }

    setIsBusy(true);
    setBranchOperation("detach");
    setBranchError("");
    try {
      const result = await checkoutDefaultBranchDetached({ cwd: workspaceCwd });
      if (!result.ok) {
        const message = formatScmCommandError(
          result,
          i18n.t("shell:topBarBranchDropdown.detachedCheckoutFailed2"),
        );
        setBranchError(message);
        toast.error(i18n.t("shell:topBarBranchDropdown.detachedCheckoutFailed"), { description: message });
        return;
      }
      // Mirror `checkoutLocalBranch`: the persisted workspace branch has to follow the
      // checkout, otherwise every other surface reading it keeps showing the old branch.
      setWorkspaceBranch({
        workspaceId: activeWorkspaceId,
        branch: DETACHED_HEAD_BRANCH,
      });
      setDetectedCurrentBranch({
        workspaceId: activeWorkspaceId,
        branch: DETACHED_HEAD_BRANCH,
      });
      toast.success(i18n.t("shell:topBarBranchDropdown.checkedOut", { value1: result.ref }), {
        description: result.head
          ? i18n.t("shell:topBarBranchDropdown.detachedHEADAt", { value1: result.head })
          : i18n.t("shell:topBarBranchDropdown.detachedHEAD"),
      });
      await loadBranches();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : i18n.t("shell:topBarBranchDropdown.detachedCheckoutFailed2");
      setBranchError(message);
      toast.error(i18n.t("shell:topBarBranchDropdown.detachedCheckoutFailed"), { description: message });
    } finally {
      setBranchOperation(null);
      setIsBusy(false);
    }
  }, [activeWorkspaceId, loadBranches, setWorkspaceBranch, workspaceCwd]);

  useEffect(() => {
    if (!hasWorkspaceContext || !branchOpen || !isDefaultWorkspace) return;
    void loadBranches();
  }, [branchOpen, hasWorkspaceContext, isDefaultWorkspace, loadBranches]);

  useEffect(() => {
    if (!branchOpen) return;
    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [branchOpen]);

  useEffect(() => {
    if (!isDefaultWorkspace) {
      setBranchOpen(false);
      setBranchFilter("");
      setNewBranchName("");
    }
  }, [isDefaultWorkspace]);

  const branchGroups = useMemo(
    () =>
      currentBranch
        ? buildTopBarBranchGroups({
            branches,
            remoteBranches,
            currentBranch,
            query: branchFilter,
            workspacePath: workspaceCwd,
            worktreePathByBranch,
          })
        : [],
    [
      branchFilter,
      branches,
      currentBranch,
      remoteBranches,
      workspaceCwd,
      worktreePathByBranch,
      i18n.language,
    ],
  );
  const firstCheckoutOption = useMemo(
    () =>
      branchGroups
        .flatMap((group) => group.options)
        .find((option) => option.state === "available") ?? null,
    [branchGroups],
  );

  async function checkoutLocalBranch(args: { name: string }) {
    const checkoutBranch = window.api?.sourceControl?.checkoutBranch;
    if (!checkoutBranch) {
      const message = i18n.t("shell:topBarBranchDropdown.checkoutBridgeUnavailable");
      setBranchError(message);
      toast.error(i18n.t("shell:topBarBranchDropdown.branchCheckoutFailed"), { description: message });
      return false;
    }

    const result = await checkoutBranch({ name: args.name, cwd: workspaceCwd });
    if (!result.ok) {
      const message = result.stderr || i18n.t("shell:topBarBranchDropdown.branchCheckoutFailed2");
      setBranchError(message);
      toast.error(i18n.t("shell:topBarBranchDropdown.branchCheckoutFailed"), { description: message });
      return false;
    }
    setWorkspaceBranch({ workspaceId: activeWorkspaceId, branch: args.name });
    setDetectedCurrentBranch({
      workspaceId: activeWorkspaceId,
      branch: args.name,
    });
    return true;
  }

  async function handleCreateBranch() {
    const createBranch = window.api?.sourceControl?.createBranch;
    if (!createBranch) {
      setBranchError(i18n.t("shell:topBarBranchDropdown.createBranchBridgeUnavailable"));
      return;
    }
    const targetName = newBranchName.trim();
    const validationError = validateNewBranchName({
      value: targetName,
      existingBranches: branches,
    });
    if (validationError) {
      setBranchError(validationError);
      return;
    }
    if (!currentBranch) return;

    setIsBusy(true);
    try {
      const result = await createBranch({
        name: targetName,
        from: currentBranch,
        cwd: workspaceCwd,
      });
      if (!result.ok) {
        setBranchError(result.stderr || i18n.t("shell:topBarBranchDropdown.branchCreationFailed"));
        return;
      }
      const checkedOut = await checkoutLocalBranch({ name: targetName });
      setNewBranchName("");
      await loadBranches();
      if (checkedOut) {
        setBranchOpen(false);
        setBranchFilter("");
      }
    } catch (err) {
      setBranchError(
        err instanceof Error ? err.message : i18n.t("shell:topBarBranchDropdown.branchCreationFailed"),
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCheckoutBranch(args: { option: TopBarBranchOption }) {
    const { option } = args;
    if (option.state === "current") return false;

    const blockedByWorktree = isBranchAttachedElsewhere({
      branch: option.localName,
      workspacePath: workspaceCwd,
      worktreePathByBranch,
    });
    if (option.state === "attached" || blockedByWorktree) {
      const attachedPath =
        option.attachedPath ?? worktreePathByBranch[option.localName];
      const message = attachedPath
        ? i18n.t("shell:topBarBranchDropdown.branchIsAlreadyCheckedOutIn", { value1: option.localName, value2: formatWorkspacePathLabel({ workspacePath: attachedPath, repositoryPath }) })
        : i18n.t("shell:topBarBranchDropdown.branchIsAlreadyCheckedOutIn2", { value1: option.localName });
      setBranchError(message);
      toast.error(i18n.t("shell:topBarBranchDropdown.branchUnavailable"), { description: message });
      return false;
    }

    if (branchStatus.dirtyCount > 0) {
      toast.warning(i18n.t("shell:topBarBranchDropdown.workingTreeHasLocalChanges"), {
        description:
          i18n.t("shell:topBarBranchDropdown.staveWillAskGitToSwitchBranches"),
      });
    }

    setIsBusy(true);
    try {
      if (option.kind === "remote") {
        const createBranch = window.api?.sourceControl?.createBranch;
        if (!createBranch) {
          const message = i18n.t("shell:topBarBranchDropdown.createBranchBridgeUnavailable");
          setBranchError(message);
          toast.error(i18n.t("shell:topBarBranchDropdown.branchCheckoutFailed"), { description: message });
          return false;
        }
        const result = await createBranch({
          name: option.localName,
          from: option.checkoutName,
          cwd: workspaceCwd,
        });
        if (!result.ok) {
          const message = result.stderr || i18n.t("shell:topBarBranchDropdown.branchCreationFailed");
          setBranchError(message);
          toast.error(i18n.t("shell:topBarBranchDropdown.branchCheckoutFailed"), { description: message });
          return false;
        }
      }

      const checkedOut = await checkoutLocalBranch({ name: option.localName });
      await loadBranches();
      return checkedOut;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : i18n.t("shell:topBarBranchDropdown.branchCheckoutFailed2");
      setBranchError(message);
      toast.error(i18n.t("shell:topBarBranchDropdown.branchCheckoutFailed"), { description: message });
      return false;
    } finally {
      setIsBusy(false);
    }
  }

  async function handleReturnToDefaultBranch() {
    if (!branchDrift) {
      return;
    }
    if (branchStatus.dirtyCount > 0) {
      toast.warning(i18n.t("shell:topBarBranchDropdown.workingTreeHasLocalChanges"), {
        description:
          i18n.t("shell:topBarBranchDropdown.gitMayBlockTheReturnIfLocal"),
      });
    }

    setIsBusy(true);
    try {
      const checkedOut = await checkoutLocalBranch({
        name: branchDrift.expectedBranch,
      });
      if (!checkedOut) {
        return;
      }
      toast.success(i18n.t("shell:topBarBranchDropdown.returnedToTheDefaultBranch"), {
        description: branchDrift.expectedBranch,
      });
      await loadBranches();
    } finally {
      setIsBusy(false);
    }
  }

  if (!hasWorkspaceContext || !currentBranch) return null;

  if (isDefaultWorkspace) {
    const dirtyTone = branchStatus.hasConflicts
      ? branchDropdownStyles.dirtyCountConflict
      : branchStatus.dirtyCount > 0
        ? branchDropdownStyles.dirtyCountDirty
        : null;

    return (
      <DropdownMenu open={branchOpen} onOpenChange={setBranchOpen}>
        <Tooltip>
          <TooltipTrigger
            render={<span {...stylex.props(layoutShellStyles.inlineFlex)} />}
          >
            <DropdownMenuTrigger
              render={
                <AdsButton
                  layout="host"
                  size="sm"
                  type="button"
                  xstyle={[
                    topBarControlStyles.control,
                    topBarControlStyles.surface,
                    branchDropdownStyles.trigger,
                    branchOpen && branchDropdownStyles.triggerOpen,
                    Boolean(branchDrift) && branchDropdownStyles.triggerDrift,
                  ]}
                  style={props.noDragStyle}
                  aria-label={
                    branchDrift
                      ? i18n.t("shell:topBarBranchDropdown.switchBranchDefaultWorkspaceIsOnInstead", { value1: branchDrift.actualBranch, value2: branchDrift.expectedBranch })
                      : i18n.t("shell:topBarBranchDropdown.switchBranch")
                  }
                />
              }
            >
              {isBusy ? (
                <Loader
                  aria-hidden
                  className={sx(branchDropdownStyles.flexNone)}
                  size="xs"
                  variant="sync"
                />
              ) : (
                <GitBranch />
              )}
              <span className={sx(branchDropdownStyles.truncate)}>
                {currentBranchLabel}
              </span>
              {branchStatus.dirtyCount > 0 ? (
                <span
                  {...stylex.props(branchDropdownStyles.dirtyCount, dirtyTone)}
                >
                  {branchStatus.dirtyCount}
                </span>
              ) : null}
              {branchDrift ? <AlertTriangle aria-hidden="true" /> : null}
              <ChevronDown
                {...stylex.props(
                  branchDropdownStyles.chevron,
                  branchOpen && branchDropdownStyles.chevronOpen,
                )}
              />
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {branchStatus.dirtyCount > 0
              ? i18n.t("shell:topBarBranchDropdown.localChange", { count: branchStatus.dirtyCount })
              : branchDrift
                ? i18n.t("shell:topBarBranchDropdown.returnTo", { value1: branchDrift.expectedBranch })
                : i18n.t("shell:topBarBranchDropdown.switchBranch")}
          </TooltipContent>
        </Tooltip>

        <DropdownMenuContent
          align="start"
          sideOffset={8}
          xstyle={branchDropdownStyles.menu}
        >
          <div className={sx(branchDropdownStyles.header)}>
            <div className={sx(branchDropdownStyles.headerRow)}>
              <div className={sx(branchDropdownStyles.searchField)}>
                <Search {...stylex.props(branchDropdownStyles.searchIcon)} />
                <Input
                  ref={searchInputRef}
                  xstyle={branchDropdownStyles.searchInput}
                  placeholder={i18n.t("shell:topBarBranchDropdown.searchBranches")}
                  value={branchFilter}
                  onChange={(event) => setBranchFilter(event.target.value)}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Enter" && firstCheckoutOption) {
                      event.preventDefault();
                      void handleCheckoutBranch({
                        option: firstCheckoutOption,
                      }).then((ok) => {
                        if (!ok) return;
                        setBranchOpen(false);
                        setBranchFilter("");
                      });
                    }
                  }}
                  onKeyUp={(event) => event.stopPropagation()}
                  onPaste={(event) => event.stopPropagation()}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                // `icon-sm` is 32px; every other control in this popup — the
                // search field beside it, Fetch, Pull, Create — is on the 36px
                // rung, so the refresh trigger was the one control in the row
                // that did not line up with its own neighbour.
                size="icon"
                title={i18n.t("shell:topBarBranchDropdown.refreshBranches")}
                aria-label={i18n.t("shell:topBarBranchDropdown.refreshBranches")}
                disabled={isBusy}
                onClick={() => void loadBranches({ refreshRemote: true })}
              >
                <RefreshCw
                  {...stylex.props(isBusy && branchDropdownStyles.spinning)}
                />
              </Button>
            </div>

            {branchDrift ? (
              <div
                className={sx(branchDropdownStyles.driftNote)}
                role="status"
              >
                <AlertTriangle
                  {...stylex.props(branchDropdownStyles.driftIcon)}
                  aria-hidden="true"
                />
                <div className={sx(branchDropdownStyles.driftBody)}>
                  <p className={sx(branchDropdownStyles.driftTitle)}>{i18n.t("shell:topBarBranchDropdown.actualBranch", { branch: branchDrift.actualBranch })}</p>
                  <p className={sx(branchDropdownStyles.driftText)}>{i18n.t("shell:topBarBranchDropdown.expectedBranch", { branch: branchDrift.expectedBranch })}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  xstyle={branchDropdownStyles.driftAction}
                  disabled={isBusy}
                  onClick={() => void handleReturnToDefaultBranch()}
                >
                  {i18n.t("shell:topBarBranchDropdown.return")}
                </Button>
              </div>
            ) : null}

            <div className={sx(branchDropdownStyles.statusSection)}>
              <div className={sx(branchDropdownStyles.statusRow)}>
                <span className={sx(branchDropdownStyles.statusBranch)}>
                  {currentBranchLabel}
                </span>
                {/* Conflicts are a fault and keep the danger tone. A count of
                    changed files is not: it is the normal state of a branch
                    being worked on, so it reads neutral, matching the workspace
                    sync card which states the same fact. "Clean" is likewise a
                    report, not a success event. */}
                <Badge
                  variant={
                    branchStatus.hasConflicts ? "destructive" : "secondary"
                  }
                  className={sx(branchDropdownStyles.statusBadge)}
                >
                  {branchStatus.hasConflicts
                    ? i18n.t("shell:topBarBranchDropdown.conflicts")
                    : branchStatus.dirtyCount > 0
                      ? i18n.t("shell:topBarBranchDropdown.changed", { value1: branchStatus.dirtyCount })
                      : i18n.t("shell:topBarBranchDropdown.clean")}
                </Badge>
              </div>
              <p className={sx(branchDropdownStyles.statusHint)}>
                {branchStatus.dirtyCount > 0
                  ? i18n.t("shell:topBarBranchDropdown.localEditsStayInThisWorkspaceGit")
                  : isDetachedCheckout
                    ? i18n.t("shell:topBarBranchDropdown.hEADIsDetachedSoNoLocalBranch")
                    : i18n.t("shell:topBarBranchDropdown.createOrSwitchBranchesForThisDefault")}
              </p>
              <div className={sx(branchDropdownStyles.actionRow)}>
                <Button
                  type="button"
                  variant="outline"
                  size="default"
                  xstyle={branchDropdownStyles.actionButton}
                  disabled={isBusy}
                  onClick={() => void handleFetchCurrentBranch()}
                >
                  {branchOperation === "fetch" ? (
                    <Loader aria-hidden size="xs" variant="sync" />
                  ) : (
                    <RefreshCw />
                  )}
                  {i18n.t("shell:topBarBranchDropdown.fetch")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="default"
                  xstyle={branchDropdownStyles.actionButton}
                  disabled={isBusy || isDetachedCheckout}
                  onClick={() => void handlePullCurrentBranch()}
                >
                  {branchOperation === "pull" ? (
                    <Loader aria-hidden size="xs" variant="sync" />
                  ) : (
                    <Download />
                  )}
                  {i18n.t("shell:topBarBranchDropdown.pull")}
                </Button>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span {...stylex.props(branchDropdownStyles.detachSlot)} />
                    }
                  >
                    <Button
                      type="button"
                      variant="outline"
                      size="default"
                      xstyle={branchDropdownStyles.detachButton}
                      disabled={isBusy || !originDefaultRef}
                      onClick={() => void handleDetachOriginDefaultBranch()}
                    >
                      {branchOperation === "detach" ? (
                        <Loader aria-hidden size="xs" variant="sync" />
                      ) : (
                        <GitBranchPlus />
                      )}
                      <span className={sx(branchDropdownStyles.truncate)}>
                        {originDefaultRef
                          ? i18n.t("shell:topBarBranchDropdown.checkout", { value1: originDefaultRef })
                          : i18n.t("shell:topBarBranchDropdown.checkoutOriginDefault")}
                      </span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {originDefaultRef
                      ? i18n.t("shell:topBarBranchDropdown.fetchOriginAndCheckOutAsA", { value1: originDefaultRef })
                      : i18n.t("shell:topBarBranchDropdown.neitherOriginMainNorOriginMasterIsAvailable")}
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>

            <div className={sx(branchDropdownStyles.createRow)}>
              <Input
                xstyle={branchDropdownStyles.createInput}
                placeholder={i18n.t("shell:topBarBranchDropdown.newBranchFrom", { value1: currentBranchLabel })}
                value={newBranchName}
                aria-invalid={Boolean(
                  newBranchName.trim() && createBranchError,
                )}
                onChange={(event) => setNewBranchName(event.target.value)}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleCreateBranch();
                  }
                }}
                onKeyUp={(event) => event.stopPropagation()}
                onPaste={(event) => event.stopPropagation()}
              />
              <Button
                type="button"
                size="default"
                xstyle={branchDropdownStyles.createButton}
                disabled={!canCreateBranch}
                onClick={() => void handleCreateBranch()}
              >
                <Plus />
                {i18n.t("shell:topBarBranchDropdown.create")}
              </Button>
            </div>
            {newBranchName.trim() && createBranchError ? (
              <p className={sx(branchDropdownStyles.createError)}>
                {createBranchError}
              </p>
            ) : null}
            {branchError ? (
              <p className={sx(branchDropdownStyles.branchError)}>
                {branchError}
              </p>
            ) : null}
          </div>

          <div className={sx(branchDropdownStyles.list)}>
            {branchGroups.length > 0 ? (
              <div className={sx(branchDropdownStyles.groups)}>
                {branchGroups.map((group) => (
                  <div key={group.id}>
                    <div className={sx(branchDropdownStyles.groupHeader)}>
                      <span>{group.label}</span>
                      <span>{group.options.length}</span>
                    </div>
                    <div className={sx(branchDropdownStyles.groupOptions)}>
                      {group.options.map((option) => {
                        const isCurrent = option.state === "current";
                        const isAttached = option.state === "attached";
                        const disabled = isBusy || isCurrent || isAttached;
                        const description = getBranchOptionDescription({
                          option,
                          repositoryPath,
                        });
                        return (
                          <AdsButton
                            layout="host"
                            key={option.key}
                            type="button"
                            xstyle={[
                              branchDropdownStyles.option,
                              isCurrent && branchDropdownStyles.optionCurrent,
                              !disabled &&
                                branchDropdownStyles.optionSelectable,
                              disabled && branchDropdownStyles.optionDisabled,
                            ]}
                            onClick={() => {
                              void handleCheckoutBranch({ option }).then(
                                (ok) => {
                                  if (!ok) return;
                                  setBranchOpen(false);
                                  setBranchFilter("");
                                },
                              );
                            }}
                            disabled={disabled}
                            title={description}
                          >
                            <GitBranch
                              {...stylex.props(
                                branchDropdownStyles.optionIcon,
                              )}
                            />
                            <span className={sx(branchDropdownStyles.optionText)}>
                              <span
                                className={sx(branchDropdownStyles.optionName)}
                              >
                                {option.displayName}
                              </span>
                              <span
                                className={sx(
                                  branchDropdownStyles.optionDescription,
                                )}
                              >
                                {description}
                              </span>
                            </span>
                            {isCurrent ? (
                              <Check
                                {...stylex.props(
                                  branchDropdownStyles.optionCheck,
                                )}
                              />
                            ) : null}
                          </AdsButton>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={sx(branchDropdownStyles.emptyState)}>
                {i18n.t("shell:topBarBranchDropdown.noBranchesMatchTheCurrentSearch")}
              </div>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            className={sx(
              topBarControlStyles.control,
              topBarControlStyles.surface,
              branchDropdownStyles.staticChip,
            )}
            style={props.noDragStyle}
          />
        }
      >
        <GitBranch {...stylex.props(topBarControlStyles.icon)} />
        <span className={sx(branchDropdownStyles.truncate)}>
          {currentBranchLabel}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {i18n.t("shell:topBarBranchDropdown.branchIsManagedByThisWorktree")}
        {workspaceCwd
          ? `: ${formatWorkspacePathLabel({ workspacePath: workspaceCwd, repositoryPath })}`
          : `: ${currentBranchLabel}`}
      </TooltipContent>
    </Tooltip>
  );
}

function getBranchOptionDescription(args: {
  option: TopBarBranchOption;
  repositoryPath?: string | null;
}) {
  if (args.option.state === "current") {
    return i18n.t("shell:topBarBranchDropdown.currentBranch");
  }
  if (args.option.state === "attached") {
    return args.option.attachedPath
      ? i18n.t("shell:topBarBranchDropdown.checkedOutIn", { value1: formatWorkspacePathLabel({
          workspacePath: args.option.attachedPath,
          repositoryPath: args.repositoryPath,
        }) })
      : i18n.t("shell:topBarBranchDropdown.checkedOutInAnotherWorkspace");
  }
  if (args.option.kind === "remote") {
    return i18n.t("shell:topBarBranchDropdown.createLocalBranch", { value1: args.option.localName });
  }
  return i18n.t("shell:topBarBranchDropdown.checkoutBranch");
}

function formatScmCommandError(
  result: { stderr?: string; stdout?: string },
  fallback: string,
) {
  return result.stderr?.trim() || result.stdout?.trim() || fallback;
}
