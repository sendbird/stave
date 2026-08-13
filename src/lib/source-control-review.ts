export type PrePrReviewProviderId = "claude-code" | "codex";

export type PrePrReviewFindingSeverity =
  | "critical"
  | "high"
  | "medium"
  | "low";

export type PrePrReviewFindingKind =
  | "bug"
  | "race"
  | "security"
  | "intent_violation"
  | "scope_drift"
  | "other";

export interface PrePrReviewFinding {
  severity: PrePrReviewFindingSeverity;
  file: string;
  line?: number;
  kind: PrePrReviewFindingKind;
  message: string;
}

const MAX_FINDINGS = 20;
const MAX_FILE_CHARS = 300;
const MAX_MESSAGE_CHARS = 500;
export const PRE_PR_REVIEW_BRANCH_DIFF_MAX_CHARS = 9_000;
export const PRE_PR_REVIEW_WORKING_TREE_DIFF_MAX_CHARS = 4_000;
const PRE_PR_REVIEW_AGENTS_MAX_CHARS = 2_000;

export const PRE_PR_REVIEW_PROVIDER_IDS = [
  "claude-code",
  "codex",
] as const satisfies readonly PrePrReviewProviderId[];

export const DEFAULT_PRE_PR_REVIEW_PROVIDER: PrePrReviewProviderId =
  "claude-code";

export const PRE_PR_REVIEW_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: {
            type: "string",
            enum: ["critical", "high", "medium", "low"],
          },
          file: { type: "string" },
          line: { type: "number" },
          kind: {
            type: "string",
            enum: [
              "bug",
              "race",
              "security",
              "intent_violation",
              "scope_drift",
              "other",
            ],
          },
          message: { type: "string" },
        },
        required: ["severity", "file", "kind", "message"],
        additionalProperties: false,
      },
    },
  },
  required: ["findings"],
  additionalProperties: false,
} as const;

export function normalizePrePrReviewProvider(
  value: unknown,
): PrePrReviewProviderId {
  return value === "codex" || value === "claude-code"
    ? value
    : DEFAULT_PRE_PR_REVIEW_PROVIDER;
}

export function buildReviewDiffPrompt(args: {
  diff: string;
  workingTreeDiff: string;
  commitLog: string;
  fileList: string;
  baseBranch: string;
  headBranch: string;
  agentsContent?: string;
}) {
  return [
    "Review this pull request diff before it is opened.",
    "Find only concrete issues that should be fixed before sharing the PR: logic bugs, races, data loss, security problems, broken user flows, or test gaps that hide a likely bug.",
    "Do not edit files. Do not run commands. Do not comment on style, naming, formatting, or speculative improvements.",
    "Return only JSON in this exact shape:",
    '{"findings":[{"severity":"critical|high|medium|low","file":"path/to/file.ts","line":123,"kind":"bug|race|security|other","message":"short actionable finding"}]}',
    "Use an empty findings array if there are no concrete issues.",
    "",
    `Base branch: ${args.baseBranch}`,
    `Head branch: ${args.headBranch}`,
    "",
    "Commit log:",
    args.commitLog || "(no commits)",
    "",
    "Changed files:",
    args.fileList || "(no file list available)",
    ...(args.agentsContent
      ? [
          "",
          "Repository guidelines from AGENTS.md:",
          args.agentsContent.slice(0, PRE_PR_REVIEW_AGENTS_MAX_CHARS),
        ]
      : []),
    ...(args.diff.length > 0
      ? [
          "",
          "Branch diff against the base branch (may be truncated):",
          args.diff.slice(0, PRE_PR_REVIEW_BRANCH_DIFF_MAX_CHARS),
        ]
      : []),
    ...(args.workingTreeDiff.length > 0
      ? [
          "",
          "Uncommitted working tree diff (may be truncated):",
          args.workingTreeDiff.slice(
            0,
            PRE_PR_REVIEW_WORKING_TREE_DIFF_MAX_CHARS,
          ),
        ]
      : []),
  ].join("\n");
}

function stripCodeFences(text: string) {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i);
  return match?.[1]?.trim() ?? trimmed;
}

function extractJsonCandidate(text: string) {
  const cleaned = stripCodeFences(text);
  if (!cleaned) {
    return "";
  }
  if (cleaned.startsWith("{") || cleaned.startsWith("[")) {
    return cleaned;
  }

  const fencedMatch = cleaned.match(/```(?:json)?\s*\n([\s\S]*?)\n```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const objectStart = cleaned.indexOf("{");
  const objectEnd = cleaned.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    return cleaned.slice(objectStart, objectEnd + 1).trim();
  }

  const arrayStart = cleaned.indexOf("[");
  const arrayEnd = cleaned.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return cleaned.slice(arrayStart, arrayEnd + 1).trim();
  }

  return "";
}

