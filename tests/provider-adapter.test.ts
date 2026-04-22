import { describe, expect, test } from "bun:test";
import { createProviderAdapter } from "@/lib/providers/adapter.factory";

describe("createProviderAdapter", () => {
  test("maps raw events through normalizer", async () => {
    const adapter = createProviderAdapter({
      id: "claude-code",
      source: {
        async *streamTurn() {
          yield { kind: "x" };
          yield { kind: "done" };
        },
      },
      normalizer: {
        normalize: ({ event }) => {
          if (event.kind === "done") {
            return { type: "done" as const };
          }
          return { type: "text" as const, text: "mapped" };
        },
      },
    });

    const events = [] as Array<{ type: string }>;
    for await (const event of adapter.runTurn({ prompt: "hello" })) {
      events.push(event as { type: string });
    }

    expect(events.map((event) => event.type)).toEqual(["text", "done"]);
  });
});
