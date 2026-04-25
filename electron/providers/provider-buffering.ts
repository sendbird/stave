import type { BridgeEvent } from "./types";
import {
  byteLengthUtf8,
  takeUtf8PrefixByBytes,
  takeUtf8SuffixByBytes,
  truncateUtf8Middle,
} from "../shared/bounded-text";

export function measureBridgeEventBytes(event: BridgeEvent) {
  return byteLengthUtf8(JSON.stringify(event));
}

export function appendBoundedText(args: {
  current: string;
  chunk: string;
  maxBytes: number;
  keep: "prefix" | "suffix";
}) {
  const combined = `${args.current}${args.chunk}`;
  if (byteLengthUtf8(combined) <= args.maxBytes) {
    return combined;
  }
  if (args.keep === "prefix") {
    return takeUtf8PrefixByBytes({
      value: combined,
      maxBytes: args.maxBytes,
    }).prefix;
  }
  return takeUtf8SuffixByBytes({
    value: combined,
    maxBytes: args.maxBytes,
  }).suffix;
}

export function truncateBufferedText(args: {
  value: string;
  maxBytes: number;
}) {
  return truncateUtf8Middle({
    value: args.value,
    maxBytes: args.maxBytes,
  });
}

export function shouldReplaceBufferedBridgeEvent(args: {
  previous?: BridgeEvent;
  next: BridgeEvent;
}) {
  const previous = args.previous;
  const next = args.next;
  if (!previous) {
    return false;
  }
  if (
    next.type === "tool_result" &&
    next.isPartial &&
    previous.type === "tool_result" &&
    previous.isPartial &&
    previous.tool_use_id === next.tool_use_id
  ) {
    return true;
  }
  if (next.type === "plan_ready" && previous.type === "plan_ready") {
    return (previous.sourceSegmentId ?? "") === (next.sourceSegmentId ?? "");
  }
  return false;
}

export function appendBoundedBridgeEvent(args: {
  events: BridgeEvent[];
  next: BridgeEvent;
  retainedBytes: number;
  maxBytes: number;
}) {
  let retainedBytes = args.retainedBytes;
  const previous = args.events.at(-1);
  if (shouldReplaceBufferedBridgeEvent({ previous, next: args.next })) {
    retainedBytes -= previous ? measureBridgeEventBytes(previous) : 0;
    args.events[args.events.length - 1] = args.next;
    retainedBytes += measureBridgeEventBytes(args.next);
  } else {
    args.events.push(args.next);
    retainedBytes += measureBridgeEventBytes(args.next);
  }

  let droppedCount = 0;
  while (retainedBytes > args.maxBytes && args.events.length > 0) {
    const removed = args.events.shift();
    if (!removed) {
      break;
    }
    retainedBytes -= measureBridgeEventBytes(removed);
    droppedCount += 1;
  }

  return {
    retainedBytes,
    droppedCount,
  };
}

export function dropBufferedBridgeEvents(args: {
  events: BridgeEvent[];
  retainedBytes: number;
  dropCount: number;
}) {
  let retainedBytes = args.retainedBytes;
  if (args.dropCount <= 0) {
    return retainedBytes;
  }
  const removed = args.events.splice(0, args.dropCount);
  for (const event of removed) {
    retainedBytes -= measureBridgeEventBytes(event);
  }
  return retainedBytes;
}

function cloneBridgeEvent(event: BridgeEvent): BridgeEvent {
  return JSON.parse(JSON.stringify(event)) as BridgeEvent;
}

function getBridgeEventStringAccessors(event: BridgeEvent) {
  switch (event.type) {
    case "thinking":
    case "text":
      return [
        {
          get: () => event.text,
          set: (value: string) => {
            event.text = value;
          },
        },
      ];
    case "prompt_suggestions":
      return event.suggestions.map((_, index) => ({
        get: () => event.suggestions[index] ?? "",
        set: (value: string) => {
          event.suggestions[index] = value;
        },
      }));
    case "tool": {
      const accessors = [
        {
          get: () => event.input,
          set: (value: string) => {
            event.input = value;
          },
        },
      ];
      if (typeof event.output === "string") {
        accessors.push({
          get: () => event.output ?? "",
          set: (value: string) => {
            event.output = value;
          },
        });
      }
      return accessors;
    }
    case "tool_result":
      return [
        {
          get: () => event.output,
          set: (value: string) => {
            event.output = value;
          },
        },
      ];
    case "diff":
      return [
        {
          get: () => event.oldContent,
          set: (value: string) => {
            event.oldContent = value;
          },
        },
        {
          get: () => event.newContent,
          set: (value: string) => {
            event.newContent = value;
          },
        },
      ];
    case "approval":
      return [
        {
          get: () => event.description,
          set: (value: string) => {
            event.description = value;
          },
        },
      ];
    case "user_input":
      return [
        {
          get: () => event.toolName,
          set: (value: string) => {
            event.toolName = value;
          },
        },
        ...event.questions.flatMap((question, questionIndex) => {
          const questionAccessors = [
            {
              get: () => event.questions[questionIndex]?.header ?? "",
              set: (value: string) => {
                if (event.questions[questionIndex]) {
                  event.questions[questionIndex].header = value;
                }
              },
            },
            {
              get: () => event.questions[questionIndex]?.question ?? "",
              set: (value: string) => {
                if (event.questions[questionIndex]) {
                  event.questions[questionIndex].question = value;
                }
              },
            },
          ];
          const optionAccessors = (question.options ?? []).flatMap(
            (_, optionIndex) => [
              {
                get: () =>
                  event.questions[questionIndex]?.options[optionIndex]?.label ??
                  "",
                set: (value: string) => {
                  const option =
                    event.questions[questionIndex]?.options[optionIndex];
                  if (option) {
                    option.label = value;
                  }
                },
              },
              {
                get: () =>
                  event.questions[questionIndex]?.options[optionIndex]
                    ?.description ?? "",
                set: (value: string) => {
                  const option =
                    event.questions[questionIndex]?.options[optionIndex];
                  if (option) {
                    option.description = value;
                  }
                },
              },
            ],
          );
          return [...questionAccessors, ...optionAccessors];
        }),
      ];
    case "plan_ready":
      return [
        {
          get: () => event.planText,
          set: (value: string) => {
            event.planText = value;
          },
        },
      ];
    case "system":
      return [
        {
          get: () => event.content,
          set: (value: string) => {
            event.content = value;
          },
        },
      ];
    case "subagent_progress":
      return [
        {
          get: () => event.content,
          set: (value: string) => {
            event.content = value;
          },
        },
      ];
    case "stave:execution_processing":
      return [
        {
          get: () => event.reason,
          set: (value: string) => {
            event.reason = value;
          },
        },
      ];
    case "stave:orchestration_processing":
      return event.subtasks.flatMap((_, index) => [
        {
          get: () => event.subtasks[index]?.title ?? "",
          set: (value: string) => {
            const subtask = event.subtasks[index];
            if (subtask) {
              subtask.title = value;
            }
          },
        },
        {
          get: () => event.subtasks[index]?.model ?? "",
          set: (value: string) => {
            const subtask = event.subtasks[index];
            if (subtask) {
              subtask.model = value;
            }
          },
        },
      ]);
    case "stave:subtask_started":
      return [
        {
          get: () => event.title,
          set: (value: string) => {
            event.title = value;
          },
        },
        {
          get: () => event.model,
          set: (value: string) => {
            event.model = value;
          },
        },
      ];
    case "error":
      return [
        {
          get: () => event.message,
          set: (value: string) => {
            event.message = value;
          },
        },
      ];
    default:
      return [];
  }
}

