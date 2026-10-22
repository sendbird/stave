import type { ProviderSessionCursor } from "@/lib/db/workspaces.db";
import type { CanonicalRetrievedContextPart } from "@/lib/providers/provider.types";
import { buildHandoffRecordContextPart, type TaskHandoffRecord } from "@/lib/task-context/handoff-record";

/**
 * Which revision of the handoff record a provider session has. A session's
 * cursor keeps the revision it had when its last turn completed; a turn notes
 * the revision it started with here, and the replay of its successful `done`
 * moves it onto the cursor. A turn that fails, or one this process no longer
 * remembers (a restart), leaves the cursor as it was, so the record goes again:
 * the safe direction.
 */
const revisionByTurnId = new Map<string, number>();
const TURN_LIMIT = 256;

export function noteTurnHandoffRevision(turnId: string, revision: number) {
  revisionByTurnId.delete(turnId);
  revisionByTurnId.set(turnId, revision);
  while (revisionByTurnId.size > TURN_LIMIT) {
    const oldest = revisionByTurnId.keys().next();
    if (oldest.done) break;
    revisionByTurnId.delete(oldest.value);
  }
}

/** The revision the turn started with, or undefined when it carried none this process knows of. */
export function turnHandoffRevision(turnId: string | undefined) {
  return turnId ? revisionByTurnId.get(turnId) : undefined;
}

/**
 * The record's part for a turn: a new session gets it with the conversation
 * excerpt; a resumed session gets it again only as an update, when the record
 * changed since the session last received it.
 */
export function buildTurnHandoffContextPart(args: {
  record: TaskHandoffRecord;
  turnId?: string;
  /** The turn's provider session; null or omitted when the turn starts a new one. */
  session?: ProviderSessionCursor | null;
}): CanonicalRetrievedContextPart | null {
  if (args.turnId) {
    noteTurnHandoffRevision(args.turnId, args.record.revision);
  }
  return buildHandoffRecordContextPart(args.record, {
    sessionRevision: args.session ? (args.session.handoffRevision ?? 0) : null,
  });
}
