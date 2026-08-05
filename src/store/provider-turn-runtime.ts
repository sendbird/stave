import { getProviderAdapter } from "@/lib/providers";
import type {
  NormalizedProviderEvent,
  ProviderAdapter,
  ProviderId,
  ProviderTurnRequest,
} from "@/lib/providers/provider.types";

export function runProviderTurn(
  args: {
    turnId?: string;
    provider: ProviderId;
    prompt: string;
    conversation?: ProviderTurnRequest["conversation"];
    taskId: string;
    workspaceId?: string;
    cwd?: string;
    runtimeOptions?: ProviderTurnRequest["runtimeOptions"];
    onEvent: (args: { event: NormalizedProviderEvent }) => void;
  },
  dependencies?: {
    runTurn?: ProviderAdapter["runTurn"];
  },
) {
  const runTurn =
    dependencies?.runTurn ??
    getProviderAdapter({ providerId: args.provider }).runTurn;

  void (async () => {
    let emittedDoneEvent = false;
    try {
      for await (const event of runTurn({
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
          type: "error",
          message: `Provider stream failed: ${String(error)}`,
          recoverable: false,
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
  /**
   * Called synchronously the moment an event is delivered over IPC, before the
   * rAF-batched visual flush below. Liveness (the "provider is still streaming"
   * signal that keeps the stall / auto-abort net disarmed) MUST be tracked here
   * rather than inside `flushEvents`: the flush is gated on
   * `requestAnimationFrame`, which the Electron renderer throttles or fully
   * pauses while the window is hidden, minimized, or occluded. If liveness were
   * derived from the flush, a backgrounded window receiving a perfectly healthy
   * stream would stop resetting the wall-clock stall timer and get
   * force-aborted with "provider went silent for too long". Arrival, unlike the
   * flush, is driven by the IPC callback and is not throttled.
   */
  onEventArrived?: (event: NormalizedProviderEvent) => void;
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
    if (
      typeof window !== "undefined" &&
      typeof window.cancelAnimationFrame === "function"
    ) {
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
    if (
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function"
    ) {
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
        // `done` flushes synchronously below, which clears the stall timer, so
        // it needs no separate liveness poke.
        cancelScheduledFlush();
        flushNow();
        return;
      }
      // Reset the stall clock on arrival, independent of the throttleable flush.
      args.onEventArrived?.(event);
      scheduleFlush();
    },
  };
}
