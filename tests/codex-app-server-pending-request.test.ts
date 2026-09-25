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
    const controller = new AbortController();
    let rejectionCount = 0;
    const rejection = new Promise<Error>((resolve) => {
      registerPendingCodexAppServerResponse({
        pendingResponses,
        requestId: 1,
        method: "turn/steer",
        timeoutMs: 5,
        signal: controller.signal,
        resolve: () => {},
        reject: (error) => {
          rejectionCount += 1;
          resolve(error as Error);
        },
      });
    });

    await expect(rejection).resolves.toThrow("turn/steer timed out");
    controller.abort();
    expect(rejectionCount).toBe(1);
    expect(pendingResponses.size).toBe(0);
  });

  test("aborting a pending request removes and rejects it", async () => {
    const pendingResponses = new Map<
      number | string,
      PendingCodexAppServerResponse
    >();
    const controller = new AbortController();
    const rejection = new Promise<Error>((resolve) => {
      expect(
        registerPendingCodexAppServerResponse({
          pendingResponses,
          requestId: "pending-turn-start",
          method: "turn/start",
          signal: controller.signal,
          resolve: () => {},
          reject: (error) => resolve(error as Error),
        }),
      ).toBe(true);
    });

    controller.abort();
    await expect(rejection).resolves.toThrow("turn/start was canceled");
    expect(pendingResponses.size).toBe(0);
  });

  test("an already-aborted signal never registers a request", () => {
    const pendingResponses = new Map<
      number | string,
      PendingCodexAppServerResponse
    >();
    const controller = new AbortController();
    controller.abort();
    let rejected = false;

    expect(
      registerPendingCodexAppServerResponse({
        pendingResponses,
        requestId: "aborted-turn-start",
        method: "turn/start",
        signal: controller.signal,
        resolve: () => {},
        reject: () => {
          rejected = true;
        },
      }),
    ).toBe(false);
    expect(pendingResponses.size).toBe(0);
    expect(rejected).toBe(false);
  });

  test("taking a response clears its deadline", async () => {
    const pendingResponses = new Map<
      number | string,
      PendingCodexAppServerResponse
    >();
    const controller = new AbortController();
    let resolved = false;
    let rejected = false;
    registerPendingCodexAppServerResponse({
      pendingResponses,
      requestId: "request-2",
      method: "turn/steer",
      timeoutMs: 5,
      signal: controller.signal,
      resolve: () => {
        resolved = true;
      },
      reject: () => {
        rejected = true;
      },
    });

    const pending = takePendingCodexAppServerResponse({
      pendingResponses,
      requestId: "request-2",
    });
    expect(pending).toBeDefined();
    pending?.resolve("response");
    controller.abort();
    await Bun.sleep(10);
    expect(resolved).toBe(true);
    expect(rejected).toBe(false);
  });

  test("rejects and clears every pending response on transport teardown", () => {
    const pendingResponses = new Map<
      number | string,
      PendingCodexAppServerResponse
    >();
    const controllers = [new AbortController(), new AbortController()];
    const rejected: string[] = [];
    for (const requestId of [1, 2]) {
      registerPendingCodexAppServerResponse({
        pendingResponses,
        requestId,
        method: "turn/steer",
        signal: controllers[requestId - 1]?.signal,
        resolve: () => {},
        reject: (error) => rejected.push((error as Error).message),
      });
    }

    rejectAllPendingCodexAppServerResponses({
      pendingResponses,
      error: new Error("transport closed"),
    });

    controllers.forEach((controller) => controller.abort());

    expect(rejected).toEqual(["transport closed", "transport closed"]);
    expect(pendingResponses.size).toBe(0);
  });
});
