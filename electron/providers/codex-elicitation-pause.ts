import type { CodexElicitationPauseClient } from "./codex-goal-commands";
import { toErrorMessage } from "./codex-app-server-errors";

export function createCodexAppServerElicitationPauseController(args: {
  client: CodexElicitationPauseClient;
  threadId: string;
  debug?: boolean;
}) {
  const pendingRequestIds = new Set<string>();
  let queue = Promise.resolve();

  const enqueue = (operation: () => Promise<void>) => {
    const next = queue.then(operation, operation);
    queue = next.catch(() => {});
    return next;
  };

  const logFailure = (
    phase: "pause" | "resume",
    requestId: string,
    error: unknown,
  ) => {
    console.warn(
      `[provider-runtime] Codex app-server elicitation ${phase} failed`,
      {
        threadId: args.threadId,
        requestId,
        error: toErrorMessage(error),
      },
    );
  };

  const logState = (
    phase: "pause" | "resume",
    requestId: string,
    response: { count?: number; paused?: boolean } | undefined,
  ) => {
    if (!args.debug) {
      return;
    }
    console.debug(`[codex-app-server-runtime] elicitation ${phase} applied`, {
      threadId: args.threadId,
      requestId,
      count: response?.count,
      paused: response?.paused,
    });
  };

  return {
    begin(requestId: string) {
      return enqueue(async () => {
        if (!requestId || pendingRequestIds.has(requestId)) {
          return;
        }
        pendingRequestIds.add(requestId);
        try {
          const response = await args.client.request<{
            count?: number;
            paused?: boolean;
          }>("thread/increment_elicitation", {
            threadId: args.threadId,
          });
          logState("pause", requestId, response);
        } catch (error) {
          pendingRequestIds.delete(requestId);
          logFailure("pause", requestId, error);
        }
      });
    },
    end(requestId: string) {
      return enqueue(async () => {
        if (!requestId || !pendingRequestIds.delete(requestId)) {
          return;
        }
        try {
          const response = await args.client.request<{
            count?: number;
            paused?: boolean;
          }>("thread/decrement_elicitation", {
            threadId: args.threadId,
          });
          logState("resume", requestId, response);
        } catch (error) {
          logFailure("resume", requestId, error);
        }
      });
    },
    endAll() {
      return enqueue(async () => {
        const requestIds = [...pendingRequestIds];
        pendingRequestIds.clear();
        for (const requestId of requestIds) {
          try {
            const response = await args.client.request<{
              count?: number;
              paused?: boolean;
            }>("thread/decrement_elicitation", {
              threadId: args.threadId,
            });
            logState("resume", requestId, response);
          } catch (error) {
            logFailure("resume", requestId, error);
          }
        }
      });
    },
  };
}
