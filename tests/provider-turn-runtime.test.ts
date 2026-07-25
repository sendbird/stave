import { afterEach, describe, expect, mock, test } from "bun:test";
import type { NormalizedProviderEvent } from "@/lib/providers/provider.types";
import { runProviderTurn } from "@/store/provider-turn-runtime";

const runTurn = mock(async function* () {
  throw new Error("connection closed");
});

describe("provider turn runtime", () => {
  afterEach(() => {
    runTurn.mockClear();
  });

  test("normalizes an adapter exception as a terminal provider error", async () => {
    const events: NormalizedProviderEvent[] = [];
    runProviderTurn(
      {
        provider: "codex",
        prompt: "Inspect the failure",
        taskId: "task-1",
        onEvent: ({ event }) => {
          events.push(event);
        },
      },
      { runTurn },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(events).toEqual([
      {
        type: "error",
        message: "Provider stream failed: Error: connection closed",
        recoverable: false,
      },
      { type: "done", stop_reason: "aborted" },
    ]);
  });
});
