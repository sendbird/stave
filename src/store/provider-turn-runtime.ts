import { i18n } from "@/i18n/runtime";
import { getProviderAdapter } from "@/lib/providers";
import { scheduleMacrotask } from "@/lib/schedule-macrotask";
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
    onConsumerError?: (args: {
      error: unknown;
      event: NormalizedProviderEvent;
    }) => void;
  },
) {
  const runTurn =
    dependencies?.runTurn ??
    getProviderAdapter({ providerId: args.provider }).runTurn;
  const onConsumerError =
    dependencies?.onConsumerError ??
    ((failure: { error: unknown; event: NormalizedProviderEvent }) =>
      reportProviderEventConsumerFailure({
        error: failure.error,
        events: [failure.event],
        provider: args.provider,
        taskId: args.taskId,
        turnId: args.turnId,
      }));

  // A throw from `onEvent` is a renderer-side failure (a store reducer or a
  // React subscriber reacting to the store write), not a provider failure.
  // Letting it escape into the `for await` below would end the iteration,
  // which aborts a provider turn that is still healthy and reports it as
  // "Provider stream failed". Report it and keep consuming the stream.
  const deliver = (event: NormalizedProviderEvent) => {
    try {
      args.onEvent({ event });
    } catch (error) {
      onConsumerError({ error, event });
    }
  };

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
        deliver(event);
      }
    } catch (error) {
      deliver({
        type: "error",
        message: i18n.t("notifications:providerTurnRuntime.streamFailed", { detail: String(error) }),
        recoverable: false,
      });
    } finally {
      if (!emittedDoneEvent) {
        // Tag the synthesized done with stop_reason="aborted" so replay can
        // distinguish abnormal terminations from natural completion. The
        // downstream `appendProviderEventToAssistant` done handler interrupts
        // any dangling pending approval/user_input parts so `isTurnActive`
        // clears cleanly — otherwise the chat input stays locked waiting for an
        // orphaned request.
        deliver({ type: "done", stop_reason: "aborted" });
      }
    }
  })();
}

/**
 * Record a renderer-side failure to apply provider events. Logs to the console
 * and to the runtime diagnostics file, because a minified production error
 * carries no component stack and is otherwise lost once the turn moves on.
 */
export function reportProviderEventConsumerFailure(args: {
  error: unknown;
  events: readonly NormalizedProviderEvent[];
  provider: ProviderId;
  taskId: string;
  turnId?: string;
}) {
  console.error(
    "[provider-turn] failed to apply a provider event; the turn keeps streaming",
    args.error,
  );
  const reportRendererIssue =
    typeof window === "undefined"
      ? undefined
      : window.api?.diagnostics?.reportRendererIssue;
  if (!reportRendererIssue) {
    return;
  }
  void reportRendererIssue({
    scope: "provider-turn",
    context: "apply-event",
    message:
      args.error instanceof Error ? args.error.message : String(args.error),
    stack: args.error instanceof Error ? args.error.stack : undefined,
    metadata: {
      provider: args.provider,
      eventTypes: [...new Set(args.events.map((event) => event.type))].join(","),
      taskId: args.taskId,
      turnId: args.turnId ?? "none",
    },
  }).catch(() => undefined);
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
  /**
   * Receives a throw from a deferred (timer or macrotask) flush. A synchronous
   * `done` flush throws to the caller instead.
   */
  onFlushError?: (args: {
    error: unknown;
    events: NormalizedProviderEvent[];
  }) => void;
}) {
  const queuedEvents: NormalizedProviderEvent[] = [];
  let cancelPendingFlush: (() => void) | null = null;
  let pendingFlushIsPrompt = false;

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

  const flushDeferred = () => {
    if (queuedEvents.length === 0) {
      return;
    }
    const events = queuedEvents.splice(0, queuedEvents.length);
    try {
      args.flushEvents(events);
    } catch (error) {
      if (args.onFlushError) {
        args.onFlushError({ error, events });
        return;
      }
      throw error;
    }
  };

  const cancelScheduledFlush = () => {
    cancelPendingFlush?.();
    cancelPendingFlush = null;
    pendingFlushIsPrompt = false;
  };

  const runScheduledFlush = () => {
    cancelPendingFlush = null;
    pendingFlushIsPrompt = false;
    flushDeferred();
  };

  const scheduleFlush = (options: { prompt: boolean }) => {
    if (cancelPendingFlush !== null) {
      if (!options.prompt || pendingFlushIsPrompt) {
        return;
      }
      // Upgrade a pending text-cadence flush to the prompt one.
      cancelScheduledFlush();
    }
    if (options.prompt) {
      // Approval, tool, error, and lifecycle changes drive controls or state
      // transitions, so they flush in the next macrotask instead of waiting for
      // the text cadence. Never synchronously per event: the stream drains
      // events queued during one IPC burst with only microtask gaps, and a
      // store write per event commits React once per event before React's own
      // scheduler task can run. Each of those commits that leaves deferred work
      // behind (any `useEffect` reacting to the stream with a state update)
      // counts toward React's nested-update limit, and the 51st throws
      // "Maximum update depth exceeded" (#185) out of the store write, aborting
      // a healthy turn. One flush per macrotask coalesces the burst into a
      // single commit and queues behind React's scheduler task.
      pendingFlushIsPrompt = true;
      cancelPendingFlush = scheduleMacrotask(runScheduledFlush);
      return;
    }
    // Human-readable streaming does not benefit from one React/store replay
    // per display frame. A 50 ms batch stays below perceptible interaction
    // latency while capping visual updates at 20 Hz and giving adjacent text
    // chunks a chance to merge before they allocate message/part copies.
    const handle = setTimeout(runScheduledFlush, 50);
    cancelPendingFlush = () => clearTimeout(handle);
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
      scheduleFlush({
        prompt: event.type !== "text" && event.type !== "thinking",
      });
    },
  };
}
