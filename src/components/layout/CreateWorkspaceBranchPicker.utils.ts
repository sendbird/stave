export interface CreateWorkspaceBranchOption {
  value: string;
  scope: "local" | "remote";
}

export type CreateWorkspaceBranchPickerRow =
  | {
      type: "label";
      key: string;
      label: string;
      scope: CreateWorkspaceBranchOption["scope"];
    }
  | {
      type: "option";
      key: string;
      option: CreateWorkspaceBranchOption;
    };

function normalizeBranches(branches: string[]) {
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

function uniqueCandidates(candidates: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

function findRemoteCandidate(args: { remoteBranches: string[]; branch?: string }) {
  const branch = args.branch?.trim();
  if (!branch) {
    return undefined;
  }

  const exact = args.remoteBranches.find((remoteBranch) => remoteBranch === `origin/${branch}`);
  if (exact) {
    return exact;
  }

  return args.remoteBranches.find((remoteBranch) => remoteBranch.endsWith(`/${branch}`));
}

function prioritizeBranches(branches: string[], candidates: string[]) {
  const priorityByBranch = new Map(candidates.map((branch, index) => [branch, index]));

  return [...branches].sort((left, right) => {
    const leftPriority = priorityByBranch.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightPriority = priorityByBranch.get(right) ?? Number.MAX_SAFE_INTEGER;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return left.localeCompare(right);
  });
}

function matchesQuery(branch: string, query: string) {
  if (!query) {
    return true;
  }
  return branch.toLowerCase().includes(query);
}

export function resolveDefaultCreateWorkspaceBaseBranch(args: {
  activeBranch?: string;
  defaultBranch?: string;
  localBranches: string[];
  remoteBranches: string[];
}) {
  const localBranches = normalizeBranches(args.localBranches);
  const remoteBranches = normalizeBranches(args.remoteBranches);
  const defaultBranch = args.defaultBranch?.trim();
  const activeBranch = args.activeBranch?.trim();

  const prioritizedCandidates = uniqueCandidates([
    findRemoteCandidate({ remoteBranches, branch: defaultBranch }),
    defaultBranch,
    "origin/main",
    "origin/master",
    "main",
    "master",
    findRemoteCandidate({ remoteBranches, branch: activeBranch }),
    activeBranch,
  ]);

  for (const candidate of prioritizedCandidates) {
    if (remoteBranches.includes(candidate) || localBranches.includes(candidate)) {
      return candidate;
    }
  }

  return remoteBranches[0] ?? localBranches[0] ?? defaultBranch ?? activeBranch ?? "main";
}

export function buildCreateWorkspaceBranchPickerRows(args: {
  defaultBranch?: string;
  localBranches: string[];
  query?: string;
  remoteBranches: string[];
}) {
  const localBranches = normalizeBranches(args.localBranches);
  const remoteBranches = normalizeBranches(args.remoteBranches);
  const defaultBranch = args.defaultBranch?.trim();
  const query = args.query?.trim().toLowerCase() ?? "";

  const remoteCandidates = uniqueCandidates([
    findRemoteCandidate({ remoteBranches, branch: defaultBranch }),
    "origin/main",
    "origin/master",
  ]);
  const localCandidates = uniqueCandidates([
    defaultBranch,
    "main",
    "master",
  ]);

  const prioritizedRemoteBranches = prioritizeBranches(remoteBranches, remoteCandidates)
    .filter((branch) => matchesQuery(branch, query));
  const prioritizedLocalBranches = prioritizeBranches(localBranches, localCandidates)
    .filter((branch) => matchesQuery(branch, query));
  const hasBothScopes = prioritizedRemoteBranches.length > 0 && prioritizedLocalBranches.length > 0;

  const rows: CreateWorkspaceBranchPickerRow[] = [];

  if (prioritizedRemoteBranches.length > 0) {
    if (hasBothScopes) {
      rows.push({
        type: "label",
        key: "remote-label",
        label: "Remote branches",
        scope: "remote",
      });
    }
    for (const branch of prioritizedRemoteBranches) {
      rows.push({
        type: "option",
        key: `remote:${branch}`,
        option: {
          value: branch,
          scope: "remote",
        },
      });
    }
  }

  if (prioritizedLocalBranches.length > 0) {
    if (hasBothScopes) {
      rows.push({
        type: "label",
        key: "local-label",
        label: "Local branches",
        scope: "local",
      });
    }
    for (const branch of prioritizedLocalBranches) {
      rows.push({
        type: "option",
        key: `local:${branch}`,
        option: {
          value: branch,
          scope: "local",
        },
      });
    }
  }

  return rows;
}
