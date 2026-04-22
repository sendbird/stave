import type { ProviderEventSource, ProviderId, ProviderTurnRequest } from "@/lib/providers/provider.types";
import {
  compactProviderTurnRequestForTransport,
  HOST_SERVICE_PROVIDER_REQUEST_RETRY_MAX_BYTES,
} from "@/lib/providers/transport-bounds";

type PushStreamPayload = {
  streamId: string;
  event: unknown;
  sequence?: number;
  done: boolean;
};

const POLLED_STREAM_ACTIVE_DELAY_MS = 80;
const POLLED_STREAM_IDLE_DELAY_MS = 1000;
const PUSH_STREAM_FALLBACK_SILENCE_MS = 15_000;
const PUSH_STREAM_ACK_DELAY_MS = 250;
const STALE_STREAM_CURSOR_MESSAGE = "retained replay window";

type StreamReadResult = {
  ok: boolean;
  events: unknown[];
  cursor: number;
  done: boolean;
  message?: string;
};

function hasAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  if (!value || typeof value !== "object") {
    return false;
  }

  return Symbol.asyncIterator in value;
}

async function* fromArray(args: { items: unknown[] }) {
  for (const item of args.items) {
    yield item;
  }
}

async function* emitStartFailure(args: { message?: string }) {
  const detail = args.message?.trim() || "Provider request could not start.";
  yield {
    type: "system",
    content: detail,
  };
  yield {
    type: "done",
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  return fallback;
}

function isHostServiceProtocolOverflowError(error: unknown) {
  const message = getErrorMessage(error, "");
  return message.includes("protocol message limit")
    || message.includes("protocol line limit")
    || message.includes("protocol overflow");
}

async function invokeProviderRequestWithTransportFallback<TResult>(args: {
  method: "provider.stream-turn" | "provider.start-stream-turn" | "provider.start-push-turn";
  request: ProviderTurnRequest & { providerId: ProviderId };
  invoke: (request: ProviderTurnRequest & { providerId: ProviderId }) => TResult | Promise<TResult>;
}) {
  const primaryRequest = compactProviderTurnRequestForTransport({
    method: args.method,
    request: args.request,
  });

  try {
    return await args.invoke(primaryRequest);
  } catch (error) {
    if (!isHostServiceProtocolOverflowError(error)) {
      throw error;
    }

    const fallbackRequest = compactProviderTurnRequestForTransport({
      method: args.method,
      request: args.request,
      maxBytes: HOST_SERVICE_PROVIDER_REQUEST_RETRY_MAX_BYTES,
    });

    if (JSON.stringify(fallbackRequest) === JSON.stringify(primaryRequest)) {
      throw error;
    }

    return args.invoke(fallbackRequest);
  }
}

function resolveWindowTimerApi() {
  const target = typeof window !== "undefined" ? window : undefined;
  const setTimeoutImpl = target?.setTimeout ?? globalThis.setTimeout;
  const clearTimeoutImpl = target?.clearTimeout ?? globalThis.clearTimeout;
  return {
    setTimeout: setTimeoutImpl.bind(target ?? globalThis),
    clearTimeout: clearTimeoutImpl.bind(target ?? globalThis),
  };
}

async function sleep(ms: number) {
  const timers = resolveWindowTimerApi();
  await new Promise((resolve) => timers.setTimeout(resolve, ms));
}

function isStaleStreamCursorResult(args: {
  page: StreamReadResult;
  cursor: number;
}) {
  return !args.page.ok
    && args.page.cursor > args.cursor
    && (args.page.message?.includes(STALE_STREAM_CURSOR_MESSAGE) ?? false);
}

async function readStreamTurnWithCursorRecovery(args: {
  streamId: string;
  cursor: number;
  readStreamTurn: (args: {
    streamId: string;
    cursor: number;
  }) => Promise<StreamReadResult>;
}) {
  let cursor = args.cursor;
  for (let attempts = 0; attempts < 3; attempts += 1) {
    const page = await args.readStreamTurn({ streamId: args.streamId, cursor });
    if (!isStaleStreamCursorResult({ page, cursor })) {
      return page;
    }
    cursor = page.cursor;
  }
  return args.readStreamTurn({ streamId: args.streamId, cursor });
}

async function* continueFromPolledStream(args: {
  streamId: string;
  cursor: number;
  readStreamTurn: (args: {
    streamId: string;
    cursor: number;
  }) => Promise<{
    ok: boolean;
    events: unknown[];
    cursor: number;
    done: boolean;
    message?: string;
  }>;
}) {
  let cursor = args.cursor;
  for (;;) {
    const page = await readStreamTurnWithCursorRecovery({
      streamId: args.streamId,
      cursor,
      readStreamTurn: args.readStreamTurn,
    });
    if (!page.ok) {
      yield {
        type: "error",
        message: page.message?.trim() || "Provider stream session not found.",
        recoverable: true,
      };
      yield { type: "done" };
      return;
    }
    for (const event of page.events) {
      yield event;
    }
    cursor = page.cursor;
    if (page.done) {
      return;
    }
    await sleep(page.events.length > 0 ? POLLED_STREAM_ACTIVE_DELAY_MS : POLLED_STREAM_IDLE_DELAY_MS);
  }
}

async function* fromPolledStream(args: {
  turnId?: string;
  providerId: ProviderId;
  prompt: string;
  conversation?: ProviderTurnRequest["conversation"];
  taskId?: string;
  workspaceId?: string;
  cwd?: string;
  runtimeOptions?: ProviderTurnRequest["runtimeOptions"];
}) {
  const startStreamTurn = window.api?.provider?.startStreamTurn;
  const readStreamTurn = window.api?.provider?.readStreamTurn;
  if (!startStreamTurn || !readStreamTurn) {
    return;
  }

  let started;
  try {
    started = await invokeProviderRequestWithTransportFallback({
      method: "provider.start-stream-turn",
      request: args,
      invoke: (request) => startStreamTurn(request),
    });
  } catch (error) {
    yield* emitStartFailure({
      message: getErrorMessage(error, "Provider request could not start."),
    });
    return;
  }
  if (!started.ok || !started.streamId) {
    yield* emitStartFailure({ message: started.message });
    return;
  }

  let cursor = 0;
  for (;;) {
    const page = await readStreamTurnWithCursorRecovery({
      streamId: started.streamId,
      cursor,
      readStreamTurn,
    });
    if (!page.ok) {
      yield* emitStartFailure({ message: page.message });
      return;
    }
    for (const event of page.events) {
      yield event;
    }
    cursor = page.cursor;
    if (page.done) {
      return;
    }
    await sleep(POLLED_STREAM_ACTIVE_DELAY_MS);
  }
}

async function* fromPushStream(args: {
  turnId?: string;
  providerId: ProviderId;
  prompt: string;
  conversation?: ProviderTurnRequest["conversation"];
  taskId?: string;
  workspaceId?: string;
  cwd?: string;
  runtimeOptions?: ProviderTurnRequest["runtimeOptions"];
}) {
  const startPushTurn = window.api?.provider?.startPushTurn;
  const subscribeStreamEvents = window.api?.provider?.subscribeStreamEvents;
  const readStreamTurn = window.api?.provider?.readStreamTurn;
  const ackStreamTurn = window.api?.provider?.ackStreamTurn;
  if (!startPushTurn || !subscribeStreamEvents) {
    return;
  }

  const timers = resolveWindowTimerApi();
  const queue: unknown[] = [];
  const pending: PushStreamPayload[] = [];
  const bufferedBySequence = new Map<number, PushStreamPayload>();
  let done = false;
  let targetStreamId: string | null = null;
  let nextSequence = 1;
  let doneSequence: number | null = null;
  let pollCursor = 0;
  let switchedToPolling = false;
  let ackedCursor = 0;
  let targetAckCursor = 0;
  let ackHandle: ReturnType<typeof setTimeout> | null = null;
  let ackInFlight: Promise<void> | null = null;
  let wake: (() => void) | null = null;
  const wakeUp = () => {
    if (!wake) {
      return;
    }
    const resolver = wake;
    wake = null;
    resolver();
  };
  const enqueueEvent = (event: unknown) => {
    queue.push(event);
    pollCursor += 1;
  };

  const clearAckTimer = () => {
    if (!ackHandle) {
      return;
    }
    timers.clearTimeout(ackHandle);
    ackHandle = null;
  };

  const flushAck = (force = false) => {
    if (!ackStreamTurn || !targetStreamId) {
      return Promise.resolve();
    }
    targetAckCursor = Math.max(targetAckCursor, pollCursor);
    if (!force && targetAckCursor <= ackedCursor) {
      return Promise.resolve();
    }
    if (ackInFlight) {
      return ackInFlight;
    }
    const cursorToAck = targetAckCursor;
    if (cursorToAck <= ackedCursor) {
      return Promise.resolve();
    }
    let delivered = false;
    ackInFlight = ackStreamTurn({
      streamId: targetStreamId,
      cursor: cursorToAck,
    })
      .then(() => {
        delivered = true;
        ackedCursor = Math.max(ackedCursor, cursorToAck);
      })
      .catch(() => undefined)
      .finally(() => {
        ackInFlight = null;
        if (delivered && targetAckCursor > ackedCursor) {
          void flushAck(true);
        }
      });
    return ackInFlight;
  };

  const scheduleAck = (force = false) => {
    if (!ackStreamTurn || !targetStreamId) {
      return;
    }
    targetAckCursor = Math.max(targetAckCursor, pollCursor);
    if (force) {
      clearAckTimer();
      void flushAck(true);
      return;
    }
    if (ackHandle) {
      return;
    }
    ackHandle = timers.setTimeout(() => {
      ackHandle = null;
      void flushAck();
    }, PUSH_STREAM_ACK_DELAY_MS);
  };

  const ingestPayload = (payload: PushStreamPayload) => {
    const sequence = payload.sequence;
    if (typeof sequence !== "number" || !Number.isFinite(sequence)) {
      enqueueEvent(payload.event);
      if (payload.done) {
        done = true;
      }
      scheduleAck(payload.done);
      wakeUp();
      return;
    }

    if (sequence < nextSequence || bufferedBySequence.has(sequence)) {
      return;
    }

    bufferedBySequence.set(sequence, payload);
    if (payload.done) {
      doneSequence = sequence;
    }

    while (bufferedBySequence.has(nextSequence)) {
      const nextPayload = bufferedBySequence.get(nextSequence)!;
      bufferedBySequence.delete(nextSequence);
      enqueueEvent(nextPayload.event);
      nextSequence += 1;
    }

    if (doneSequence !== null && nextSequence > doneSequence) {
      done = true;
    }
    scheduleAck(done);
    wakeUp();
  };

  const unsubscribe = subscribeStreamEvents((payload) => {
    if (!targetStreamId) {
      pending.push(payload);
      return;
    }
    if (payload.streamId !== targetStreamId) {
      return;
    }
    ingestPayload(payload);
  });

  try {
    let started;
    try {
      started = await invokeProviderRequestWithTransportFallback({
        method: "provider.start-push-turn",
        request: args,
        invoke: (request) => startPushTurn(request),
      });
    } catch (error) {
      yield* emitStartFailure({
        message: getErrorMessage(error, "Provider request could not start."),
      });
      return;
    }
    if (!started.ok || !started.streamId) {
      yield* emitStartFailure({ message: started.message });
      return;
    }
    targetStreamId = started.streamId;

    for (const item of pending) {
      if (item.streamId !== targetStreamId) {
        continue;
      }
      ingestPayload(item);
    }
    pending.length = 0;
    wakeUp();

    while (!done || queue.length > 0) {
      if (queue.length === 0) {
        const outcome = await new Promise<"push" | "poll">((resolve) => {
          let settled = false;
          const complete = (value: "push" | "poll") => {
            if (settled) {
              return;
            }
            settled = true;
            if (wake === onWake) {
              wake = null;
            }
            timers.clearTimeout(timeoutHandle);
            resolve(value);
          };
          const onWake = () => {
            complete("push");
          };
          const timeoutHandle = timers.setTimeout(() => {
            complete("poll");
          }, PUSH_STREAM_FALLBACK_SILENCE_MS);
          wake = onWake;
        });
        if (outcome === "poll" && targetStreamId && readStreamTurn) {
          switchedToPolling = true;
          unsubscribe();
          yield* continueFromPolledStream({
            streamId: targetStreamId,
            cursor: pollCursor,
            readStreamTurn,
          });
          return;
        }
        continue;
      }
      const next = queue.shift();
      if (typeof next !== "undefined") {
        yield next;
      }
    }
  } finally {
    clearAckTimer();
    if (!switchedToPolling) {
      await flushAck(true);
    }
    if (!switchedToPolling && done && targetStreamId && readStreamTurn) {
      await readStreamTurn({
        streamId: targetStreamId,
        cursor: pollCursor,
      }).catch(() => undefined);
    }
    unsubscribe();
  }
}

async function resolveBridgeStream(args: {
  turnId?: string;
  providerId: ProviderId;
  prompt: string;
  conversation?: ProviderTurnRequest["conversation"];
  taskId?: string;
  workspaceId?: string;
  cwd?: string;
  runtimeOptions?: ProviderTurnRequest["runtimeOptions"];
}): Promise<unknown[] | AsyncIterable<unknown> | null> {
  if (args.runtimeOptions?.chatStreamingEnabled === false) {
    const streamTurn = window.api?.provider?.streamTurn;
    if (!streamTurn) {
      return null;
    }
    try {
      const result = await invokeProviderRequestWithTransportFallback({
        method: "provider.stream-turn",
        request: args,
        invoke: (request) => streamTurn(request),
      });

      if (Array.isArray(result) || hasAsyncIterable(result)) {
        return result;
      }
    } catch (error) {
      return [
        {
          type: "system",
          content: getErrorMessage(error, "Provider request could not start."),
        },
        {
          type: "done",
        },
      ];
    }

    return null;
  }

  const startPushTurn = window.api?.provider?.startPushTurn;
  const subscribeStreamEvents = window.api?.provider?.subscribeStreamEvents;
  if (startPushTurn && subscribeStreamEvents) {
    return fromPushStream({
      turnId: args.turnId,
      providerId: args.providerId,
      prompt: args.prompt,
      conversation: args.conversation,
      taskId: args.taskId,
      workspaceId: args.workspaceId,
      cwd: args.cwd,
      runtimeOptions: args.runtimeOptions,
    });
  }

  const startStreamTurn = window.api?.provider?.startStreamTurn;
  const readStreamTurn = window.api?.provider?.readStreamTurn;
  if (startStreamTurn && readStreamTurn) {
    return fromPolledStream({
      turnId: args.turnId,
      providerId: args.providerId,
      prompt: args.prompt,
      conversation: args.conversation,
      taskId: args.taskId,
      workspaceId: args.workspaceId,
      cwd: args.cwd,
      runtimeOptions: args.runtimeOptions,
    });
  }

  const streamTurn = window.api?.provider?.streamTurn;
  if (!streamTurn) {
    return null;
  }

  let result;
  try {
    result = await invokeProviderRequestWithTransportFallback({
      method: "provider.stream-turn",
      request: args,
      invoke: (request) => streamTurn({ ...request }),
    });
  } catch (error) {
    return [
      {
        type: "system",
        content: getErrorMessage(error, "Provider request could not start."),
      },
      {
        type: "done",
      },
    ];
  }

  if (Array.isArray(result)) {
    return result;
  }

  if (hasAsyncIterable(result)) {
    return result;
  }

  return null;
}

export function hasBridgeProviderSource() {
  if (typeof window === "undefined") {
    return false;
  }
  return typeof window.api?.provider?.startPushTurn === "function"
    || typeof window.api?.provider?.startStreamTurn === "function"
    || typeof window.api?.provider?.streamTurn === "function";
}

export function createBridgeProviderSource<TRawEvent>(args: { providerId: ProviderId }): ProviderEventSource<TRawEvent> {
  const { providerId } = args;

  return {
    async *streamTurn(turnArgs: ProviderTurnRequest) {
      const source = await resolveBridgeStream({
        turnId: turnArgs.turnId,
        providerId,
        prompt: turnArgs.prompt,
        conversation: turnArgs.conversation,
        taskId: turnArgs.taskId,
        workspaceId: turnArgs.workspaceId,
        cwd: turnArgs.cwd,
        runtimeOptions: turnArgs.runtimeOptions,
      });

      if (!source) {
        return;
      }

      if (Array.isArray(source)) {
        for await (const item of fromArray({ items: source })) {
          yield item as TRawEvent;
        }
        return;
      }

      for await (const item of source) {
        yield item as TRawEvent;
      }
    },
  };
}
