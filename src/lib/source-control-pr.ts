const CONVENTIONAL_TITLE_TYPES = ["feat", "fix", "refactor", "style", "docs", "test", "build", "ci", "chore", "perf", "revert"] as const;
const CONVENTIONAL_PR_TITLE_PATTERN = new RegExp(`^(${CONVENTIONAL_TITLE_TYPES.join("|")})(\\(([^)]+)\\))?: (.+)$`);
const BRANCH_TITLE_TYPES = new Set<string>(CONVENTIONAL_TITLE_TYPES);
const GENERIC_PR_TITLE_PATTERNS = [
  /^pull request\b/i,
  /^create pr\b/i,
  /^update changes\b/i,
  /^update branch\b/i,
  /^pr\b/i,
];
const MAX_WORKSPACE_CONTEXT_BLOCK_CHARS = 1_200;

function sanitizeInlineText(value?: string) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function truncateWorkspaceContextBlock(value?: string) {
  const normalized = (value ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();

  if (!normalized) {
    return "";
  }

  if (normalized.length <= MAX_WORKSPACE_CONTEXT_BLOCK_CHARS) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_WORKSPACE_CONTEXT_BLOCK_CHARS - 3).trimEnd()}...`;
}

function pushWorkspaceContextSection(lines: string[], title: string, bodyLines: string[]) {
  const content = bodyLines.filter((line) => line.trim().length > 0);
  if (content.length === 0) {
    return;
  }
  lines.push("", `${title}:`, ...content);
}

export function resolvePullRequestComparisonBaseRef(args: {
  baseBranch?: string;
  remoteBranches?: string[];
}) {
  const normalizedBaseBranch = args.baseBranch?.trim() || "main";
  if (!normalizedBaseBranch) {
    return "main";
  }

  if (normalizedBaseBranch.includes("/")) {
    return normalizedBaseBranch;
  }

  const remoteBranches = (args.remoteBranches ?? [])
    .map((branch) => branch.trim())
    .filter(Boolean);
  const preferredOriginRef = `origin/${normalizedBaseBranch}`;
  if (remoteBranches.includes(preferredOriginRef)) {
    return preferredOriginRef;
  }

  const matchingRemoteRef = remoteBranches.find((branch) =>
    branch.endsWith(`/${normalizedBaseBranch}`)
  );
  return matchingRemoteRef ?? normalizedBaseBranch;
}

function parseConventionalPullRequestTitle(title?: string) {
  const normalized = title?.trim();
  if (!normalized) {
    return null;
  }

  const match = normalized.match(CONVENTIONAL_PR_TITLE_PATTERN);
  if (!match) {
    return null;
  }

  const [, type, , scope, rawSubject = ""] = match;
  const subject = rawSubject.trim();
  if (!/^[a-z0-9]/.test(subject)) {
    return null;
  }

  return {
    raw: normalized,
    type,
    scope: scope?.trim() || undefined,
    subject,
  };
}

function parseCommitSubjects(commitLog?: string) {
  return (commitLog ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[0-9a-f]+\s+/i, "").trim())
    .filter(Boolean);
}

function parseChangedFiles(fileList?: string) {
  const files = new Set<string>();

  for (const rawLine of (fileList ?? "").split("\n")) {
    const line = rawLine.trim();
    if (!line || /^-+\s*$/.test(line) || /^\d+\s+files?\s+changed\b/i.test(line)) {
      continue;
    }

    const statMatch = line.match(/^(.+?)\s+\|\s+\d+/);
    if (statMatch?.[1]) {
      files.add(statMatch[1].trim());
      continue;
    }

    const statusMatch = line.match(/^[ MADRCU?!]{1,2}\s+(.+)$/);
    if (statusMatch?.[1]) {
      files.add(statusMatch[1].trim());
      continue;
    }
  }

  return Array.from(files);
}

function formatSubjectTokens(tokens: string[]) {
  return tokens
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
}

function tokenizeBranchSegment(segment: string) {
  return segment
    .split(/[_-]+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
}

function buildFallbackTitleFromBranch(headBranch?: string) {
  const branch = headBranch?.replace(/^refs\/heads\//, "").trim() || "HEAD";
  const branchSegments = branch
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const type = branchSegments[0]?.toLowerCase();

  if (type && BRANCH_TITLE_TYPES.has(type)) {
    const hasExplicitScopeSegment = branchSegments.length >= 3;
    const scope = hasExplicitScopeSegment
      ? formatSubjectTokens(tokenizeBranchSegment(branchSegments[1] ?? ""))
      : undefined;
    const subjectSegments = hasExplicitScopeSegment
      ? branchSegments.slice(2)
      : branchSegments.slice(1);
    const subjectTokens = subjectSegments.flatMap((segment) => tokenizeBranchSegment(segment));
    const subject = formatSubjectTokens(subjectTokens);
    if (scope && subject) {
      return `${type}(${scope}): ${subject}`;
    }
    if (subject) {
      return `${type}: ${subject}`;
    }
  }

  const cleanedBranch = formatSubjectTokens(
    branchSegments.flatMap((segment) => tokenizeBranchSegment(segment)),
  );
  return cleanedBranch ? `chore: update ${cleanedBranch}` : "chore: update branch";
}

export function isReasonablePullRequestTitle(title?: string) {
  const normalized = title?.trim();
  if (!normalized || normalized.length < 8 || normalized.length > 72) {
    return false;
  }
  if (!parseConventionalPullRequestTitle(normalized)) {
    return false;
  }
  return !GENERIC_PR_TITLE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isReasonablePullRequestBody(body?: string) {
  const normalized = body?.trim();
  if (!normalized || normalized.length < 20) {
    return false;
  }
  return /^##\s+/m.test(normalized) || /^-\s+/m.test(normalized) || normalized.split("\n").length >= 3;
}

export function generateFallbackPullRequestDraft(args: {
  baseBranch: string;
  headBranch?: string;
  commitLog?: string;
  fileList?: string;
}) {
  const commitSubjects = parseCommitSubjects(args.commitLog);
  const changedFiles = parseChangedFiles(args.fileList);

  const fallbackTitle = commitSubjects.find((subject) => isReasonablePullRequestTitle(subject))
    ?? buildFallbackTitleFromBranch(args.headBranch);

  const summaryLines = commitSubjects.length > 0
    ? commitSubjects.slice(0, 2).map((subject) => `- ${subject}`)
    : [`- Prepare \`${args.headBranch || "HEAD"}\` for merge into \`${args.baseBranch}\`.`];

  const changeLines = changedFiles.length > 0
    ? changedFiles.slice(0, 5).map((filePath) => `- Update \`${filePath}\``)
    : commitSubjects.slice(0, 5).map((subject) => `- ${subject}`);

  if (changedFiles.length > 5) {
    changeLines.push(`- Touch ${changedFiles.length - 5} more files`);
  }

  if (changeLines.length === 0) {
    changeLines.push("- Review branch changes before merge");
  }

  return {
    title: fallbackTitle,
    body: [
      "## Summary",
      ...summaryLines,
      "",
      "## Changes",
      ...changeLines,
    ].join("\n"),
  };
}

