import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Check,
  ChevronDown,
  Download,
  GitBranch,
  Loader2,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
} from "@/components/ui";
import { isBranchAttachedElsewhere } from "@/lib/source-control-worktrees";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import { formatWorkspacePathLabel } from "@/store/project.utils";
import {
  buildTopBarBranchGroups,
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
  const [branchOpen, setBranchOpen] = useState(false);
  const [branchFilter, setBranchFilter] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [remoteBranches, setRemoteBranches] = useState<string[]>([]);
  const [worktreePathByBranch, setWorktreePathByBranch] = useState<Record<string, string>>({});
  const [detectedCurrentBranch, setDetectedCurrentBranch] = useState<{
    workspaceId: string;
    branch: string | null;
  }>({ workspaceId: "", branch: null });
  const [branchError, setBranchError] = useState("");
  const [branchStatus, setBranchStatus] = useState<BranchStatusSummary>(CLEAN_BRANCH_STATUS);
  const [isBusy, setIsBusy] = useState(false);
  const [branchOperation, setBranchOperation] = useState<"fetch" | "pull" | null>(null);
  const branchRequestIdRef = useRef(0);
  const statusRequestIdRef = useRef(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [
    activeWorkspaceId,
    workspaceDefaultById,
    workspaceBranchById,
    workspacePathById,
    projectPath,
    setWorkspaceBranch,
  ] = useAppStore(useShallow((state) => [
    state.activeWorkspaceId,
    state.workspaceDefaultById,
    state.workspaceBranchById,
    state.workspacePathById,
    state.projectPath,
    state.setWorkspaceBranch,
  ] as const));

  const isDefaultWorkspace = Boolean(workspaceDefaultById[activeWorkspaceId]);
  const activeWorkspaceBranch = workspaceBranchById[activeWorkspaceId];
  const workspaceCwd = workspacePathById[activeWorkspaceId] ?? projectPath ?? "";
  const hasWorkspaceContext = Boolean(activeWorkspaceId && workspaceCwd);
  const currentBranch = activeWorkspaceBranch
    ?? (detectedCurrentBranch.workspaceId === activeWorkspaceId ? detectedCurrentBranch.branch : null);
  const createBranchError = useMemo(
    () => validateNewBranchName({ value: newBranchName, existingBranches: branches }),
    [branches, newBranchName],
  );
  const canCreateBranch = Boolean(newBranchName.trim() && !createBranchError && currentBranch && !isBusy);

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

  useEffect(() => {
    branchRequestIdRef.current += 1;
    const requestId = branchRequestIdRef.current;

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

    async function detectBranch() {
      const listBranches = window.api?.sourceControl?.listBranches;
      if (!listBranches) return;
      const result = await listBranches({ cwd: workspaceCwd });
      if (result.ok && result.current) {
        if (branchRequestIdRef.current !== requestId) {
          return;
        }
        setDetectedCurrentBranch({
          workspaceId: activeWorkspaceId,
          branch: result.current,
        });
        setBranches(result.branches);
        setRemoteBranches(result.remoteBranches ?? []);
        setWorktreePathByBranch(result.worktreePathByBranch ?? {});
      }
    }

    void detectBranch();
    void refreshBranchStatus();
  }, [activeWorkspaceId, hasWorkspaceContext, refreshBranchStatus, workspaceCwd]);

  const loadBranches = useCallback(
    async (args?: { refreshRemote?: boolean }) => {
      if (!hasWorkspaceContext) {
        setBranchError("No workspace selected.");
        return false;
      }

      const listBranches = window.api?.sourceControl?.listBranches;
      if (!listBranches) {
        setBranchError("Source Control bridge unavailable.");
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
          setBranchError(result.stderr || "Failed to load branches.");
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
          setBranchError(err instanceof Error ? err.message : "Failed to load branches.");
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
      const message = "Fetch bridge unavailable.";
      setBranchError(message);
      toast.error("Branch fetch failed", { description: message });
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
        const message = formatScmCommandError(result, "Branch fetch failed.");
        setBranchError(message);
        toast.error("Branch fetch failed", { description: message });
        return;
      }
      toast.success("Branch fetched", { description: currentBranch });
      await loadBranches();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Branch fetch failed.";
      setBranchError(message);
      toast.error("Branch fetch failed", { description: message });
    } finally {
      setBranchOperation(null);
      setIsBusy(false);
    }
  }, [currentBranch, loadBranches, workspaceCwd]);

  const handlePullCurrentBranch = useCallback(async () => {
    if (!currentBranch) return;
    const pullBranch = window.api?.sourceControl?.pullBranch;
    if (!pullBranch) {
      const message = "Pull bridge unavailable.";
      setBranchError(message);
      toast.error("Branch pull failed", { description: message });
      return;
    }

    if (branchStatus.dirtyCount > 0) {
      toast.warning("Working tree has local changes", {
        description: "Git may block pull if local edits would be overwritten.",
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
        const message = formatScmCommandError(result, "Branch pull failed.");
        setBranchError(message);
        toast.error("Branch pull failed", { description: message });
        return;
      }
      toast.success("Branch pulled", { description: currentBranch });
      await loadBranches();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Branch pull failed.";
      setBranchError(message);
      toast.error("Branch pull failed", { description: message });
    } finally {
      setBranchOperation(null);
      setIsBusy(false);
    }
  }, [branchStatus.dirtyCount, currentBranch, loadBranches, workspaceCwd]);

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
    [branchFilter, branches, currentBranch, remoteBranches, workspaceCwd, worktreePathByBranch],
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
      const message = "Checkout bridge unavailable.";
      setBranchError(message);
      toast.error("Branch checkout failed", { description: message });
      return false;
    }

    const result = await checkoutBranch({ name: args.name, cwd: workspaceCwd });
    if (!result.ok) {
      const message = result.stderr || "Branch checkout failed.";
      setBranchError(message);
      toast.error("Branch checkout failed", { description: message });
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
      setBranchError("Create branch bridge unavailable.");
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
      const result = await createBranch({ name: targetName, from: currentBranch, cwd: workspaceCwd });
      if (!result.ok) {
        setBranchError(result.stderr || "Branch creation failed.");
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
      setBranchError(err instanceof Error ? err.message : "Branch creation failed.");
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
      const attachedPath = option.attachedPath ?? worktreePathByBranch[option.localName];
      const message = attachedPath
        ? `Branch "${option.localName}" is already checked out in ${formatWorkspacePathLabel({ workspacePath: attachedPath, projectPath })}.`
        : `Branch "${option.localName}" is already checked out in another workspace.`;
      setBranchError(message);
      toast.error("Branch unavailable", { description: message });
      return false;
    }

    if (branchStatus.dirtyCount > 0) {
      toast.warning("Working tree has local changes", {
        description: "Stave will ask Git to switch branches. Git may block if files would be overwritten.",
      });
    }

    setIsBusy(true);
    try {
      if (option.kind === "remote") {
        const createBranch = window.api?.sourceControl?.createBranch;
        if (!createBranch) {
          const message = "Create branch bridge unavailable.";
          setBranchError(message);
          toast.error("Branch checkout failed", { description: message });
          return false;
        }
        const result = await createBranch({
          name: option.localName,
          from: option.checkoutName,
          cwd: workspaceCwd,
        });
        if (!result.ok) {
          const message = result.stderr || "Branch creation failed.";
          setBranchError(message);
          toast.error("Branch checkout failed", { description: message });
          return false;
        }
      }

      const checkedOut = await checkoutLocalBranch({ name: option.localName });
      await loadBranches();
      return checkedOut;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Branch checkout failed.";
      setBranchError(message);
      toast.error("Branch checkout failed", { description: message });
      return false;
    } finally {
      setIsBusy(false);
    }
  }

  if (!hasWorkspaceContext || !currentBranch) return null;

  if (isDefaultWorkspace) {
    const dirtyTone = branchStatus.hasConflicts
      ? "bg-destructive text-destructive-foreground"
      : branchStatus.dirtyCount > 0
        ? "bg-warning text-warning-foreground"
        : "";

    return (
      <DropdownMenu open={branchOpen} onOpenChange={setBranchOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "inline-flex max-w-56 items-center gap-1.5 rounded-md border border-border/60 bg-background/60 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary/60",
                    branchOpen && "border-primary/70 bg-secondary/80 text-foreground",
                  )}
                  style={props.noDragStyle}
                  aria-label="switch-branch"
                >
                  {isBusy ? (
                    <Loader2 className="size-3.5 shrink-0 animate-spin" />
                  ) : (
                    <GitBranch className="size-3.5 shrink-0" />
                  )}
                  <span className="truncate">{currentBranch}</span>
                  {branchStatus.dirtyCount > 0 ? (
                    <span
                      className={cn(
                        "inline-flex min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-medium leading-4",
                        dirtyTone,
                      )}
                    >
                      {branchStatus.dirtyCount}
                    </span>
                  ) : null}
                  <ChevronDown
                    className={cn("size-3 shrink-0 transition-transform", branchOpen && "rotate-180")}
                  />
                </button>
              </DropdownMenuTrigger>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {branchStatus.dirtyCount > 0
              ? `${branchStatus.dirtyCount} local change${branchStatus.dirtyCount === 1 ? "" : "s"}`
              : "Switch branch"}
          </TooltipContent>
        </Tooltip>

        <DropdownMenuContent
          align="start"
          sideOffset={8}
          className="flex max-h-[min(34rem,calc(100vh-5rem))] w-[min(30rem,calc(100vw-2rem))] flex-col overflow-hidden p-0"
        >
          <div className="border-b border-border/70 bg-background/95 p-2">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  className="h-8 rounded-md pl-8 text-sm"
                  placeholder="Search branches"
                  value={branchFilter}
                  onChange={(event) => setBranchFilter(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && firstCheckoutOption) {
                      event.preventDefault();
                      void handleCheckoutBranch({ option: firstCheckoutOption }).then((ok) => {
                        if (!ok) return;
                        setBranchOpen(false);
                        setBranchFilter("");
                      });
                    }
                  }}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                title="Refresh branches"
                disabled={isBusy}
                onClick={() => void loadBranches({ refreshRemote: true })}
              >
                <RefreshCw className={cn("size-4", isBusy && "animate-spin")} />
              </Button>
            </div>

            <div className="mt-2 rounded-md border border-border/70 bg-muted/30 px-2.5 py-2">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="min-w-0 truncate font-medium text-foreground">{currentBranch}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-sm px-1.5 py-0.5 text-[11px]",
                    branchStatus.hasConflicts
                      ? "bg-destructive/10 text-destructive"
                      : branchStatus.dirtyCount > 0
                        ? "bg-warning/10 text-warning"
                        : "bg-success/10 text-success",
                  )}
                >
                  {branchStatus.hasConflicts
                    ? "Conflicts"
                    : branchStatus.dirtyCount > 0
                      ? `${branchStatus.dirtyCount} changed`
                      : "Clean"}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                {branchStatus.dirtyCount > 0
                  ? "Local edits stay in this workspace. Git may block unsafe checkouts."
                  : "Create or switch branches for this default workspace."}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 rounded-sm px-2 text-xs"
                  disabled={isBusy}
                  onClick={() => void handleFetchCurrentBranch()}
                >
                  {branchOperation === "fetch" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                  Fetch
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 rounded-sm px-2 text-xs"
                  disabled={isBusy}
                  onClick={() => void handlePullCurrentBranch()}
                >
                  {branchOperation === "pull" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Download className="size-3.5" />
                  )}
                  Pull
                </Button>
              </div>
            </div>

            <div className="mt-2 flex gap-2">
              <Input
                className="h-8 rounded-md text-sm"
                placeholder={`New branch from ${currentBranch}`}
                value={newBranchName}
                aria-invalid={Boolean(newBranchName.trim() && createBranchError)}
                onChange={(event) => setNewBranchName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleCreateBranch();
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                className="h-8 gap-1.5 px-2.5 text-xs"
                disabled={!canCreateBranch}
                onClick={() => void handleCreateBranch()}
              >
                <Plus className="size-3.5" />
                Create
              </Button>
            </div>
            {newBranchName.trim() && createBranchError ? (
              <p className="mt-1.5 px-0.5 text-[11px] text-destructive">{createBranchError}</p>
            ) : null}
            {branchError ? (
              <p className="mt-2 whitespace-pre-wrap break-words rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                {branchError}
              </p>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {branchGroups.length > 0 ? (
              <div className="space-y-3">
                {branchGroups.map((group) => (
                  <div key={group.id}>
                    <div className="mb-1 flex items-center justify-between px-1.5 text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
                      <span>{group.label}</span>
                      <span>{group.options.length}</span>
                    </div>
                    <div className="space-y-1">
                      {group.options.map((option) => {
                        const isCurrent = option.state === "current";
                        const isAttached = option.state === "attached";
                        const disabled = isBusy || isCurrent || isAttached;
                        const description = getBranchOptionDescription({
                          option,
                          projectPath,
                        });
                        return (
                          <button
                            key={option.key}
                            type="button"
                            className={cn(
                              "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors",
                              isCurrent && "border border-border bg-accent",
                              !disabled && "hover:bg-accent/60",
                              disabled && "cursor-not-allowed opacity-70",
                            )}
                            onClick={() => {
                              void handleCheckoutBranch({ option }).then((ok) => {
                                if (!ok) return;
                                setBranchOpen(false);
                                setBranchFilter("");
                              });
                            }}
                            disabled={disabled}
                            title={description}
                          >
                            <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-foreground">
                                {option.displayName}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {description}
                              </span>
                            </span>
                            {isCurrent ? <Check className="size-3.5 shrink-0 text-success" /> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-border/70 px-3 py-6 text-center text-sm text-muted-foreground">
                No branches match the current search.
              </div>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="inline-flex max-w-56 items-center gap-1.5 rounded-md border border-border/60 bg-background/60 px-2.5 py-1 text-xs text-muted-foreground"
          style={props.noDragStyle}
        >
          <GitBranch className="size-3.5 shrink-0" />
          <span className="truncate">{currentBranch}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        Branch is managed by this worktree
        {workspaceCwd
          ? `: ${formatWorkspacePathLabel({ workspacePath: workspaceCwd, projectPath })}`
          : `: ${currentBranch}`}
      </TooltipContent>
    </Tooltip>
  );
}

function getBranchOptionDescription(args: {
  option: TopBarBranchOption;
  projectPath?: string | null;
}) {
  if (args.option.state === "current") {
    return "Current branch";
  }
  if (args.option.state === "attached") {
    return args.option.attachedPath
      ? `Checked out in ${formatWorkspacePathLabel({
          workspacePath: args.option.attachedPath,
          projectPath: args.projectPath,
        })}`
      : "Checked out in another workspace";
  }
  if (args.option.kind === "remote") {
    return `Create local branch ${args.option.localName}`;
  }
  return "Checkout branch";
}

function formatScmCommandError(
  result: { stderr?: string; stdout?: string },
  fallback: string,
) {
  return result.stderr?.trim() || result.stdout?.trim() || fallback;
}
