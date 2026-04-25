export type CreatePrDialogStep =
  | "idle"
  | "loading"
  | "ready"
  | "committing"
  | "pushing"
  | "creating-pr"
  | "action";

export type CreatePrSubmitAction = "pr" | "draft";

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
  const isSubmitStep =
    args.step === "committing"
    || args.step === "pushing"
    || args.step === "creating-pr";

  return isSubmitStep && args.activeSubmitAction === args.buttonAction;
}

export function canSubmitCreatePr(args: {
  step: CreatePrDialogStep;
  title?: string;
}) {
  return args.step === "ready" && (args.title?.trim().length ?? 0) > 0;
}

export function canApplyCreatePrDialogOpenChange(args: {
  open: boolean;
  isDialogBusy: boolean;
}) {
  return args.open || !args.isDialogBusy;
}