export function buildPullRequestWorkspaceContext(args: {
  activeTaskTitle?: string;
  taskPrompt?: string;
  attachedContextSnippets?: Array<{ label: string; content: string }>;
  notes?: string;
  openTodos?: string[];
}) {
  const lines = [
    "Use this workspace context as the primary source of intent for the PR draft.",
    "Do not carry over previous workspace or earlier PR summaries unless the current diff clearly depends on them.",
  ];

  const activeTaskTitle = sanitizeInlineText(args.activeTaskTitle);
  if (activeTaskTitle) {
    lines.push(`- Active task: ${activeTaskTitle}`);
  }

  const normalizedTaskPrompt = truncateWorkspaceContextBlock(args.taskPrompt);
  pushWorkspaceContextSection(lines, "Task request", normalizedTaskPrompt ? [normalizedTaskPrompt] : []);

  const attachedContextLines = (args.attachedContextSnippets ?? [])
    .slice(0, 2)
    .flatMap((snippet, index) => {
      const label = sanitizeInlineText(snippet.label) || `attachment-${index + 1}`;
      const content = truncateWorkspaceContextBlock(snippet.content);
      if (!content) {
        return [];
      }
      return [`[${index + 1}] ${label}`, content];
    });
  pushWorkspaceContextSection(lines, "Attached workspace context", attachedContextLines);

  const normalizedNotes = truncateWorkspaceContextBlock(args.notes);
  pushWorkspaceContextSection(lines, "Workspace notes", normalizedNotes ? [normalizedNotes] : []);

  const todoLines = (args.openTodos ?? [])
    .map((todo) => sanitizeInlineText(todo))
    .filter(Boolean)
    .slice(0, 6)
    .map((todo) => `- ${todo}`);
  pushWorkspaceContextSection(lines, "Open todos", todoLines);

  return lines.join("\n").trim();
}

