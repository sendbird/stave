import { describe, expect, it } from "bun:test";
import { isTrustedLensRenderer } from "../electron/main/ipc/lens-ipc-authorization";

function renderer(overrides?: {
  id?: number;
  destroyed?: boolean;
  processId?: number;
  routingId?: number;
}) {
  return {
    id: overrides?.id ?? 10,
    isDestroyed: () => overrides?.destroyed ?? false,
    mainFrame: {
      processId: overrides?.processId ?? 20,
      routingId: overrides?.routingId ?? 30,
    },
  };
}

describe("Lens annotation IPC authorization", () => {
  it("accepts only the current renderer main frame", () => {
    expect(
      isTrustedLensRenderer(
        {
          sender: { id: 10 },
          senderFrame: { processId: 20, routingId: 30 },
        },
        renderer(),
      ),
    ).toBe(true);
  });

  it("rejects a subframe, another renderer, and a destroyed renderer", () => {
    expect(
      isTrustedLensRenderer(
        {
          sender: { id: 10 },
          senderFrame: { processId: 20, routingId: 31 },
        },
        renderer(),
      ),
    ).toBe(false);
    expect(
      isTrustedLensRenderer(
        {
          sender: { id: 11 },
          senderFrame: { processId: 20, routingId: 30 },
        },
        renderer(),
      ),
    ).toBe(false);
    expect(
      isTrustedLensRenderer(
        {
          sender: { id: 10 },
          senderFrame: { processId: 20, routingId: 30 },
        },
        renderer({ destroyed: true }),
      ),
    ).toBe(false);
  });
});
