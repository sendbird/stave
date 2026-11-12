import { i18n, type I18nKey } from "@/i18n/runtime";
import type { AgentRunPauseReason, AgentRunStopReason } from "@/lib/agent-runs/domain";
import { parseAgentRunTurnStartFailure } from "@/lib/agent-runs/turn-start-failure";
import { TARS_MESSAGE_FAILURE_TEXT, TarsMessageFailureCodeSchema, type TarsMessage, type TarsMessageFailureCode } from "./conversation";
import { TarsDetailCodeSchema, type TarsDetailCode, type TarsResponsibility } from "./types";
import { hasEndedTarsExecution } from "./continuation";

/** The fields a detail line reads; a responsibility and an activity entry both carry them. */
export type TarsDetailFields = Pick<TarsResponsibility, "detail" | "detailCode" | "detailParams">;

const DETAIL_KEYS = {
  waitingForUser: "shell:tars.detail.waitingForUser",
  runPaused: "shell:tars.detail.runPaused",
  runStopped: "shell:tars.detail.runStopped",
  incompleteReport: "shell:tars.detail.incompleteReport",
  staleVerification: "shell:tars.detail.staleVerification",
  scopeUnregistered: "shell:tars.detail.scopeUnregistered",
  taskIdentityChanged: "shell:tars.detail.taskIdentityChanged",
  taskInUse: "shell:tars.detail.taskInUse",
  executionAgentUnavailable: "shell:tars.detail.executionAgentUnavailable",
  assignmentUnavailable: "shell:tars.detail.assignmentUnavailable",
  executionExists: "shell:tars.detail.executionExists",
  ownershipUnverified: "shell:tars.detail.ownershipUnverified",
  ownershipChanged: "shell:tars.detail.ownershipChanged",
  taskUnavailable: "shell:tars.detail.taskUnavailable",
  takenOverInTask: "shell:tars.detail.takenOverInTask",
  admissionWithdrawn: "shell:tars.detail.admissionWithdrawn",
  observationFailed: "shell:tars.detail.observationFailed",
  unverifiedCompletion: "shell:tars.detail.unverifiedCompletion",
  acceptedWithoutVerification: "shell:tars.detail.acceptedWithoutVerification",
  workingChangesUnavailable: "shell:tars.detail.workingChangesUnavailable",
  runCancelled: "shell:tars.detail.runCancelled",
  turnStartFailed: "shell:tars.detail.turnStartFailed",
} as const satisfies Record<TarsDetailCode, I18nKey>;

/** A run's own pause reason, more specific than the generic "paused" sentence. */
const PAUSE_REASON_KEYS = {
  "paused-by-user": "shell:tars.detail.pauseReason.pausedByUser",
  "taken-over": "shell:tars.detail.pauseReason.takenOver",
  "task-identity-changed": "shell:tars.detail.pauseReason.taskIdentityChanged",
  "runtime-changed": "shell:tars.detail.pauseReason.runtimeChanged",
  "usage-limit": "shell:tars.detail.pauseReason.usageLimit",
  "wait-expired": "shell:tars.detail.pauseReason.waitExpired",
  "limit-reached": "shell:tars.detail.pauseReason.limitReached",
} as const satisfies Record<AgentRunPauseReason, I18nKey>;

const STOP_REASON_KEYS = {
  "task-unavailable": "shell:tars.detail.stopReason.taskUnavailable",
  "turn-cap-reached": "shell:tars.detail.stopReason.turnCapReached",
  "acceptance-unmet": "shell:tars.detail.stopReason.acceptanceUnmet",
  expired: "shell:tars.detail.stopReason.expired",
} as const satisfies Record<AgentRunStopReason, I18nKey>;

function reasonKey<K extends Record<string, I18nKey>>(keys: K, reason: string | undefined): K[keyof K] | null {
  return reason && Object.hasOwn(keys, reason) ? keys[reason as keyof K] : null;
}

/**
 * The text a surface shows for a responsibility's (or an activity entry's)
 * detail line. Host-made status sentences become translated text from their
 * stable code; free text (a run's own reason) passes through unchanged, and an
 * unknown code from a newer host falls back to the saved text.
 */
