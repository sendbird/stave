import {
  REVIEW_EVIDENCE_INSTRUCTIONS,
  getReviewPromptPreset,
} from "@/lib/reviews/review-prompts";

export type LocalChangeReviewScope = "working-tree" | "branch" | "commit";

/**
 * A commit, or a range such as `main..HEAD`, as typed by the user. It only
 * ever reaches a prompt, never a shell, but is still held to ref characters so
 * it cannot smuggle text into the instructions.
 */
export function normalizeReviewCommitRef(value: string | null | undefined) {
  const ref = value?.trim() ?? "";
  return /^[A-Za-z0-9][A-Za-z0-9._/~^@{}-]{0,119}$/.test(ref) ? ref : null;
}

export type LocalChangeReviewFocus =
  | "correctness"
  | "tests"
  | "security"
  | "performance"
  | "architecture"
  | "ui-accessibility"
  | "error-handling";

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
  "ui-accessibility":
    "UI and accessibility: hardcoded colors instead of theme tokens, contrast or dark-mode breakage, keyboard and screen-reader gaps, and layout regressions.",
  "error-handling":
    "Error handling: unhandled failure paths, swallowed errors, missing cancellation or timeout handling, and states that cannot recover from a partial failure.",
};

/**
 * Single source of truth for the focus chips. The description tells the user
 * what the reviewer is actually instructed to do, so it stays a plain-language
 * restatement of `REVIEW_FOCUS_INSTRUCTIONS`.
 */
export const LOCAL_CHANGE_REVIEW_FOCUS_OPTIONS: ReadonlyArray<{
  value: LocalChangeReviewFocus;
  label: string;
  description: string;
}> = [
  {
    value: "correctness",
    label: "Correctness",
    description: "Logic errors, regressions, races, and data loss.",
  },
  {
    value: "tests",
    label: "Test gaps",
    description: "Missing coverage that could hide a real regression.",
  },
  {
    value: "security",
    label: "Security",
    description: "Unsafe input, secret exposure, permission bypasses.",
  },
  {
    value: "performance",
    label: "Performance",
    description: "Hot-path, memory, I/O, and rendering regressions.",
  },
  {
    value: "architecture",
    label: "Architecture",
    description: "Contract drift and repository-guideline violations.",
  },
  {
    value: "ui-accessibility",
    label: "UI & accessibility",
    description: "Theme tokens, keyboard/screen-reader, layout breakage.",
  },
  {
    value: "error-handling",
    label: "Error handling",
    description: "Failure paths, cancellation, timeouts, recovery.",
  },
];

function buildScopeInstructions(scope: LocalChangeReviewScope, commitRef: string | null) {
  if (scope === "commit") {
    const ref = commitRef ?? "HEAD";
    return ref.includes("..")
      ? [
          `Review only the commits in the range ${ref}. Start with \`git log --oneline ${ref}\` and \`git diff ${ref}\`, then read the changed files as needed for context.`,
          "Ignore uncommitted work in the workspace; it is not part of this review.",
        ]
      : [
          `Review only the changes introduced by commit ${ref}. Start with \`git show --stat ${ref}\` and \`git show ${ref}\`, then read the changed files as needed for context.`,
          "Ignore uncommitted work and other commits; they are not part of this review.",
        ];
  }
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

/** The reviewer instruction for each selected focus, in selection order. */
export function buildReviewFocusInstructions(
  focuses: readonly LocalChangeReviewFocus[],
) {
  return focuses.map((focus) => REVIEW_FOCUS_INSTRUCTIONS[focus]).filter(Boolean);
}

export function buildLocalChangeReviewPrompt(args: {
  scope: LocalChangeReviewScope;
  focuses: readonly LocalChangeReviewFocus[];
  instructions?: string;
  /** Required by the commit scope; ignored by the others. */
  commitRef?: string | null;
  /** A selected rubric; absent uses the portable general review. */
  rubric?: string;
}) {
  const focusInstructions = buildReviewFocusInstructions(args.focuses);
  const customInstructions = args.instructions?.trim();

  return [
    args.scope === "commit"
      ? "Review committed changes in this workspace."
      : "Review the local changes in this workspace before they are pushed.",
    ...buildScopeInstructions(args.scope, normalizeReviewCommitRef(args.commitRef)),
    "Do not look for a pull request and do not use remote PR metadata as the review source.",
    "Treat this as a read-only review: do not modify files, create commits, or push anything.",
    "Read the repository instructions and inspect enough surrounding code to validate each finding.",
    "Report only concrete, actionable findings introduced by these changes. Avoid style-only comments and speculative improvements.",
    "",
    args.rubric ?? getReviewPromptPreset("general").instructions,
    "",
    REVIEW_EVIDENCE_INSTRUCTIONS,
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
