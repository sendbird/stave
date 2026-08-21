import { isReasonablePullRequestTitle } from "@/lib/source-control-pr";
import type { ConcretePrMergeMethod, PrMergeMethod } from "@/lib/pr-status";

export type CreatePrDialogStep =
  "idle" | "loading" | "ready" | "committing" | "reviewing" | "pushing" | "creating-pr" | "action";

export type CreatePrSubmitAction = "pr";

export type { ConcretePrMergeMethod };

export interface RepoMergeSettings {
  squashMergeAllowed: boolean;
  mergeCommitAllowed: boolean;
  rebaseMergeAllowed: boolean;
  autoMergeAllowed: boolean;
}

export function resolveCreatePrMergeState(args: {
  preferredMethod: PrMergeMethod;
  autoMergeEnabled: boolean;
  repoSettings?: RepoMergeSettings;
}) {
  const allowedMethods: Record<ConcretePrMergeMethod, boolean> = {
    squash: args.repoSettings?.squashMergeAllowed ?? true,
    merge: args.repoSettings?.mergeCommitAllowed ?? true,
    rebase: args.repoSettings?.rebaseMergeAllowed ?? true,
  };
  const preferredMethod = args.preferredMethod === "default" ? undefined : args.preferredMethod;
  const mergeMethod =
    (preferredMethod && allowedMethods[preferredMethod]
      ? preferredMethod
      : (Object.keys(allowedMethods) as ConcretePrMergeMethod[]).find((method) => allowedMethods[method])) ?? "squash";

  return {
    allowedMethods,
    mergeMethod,
    autoMergeEnabled: args.autoMergeEnabled && (args.repoSettings?.autoMergeAllowed ?? true),
  };
}

export function buildDriftSelectedFilePaths(args: {
  currentPaths: string[];
  userDeselectedPaths: ReadonlySet<string>;
}) {
  return [...new Set(args.currentPaths.filter(Boolean))].filter((path) => !args.userDeselectedPaths.has(path));
}

const CONVENTIONAL_COMMIT_PATTERN = /^(feat|fix|refactor|chore|docs|test|perf|ci|build|revert)(\([^\n()]+\))?!?:\s+\S/;

export function isConventionalCommitMessage(message?: string) {
  const firstLine = message?.trim().split(/\r?\n/, 1)[0]?.trim();
  return Boolean(firstLine && CONVENTIONAL_COMMIT_PATTERN.test(firstLine));
}

export function haveSameCreatePrFileScope(args: { left: string[]; right: string[] }) {
  const left = new Set(args.left.filter(Boolean));
  const right = new Set(args.right.filter(Boolean));
  if (left.size !== right.size) {
    return false;
  }
  for (const path of left) {
    if (!right.has(path)) {
      return false;
    }
  }
  return true;
}

function normalizeRemoteBranchName(branch: string) {
  const trimmed = branch.trim();
  if (!trimmed) {
    return "";
  }
  const slashIndex = trimmed.indexOf("/");
  if (slashIndex < 0 || slashIndex === trimmed.length - 1) {
    return trimmed;
  }
  return trimmed.slice(slashIndex + 1);
}

function uniqueBranches(branches: string[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const branch of branches) {
    const trimmed = branch.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

export function buildCreatePrTargetBranchOptions(args: {
  defaultBranch: string;
  headBranch?: string;
  remoteBranches: string[];
}) {
  const headBranch = args.headBranch?.trim();
  const normalizedDefaultBranch = args.defaultBranch.trim() || "main";
  const preferredRemoteBranches = uniqueBranches(args.remoteBranches);
  const originRemoteBranches = preferredRemoteBranches.filter((branch) => branch.startsWith("origin/"));
  const candidateRemoteBranches = originRemoteBranches.length > 0 ? originRemoteBranches : preferredRemoteBranches;

  const seen = new Set<string>();
  const branches: string[] = [];

  for (const branch of candidateRemoteBranches) {
    const normalizedBranch = normalizeRemoteBranchName(branch);
    if (!normalizedBranch || normalizedBranch === headBranch || seen.has(normalizedBranch)) {
      continue;
    }
    seen.add(normalizedBranch);
    branches.push(normalizedBranch);
  }

  const priorityByBranch = new Map<string, number>(
    [normalizedDefaultBranch, "main", "master"].map((branch, index) => [branch, index]),
  );

  const prioritizedBranches = [...branches].sort((left, right) => {
    const leftPriority = priorityByBranch.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightPriority = priorityByBranch.get(right) ?? Number.MAX_SAFE_INTEGER;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return left.localeCompare(right);
  });

  if (prioritizedBranches.length > 0) {
    return prioritizedBranches;
  }
  return [normalizedDefaultBranch];
}

export function shouldShowCreatePrSubmitSpinner(args: {
  step: CreatePrDialogStep;
  activeSubmitAction: CreatePrSubmitAction | null;
  buttonAction: CreatePrSubmitAction;
}) {
  const isSubmitStep = args.step === "committing" || args.step === "pushing" || args.step === "creating-pr";

  return isSubmitStep && args.activeSubmitAction === args.buttonAction;
}

export function canSubmitCreatePr(args: {
  step: CreatePrDialogStep;
  title?: string;
  hasUncommittedChanges?: boolean;
  selectedFileCount?: number;
  commitMessage?: string;
}) {
  if (args.step !== "ready" || !isReasonablePullRequestTitle(args.title)) {
    return false;
  }
  if (args.hasUncommittedChanges && (args.selectedFileCount ?? 0) === 0) {
    return false;
  }
  if (args.commitMessage?.trim() && !isConventionalCommitMessage(args.commitMessage)) {
    return false;
  }
  return true;
}

export function canApplyCreatePrDialogOpenChange(args: { open: boolean; isDialogBusy: boolean }) {
  return args.open || !args.isDialogBusy;
}