export function describeTarsResponsibilityDetail(row: TarsDetailFields): string | null {
  const code = TarsDetailCodeSchema.safeParse(row.detailCode);
  if (!code.success) return row.detail;
  const reason = row.detailParams?.reason;
  const specific = code.data === "runPaused" ? reasonKey(PAUSE_REASON_KEYS, reason)
    : code.data === "runStopped" ? reasonKey(STOP_REASON_KEYS, reason) : null;
  return i18n.t(specific ?? DETAIL_KEYS[code.data]);
}

/** Codes whose `detail` holds the run's or provider's own words rather than Tars's fixed sentence. */
const DIAGNOSTIC_CODES: ReadonlySet<TarsDetailCode> = new Set(["runStopped", "runCancelled", "turnStartFailed"]);
// i18n-ignore: the fixed diagnostic Tars saves for a stop with no reason; it adds nothing to the translated line
const BARE_STOP_DETAIL = "The run stopped.";

/**
 * The run's or provider's own words behind a coded detail line, untranslated,
 * for an expandable "technical details" disclosure. Null when the line has
 * no such words, or they only repeat the code.
 */
export function describeTarsResponsibilityDiagnostic(row: TarsDetailFields): string | null {
  const code = TarsDetailCodeSchema.safeParse(row.detailCode);
  if (!code.success || !DIAGNOSTIC_CODES.has(code.data) || !row.detail) return null;
  const words = code.data === "turnStartFailed" ? parseAgentRunTurnStartFailure(row.detail) : row.detail.trim();
  return words && words !== row.detailParams?.reason && words !== BARE_STOP_DETAIL ? words : null;
}

const FAILURE_KEYS = {
  interrupted: "shell:tars.messageFailure.interrupted",
  reasoningFailed: "shell:tars.messageFailure.reasoningFailed",
} as const satisfies Record<TarsMessageFailureCode, I18nKey>;

/** A message saved before failure codes existed is recognized by its fixed English diagnostic. */
function legacyFailureCode(error: string): TarsMessageFailureCode | null {
  for (const code of TarsMessageFailureCodeSchema.options) if (TARS_MESSAGE_FAILURE_TEXT[code] === error) return code;
  return null;
}

/** The translated reason a conversation message failed, or null when it did not. */
export function describeTarsMessageFailure(message: Pick<TarsMessage, "error" | "errorCode">): string | null {
  if (message.error === null) return null;
  const code = TarsMessageFailureCodeSchema.safeParse(message.errorCode);
  const known = code.success ? code.data : legacyFailureCode(message.error);
  return known ? i18n.t(FAILURE_KEYS[known]) : message.error;
}

/** The commit a short form names: 7 characters, as Git abbreviates by default. */
export const TARS_SHORT_COMMIT_CHARS = 7;

/**
 * Where work that included the user's working changes starts: their snapshot
 * (with its short commit) or, when there were none, the branch. Null for work
 * whose message did not ask to include them.
 */
export function describeTarsWorkingChanges(row: Pick<TarsResponsibility, "workingChanges">): string | null {
  const changes = row.workingChanges;
  if (!changes) return null;
  return changes.kind === "snapshot"
    ? i18n.t("shell:tars.workingChanges.snapshot", { commit: changes.commit.slice(0, TARS_SHORT_COMMIT_CHARS) })
    : i18n.t("shell:tars.workingChanges.clean");
}

/** Only scheduler evidence explains queued work or an ended execution's queued follow-up. */
export function describeTarsQueueWait(row: Pick<TarsResponsibility, "state" | "queueWait">): string | null {
  const ended = hasEndedTarsExecution(row);
  if (row.state !== "queued" && !(ended && row.queueWait)) return null;
  const wait = row.queueWait;
  if (ended && wait?.code === "unknown") return null;
  if (wait?.code === "capacity") return i18n.t("shell:tars.queueWait.capacity", { active: wait.active, limit: wait.limit });
  return i18n.t(wait?.code === "storageBusy" ? "shell:tars.queueWait.storageBusy" : "shell:tars.queueWait.unknown");
}