export function resolvePullRequestTitle(args: {
  currentTitle?: string;
  commitLog?: string;
  headBranch?: string;
}) {
  const currentTitle = parseConventionalPullRequestTitle(args.currentTitle);
  const referenceTitle = parseCommitSubjects(args.commitLog)
    .map((subject) => parseConventionalPullRequestTitle(subject))
    .find((subject) => Boolean(subject));

  if (currentTitle && referenceTitle) {
    if (currentTitle.type === referenceTitle.type && currentTitle.scope === referenceTitle.scope) {
      return currentTitle.raw;
    }
    return referenceTitle.raw;
  }

  if (currentTitle) {
    return currentTitle.raw;
  }

  if (referenceTitle) {
    return referenceTitle.raw;
  }

  return buildFallbackTitleFromBranch(args.headBranch);
}

function stripCodeFences(text: string) {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:\w+)?\n([\s\S]*?)\n```$/);
  return match?.[1]?.trim() ?? trimmed;
}

export function parsePullRequestSuggestionResponse(text: string) {
  const cleaned = stripCodeFences(text);
  if (!cleaned) {
    return { title: undefined, body: undefined };
  }

  const lines = cleaned.split("\n");
  const titleIndex = lines.findIndex((line) => /^title\s*:/i.test(line.trim()));
  const bodyIndex = lines.findIndex((line) => /^body\s*:/i.test(line.trim()));

  let title = titleIndex >= 0
    ? lines[titleIndex]?.replace(/^title\s*:/i, "").trim()
    : undefined;

  if (!title) {
    title = lines
      .map((line) => line.trim())
      .find((line) => isReasonablePullRequestTitle(line));
  }

  let body: string | undefined;

  if (bodyIndex >= 0) {
    const sameLineBody = lines[bodyIndex]?.replace(/^body\s*:/i, "").trim() ?? "";
    const followingBody = lines.slice(bodyIndex + 1).join("\n").trim();
    body = [sameLineBody, followingBody].filter(Boolean).join("\n").trim() || undefined;
  } else if (titleIndex >= 0) {
    body = lines
      .slice(titleIndex + 1)
      .join("\n")
      .replace(/^body\s*:/i, "")
      .trim() || undefined;
  } else if (title) {
    const titleLineIndex = lines.findIndex((line) => line.trim() === title);
    body = lines.slice(titleLineIndex + 1).join("\n").trim() || undefined;
  }

  return {
    title: title?.trim() || undefined,
    body: body?.trim() || undefined,
  };
}

export function mergePullRequestDraft(args: {
  fallbackTitle: string;
  fallbackBody: string;
  generatedTitle?: string;
  generatedBody?: string;
}) {
  return {
    title: isReasonablePullRequestTitle(args.generatedTitle) ? args.generatedTitle!.trim() : args.fallbackTitle,
    body: isReasonablePullRequestBody(args.generatedBody) ? args.generatedBody!.trim() : args.fallbackBody,
  };
}
