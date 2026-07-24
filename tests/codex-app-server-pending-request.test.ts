import { describe, expect, test } from "bun:test";
import {
  registerPendingCodexAppServerResponse,
  rejectAllPendingCodexAppServerResponses,
  takePendingCodexAppServerResponse,
  type PendingCodexAppServerResponse,
} from "../electron/providers/codex-app-server-pending-request";

describe("Codex App Server pending requests", () => {
  test("rejects and removes a request after its deadline", async () => {
    const pendingResponses = new Map<
      number | string,
      PendingCodexAppServerResponse
    >();
    const rejection = new Promise<Error>((resolve) => {
      registerPendingCodexAppServerResponse({
        pendingResponses,
        requestId: 1,
        method: "turn/steer",
        timeoutMs: 5,
        resolve: () => {},
        reject: (error) => resolve(error as Error),
      });
    });

    await expect(rejection).resolves.toThrow("turn/steer timed out");
    expect(pendingResponses.size).toBe(0);
  });

  test("taking a response clears its deadline", async () => {
    const pendingResponses = new Map<
      number | string,
      PendingCodexAppServerResponse
    >();
    let rejected = false;
    registerPendingCodexAppServerResponse({
      pendingResponses,
      requestId: "request-2",
      method: "turn/steer",
      timeoutMs: 5,
      resolve: () => {},
      reject: () => {
        rejected = true;
      },
    });

    expect(
      takePendingCodexAppServerResponse({
        pendingResponses,
        requestId: "request-2",
      }),
    ).toBeDefined();
    await Bun.sleep(10);
    expect(rejected).toBe(false);
  });

  test("rejects and clears every pending response on transport teardown", () => {
    const pendingResponses = new Map<
      number | string,
      PendingCodexAppServerResponse
    >();
    const rejected: string[] = [];
    for (const requestId of [1, 2]) {
      registerPendingCodexAppServerResponse({
        pendingResponses,
        requestId,
        method: "turn/steer",
        resolve: () => {},
        reject: (error) => rejected.push((error as Error).message),
      });
    }

    rejectAllPendingCodexAppServerResponses({
      pendingResponses,
      error: new Error("transport closed"),
    });

    expect(rejected).toEqual(["transport closed", "transport closed"]);
    expect(pendingResponses.size).toBe(0);
  });
});
