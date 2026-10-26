import type { WorkspaceSessionState } from "../../src/store/workspace-session-state";
import type { ChatMessage, Task } from "../../src/types/chat";

/** What one task looked like on disk before a host turn added its rows. */
export interface UnsavedTurn {
  taskId: string;
  turnId: string;
  /** The stored task, or null when the turn would have created it. */
  storedTask: Task | null;
  activeTaskId: string;
  messages: ChatMessage[];
  messageCount: number | undefined;
}

/**
 * Saves a host turn's prompt row and pending reply row before the turn starts.
 * A turn must not start without its prompt row: event writes carry only the
 * reply, so a later full write would add the prompt below its reply, or
 * nothing would. On failure only this turn leaves the cache (another task's
 * running turn may hold output there that is not on disk yet) and the error
 * says the turn did not start.
 */
export async function savePromptOrRevert(args: {
  turn: UnsavedTurn;
  save: (turn: UnsavedTurn) => Promise<void>;
  cache: { read: () => WorkspaceSessionState | undefined; write: (session: WorkspaceSessionState) => void };
}) {
  try {
    await args.save(args.turn);
  } catch (error) {
    const latest = args.cache.read();
    if (latest) args.cache.write(revertUnsavedTurn(latest, args.turn));
    throw new Error(`The prompt could not be saved, so the turn did not start: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Takes a turn whose prompt never reached disk back out of the host's cached
 * session: the task returns to its stored state (or leaves, when the turn
 * would have created it) and has no active turn. Every other task is left as
 * the cache holds it, because another running turn may have output there that
 * is not on disk yet.
 */
export function revertUnsavedTurn(session: WorkspaceSessionState, turn: UnsavedTurn): WorkspaceSessionState {
  const { [turn.taskId]: _messages, ...otherMessages } = session.messagesByTask;
  const { [turn.taskId]: _count, ...otherCounts } = session.messageCountByTask;
  const { [turn.taskId]: activeTurnId, ...otherActiveTurns } = session.activeTurnIdsByTask;
  const { [turn.taskId]: ready, ...otherReady } = session.nativeSessionReadyByTask;
  const stored = turn.storedTask;
  return {
    ...session,
    activeTaskId: session.activeTaskId === turn.taskId ? turn.activeTaskId : session.activeTaskId,
    tasks: stored
      ? session.tasks.map((task) => (task.id === turn.taskId ? stored : task))
      : session.tasks.filter((task) => task.id !== turn.taskId),
    messagesByTask: stored ? { ...otherMessages, [turn.taskId]: turn.messages } : otherMessages,
    messageCountByTask: stored && turn.messageCount !== undefined
      ? { ...otherCounts, [turn.taskId]: turn.messageCount }
      : otherCounts,
    activeTurnIdsByTask: activeTurnId === turn.turnId || activeTurnId === undefined
      ? otherActiveTurns
      : { ...otherActiveTurns, [turn.taskId]: activeTurnId },
    nativeSessionReadyByTask: stored && ready !== undefined ? { ...otherReady, [turn.taskId]: ready } : otherReady,
  };
}
