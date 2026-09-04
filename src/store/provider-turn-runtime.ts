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
   * time-batched visual flush below. Liveness (the "provider is still streaming"
   * signal that keeps the stall / auto-abort net disarmed) MUST be tracked here
   * rather than inside `flushEvents`: renderer timers can be throttled while the
   * window is hidden, minimized, or occluded. If liveness were derived from the
   * flush, a backgrounded window receiving a perfectly healthy stream could
   * stop resetting the wall-clock stall timer and get force-aborted with
   * "provider went silent for too long". Arrival, unlike the flush, is driven
   * by the IPC callback and is not throttled.
   */
  onEventArrived?: (event: NormalizedProviderEvent) => void;
}) {
  const queuedEvents: NormalizedProviderEvent[] = [];
  let flushHandle: ReturnType<typeof setTimeout> | null = null;

  const queueEvent = (event: NormalizedProviderEvent) => {
    const previous = queuedEvents.at(-1);
    if (
      previous?.type === "text" &&
      event.type === "text" &&
      ((previous.segmentId == null && event.segmentId == null) ||
        previous.segmentId === event.segmentId)
    ) {
      queuedEvents[queuedEvents.length - 1] = {
        ...previous,
        text: `${previous.text}${event.text}`,
      };
      return;
    }
    if (previous?.type === "thinking" && event.type === "thinking") {
      queuedEvents[queuedEvents.length - 1] = {
        ...previous,
        text: `${previous.text}${event.text}`,
        isStreaming: event.isStreaming,
      };
      return;
    }
    queuedEvents.push(event);
  };

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
    clearTimeout(flushHandle);
    flushHandle = null;
  };

  const scheduleFlush = () => {
    if (flushHandle !== null) {
      return;
    }
    // Human-readable streaming does not benefit from one React/store replay
    // per display frame. A 50 ms batch stays below perceptible interaction
    // latency while capping visual updates at 20 Hz and giving adjacent text
    // chunks a chance to merge before they allocate message/part copies.
    flushHandle = setTimeout(() => {
      flushHandle = null;
      flushNow();
    }, 50);
  };

  return {
    handleEvent(event: NormalizedProviderEvent) {
      queueEvent(event);
      if (event.type === "done") {
        // `done` flushes synchronously below, which clears the stall timer, so
        // it needs no separate liveness poke.
        cancelScheduledFlush();
        flushNow();
        return;
      }
      // Reset the stall clock on arrival, independent of the throttleable flush.
      args.onEventArrived?.(event);
      if (event.type !== "text" && event.type !== "thinking") {
        // Approval, tool, error, and lifecycle changes drive controls or state
        // transitions. Flush them immediately, along with any earlier text, so
        // lowering prose cadence never makes the interface feel unresponsive.
        cancelScheduledFlush();
        flushNow();
        return;
      }
      scheduleFlush();
    },
  };
}
