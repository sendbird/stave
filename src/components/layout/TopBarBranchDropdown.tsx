import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ChevronDown, GitBranch } from "lucide-react";
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
import type { CSSProperties } from "react";

export function TopBarBranchDropdown(props: { noDragStyle: CSSProperties }) {
  const [branchOpen, setBranchOpen] = useState(false);
  const [branchFilter, setBranchFilter] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [worktreePathByBranch, setWorktreePathByBranch] = useState<Record<string, string>>({});
  const [detectedCurrentBranch, setDetectedCurrentBranch] = useState<{
    workspaceId: string;
    branch: string | null;
  }>({ workspaceId: "", branch: null });
  const [branchError, setBranchError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const branchRequestIdRef = useRef(0);

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

  useEffect(() => {
    branchRequestIdRef.current += 1;
    const requestId = branchRequestIdRef.current;

    if (!hasWorkspaceContext) {
      setDetectedCurrentBranch({ workspaceId: "", branch: null });
      setBranches([]);
      setWorktreePathByBranch({});
      setBranchError("");
      setIsBusy(false);
      return;
    }

    setDetectedCurrentBranch((previous) =>
      previous.workspaceId === activeWorkspaceId
        ? previous
        : { workspaceId: activeWorkspaceId, branch: null },
    );
    setBranches([]);
    setWorktreePathByBranch({});
    setBranchError("");
    setIsBusy(false);

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
      }
    }
    void detectBranch();
  }, [activeWorkspaceId, hasWorkspaceContext, workspaceCwd]);

  async function loadBranches() {
    if (!hasWorkspaceContext) {
      setBranchError("No workspace selected.");
      return;
    }

    const listBranches = window.api?.sourceControl?.listBranches;
    if (!listBranches) {
      setBranchError("Source Control bridge unavailable.");
      return;
    }

    branchRequestIdRef.current += 1;
    const requestId = branchRequestIdRef.current;
    setIsBusy(true);
    try {
      const result = await listBranches({ cwd: workspaceCwd });
      if (branchRequestIdRef.current !== requestId) {
        return;
      }
      if (!result.ok) {
        setBranchError(result.stderr || "Failed to load branches.");
        return;
      }
      setDetectedCurrentBranch({
        workspaceId: activeWorkspaceId,
        branch: result.current || workspaceBranchById[activeWorkspaceId] || null,
      });
      setBranches(result.branches);
      setWorktreePathByBranch(result.worktreePathByBranch ?? {});
      setBranchError("");
    } catch (err) {
      if (branchRequestIdRef.current === requestId) {
        setBranchError(err instanceof Error ? err.message : "Failed to load branches.");
      }
    } finally {
      if (branchRequestIdRef.current === requestId) {
        setIsBusy(false);
      }
    }
  }

  useEffect(() => {
    if (!hasWorkspaceContext || !branchOpen || !isDefaultWorkspace) return;
    void loadBranches();
  }, [activeWorkspaceId, branchOpen, hasWorkspaceContext, isDefaultWorkspace]);

  useEffect(() => {
    if (!isDefaultWorkspace) {
      setBranchOpen(false);
      setBranchFilter("");
      setNewBranchName("");
    }
  }, [isDefaultWorkspace]);

  const filteredBranches = useMemo(() => {
    const normalized = branchFilter.trim().toLowerCase();
    return branches.filter((branch) => {
      if (isBranchAttachedElsewhere({ branch, workspacePath: workspaceCwd, worktreePathByBranch })) {
        return false;
      }
      if (!normalized) return true;
      return branch.toLowerCase().includes(normalized);
    });
  }, [branchFilter, branches, workspaceCwd, worktreePathByBranch]);

  async function handleCreateBranch() {
    const createBranch = window.api?.sourceControl?.createBranch;
    if (!createBranch) {
      setBranchError("Create branch bridge unavailable.");
      return;
    }
    const targetName = newBranchName.trim();
    if (!targetName || !currentBranch) return;

    setIsBusy(true);
    try {
      const result = await createBranch({ name: targetName, from: currentBranch, cwd: workspaceCwd });
      if (!result.ok) {
        setBranchError(result.stderr || "Branch creation failed.");
        return;
      }
      setNewBranchName("");
      await loadBranches();
    } catch (err) {
      setBranchError(err instanceof Error ? err.message : "Branch creation failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCheckoutBranch(args: { name: string }) {
    const checkoutBranch = window.api?.sourceControl?.checkoutBranch;
    if (!checkoutBranch) {
      const message = "Checkout bridge unavailable.";
      setBranchError(message);
      toast.error("Branch checkout failed", { description: message });
      return false;
    }

    if (args.name === currentBranch) return false;

    const blockedByWorktree = isBranchAttachedElsewhere({
      branch: args.name,
      workspacePath: workspaceCwd,
      worktreePathByBranch,
    });
    if (blockedByWorktree) {
      const attachedPath = worktreePathByBranch[args.name];
      const message = attachedPath
        ? `Branch "${args.name}" is already checked out in ${formatWorkspacePathLabel({ workspacePath: attachedPath, projectPath })}.`
        : `Branch "${args.name}" is already checked out in another worktree.`;
      setBranchError(message);
      toast.error("Branch unavailable", { description: message });
      return false;
    }

    setIsBusy(true);
    try {
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
      await loadBranches();
      return true;
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

  // Default workspace: show dropdown to switch branches
  if (isDefaultWorkspace) {
    return (
      <DropdownMenu open={branchOpen} onOpenChange={setBranchOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "inline-flex max-w-48 items-center gap-1.5 rounded-md border border-border/60 bg-background/60 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary/60",
                    branchOpen && "border-primary/70 bg-secondary/80",
                  )}
                  style={props.noDragStyle}
                  aria-label="switch-branch"
                >
                  <GitBranch className="size-3.5 shrink-0" />
                  <span className="truncate">{currentBranch}</span>
                  <ChevronDown className="size-3 shrink-0" />
                </button>
              </DropdownMenuTrigger>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">Switch branch</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" sideOffset={8} className="h-[50vh] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto p-2">
          <Input
            className="h-9 rounded-md text-sm"
            placeholder="Search branches"
            value={branchFilter}
            onChange={(event) => setBranchFilter(event.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <Input
              className="h-9 rounded-md text-sm"
              placeholder="new-branch-name"
              value={newBranchName}
              onChange={(event) => setNewBranchName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleCreateBranch();
                }
              }}
            />
            <Button className="h-9 rounded-md px-3.5 text-sm" disabled={isBusy} onClick={() => void handleCreateBranch()}>
              Create
            </Button>
          </div>
          <div className="mt-2 space-y-1 text-sm">
            {branchError ? <p className="break-words px-2 py-1 whitespace-pre-wrap text-destructive">{branchError}</p> : null}
            {filteredBranches.map((branch) => {
              const isCurrent = branch === currentBranch;
              const statusLabel = isCurrent ? "Current branch" : "Checkout";
              return (
                <button
                  key={branch}
                  type="button"
                  className={cn(
                    "w-full rounded-sm px-2 py-2 text-left transition-colors",
                    isCurrent && "border border-border bg-accent",
                    !isCurrent && "hover:bg-accent/60",
                    (isBusy || isCurrent) && "cursor-not-allowed opacity-60",
                  )}
                  onClick={() => {
                    void handleCheckoutBranch({ name: branch }).then((ok) => {
                      if (!ok) return;
                      setBranchOpen(false);
                      setBranchFilter("");
                    });
                  }}
                  disabled={isBusy || isCurrent}
                  title={statusLabel}
                >
                  <p className="font-medium">{branch}</p>
                  <p className="text-sm text-muted-foreground">{statusLabel}</p>
                </button>
              );
            })}
            {!branchError && filteredBranches.length === 0 ? <p className="px-2 py-2 text-muted-foreground">No available branches.</p> : null}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Non-default workspace: read-only branch label
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="inline-flex max-w-48 items-center gap-1.5 rounded-md border border-border/60 bg-background/60 px-2.5 py-1 text-xs text-muted-foreground"
          style={props.noDragStyle}
        >
          <GitBranch className="size-3.5 shrink-0" />
          <span className="truncate">{currentBranch}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">{currentBranch}</TooltipContent>
    </Tooltip>
  );
}
