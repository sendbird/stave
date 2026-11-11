import { z } from "zod";

/**
 * Publishing a responsibility's verified work: commit, push and a draft pull
 * request, done by the host only after the user confirms one card. Words (a
 * `publish` proposal) and clicks (the card opened from the tray or the
 * report) converge on the host's one publish path; nothing here merges,
 * deploys or force-pushes.
 *
 * This module is imported by the responsibility and conversation contracts,
 * so it imports neither of them.
 */

const IdSchema = z.string().trim().min(1).max(256);
const RevisionSchema = z.number().int().min(1);
const TimestampSchema = z.iso.datetime();
const ErrorSchema = z.string().trim().min(1).max(2_000);
/** Git refuses longer ref names on most filesystems; a responsibility's branch is far shorter. */
const BranchSchema = z.string().trim().min(1).max(255);
const UrlSchema = z.string().trim().max(2_048).regex(/^https?:\/\/\S+$/);

/** GitHub's pull request title limit. */
export const TARS_PUBLISH_TITLE_MAX_CHARS = 256;
export const TARS_PUBLISH_COMMIT_MESSAGE_MAX_CHARS = 2_000;
/** Below GitHub's 65,536-character body limit. */
export const TARS_PUBLISH_BODY_MAX_CHARS = 60_000;

/** The publish steps, in order; a retry resumes at the step that failed. */
export const TarsPublicationStepSchema = z.enum(["commit", "push", "pr"]);
export type TarsPublicationStep = z.infer<typeof TarsPublicationStepSchema>;

/**
 * `committing` while the commit step runs, `committed` and `pushed` after
 * those steps, `opened` once the draft pull request exists (or one that
 * already existed for the branch was recorded), `failed` with the step that
 * failed. A host restart turns an unfinished state into `failed`.
 */
export const TarsPublicationStateSchema = z.enum(["committing", "committed", "pushed", "opened", "failed"]);
export type TarsPublicationState = z.infer<typeof TarsPublicationStateSchema>;

/**
 * Why the host refused or could not finish a publish. The interface
 * translates the code; the English `error` beside it is a diagnostic.
 * - `notOwned`: no such responsibility of Tars.
 * - `notCompleted`: the work has not completed.
 * - `notVerified`: it completed only because the user accepted it without a Stave-verified check.
 * - `stale`: the work changed since the card was shown.
 * - `noWorkspace`: its execution workspace is missing.
 * - `noChanges`: nothing uncommitted and no commit ahead of the base branch.
 * - `noRemote`: no `origin` remote, or it is not a GitHub repository.
 * - `ghUnavailable`: the GitHub CLI is missing or not signed in.
 * - `wrongBranch`: the workspace is not on the work's branch, or that branch is the base branch.
 * - `alreadyPublished`: its draft pull request is already open.
 * - `inProgress`: another publish of the same work is running.
 * - `publishFailed`: a step failed; the diagnostic says which and why.
 * - `notByFollowUp`: an automatic follow-up proposed it.
 */
export const TarsPublishReasonSchema = z.enum([
  "notOwned", "notCompleted", "notVerified", "stale", "noWorkspace", "noChanges", "noRemote", "ghUnavailable",
  "wrongBranch", "alreadyPublished", "inProgress", "publishFailed", "notByFollowUp", "unknown",
]);
export type TarsPublishReason = z.infer<typeof TarsPublishReasonSchema>;

