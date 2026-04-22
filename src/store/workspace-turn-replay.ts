import type { NormalizedProviderEvent, ProviderId } from "@/lib/providers/provider.types";
import { replayProviderEventsToTaskState } from "@/lib/session/provider-event-replay";
import type { WorkspaceSessionState } from "@/store/workspace-session-state";

export function applyProviderEventsToWorkspaceSession(args: {
  session: WorkspaceSessionState;
  taskId: string;
  events: NormalizedProviderEvent[];
  provider: ProviderId;
  model: string;
  turnId: string;
}) {
  const replayed = replayProviderEventsToTaskState({
    taskId: args.taskId,
    messages: args.session.messagesByTask[args.taskId] ?? [],
    events: args.events,
    provider: args.provider,
    model: args.model,
    turnId: args.turnId,
    nativeSessionReady: args.session.nativeSessionReadyByTask[args.taskId],
    providerSession: args.session.providerSessionByTask[args.taskId],
  });

  const activeTurnMatches = args.session.activeTurnIdsByTask[args.taskId] === replayed.activeTurnId;
  const nativeSessionReadyMatches =
    args.session.nativeSessionReadyByTask[args.taskId] === replayed.nativeSessionReady;
  const providerSessionMatches =
    replayed.providerSession === undefined
    || args.session.providerSessionByTask[args.taskId] === replayed.providerSession;

  if (
    !replayed.changed
    && activeTurnMatches
    && nativeSessionReadyMatches
    && providerSessionMatches
  ) {
    return {
      stateChanged: false,
      snapshotChanged: false,
      session: args.session,
      turnCompleted: replayed.activeTurnId === undefined,
    };
  }

  return {
    stateChanged: true,
    snapshotChanged: replayed.changed || !providerSessionMatches,
    session: {
      ...args.session,
      messagesByTask: replayed.changed
        ? {
            ...args.session.messagesByTask,
            [args.taskId]: replayed.messages,
          }
        : args.session.messagesByTask,
      messageCountByTask: replayed.changed
        ? {
            ...args.session.messageCountByTask,
            [args.taskId]: Math.max(
              replayed.messages.length,
              (args.session.messageCountByTask[args.taskId] ?? (args.session.messagesByTask[args.taskId] ?? []).length)
                + (replayed.messages.length - (args.session.messagesByTask[args.taskId] ?? []).length),
            ),
          }
        : args.session.messageCountByTask,
      activeTurnIdsByTask: activeTurnMatches
        ? args.session.activeTurnIdsByTask
        : {
            ...args.session.activeTurnIdsByTask,
            [args.taskId]: replayed.activeTurnId,
          },
      nativeSessionReadyByTask: nativeSessionReadyMatches
        ? args.session.nativeSessionReadyByTask
        : {
            ...args.session.nativeSessionReadyByTask,
            [args.taskId]: replayed.nativeSessionReady,
          },
      providerSessionByTask: providerSessionMatches
        ? args.session.providerSessionByTask
        : {
            ...args.session.providerSessionByTask,
            [args.taskId]: replayed.providerSession!,
          },
    },
    turnCompleted: replayed.activeTurnId === undefined,
  };
}
