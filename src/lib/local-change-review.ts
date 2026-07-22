export type LocalChangeReviewScope = "working-tree" | "branch";

export type LocalChangeReviewFocus =
  | "correctness"
  | "tests"
  | "security"
  | "performance"
  | "architecture";

const REVIEW_FOCUS_INSTRUCTIONS: Record<LocalChangeReviewFocus, string> = {
  correctness:
    "Correctness: logic errors, regressions, broken edge cases, races, and data loss.",
  tests:
    "Tests: missing or weak coverage only where it could hide a concrete regression.",
  security:
    "Security: trust-boundary mistakes, unsafe input handling, secrets exposure, and permission bypasses.",
  performance:
    "Performance: meaningful hot-path, memory, I/O, or rendering regressions.",
  architecture:
    "Architecture: contract drift, misplaced responsibilities, and changes that violate repository guidance.",
};

function buildScopeInstructions(scope: LocalChangeReviewScope) {
  if (scope === "branch") {
    return [
      "Review all changes on the current local branch before they are pushed, including committed branch changes and any staged, unstaged, or untracked work.",
      "Determine the best available base from the branch upstream or the repository default branch. State the base you selected if it is ambiguous.",
    ];
  }

  return [
    "Review only the current uncommitted working tree before it is committed or pushed: staged, unstaged, and untracked changes.",
    "Start with `git status --short`, `git diff`, and `git diff --cached`, then read changed or untracked files as needed for context.",
  ];
}

export function buildLocalChangeReviewPrompt(args: {
  scope: LocalChangeReviewScope;
  focuses: readonly LocalChangeReviewFocus[];
  instructions?: string;
}) {
  const focusInstructions = args.focuses
    .map((focus) => REVIEW_FOCUS_INSTRUCTIONS[focus])
    .filter(Boolean);
  const customInstructions = args.instructions?.trim();

  return [
    "Review the local changes in this workspace before they are pushed.",
    ...buildScopeInstructions(args.scope),
    "Do not look for a pull request and do not use remote PR metadata as the review source.",
    "Treat this as a read-only review: do not modify files, create commits, or push anything.",
    "Read the repository instructions and inspect enough surrounding code to validate each finding.",
    "Report only concrete, actionable findings introduced by these changes. Avoid style-only comments and speculative improvements.",
    ...(focusInstructions.length > 0
      ? ["", "Review focus:", ...focusInstructions.map((item) => `- ${item}`)]
      : []),
    ...(customInstructions
      ? ["", "Additional review instructions:", customInstructions]
      : []),
    "",
    "Output findings first, ordered by severity. For each finding include severity, file and line, the issue, its impact, and a concise fix direction.",
    'If there are no concrete findings, say "No findings" explicitly. Finish with any residual risks or tests you could not verify.',
  ].join("\n");
}