/** The publish state saved on the responsibility, written only by the host. */
export const TarsPublicationSchema = z.object({
  /** The execution whose result the host published; absent on older records. */
  agentRunId: IdSchema.optional(),
  state: TarsPublicationStateSchema,
  /** The step a retry resumes; only a failed publication has one. */
  failedStep: TarsPublicationStepSchema.nullable(),
  /** The commit the work was published as, once committed. */
  commit: z.string().regex(/^[0-9a-f]{7,64}$/).nullable(),
  /** The head branch pushed and named in the pull request. */
  branch: BranchSchema,
  /** The branch the pull request targets; never pushed to. */
  base: BranchSchema,
  commitMessage: z.string().trim().min(1).max(TARS_PUBLISH_COMMIT_MESSAGE_MAX_CHARS),
  title: z.string().trim().min(1).max(TARS_PUBLISH_TITLE_MAX_CHARS),
  url: UrlSchema.nullable(),
  number: z.number().int().min(1).nullable(),
  /** The pull request already existed for the branch; its URL was recorded instead of opening another. */
  existing: z.boolean().optional(),
  error: ErrorSchema.nullable(),
  reason: TarsPublishReasonSchema.nullable(),
  updatedAt: TimestampSchema,
}).strict().superRefine((publication, context) => {
  const failed = publication.state === "failed";
  const consistent = failed === (publication.failedStep !== null) && failed === (publication.error !== null)
    && (publication.state !== "opened" || publication.url !== null);
  // i18n-ignore: persisted-state integrity diagnostic, not user-facing copy
  if (!consistent) context.addIssue({ code: "custom", message: "Publication state and outcome fields disagree." });
});
export type TarsPublication = z.infer<typeof TarsPublicationSchema>;

/**
 * The model's proposal to publish one completed responsibility at the
 * revision it saw. It grants nothing: the host saves it as proposed and only
 * the user's confirmation on its card publishes.
 */
export const TarsPublishActionSchema = z.object({
  kind: z.literal("publish"),
  responsibilityId: IdSchema,
  expectedRevision: RevisionSchema,
}).strict();
export type TarsPublishAction = z.infer<typeof TarsPublishActionSchema>;

/** How the card was confirmed: its button, or Enter while it has focus. */
export const TarsPublishSourceSchema = z.enum(["click", "key"]);
export type TarsPublishSource = z.infer<typeof TarsPublishSourceSchema>;

const NO_NUL = (value: string) => !value.includes("\u0000");
const singleLine = (value: string) => !/[\r\n]/.test(value);

/**
 * The user's confirmation of one card. The host derives everything else
 * (repository, base, head, the body) itself; only the words the user may edit
 * cross from the renderer. `publish:<message>:<index>` confirms that word
 * proposal and must repeat it exactly; any other request id is a click on a
 * card opened from the tray or the report.
 */
export const TarsPublishInputSchema = z.object({
  requestId: IdSchema.regex(/^[A-Za-z0-9._:-]+$/),
  responsibilityId: IdSchema,
  expectedRevision: RevisionSchema,
  // i18n-ignore: schema diagnostic, not user-facing copy
  commitMessage: z.string().trim().min(1).max(TARS_PUBLISH_COMMIT_MESSAGE_MAX_CHARS).refine(NO_NUL, "The commit message has a NUL character."),
  // i18n-ignore: schema diagnostic, not user-facing copy
  title: z.string().trim().min(1).max(TARS_PUBLISH_TITLE_MAX_CHARS).refine((value) => NO_NUL(value) && singleLine(value), "The title is one line."),
  source: TarsPublishSourceSchema,
}).strict();
export type TarsPublishInput = z.infer<typeof TarsPublishInputSchema>;

export const TarsPublishPreviewInputSchema = z.object({ responsibilityId: IdSchema }).strict();
export type TarsPublishPreviewInput = z.infer<typeof TarsPublishPreviewInputSchema>;

/**
 * What the card shows before the user confirms, read by the host: where the
 * work would go and what the pull request would say. `reason` null means the
 * host would publish it now; the confirmation checks everything again.
 */
