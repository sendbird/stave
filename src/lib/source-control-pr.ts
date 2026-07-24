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
const PR_TEMPLATE_MAX_CHARS = 4_000;
const PR_AGENTS_GUIDANCE_MAX_CHARS = 2_000;
const PR_WORKSPACE_CONTEXT_MAX_CHARS = 3_000;
export const PR_BRANCH_DIFF_MAX_CHARS = 12_000;
export const PR_WORKING_TREE_DIFF_MAX_CHARS = 8_000;

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
    "Use this workspace context to understand the intended outcome and motivation.",
    "Treat the Git diff and commit log as the source of truth for work that is actually complete.",
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

export function compactPullRequestDiff(diff: string, maxChars: number) {
  const normalized = diff.replace(/\r\n?/g, "\n").trim();
  if (!normalized || maxChars <= 0) {
    return "";
  }
  if (normalized.length <= maxChars) {
    return normalized;
  }

  const sections = normalized
    .split(/(?=^diff --git )/m)
    .map((section) => section.trim())
    .filter(Boolean);
  if (sections.length <= 1) {
    return `${normalized.slice(0, Math.max(0, maxChars - 25)).trimEnd()}\n... [diff truncated]`;
  }

  const separatorChars = sections.length - 1;
  const sectionBudget = Math.max(1, Math.floor((maxChars - separatorChars) / sections.length));
  const marker = "\n... [file diff truncated]";
  return sections
    .map((section) => {
      if (section.length <= sectionBudget) {
        return section;
      }
      return `${section.slice(0, Math.max(0, sectionBudget - marker.length)).trimEnd()}${marker}`;
    })
    .join("\n")
    .slice(0, maxChars);
}

export function buildPullRequestDescriptionPrompt(args: {
  baseTemplate: string;
  baseBranch: string;
  headBranch: string;
  commitLog: string;
  fileList: string;
  diff: string;
  workingTreeDiff: string;
  prTemplateContent?: string;
  agentsContent?: string;
  workspaceContext?: string;
}) {
  const branchDiff = compactPullRequestDiff(args.diff, PR_BRANCH_DIFF_MAX_CHARS);
  const workingTreeDiff = compactPullRequestDiff(args.workingTreeDiff, PR_WORKING_TREE_DIFF_MAX_CHARS);

  return [
    ...(args.prTemplateContent
      ? [
          "Repository pull request template (highest priority for body structure):",
          args.prTemplateContent.slice(0, PR_TEMPLATE_MAX_CHARS),
          "",
        ]
      : []),
    ...(args.agentsContent
      ? [
          "Repository guidelines from AGENTS.md (apply when consistent with the pull request template):",
          args.agentsContent.slice(0, PR_AGENTS_GUIDANCE_MAX_CHARS),
          "",
        ]
      : []),
    ...(args.workspaceContext
      ? [
          "Workspace intent context (use for motivation only; it is not evidence that work is complete):",
          args.workspaceContext.slice(0, PR_WORKSPACE_CONTEXT_MAX_CHARS),
          "",
        ]
      : []),
    "PR drafting instructions:",
    args.baseTemplate,
    "",
    `Base branch: ${args.baseBranch}`,
    `Head branch: ${args.headBranch}`,
    "",
    "Git evidence (source of truth for completed work):",
    "",
    "Recent commits:",
    args.commitLog || "(no commits)",
    "",
    "Changed files and stats:",
    args.fileList || "(no changed files available)",
    "",
    "Branch diff against the base branch:",
    branchDiff || "(no committed branch diff)",
    "",
    "Uncommitted working tree diff, including new files when available:",
    workingTreeDiff || "(no uncommitted diff)",
    "",
    "Evidence requirements (always apply):",
    "- Read the Git evidence before drafting the title or body.",
    "- Base every Summary and Changes bullet on behavior or implementation visible in the diff or commit log.",
    "- Use workspace context only to explain why the evidenced changes matter; never describe requested-but-unimplemented work as complete.",
    "- Summarize concrete behavior and implementation changes instead of listing filenames or saying only that files were updated.",
    "- Populate every relevant repository-template section and remove empty placeholder sections.",
    "- Mention tests or verification only when the Git evidence explicitly supports the claim; never invent results.",
  ].join("\n");
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
