import { isBranchAttachedElsewhere } from "@/lib/source-control-worktrees";

export type TopBarBranchOptionKind = "local" | "remote";
export type TopBarBranchOptionState = "current" | "available" | "attached";

export interface TopBarBranchOption {
  key: string;
  kind: TopBarBranchOptionKind;
  name: string;
  checkoutName: string;
  displayName: string;
  localName: string;
  state: TopBarBranchOptionState;
  attachedPath?: string;
}

export interface TopBarBranchGroup {
  id: "current" | "local" | "remote" | "attached";
  label: string;
  options: TopBarBranchOption[];
}

export interface DefaultBranchDrift {
  expectedBranch: string;
  actualBranch: string;
}

const INVALID_BRANCH_NAME_CHAR_PATTERN = /[~^:?\*\[\\]/;

export function resolveDefaultBranchDrift(args: {
  isDefaultWorkspace: boolean;
  expectedBranch?: string | null;
  actualBranch?: string | null;
}): DefaultBranchDrift | null {
  const expectedBranch = args.expectedBranch?.trim();
  const actualBranch = args.actualBranch?.trim();
  if (
    !args.isDefaultWorkspace ||
    !expectedBranch ||
    !actualBranch ||
    expectedBranch === actualBranch
  ) {
    return null;
  }
  return { expectedBranch, actualBranch };
}

export function normalizeRemoteBranchName(branch: string) {
  const trimmed = branch.trim();
  const slashIndex = trimmed.indexOf("/");
  if (slashIndex < 0 || slashIndex >= trimmed.length - 1) {
    return trimmed;
  }
  return trimmed.slice(slashIndex + 1);
}

function branchMatchesQuery(args: {
  option: TopBarBranchOption;
  query: string;
}) {
  const query = args.query.trim().toLowerCase();
  if (!query) {
    return true;
  }
  return (
    args.option.displayName.toLowerCase().includes(query) ||
    args.option.localName.toLowerCase().includes(query)
  );
}

function uniqueSortedBranches(branches: readonly string[]) {
  return Array.from(
    new Set(
      branches
        .map((branch) => branch.trim())
        .filter((branch) => branch.length > 0),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

export function buildTopBarBranchGroups(args: {
  branches: readonly string[];
  remoteBranches?: readonly string[];
  currentBranch: string;
  query: string;
  workspacePath: string;
  worktreePathByBranch: Record<string, string>;
}): TopBarBranchGroup[] {
  const localBranches = uniqueSortedBranches(args.branches);
  const localBranchSet = new Set(localBranches);
  const localOptions = localBranches
    .map((branch): TopBarBranchOption => {
      const attached = isBranchAttachedElsewhere({
        branch,
        workspacePath: args.workspacePath,
        worktreePathByBranch: args.worktreePathByBranch,
      });
      return {
        key: `local:${branch}`,
        kind: "local",
        name: branch,
        checkoutName: branch,
        displayName: branch,
        localName: branch,
        state:
          branch === args.currentBranch
            ? "current"
            : attached
              ? "attached"
              : "available",
        attachedPath: attached ? args.worktreePathByBranch[branch] : undefined,
      };
    })
    .filter((option) => branchMatchesQuery({ option, query: args.query }));

  const remoteOptions = uniqueSortedBranches(args.remoteBranches ?? [])
    .filter((branch) => !branch.endsWith("/HEAD"))
    .map((branch) => ({
      remoteBranch: branch,
      localName: normalizeRemoteBranchName(branch),
    }))
    .filter(({ localName }) => localName && !localBranchSet.has(localName))
    .map(({ remoteBranch, localName }): TopBarBranchOption => ({
      key: `remote:${remoteBranch}`,
      kind: "remote",
      name: remoteBranch,
      checkoutName: remoteBranch,
      displayName: remoteBranch,
      localName,
      state: "available",
    }))
    .filter((option) => branchMatchesQuery({ option, query: args.query }));

  const current = localOptions.filter((option) => option.state === "current");
  const attached = localOptions.filter((option) => option.state === "attached");
  const availableLocal = localOptions.filter(
    (option) => option.state === "available",
  );

  const groups: TopBarBranchGroup[] = [
    { id: "current", label: "Current", options: current },
    { id: "local", label: "Local branches", options: availableLocal },
    { id: "remote", label: "Remote branches", options: remoteOptions },
    {
      id: "attached",
      label: "Checked out in other workspaces",
      options: attached,
    },
  ];

  return groups.filter((group) => group.options.length > 0);
}

export function validateNewBranchName(args: {
  value: string;
  existingBranches: readonly string[];
}) {
  const value = args.value.trim();
  if (!value) {
    return "Enter a branch name.";
  }
  if (/\s/.test(value)) {
    return "Branch names cannot contain spaces.";
  }
  if (
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.includes("//") ||
    value.includes("..") ||
    INVALID_BRANCH_NAME_CHAR_PATTERN.test(value) ||
    value.endsWith(".") ||
    value.endsWith(".lock") ||
    value.includes("@{")
  ) {
    return "Use a valid git branch name.";
  }
  if (args.existingBranches.includes(value)) {
    return "A local branch with that name already exists.";
  }
  return null;
}
