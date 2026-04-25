import { getProviderAdapter } from "@/lib/providers";
import type { NormalizedProviderEvent, ProviderId, ProviderTurnRequest } from "@/lib/providers/provider.types";

export function runProviderTurn(args: {
  turnId?: string;
  provider: ProviderId;
  prompt: string;
  conversation?: ProviderTurnRequest["conversation"];
  taskId: string;
  workspaceId?: string;
  cwd?: string;
  runtimeOptions?: ProviderTurnRequest["runtimeOptions"];
  onEvent: (args: { event: NormalizedProviderEvent }) => void;
}) {
  const adapter = getProviderAdapter({ providerId: args.provider });

  void (async () => {
    let emittedDoneEvent = false;
    try {
      for await (const event of adapter.runTurn({
        turnId: args.turnId,
        prompt: args.prompt,
        conversation: args.conversation,
        taskId: args.taskId,
        workspaceId: args.workspaceId,
        cwd: args.cwd,
        runtimeOptions: args.runtimeOptions,
      })) {
        if (event.type === "done") {
          emittedDoneEvent = true;
        }
        args.onEvent({ event });
      }
    } catch (error) {
      args.onEvent({
        event: {
          type: "system",
          content: `Provider stream failed: ${String(error)}`,
        },
      });
    } finally {
      if (!emittedDoneEvent) {
        // Tag the synthesized done with stop_reason="aborted" so replay can
        // distinguish abnormal terminations from natural completion. The
        // downstream `appendProviderEventToAssistant` done handler interrupts
        // any dangling pending approval/user_input parts so `isTurnActive`
        // clears cleanly — otherwise the PlanViewer's Approve/Revise controls
        // and the chat input stay locked waiting for an orphaned request.
        args.onEvent({
          event: { type: "done", stop_reason: "aborted" },
        });
      }
    }
  })();
}

export function createProviderTurnEventController(args: {
  flushEvents: (events: NormalizedProviderEvent[]) => void;
}) {
  const queuedEvents: NormalizedProviderEvent[] = [];
  let flushHandle: number | null = null;

  const flushNow = () => {
    if (queuedEvents.length === 0) {
      return;
    }
    args.flushEvents(queuedEvents.splice(0, queuedEvents.length));
  };

  const cancelScheduledFlush = () => {
    if (flushHandle === null) {
      return;
    }
    if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(flushHandle);
    } else {
      window.clearTimeout(flushHandle);
    }
    flushHandle = null;
  };

  const scheduleFlush = () => {
    if (flushHandle !== null) {
      return;
    }
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      flushHandle = window.requestAnimationFrame(() => {
        flushHandle = null;
        flushNow();
      });
      return;
    }
    flushHandle = window.setTimeout(() => {
      flushHandle = null;
      flushNow();
    }, 16);
  };

  return {
    handleEvent(event: NormalizedProviderEvent) {
      queuedEvents.push(event);
      if (event.type === "done") {
        cancelScheduledFlush();
        flushNow();
        return;
      }
      scheduleFlush();
    },
  };
}