function normalizeSeverity(value: unknown): PrePrReviewFindingSeverity {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (
    normalized === "critical" ||
    normalized === "blocker" ||
    normalized === "severe"
  ) {
    return "critical";
  }
  if (normalized === "high" || normalized === "major") {
    return "high";
  }
  if (normalized === "low" || normalized === "minor" || normalized === "nit") {
    return "low";
  }
  return "medium";
}

function normalizeKind(value: unknown): PrePrReviewFindingKind {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "bug" || normalized === "logic") {
    return "bug";
  }
  if (normalized === "race" || normalized === "concurrency") {
    return "race";
  }
  if (normalized === "security" || normalized === "sec") {
    return "security";
  }
  if (
    normalized === "intent_violation" ||
    normalized === "intent-violation" ||
    normalized === "intent" ||
    normalized === "violation"
  ) {
    return "intent_violation";
  }
  if (
    normalized === "scope_drift" ||
    normalized === "scope-drift" ||
    normalized === "scope" ||
    normalized === "drift" ||
    normalized === "out_of_scope" ||
    normalized === "out-of-scope"
  ) {
    return "scope_drift";
  }
  return "other";
}

function normalizeLine(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

function normalizeFinding(value: unknown): PrePrReviewFinding | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const message = String(record.message ?? record.description ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_MESSAGE_CHARS);
  if (!message) {
    return null;
  }

  const file = String(record.file ?? record.path ?? "unknown")
    .trim()
    .slice(0, MAX_FILE_CHARS);

  return {
    severity: normalizeSeverity(record.severity),
    file: file || "unknown",
    line: normalizeLine(record.line),
    kind: normalizeKind(record.kind),
    message,
  };
}

export function parseReviewFindings(text: string): PrePrReviewFinding[] {
  const candidate = extractJsonCandidate(text);
  if (!candidate) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return [];
  }

  const rawFindings = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { findings?: unknown }).findings)
      ? (parsed as { findings: unknown[] }).findings
      : [];

  return rawFindings
    .map((item) => normalizeFinding(item))
    .filter((item): item is PrePrReviewFinding => Boolean(item))
    .slice(0, MAX_FINDINGS);
}

export const INTENT_GUARD_CONTEXT_MAX_CHARS = 6_000;
const INTENT_GUARD_NOTE_MAX_CHARS = 600;

/**
 * Structural subset of the workspace information that holds pinned product
 * intent. Kept decoupled from `WorkspaceInformationState` so this lib has no
 * dependency on the renderer-side information model and stays trivially
 * testable. Pass the full workspace information state — extra fields are
 * ignored.
 */
export interface IntentGuardContextInput {
  notes?: string;
  jiraIssues?: ReadonlyArray<{
    issueKey?: string;
    title?: string;
    url?: string;
    note?: string;
  }>;
  craneIssues?: ReadonlyArray<{
    issueKey?: string;
    title?: string;
    url?: string;
    note?: string;
  }>;
  confluencePages?: ReadonlyArray<{
    title?: string;
    url?: string;
    note?: string;
  }>;
  figmaResources?: ReadonlyArray<{
    title?: string;
    url?: string;
    note?: string;
  }>;
}

function appendIntentNote(lines: string[], note?: string) {
  const trimmed = (note ?? "").replace(/\s+/g, " ").trim();
  if (trimmed) {
    lines.push(`  note: ${trimmed.slice(0, INTENT_GUARD_NOTE_MAX_CHARS)}`);
  }
}

function buildResourceSection(
  label: string,
  title: string | undefined,
  url: string | undefined,
  note: string | undefined,
): string | null {
  const heading = (title ?? "").trim() || (url ?? "").trim();
  if (!heading && !(url ?? "").trim()) {
    return null;
  }
  const lines = [
    `[${label}] ${heading || "(untitled)"}${url ? ` (${url})` : ""}`,
  ];
  appendIntentNote(lines, note);
  return lines.join("\n");
}

/**
 * Collect the workspace's pinned product intent (notes + Jira/Crane/Confluence/Figma
 * references) into a single labelled, length-capped string for the intent
 * guard prompt. Returns an empty string when no intent is available, so callers
 * can skip the guard entirely.
 */