export const TarsPublishPreviewSchema = z.object({
  responsibilityId: IdSchema,
  revision: RevisionSchema,
  reason: TarsPublishReasonSchema.nullable(),
  /** `owner/name` when GitHub resolved it, otherwise the repository folder. */
  repository: z.string().trim().min(1).max(300).nullable(),
  repositoryUrl: UrlSchema.nullable(),
  base: BranchSchema.nullable(),
  head: BranchSchema.nullable(),
  /** Uncommitted changed files and files changed by commits ahead of the base; null when unread. */
  changedFiles: z.number().int().min(0).nullable(),
  body: z.string().max(TARS_PUBLISH_BODY_MAX_CHARS),
  publication: TarsPublicationSchema.nullable(),
}).strict();
export type TarsPublishPreview = z.infer<typeof TarsPublishPreviewSchema>;

export const TarsPublishProposalRefSchema = z.object({
  messageId: IdSchema,
  actionIndex: z.number().int().min(0).max(7),
}).strict();
export type TarsPublishProposalRef = z.infer<typeof TarsPublishProposalRefSchema>;

/**
 * One confirmation and its outcome, in the conversation. `applied` means the
 * draft pull request is open (or already was); `rejected` carries the
 * refusal or the failed step. Never a user message or a model proposal.
 */
export const TarsPublishRecordSchema = z.object({
  requestId: IdSchema,
  source: TarsPublishSourceSchema,
  requestHash: z.string().regex(/^[a-f0-9]{64}$/),
  responsibilityId: IdSchema,
  expectedRevision: RevisionSchema,
  commitMessage: TarsPublishInputSchema.shape.commitMessage,
  title: TarsPublishInputSchema.shape.title,
  /** The word proposal this confirmed; null for a card opened by a click. */
  proposal: TarsPublishProposalRefSchema.nullable(),
  status: z.enum(["pending", "applied", "rejected"]),
  reason: TarsPublishReasonSchema.nullable(),
  error: ErrorSchema.nullable(),
  url: UrlSchema.nullable(),
  number: z.number().int().min(1).nullable(),
  existing: z.boolean().optional(),
  revision: RevisionSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
}).strict().superRefine((record, context) => {
  const rejected = record.status === "rejected";
  const consistent = rejected === (record.error !== null) && rejected === (record.reason !== null)
    && (record.status !== "applied" || record.url !== null);
  // i18n-ignore: persisted-state integrity diagnostic, not user-facing copy
  if (!consistent) context.addIssue({ code: "custom", message: "Publish record status and outcome fields disagree." });
});
export type TarsPublishRecord = z.infer<typeof TarsPublishRecordSchema>;

export const TarsPublishResultSchema = z.object({
  record: TarsPublishRecordSchema,
}).strict();
export type TarsPublishResult = z.infer<typeof TarsPublishResultSchema>;

/** A word proposal's confirmation request id; the card, the tray and the report join one record with it. */
export function tarsPublishProposalRequestId(messageId: string, actionIndex: number) {
  return `publish:${messageId}:${actionIndex}`;
}
export function parseTarsPublishProposalRequestId(requestId: string): TarsPublishProposalRef | null {
  const match = /^publish:([A-Za-z0-9._-]+):([0-7])$/.exec(requestId);
  return match ? { messageId: match[1]!, actionIndex: Number(match[2]) } : null;
}

/** The head branch of a responsibility: its admitted branch, or `tars/<id>` for work admitted before branch names. */
export function tarsPublishHeadBranch(row: { id: string; branchName?: string }) {
  return row.branchName ?? `tars/${row.id}`;
}

/** Whether a publication is between steps: a confirmation is running, or was interrupted before a restart marked it failed. */
export function isTarsPublicationUnfinished(publication: Pick<TarsPublication, "state"> | null | undefined) {
  return publication?.state === "committing" || publication?.state === "committed" || publication?.state === "pushed";
}

/** The step a publication resumes at: the failed step, else the one after the last finished step. */
export function tarsPublicationResumeStep(publication: Pick<TarsPublication, "state" | "failedStep"> | null | undefined): TarsPublicationStep | null {
  if (!publication) return "commit";
  switch (publication.state) {
    case "committing": return "commit";
    case "committed": return "push";
    case "pushed": return "pr";
    case "opened": return null;
    case "failed": return publication.failedStep ?? "commit";
  }
}

