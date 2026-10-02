export interface CliSessionLaunchScope {
  isCurrent: () => boolean;
  rememberSession: (sessionId: string) => void;
}

/** Serializes each tab's launches and explicit resets, including pending IPC. */
export function createCliSessionLaunchQueue() {
  const tabs = new Map<
    string,
    {
      generation: number;
      pending: Promise<void>;
      sessionId?: string;
      resetError?: unknown;
    }
  >();

  function stateFor(tabKey: string) {
    let state = tabs.get(tabKey);
    if (!state) {
      state = { generation: 0, pending: Promise.resolve() };
      tabs.set(tabKey, state);
    }
    return state;
  }

  return {
    run(tabKey: string, launch: (scope: CliSessionLaunchScope) => Promise<void>) {
      const state = stateFor(tabKey);
      const generation = state.generation;
      const isCurrent = () => state.generation === generation;
      const result = state.pending.then(async () => {
        if (!isCurrent()) return;
        if (state.resetError) throw state.resetError;
        await launch({
          isCurrent,
          rememberSession: (sessionId) => {
            state.sessionId = sessionId;
          },
        });
      });
      state.pending = result.catch(() => {});
      return result;
    },

    reset(tabKey: string, close: (sessionId?: string) => Promise<void>) {
      const state = stateFor(tabKey);
      // Invalidate immediately, before React cleans up the old effect. The old
      // launch may finish, but must not attach or persist its conversation id.
      state.generation += 1;
      const result = state.pending.then(async () => {
        try {
          await close(state.sessionId);
          state.sessionId = undefined;
          state.resetError = undefined;
        } catch (error) {
          // A failed close must not allow a new account to adopt the old slot.
          state.resetError = error;
          throw error;
        }
      });
      state.pending = result.catch(() => {});
      return result;
    },
  };
}

export async function closeCliSessionsForRestart(args: {
  sessionIds: (string | undefined | null)[];
  slotKey?: string | null;
  terminal: NonNullable<Window["api"]>["terminal"];
}) {
  const sessionIds = new Set(
    args.sessionIds.filter((id): id is string => Boolean(id)),
  );
  if (args.slotKey && args.terminal?.getSlotState) {
    const slot = await args.terminal.getSlotState({ slotKey: args.slotKey });
    if (slot.sessionId) sessionIds.add(slot.sessionId);
  }
  for (const sessionId of sessionIds) {
    const result = await args.terminal?.closeSession?.({ sessionId });
    // An exited session may already have been removed by the host.
    if (!result?.ok && result?.stderr !== "Terminal session not found.") {
      throw new Error(
        result?.stderr || "Failed to end the previous CLI session. Try Restart again.",
      );
    }
  }
}