export function collectIntentContext(input: IntentGuardContextInput): string {
  const sections: string[] = [];

  const notes = (input.notes ?? "").trim();
  if (notes) {
    sections.push(`[Notes]\n${notes}`);
  }

  for (const issue of input.jiraIssues ?? []) {
    const heading = [issue.issueKey, issue.title]
      .map((part) => (part ?? "").trim())
      .filter(Boolean)
      .join(" — ");
    const section = buildResourceSection(
      "Jira",
      heading || undefined,
      issue.url,
      issue.note,
    );
    if (section) {
      sections.push(section);
    }
  }

  for (const issue of input.craneIssues ?? []) {
    const heading = [issue.issueKey, issue.title]
      .map((part) => (part ?? "").trim())
      .filter(Boolean)
      .join(" — ");
    const section = buildResourceSection(
      "Crane",
      heading || undefined,
      issue.url,
      issue.note,
    );
    if (section) {
      sections.push(section);
    }
  }

  for (const page of input.confluencePages ?? []) {
    const section = buildResourceSection(
      "Confluence",
      page.title,
      page.url,
      page.note,
    );
    if (section) {
      sections.push(section);
    }
  }

  for (const figma of input.figmaResources ?? []) {
    const section = buildResourceSection(
      "Figma",
      figma.title,
      figma.url,
      figma.note,
    );
    if (section) {
      sections.push(section);
    }
  }

  return sections.join("\n\n").slice(0, INTENT_GUARD_CONTEXT_MAX_CHARS).trim();
}

export type IntentComplianceStatus = "pass" | "warn" | "fail";

/**
 * Collapse intent-guard findings into a single status.
 * - `pass` — no findings (the change is consistent with the pinned intent).
 * - `fail` — at least one `critical`/`high` finding (a likely real violation).
 * - `warn` — only `medium`/`low` findings (possible drift worth a look).
 */
export function deriveIntentComplianceStatus(
  findings: PrePrReviewFinding[],
): IntentComplianceStatus {
  if (findings.length === 0) {
    return "pass";
  }
  if (
    findings.some(
      (finding) =>
        finding.severity === "critical" || finding.severity === "high",
    )
  ) {
    return "fail";
  }
  return "warn";
}

/** Latest intent-guard result for a workspace turn (mirrors the verification result). */
export interface TurnIntentComplianceResult {
  workspaceId: string;
  taskId?: string;
  turnId?: string;
  status: IntentComplianceStatus;
  findings: PrePrReviewFinding[];
  /** Epoch-ms the guarding turn completed. */
  completedAt: number;
}

/**
 * Build the intent-guard prompt: ask the provider whether the change conflicts
 * with or drifts outside the pinned product intent, returning findings in the
 * same JSON shape as the pre-PR review (with `intent_violation`/`scope_drift`
 * kinds).
 */
export function buildIntentGuardPrompt(args: {
  diff: string;
  workingTreeDiff: string;
  fileList: string;
  intentContext: string;
}) {
  return [
    "You are an intent-compliance guard for a code change.",
    "The user pinned the product intent below (PRD / spec / design references). Judge ONLY whether the change conflicts with, contradicts, or drifts outside that pinned intent.",
    'Report two kinds of issues: "intent_violation" (the change does something the pinned intent forbids or contradicts) and "scope_drift" (the change adds or removes behavior that is outside the pinned intent\'s scope).',
    "Do not report style, naming, formatting, generic bugs, or improvements unrelated to the pinned intent. Do not edit files. Do not run commands.",
    "Return only JSON in this exact shape:",
    '{"findings":[{"severity":"critical|high|medium|low","file":"path/to/file.ts","line":123,"kind":"intent_violation|scope_drift","message":"how the change conflicts with the pinned intent"}]}',
    "Use an empty findings array if the change is consistent with the pinned intent.",
    "",
    "Pinned product intent:",
    args.intentContext || "(no pinned intent provided)",
    "",
    "Changed files:",
    args.fileList || "(no file list available)",
    ...(args.diff.length > 0
      ? [
          "",
          "Branch diff against the base branch (may be truncated):",
          args.diff.slice(0, PRE_PR_REVIEW_BRANCH_DIFF_MAX_CHARS),
        ]
      : []),
    ...(args.workingTreeDiff.length > 0
      ? [
          "",
          "Uncommitted working tree diff (may be truncated):",
          args.workingTreeDiff.slice(
            0,
            PRE_PR_REVIEW_WORKING_TREE_DIFF_MAX_CHARS,
          ),
        ]
      : []),
  ].join("\n");
}
