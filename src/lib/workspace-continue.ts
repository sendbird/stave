import type { WorkspacePrStatus } from "@/lib/pr-status";

export interface WorkspaceContinueSummaryInput {
  generatedAt: string;
  sourceWorkspaceName: string;
  sourceBranch: string;
  baseBranch: string;
  pr?: {
    number?: number;
    title?: string;
    url?: string;
    status?: WorkspacePrStatus;
  };
  activeTaskTitle?: string;
  notes?: string;
  openTodos?: string[];
  changedFiles?: string[];
  recentCommitSubjects?: string[];
  diffStat?: string;
}

function compactMultiline(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function sanitizeBranchForFileName(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "workspace";
}

function pushSection(lines: string[], title: string, bodyLines: string[]) {
  const content = bodyLines.filter((line) => line.trim().length > 0);
  if (content.length === 0) {
    return;
  }
  lines.push("", `## ${title}`, ...content);
}

export function buildWorkspaceContinueSummaryFilePath(args: { sourceBranch: string }) {
  return `.stave/context/continued-from-${sanitizeBranchForFileName(args.sourceBranch)}.md`;
}

export function buildWorkspaceContinueSummaryMarkdown(args: WorkspaceContinueSummaryInput) {
  const lines: string[] = [
    "# Workspace Continue Brief",
    "",
    `Generated: ${args.generatedAt}`,
  ];

  pushSection(lines, "Source", [
    `- Workspace: \`${args.sourceWorkspaceName}\``,
    `- Branch: \`${args.sourceBranch}\``,
    `- Base branch: \`${args.baseBranch}\``,
  ]);

  if (args.pr) {
    const prLines = [
      args.pr.number ? `- PR: #${args.pr.number}${args.pr.title ? ` - ${args.pr.title}` : ""}` : "",
      args.pr.status ? `- PR status: \`${args.pr.status}\`` : "",
      args.pr.url ? `- URL: ${args.pr.url}` : "",
    ];
    pushSection(lines, "Pull Request", prLines);
  }

  if (args.activeTaskTitle?.trim()) {
    pushSection(lines, "Task Focus", [
      `- Active task: ${args.activeTaskTitle.trim()}`,
    ]);
  }

  pushSection(lines, "Why This Brief Exists", [
    "This workspace continues from a completed branch so the next task can start with the previous implementation context already attached.",
  ]);

  if (args.diffStat?.trim()) {
    pushSection(lines, "Diff Summary", [
      "```text",
      args.diffStat.trim(),
      "```",
    ]);
  }

  if (args.changedFiles?.length) {
    const visibleFiles = args.changedFiles.slice(0, 12);
    const remaining = args.changedFiles.length - visibleFiles.length;
    pushSection(lines, "Key Files", [
      ...visibleFiles.map((filePath) => `- \`${filePath}\``),
      remaining > 0 ? `- ...and ${remaining} more file${remaining === 1 ? "" : "s"}` : "",
    ]);
  }

  if (args.recentCommitSubjects?.length) {
    pushSection(lines, "Recent Commits", args.recentCommitSubjects.slice(0, 8).map((subject) => `- ${subject}`));
  }

  if (args.notes?.trim()) {
    pushSection(lines, "Workspace Notes", [
      compactMultiline(args.notes.trim()),
    ]);
  }

  if (args.openTodos?.length) {
    pushSection(lines, "Open Todos", args.openTodos.slice(0, 10).map((todo) => `- ${todo}`));
  }

  pushSection(lines, "Suggested Next Step", [
    "Review this brief, then enter the follow-up request for the next task in this workspace.",
  ]);

  return `${lines.join("\n").trimEnd()}\n`;
}