function truncateBridgeEventToFit(args: {
  event: BridgeEvent;
  maxBytes: number;
}) {
  if (args.maxBytes <= 0) {
    return null;
  }
  if (measureBridgeEventBytes(args.event) <= args.maxBytes) {
    return args.event;
  }

  const candidate = cloneBridgeEvent(args.event);
  const accessors = getBridgeEventStringAccessors(candidate);
  if (accessors.length === 0) {
    return null;
  }

  let previousBytes = measureBridgeEventBytes(candidate);
  while (previousBytes > args.maxBytes) {
    const nextAccessor = accessors
      .map((accessor) => ({
        accessor,
        bytes: byteLengthUtf8(accessor.get()),
      }))
      .sort((a, b) => b.bytes - a.bytes)[0];

    if (!nextAccessor || nextAccessor.bytes <= 0) {
      return null;
    }

    const overflowBytes = measureBridgeEventBytes(candidate) - args.maxBytes;
    const nextMaxBytes = Math.max(0, nextAccessor.bytes - overflowBytes - 32);
    const nextValue = truncateUtf8Middle({
      value: nextAccessor.accessor.get(),
      maxBytes: nextMaxBytes,
    });

    if (nextValue === nextAccessor.accessor.get()) {
      nextAccessor.accessor.set("");
    } else {
      nextAccessor.accessor.set(nextValue);
    }

    const nextBytes = measureBridgeEventBytes(candidate);
    if (nextBytes >= previousBytes) {
      return null;
    }
    previousBytes = nextBytes;
  }

  return candidate;
}

export function createBoundedBridgeEventCollector(args: {
  maxBytes: number;
  reserveTailBytes?: number;
}) {
  const events: BridgeEvent[] = [];
  let retainedBytes = 0;
  let overflowed = false;
  let truncatedEventCount = 0;
  const appendEvent = (event: BridgeEvent, maxBytes: number) => {
    const previous = events.at(-1);
    const shouldReplace = shouldReplaceBufferedBridgeEvent({
      previous,
      next: event,
    });
    const baseRetainedBytes = shouldReplace
      ? retainedBytes - (previous ? measureBridgeEventBytes(previous) : 0)
      : retainedBytes;
    const availableBytes = maxBytes - baseRetainedBytes;

    if (availableBytes <= 0) {
      return false;
    }

    const fittedEvent = truncateBridgeEventToFit({
      event,
      maxBytes: availableBytes,
    });
    if (!fittedEvent) {
      return false;
    }

    if (measureBridgeEventBytes(fittedEvent) < measureBridgeEventBytes(event)) {
      truncatedEventCount += 1;
    }

    if (shouldReplace) {
      events[events.length - 1] = fittedEvent;
      retainedBytes = baseRetainedBytes + measureBridgeEventBytes(fittedEvent);
      return true;
    }

    events.push(fittedEvent);
    retainedBytes = baseRetainedBytes + measureBridgeEventBytes(fittedEvent);
    return true;
  };

  const reserveTailBytes = Math.max(0, args.reserveTailBytes ?? 0);
  const append = (event: BridgeEvent) => {
    if (overflowed) {
      return false;
    }
    const appended = appendEvent(
      event,
      Math.max(0, args.maxBytes - reserveTailBytes),
    );
    if (!appended) {
      overflowed = true;
    }
    return appended;
  };

  return {
    events,
    append,
    appendMany(nextEvents: BridgeEvent[]) {
      for (const nextEvent of nextEvents) {
        if (!append(nextEvent)) {
          break;
        }
      }
    },
    appendTail(event: BridgeEvent) {
      return appendEvent(event, args.maxBytes);
    },
    get retainedBytes() {
      return retainedBytes;
    },
    get overflowed() {
      return overflowed;
    },
    get truncatedEventCount() {
      return truncatedEventCount;
    },
  };
}