/** Conventional Commits types offered on the card, most common first. */
export const TARS_COMMIT_TYPES = ["feat", "fix", "refactor", "perf", "docs", "test", "build", "ci", "chore", "style"] as const;
export type TarsCommitType = (typeof TARS_COMMIT_TYPES)[number];
const COMMIT_SUBJECT = new RegExp(`^(${TARS_COMMIT_TYPES.join("|")})(\\([^)\\s]{1,40}\\))?(!)?:\\s*(.*)$`, "s");

/** Splits `type(scope)!: subject`; null when the message does not start with an offered type. */
export function parseTarsCommitSubject(message: string): { type: TarsCommitType; scope: string | null; breaking: boolean; subject: string } | null {
  const match = COMMIT_SUBJECT.exec(message.trim());
  if (!match) return null;
  return { type: match[1] as TarsCommitType, scope: match[2] ? match[2].slice(1, -1) : null, breaking: match[3] === "!", subject: match[4]!.trim() };
}

/** Replaces the type of a Conventional Commit message, keeping its scope and subject; prefixes one when it has none. */
export function withTarsCommitType(message: string, type: TarsCommitType): string {
  const parsed = parseTarsCommitSubject(message);
  if (!parsed) return `${type}: ${message.trim()}`;
  return `${type}${parsed.scope ? `(${parsed.scope})` : ""}${parsed.breaking ? "!" : ""}: ${parsed.subject}`;
}

/**
 * A plain capitalized word becomes lower case; acronyms, identifiers and
 * mixed-case names ("API", "DatePicker", "iOS") keep their spelling.
 */
function lowerWord(word: string) {
  return /^\p{Lu}[\p{Ll}'’-]*$/u.test(word) ? word.toLocaleLowerCase() : word;
}

/** The type a title suggests from its first word; `feat` otherwise. */
export function inferTarsCommitType(title: string): TarsCommitType {
  const first = title.trim().split(/\s+/)[0]?.toLocaleLowerCase() ?? "";
  if (/^(fix|fixes|fixed|repair|resolve|correct)$/.test(first)) return "fix";
  if (/^(refactor|simplify|restructure|rename|extract)$/.test(first)) return "refactor";
  if (/^(document|docs|doc)$/.test(first)) return "docs";
  if (/^(test|tests|cover)$/.test(first)) return "test";
  return "feat";
}

/**
 * The default commit subject and pull request title for a responsibility:
 * a Conventional Commit subject from its title in lower case, such as
 * `feat: add a slugify helper`. A title that already starts with a type keeps it.
 */
export function tarsDefaultCommitSubject(title: string, type?: TarsCommitType): string {
  const trimmed = title.trim().replace(/[.。]+$/u, "");
  const parsed = parseTarsCommitSubject(trimmed);
  if (parsed) return type ? withTarsCommitType(trimmed, type) : trimmed;
  const chosen = type ?? inferTarsCommitType(trimmed);
  // "Fix the flaky test" reads "fix: the flaky test", not "fix: fix the flaky test".
  const rest = chosen === "fix" ? trimmed.replace(/^fix(?:es|ed)?\s+(?=\S)/i, "") : trimmed;
  const subject = rest.split(/(\s+)/).map((part) => /\s/.test(part) ? part : lowerWord(part)).join("");
  return `${chosen}: ${subject}`.slice(0, TARS_PUBLISH_TITLE_MAX_CHARS);
}

/** The pull request number in a GitHub pull request URL. */
export function tarsPullRequestNumber(url: string): number | null {
  const match = /\/pull\/(\d{1,9})(?:[/?#]|$)/.exec(url);
  return match ? Number(match[1]) : null;
}
