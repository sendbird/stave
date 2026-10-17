import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { createBridgeProviderAdapter, getProviderAdapter } from "@/lib/providers";

const originalWindow = globalThis.window;

afterEach(() => {
  (globalThis as { window: unknown }).window = originalWindow;
});

async function collect(adapter: ReturnType<typeof getProviderAdapter>) {
  const events = [] as Array<{ type: string }>;
  for await (const event of adapter.runTurn({ prompt: "hello" })) {
    events.push(event as { type: string });
  }
  return events;
}

describe("createBridgeProviderAdapter", () => {
  test("yields valid normalized events and drops invalid ones", async () => {
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});
    try {
      const adapter = createBridgeProviderAdapter({
        providerId: "claude-code",
        source: {
          async *streamTurn() {
            yield { type: "text", text: "kept" };
            yield { type: "not-a-provider-event" };
            yield { type: "done" };
          },
        },
      });

      expect(adapter.id).toBe("claude-code");
      expect(await collect(adapter)).toEqual([
        { type: "text", text: "kept" },
        { type: "done" },
      ] as Array<{ type: string }>);
      expect(errorSpy).toHaveBeenCalledTimes(1);
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe("getProviderAdapter", () => {
  test("explains the missing bridge and finishes the turn when no bridge is exposed", async () => {
    (globalThis as { window: unknown }).window = { api: {} } as unknown;
    const adapter = getProviderAdapter({ providerId: "codex" });

    const events = await collect(adapter);
    expect(adapter.id).toBe("codex");
    expect(events.map((event) => event.type)).toEqual(["system", "done"]);
  });
});
