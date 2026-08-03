import { afterEach, describe, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  LensConsoleEntryDetailArgsSchema,
  LensConsoleObjectPropertiesArgsSchema,
  LensDiagnosticsCaptureArgsSchema,
  LensNetworkBodyArgsSchema,
  LensNetworkEntryDetailArgsSchema,
} from "../electron/main/ipc/schemas";
import type {
  BrowserConsoleEntry,
  BrowserNetworkEntry,
} from "../src/lib/lens/lens.types";

type CdpCommandResult =
  | Record<string, unknown>
  | Promise<Record<string, unknown>>
  | ((
      params?: Record<string, unknown>,
    ) => Record<string, unknown> | Promise<Record<string, unknown>>);

class FakeDebugger extends EventEmitter {
  attached = false;
  readonly commands: Array<{
    method: string;
    params?: Record<string, unknown>;
  }> = [];
  readonly results = new Map<string, CdpCommandResult>();

  isAttached() {
    return this.attached;
  }

  attach() {
    this.attached = true;
  }

  detach() {
    this.attached = false;
  }

  async sendCommand(method: string, params?: Record<string, unknown>) {
    this.commands.push({ method, params });
    const result = this.results.get(method);
    return typeof result === "function" ? result(params) : (result ?? {});
  }

  emitMessage(method: string, params: Record<string, unknown>) {
    this.emit("message", {}, method, params);
  }
}

class FakeWebContents extends EventEmitter {
  readonly debugger = new FakeDebugger();

  constructor(readonly id: number) {
    super();
  }

  isDestroyed() {
    return false;
  }
}

const fakeWebContents = new Map<number, FakeWebContents>();

mock.module("electron", () => ({
  webContents: {
    fromId: (id: number) => fakeWebContents.get(id) ?? null,
  },
}));

const diagnostics =
  await import("../electron/main/browser/browser-cdp-diagnostics");

let nextWebContentsId = 20_000;
const usedWebContentsIds: number[] = [];

function createHarness() {
  const webContentsId = nextWebContentsId++;
  const webContents = new FakeWebContents(webContentsId);
  fakeWebContents.set(webContentsId, webContents);
  usedWebContentsIds.push(webContentsId);

  const consoleEntries: BrowserConsoleEntry[] = [];
  const networkEntries: BrowserNetworkEntry[] = [];

  return {
    webContentsId,
    webContents,
    consoleEntries,
    networkEntries,
    async start(
      url = "https://app.example.test/dashboard",
      acceptConsoleEntry?: () => {
        accepted: boolean;
        droppedCount: number;
      },
      onConsoleEntry: (entry: BrowserConsoleEntry) => void = (entry) =>
        consoleEntries.push(entry),
    ) {
      return diagnostics.startLensCdpDiagnostics({
        webContentsId,
        workspaceId: "workspace-fixture",
        lensSessionId: "lens-fixture",
        url,
        acceptConsoleEntry,
        onConsoleEntry,
        onNetworkEntry: (entry) => networkEntries.push(entry),
      });
    },
  };
}

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for Lens CDP diagnostics");
}

afterEach(() => {
  for (const webContentsId of usedWebContentsIds.splice(0)) {
    diagnostics.stopLensCdpDiagnostics(webContentsId, true);
    fakeWebContents.delete(webContentsId);
  }
});

describe("Lens CDP diagnostics", () => {
  test("clears diagnostics when the owned WebContents is destroyed unexpectedly", async () => {
    const harness = createHarness();
    await harness.start();

    expect(
      diagnostics.getLensCdpDiagnosticsState(harness.webContentsId),
    ).toEqual({
      enabled: true,
      host: "app.example.test",
    });

    harness.webContents.emit("destroyed");

    expect(
      diagnostics.getLensCdpDiagnosticsState(harness.webContentsId),
    ).toEqual({
      enabled: false,
    });
  });

  test("does not revive a capture disposed while CDP domains are enabling", async () => {
    const harness = createHarness();
    let finishRuntimeEnable: (() => void) | undefined;
    harness.webContents.debugger.results.set(
      "Runtime.enable",
      new Promise<Record<string, unknown>>((resolve) => {
        finishRuntimeEnable = () => resolve({});
      }),
    );

    const starting = harness.start();
    await waitFor(() =>
      harness.webContents.debugger.commands.some(
        ({ method }) => method === "Runtime.enable",
      ),
    );

    diagnostics.disposeLensCdpDiagnostics(harness.webContentsId);
    expect(harness.webContents.debugger.isAttached()).toBe(false);
    finishRuntimeEnable?.();

    expect(await starting).toEqual({
      enabled: false,
      message: "Lens browser session closed while diagnostics were starting.",
    });
    expect(
      diagnostics.getLensCdpDiagnosticsState(harness.webContentsId),
    ).toEqual({ enabled: false });
  });

  test("a failed stale setup does not stop its replacement capture", async () => {
    const harness = createHarness();
    let rejectFirstRuntimeEnable: ((error: Error) => void) | undefined;
    harness.webContents.debugger.results.set(
      "Runtime.enable",
      new Promise<Record<string, unknown>>((_resolve, reject) => {
        rejectFirstRuntimeEnable = reject;
      }),
    );

    const firstStart = harness.start();
    await waitFor(() =>
      harness.webContents.debugger.commands.some(
        ({ method }) => method === "Runtime.enable",
      ),
    );
    diagnostics.stopLensCdpDiagnostics(harness.webContentsId, true);

    harness.webContents.debugger.results.set("Runtime.enable", {});
    expect(await harness.start()).toEqual({
      enabled: true,
      host: "app.example.test",
    });

    rejectFirstRuntimeEnable?.(new Error("stale enable failed"));
    expect(await firstStart).toEqual({
      enabled: false,
      message: "stale enable failed",
    });
    expect(
      diagnostics.getLensCdpDiagnosticsState(harness.webContentsId),
    ).toEqual({ enabled: true, host: "app.example.test" });
  });

  test("captures execution contexts emitted while CDP domains are enabling", async () => {
    const harness = createHarness();
    harness.webContents.debugger.results.set("Runtime.enable", () => {
      harness.webContents.debugger.emitMessage(
        "Runtime.executionContextCreated",
        {
          context: {
            id: 13,
            name: "startup-main",
            origin: "https://app.example.test/dashboard",
            auxData: {
              frameId: "frame-startup",
              isDefault: true,
            },
          },
        },
      );
      return {};
    });

    await harness.start();
    harness.webContents.debugger.emitMessage("Runtime.consoleAPICalled", {
      type: "log",
      timestamp: 1_700_000_000_000,
      executionContextId: 13,
      args: [{ type: "string", value: "startup context" }],
    });

    const entry = harness.consoleEntries.at(-1);
    expect(entry?.executionContextId).toBe(13);
    expect(
      diagnostics.getLensConsoleEntryDetail(
        harness.webContentsId,
        entry?.id ?? "",
      )?.executionContext,
    ).toMatchObject({
      id: 13,
      name: "startup-main",
      origin: "https://app.example.test/dashboard",
      frameId: "frame-startup",
      isDefault: true,
    });
  });

  test("applies console backpressure before retaining CDP object details", async () => {
    const harness = createHarness();
    let accepted = 0;
    await harness.start("https://app.example.test/dashboard", () => ({
      accepted: accepted++ < 2,
      droppedCount: 0,
    }));

    for (let index = 0; index < 5; index += 1) {
      harness.webContents.debugger.emitMessage("Runtime.consoleAPICalled", {
        type: "log",
        timestamp: 1_700_000_000_000 + index,
        args: [
          {
            type: "object",
            objectId: `remote-${index}`,
            description: `entry-${index}`,
          },
        ],
      });
    }

    expect(harness.consoleEntries).toHaveLength(3);
    expect(harness.consoleEntries.at(-1)).toMatchObject({
      level: "warn",
      text: "Lens full diagnostics stopped because the page emitted excessive console logs.",
      diagnosticsCaptureState: {
        enabled: false,
        message:
          "Lens full diagnostics stopped because the page emitted excessive console logs.",
      },
    });
    for (const entry of harness.consoleEntries.slice(0, 2)) {
      const detail = diagnostics.getLensConsoleEntryDetail(
        harness.webContentsId,
        entry.id ?? "",
      );
      expect(detail).toBeDefined();
      expect(detail?.arguments[0]?.objectHandle).toBeUndefined();
    }
    expect(
      harness.webContents.debugger.commands.filter(
        ({ method }) => method === "Runtime.releaseObject",
      ),
    ).toHaveLength(0);
    expect(
      harness.webContents.debugger.commands.filter(
        ({ method }) => method === "Runtime.discardConsoleEntries",
      ),
    ).toHaveLength(1);
    expect(
      diagnostics.getLensCdpDiagnosticsState(harness.webContentsId),
    ).toEqual({ enabled: false });
  });

  test("emits one identified warning when a console window reports drops", async () => {
    const harness = createHarness();
    await harness.start("https://app.example.test/dashboard", () => ({
      accepted: true,
      droppedCount: 7,
    }));

    harness.webContents.debugger.emitMessage("Runtime.consoleAPICalled", {
      type: "log",
      timestamp: 1_700_000_000_000,
      args: [{ type: "string", value: "after flood" }],
    });

    expect(harness.consoleEntries).toHaveLength(2);
    expect(harness.consoleEntries[0]).toMatchObject({
      level: "warn",
      text: "Lens console dropped 7 excessive page log entries.",
      source: "lens",
      captureSource: "cdp",
    });
    expect(harness.consoleEntries[0]?.id).toBeString();
    expect(harness.consoleEntries[1]?.text).toBe("after flood");
  });

  test("detaches overloaded diagnostics even when the warning consumer throws", async () => {
    const harness = createHarness();
    await harness.start(
      "https://app.example.test/dashboard",
      () => ({ accepted: false, droppedCount: 0 }),
      () => {
        throw new Error("renderer unavailable");
      },
    );

    harness.webContents.debugger.emitMessage("Runtime.consoleAPICalled", {
      type: "log",
      timestamp: 1_700_000_000_000,
      args: [{ type: "object", objectId: "overload-object" }],
    });

    await waitFor(() => !harness.webContents.debugger.isAttached());
    expect(
      harness.webContents.debugger.commands.filter(
        ({ method }) => method === "Runtime.discardConsoleEntries",
      ),
    ).toHaveLength(1);
    expect(
      diagnostics.getLensCdpDiagnosticsState(harness.webContentsId),
    ).toEqual({ enabled: false });
  });

  test("force-detaches overload capture when console discard never settles", async () => {
    const harness = createHarness();
    harness.webContents.debugger.results.set(
      "Runtime.discardConsoleEntries",
      new Promise<Record<string, unknown>>(() => undefined),
    );
    await harness.start("https://app.example.test/dashboard", () => ({
      accepted: false,
      droppedCount: 0,
    }));

    harness.webContents.debugger.emitMessage("Runtime.consoleAPICalled", {
      type: "log",
      timestamp: 1_700_000_000_000,
      args: [{ type: "object", objectId: "stalled-overload-object" }],
    });

    expect(harness.webContents.debugger.isAttached()).toBe(false);
    expect(
      harness.webContents.debugger.commands.filter(
        ({ method }) => method === "Runtime.discardConsoleEntries",
      ),
    ).toHaveLength(1);
    expect(
      diagnostics.getLensCdpDiagnosticsState(harness.webContentsId),
    ).toEqual({ enabled: false });
  });

  test("keeps an allow-once capture active across policy republish", async () => {
    const harness = createHarness();
    await harness.start();

    diagnostics.enforceLensCdpDiagnosticsPolicy({
      allowedHosts: [],
      blockedHosts: [],
      developerModeCdp: true,
      cdpApprovedHosts: [],
      transientCdpApprovals: [
        {
          workspaceId: "workspace-fixture",
          host: "app.example.test",
          expiresAt: Date.now() + 60_000,
        },
      ],
    });

    expect(
      diagnostics.getLensCdpDiagnosticsState(harness.webContentsId),
    ).toEqual({
      enabled: true,
      host: "app.example.test",
    });
  });

  test("collects bounded network detail and preserves it after recording stops", async () => {
    const harness = createHarness();
    harness.webContents.debugger.results.set("Network.getResponseBody", {
      body: JSON.stringify({
        token: "fixture-response-token",
        result: "ok",
      }),
      base64Encoded: false,
    });

    expect(await harness.start()).toEqual({
      enabled: true,
      host: "app.example.test",
    });

    harness.webContents.debugger.emitMessage("Network.requestWillBeSent", {
      requestId: "request-1",
      timestamp: 10,
      wallTime: 1_700_000_000,
      type: "Fetch",
      request: {
        url: "https://api.example.test/items?token=fixture-query-token&view=all",
        method: "POST",
        headers: {
          Authorization: "Bearer fixture-authorization",
          "Content-Type": "application/json",
          Referer:
            "https://app.example.test/dashboard?state=fixture-state&tab=network",
        },
        postData: JSON.stringify({
          password: "fixture-password",
          query: "active",
        }),
        initialPriority: "High",
      },
      initiator: {
        type: "script",
        url: "https://app.example.test/app.js?code=fixture-code",
        lineNumber: 4,
        columnNumber: 8,
        stack: {
          callFrames: [
            {
              functionName: "loadItems",
              url: "https://app.example.test/app.js?token=fixture-stack-token",
              lineNumber: 9,
              columnNumber: 12,
              scriptId: "script-1",
            },
          ],
        },
      },
    });
    harness.webContents.debugger.emitMessage("Network.responseReceived", {
      requestId: "request-1",
      timestamp: 10.25,
      hasExtraInfo: false,
      response: {
        status: 200,
        statusText: "OK",
        mimeType: "application/json",
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": "session=fixture-session",
          "X-Request-Id": "trace-fixture",
        },
        protocol: "h2",
        remoteIPAddress: "203.0.113.10",
        remotePort: 443,
        connectionId: 17,
        connectionReused: true,
        fromDiskCache: false,
        fromServiceWorker: false,
        timing: {
          requestTime: 10,
          dnsStart: 0,
          dnsEnd: 1.5,
          connectStart: 1.5,
          connectEnd: 4,
          sendStart: 4.5,
          sendEnd: 5,
          receiveHeadersStart: 20,
          receiveHeadersEnd: 22,
        },
      },
    });
    harness.webContents.debugger.emitMessage("Network.loadingFinished", {
      requestId: "request-1",
      timestamp: 10.5,
      encodedDataLength: 512,
    });

    await waitFor(() =>
      harness.networkEntries.some(
        (entry) =>
          entry.entryId === "request-1:0" && entry.state === "complete",
      ),
    );

    const complete = harness.networkEntries.findLast(
      (entry) => entry.entryId === "request-1:0",
    );
    expect(complete).toMatchObject({
      entryId: "request-1:0",
      requestId: "request-1",
      state: "complete",
      method: "POST",
      status: 200,
      resourceType: "xhr",
      mimeType: "application/json",
      responseSize: 512,
      hasRequestBody: true,
      hasResponseBody: true,
      detailAvailable: true,
      captureSource: "cdp",
    });
    expect(new URL(complete?.url ?? "").searchParams.get("token")).toBe(
      "[redacted]",
    );
    expect(new URL(complete?.url ?? "").searchParams.get("view")).toBe("all");

    const detail = diagnostics.getLensNetworkEntryDetail(
      harness.webContentsId,
      "request-1:0",
    );
    expect(detail).toMatchObject({
      entryId: "request-1:0",
      requestId: "request-1",
      requestHeaders: {
        Authorization: ["[redacted]"],
        "Content-Type": ["application/json"],
      },
      responseHeaders: {
        "Content-Type": ["application/json"],
        "Set-Cookie": ["[redacted]"],
        "X-Request-Id": ["trace-fixture"],
      },
      priority: "High",
      protocol: "h2",
      remoteAddress: "203.0.113.10:443",
      connectionId: 17,
      connectionReused: true,
      timing: {
        requestTimestamp: 10,
        wallTime: 1_700_000_000,
        responseTimestamp: 10.25,
        finishedTimestamp: 10.5,
        dnsStart: 0,
        dnsEnd: 1.5,
        sendStart: 4.5,
        sendEnd: 5,
        receiveHeadersStart: 20,
        receiveHeadersEnd: 22,
      },
      initiator: {
        type: "script",
        lineNumber: 5,
        columnNumber: 9,
      },
      requestBody: {
        kind: "json",
        redacted: true,
      },
      responseBody: {
        kind: "json",
        redacted: true,
      },
    });
    expect(detail?.initiator?.url).not.toContain("fixture-code");
    expect(detail?.initiator?.stack?.callFrames[0]).toMatchObject({
      functionName: "loadItems",
      lineNumber: 10,
      columnNumber: 13,
    });
    expect(detail?.initiator?.stack?.callFrames[0]?.url).not.toContain(
      "fixture-stack-token",
    );

    const requestBody = diagnostics.getLensNetworkBody(
      harness.webContentsId,
      "request-1:0",
      "request",
    );
    const responseBody = diagnostics.getLensNetworkBody(
      harness.webContentsId,
      "request-1:0",
      "response",
    );
    expect(requestBody?.content).toContain('"password": "[redacted]"');
    expect(requestBody?.content).not.toContain("fixture-password");
    expect(responseBody?.content).toContain('"token": "[redacted]"');
    expect(responseBody?.content).not.toContain("fixture-response-token");

    expect(
      diagnostics.stopLensCdpDiagnostics(harness.webContentsId, true, true),
    ).toEqual({ enabled: false });
    expect(
      diagnostics.getLensCdpDiagnosticsState(harness.webContentsId),
    ).toEqual({ enabled: false });
    expect(
      diagnostics.getLensNetworkEntryDetail(
        harness.webContentsId,
        "request-1:0",
      ),
    ).toEqual(detail);
    expect(
      diagnostics.getLensNetworkBody(
        harness.webContentsId,
        "request-1:0",
        "response",
      ),
    ).toEqual(responseBody);
  });

  test("uses stable hop ids and applies early redirect extra info to the completed hop", async () => {
    const harness = createHarness();
    await harness.start();

    harness.webContents.debugger.emitMessage("Network.requestWillBeSent", {
      requestId: "redirect-request",
      timestamp: 1,
      wallTime: 1_700_000_100,
      type: "Document",
      request: {
        url: "https://app.example.test/start",
        method: "GET",
        headers: {},
      },
    });
    harness.webContents.debugger.emitMessage(
      "Network.responseReceivedExtraInfo",
      {
        requestId: "redirect-request",
        statusCode: 302,
        headers: {
          Location: "/finish",
          "Set-Cookie": "redirect=fixture-cookie",
        },
      },
    );
    harness.webContents.debugger.emitMessage("Network.requestWillBeSent", {
      requestId: "redirect-request",
      timestamp: 1.1,
      wallTime: 1_700_000_100.1,
      type: "Document",
      redirectHasExtraInfo: true,
      redirectResponse: {
        status: 301,
        statusText: "Found",
        mimeType: "text/html",
        headers: {
          Location: "/stale",
        },
      },
      request: {
        url: "https://app.example.test/finish",
        method: "GET",
        headers: {},
      },
    });

    const oldHopEntries = harness.networkEntries.filter(
      (entry) =>
        entry.requestId === "redirect-request" && entry.entryId.endsWith(":0"),
    );
    const newHop = harness.networkEntries.findLast(
      (entry) => entry.entryId === "redirect-request:1",
    );
    expect(oldHopEntries.length).toBeGreaterThanOrEqual(2);
    expect(new Set(oldHopEntries.map((entry) => entry.entryId))).toEqual(
      new Set(["redirect-request:0"]),
    );
    expect(oldHopEntries.at(-1)).toMatchObject({
      entryId: "redirect-request:0",
      state: "complete",
      status: 302,
    });
    expect(newHop).toMatchObject({
      entryId: "redirect-request:1",
      requestId: "redirect-request",
      state: "pending",
      url: "https://app.example.test/finish",
    });

    const oldDetail = diagnostics.getLensNetworkEntryDetail(
      harness.webContentsId,
      "redirect-request:0",
    );
    const newDetail = diagnostics.getLensNetworkEntryDetail(
      harness.webContentsId,
      "redirect-request:1",
    );
    expect(oldDetail?.responseHeaders).toEqual({
      Location: ["/finish"],
      "Set-Cookie": ["[redacted]"],
    });
    expect(newDetail?.redirects).toEqual([
      expect.objectContaining({
        url: "https://app.example.test/start",
        status: 302,
        responseHeaders: {
          Location: ["/finish"],
          "Set-Cookie": ["[redacted]"],
        },
      }),
    ]);

    harness.webContents.debugger.emitMessage("Network.responseReceived", {
      requestId: "redirect-request",
      timestamp: 1.2,
      hasExtraInfo: false,
      response: {
        status: 200,
        statusText: "OK",
        mimeType: "text/html",
        headers: {
          "Content-Type": "text/html",
        },
      },
    });
    expect(
      diagnostics.getLensNetworkEntryDetail(
        harness.webContentsId,
        "redirect-request:1",
      )?.responseHeaders,
    ).toEqual({
      "Content-Type": ["text/html"],
    });
    expect(
      harness.networkEntries.findLast(
        (entry) => entry.entryId === "redirect-request:1",
      )?.status,
    ).toBe(200);
  });

  test("does not requeue a redirect hop after response extra info was already applied", async () => {
    const harness = createHarness();
    await harness.start();

    harness.webContents.debugger.emitMessage("Network.requestWillBeSent", {
      requestId: "ordered-redirect",
      timestamp: 2,
      type: "Document",
      request: {
        url: "https://app.example.test/start",
        method: "GET",
        headers: {},
      },
    });
    harness.webContents.debugger.emitMessage("Network.responseReceived", {
      requestId: "ordered-redirect",
      timestamp: 2.1,
      hasExtraInfo: true,
      response: {
        status: 302,
        statusText: "Found",
        mimeType: "text/html",
        headers: {
          Location: "/stale",
        },
      },
    });
    harness.webContents.debugger.emitMessage(
      "Network.responseReceivedExtraInfo",
      {
        requestId: "ordered-redirect",
        statusCode: 302,
        headers: {
          Location: "/finish",
          "X-Hop": "redirect",
        },
      },
    );
    harness.webContents.debugger.emitMessage("Network.requestWillBeSent", {
      requestId: "ordered-redirect",
      timestamp: 2.2,
      type: "Document",
      redirectHasExtraInfo: true,
      redirectResponse: {
        status: 302,
        statusText: "Found",
        mimeType: "text/html",
        headers: {
          Location: "/stale",
        },
      },
      request: {
        url: "https://app.example.test/finish",
        method: "GET",
        headers: {},
      },
    });
    harness.webContents.debugger.emitMessage("Network.responseReceived", {
      requestId: "ordered-redirect",
      timestamp: 2.3,
      hasExtraInfo: true,
      response: {
        status: 200,
        statusText: "OK",
        mimeType: "text/html",
        headers: {
          "Content-Type": "text/html",
        },
      },
    });
    harness.webContents.debugger.emitMessage(
      "Network.responseReceivedExtraInfo",
      {
        requestId: "ordered-redirect",
        statusCode: 200,
        headers: {
          "Content-Type": "text/html",
          "X-Hop": "final",
        },
      },
    );

    expect(
      diagnostics.getLensNetworkEntryDetail(
        harness.webContentsId,
        "ordered-redirect:0",
      )?.responseHeaders,
    ).toEqual({
      Location: ["/finish"],
      "X-Hop": ["redirect"],
    });
    expect(
      diagnostics.getLensNetworkEntryDetail(
        harness.webContentsId,
        "ordered-redirect:1",
      )?.responseHeaders,
    ).toEqual({
      "Content-Type": ["text/html"],
      "X-Hop": ["final"],
    });
    expect(
      harness.networkEntries.findLast(
        (entry) => entry.entryId === "ordered-redirect:0",
      )?.status,
    ).toBe(302);
    expect(
      harness.networkEntries.findLast(
        (entry) => entry.entryId === "ordered-redirect:1",
      )?.status,
    ).toBe(200);
  });

  test("retires completed requests from extra-info target and pending queues", async () => {
    const harness = createHarness();
    await harness.start();

    harness.webContents.debugger.emitMessage("Network.requestWillBeSent", {
      requestId: "target-cleanup",
      timestamp: 3,
      type: "Fetch",
      request: {
        url: "https://app.example.test/target-cleanup",
        method: "POST",
        headers: {},
        postData: JSON.stringify({ value: "captured" }),
      },
    });
    harness.webContents.debugger.emitMessage("Network.responseReceived", {
      requestId: "target-cleanup",
      timestamp: 3.1,
      hasExtraInfo: true,
      response: {
        status: 204,
        statusText: "No Content",
        mimeType: "text/plain",
        headers: {},
      },
    });
    harness.webContents.debugger.emitMessage("Network.loadingFailed", {
      requestId: "target-cleanup",
      timestamp: 3.2,
      errorText: "fixture failure",
    });

    const entryCountAfterCompletion = harness.networkEntries.length;
    harness.webContents.debugger.emitMessage(
      "Network.requestWillBeSentExtraInfo",
      {
        requestId: "target-cleanup",
        headers: {
          "X-Late-Request": "must-not-apply",
        },
      },
    );
    harness.webContents.debugger.emitMessage(
      "Network.responseReceivedExtraInfo",
      {
        requestId: "target-cleanup",
        statusCode: 599,
        headers: {
          "X-Late-Response": "must-not-apply",
        },
      },
    );
    expect(harness.networkEntries).toHaveLength(entryCountAfterCompletion);
    const targetCleanupDetail = diagnostics.getLensNetworkEntryDetail(
      harness.webContentsId,
      "target-cleanup:0",
    );
    expect(
      targetCleanupDetail?.requestHeaders?.["X-Late-Request"],
    ).toBeUndefined();
    expect(
      targetCleanupDetail?.responseHeaders?.["X-Late-Response"],
    ).toBeUndefined();
    expect(
      harness.networkEntries.findLast(
        (entry) => entry.entryId === "target-cleanup:0",
      )?.status,
    ).toBe(204);

    for (const suffix of ["first", "stale"]) {
      harness.webContents.debugger.emitMessage(
        "Network.requestWillBeSentExtraInfo",
        {
          requestId: "pending-cleanup",
          headers: {
            "X-Request-Hop": suffix,
          },
        },
      );
      harness.webContents.debugger.emitMessage(
        "Network.responseReceivedExtraInfo",
        {
          requestId: "pending-cleanup",
          statusCode: suffix === "first" ? 200 : 599,
          headers: {
            "X-Response-Hop": suffix,
          },
        },
      );
    }
    harness.webContents.debugger.emitMessage("Network.requestWillBeSent", {
      requestId: "pending-cleanup",
      timestamp: 4,
      type: "Fetch",
      request: {
        url: "https://app.example.test/pending-cleanup",
        method: "GET",
        headers: {},
      },
    });
    harness.webContents.debugger.emitMessage("Network.responseReceived", {
      requestId: "pending-cleanup",
      timestamp: 4.1,
      hasExtraInfo: true,
      response: {
        status: 200,
        statusText: "OK",
        mimeType: "text/plain",
        headers: {},
      },
    });
    harness.webContents.debugger.emitMessage("Network.loadingFailed", {
      requestId: "pending-cleanup",
      timestamp: 4.2,
      errorText: "fixture failure",
    });
    harness.webContents.debugger.emitMessage("Network.requestWillBeSent", {
      requestId: "pending-cleanup",
      timestamp: 5,
      type: "Fetch",
      request: {
        url: "https://app.example.test/reused-id",
        method: "GET",
        headers: {
          "X-Request-Hop": "fresh",
        },
      },
    });

    expect(
      diagnostics.getLensNetworkEntryDetail(
        harness.webContentsId,
        "pending-cleanup:0",
      )?.requestHeaders,
    ).toEqual({
      "X-Request-Hop": ["fresh"],
    });
  });

  test("clears a preserved disabled archive on same-host navigation start", async () => {
    const harness = createHarness();
    await harness.start();

    harness.webContents.debugger.emitMessage("Network.requestWillBeSent", {
      requestId: "archived-request",
      timestamp: 6,
      type: "Fetch",
      request: {
        url: "https://app.example.test/archived",
        method: "GET",
        headers: {},
      },
    });
    expect(
      diagnostics.getLensNetworkEntryDetail(
        harness.webContentsId,
        "archived-request:0",
      ),
    ).toBeDefined();

    diagnostics.stopLensCdpDiagnostics(harness.webContentsId, false, true);
    expect(
      diagnostics.getLensNetworkEntryDetail(
        harness.webContentsId,
        "archived-request:0",
      ),
    ).toBeDefined();

    diagnostics.handleLensCdpDiagnosticsNavigationStart(
      harness.webContentsId,
      "https://app.example.test/next",
    );
    expect(
      diagnostics.getLensNetworkEntryDetail(
        harness.webContentsId,
        "archived-request:0",
      ),
    ).toBeUndefined();
    expect(
      diagnostics.getLensCdpDiagnosticsState(harness.webContentsId),
    ).toEqual({ enabled: false });
  });

  test("defers debugger detach until an in-flight response body command settles", async () => {
    const harness = createHarness();
    let resolveResponseBody:
      ((value: Record<string, unknown>) => void) | undefined;
    const responseBodyPromise = new Promise<Record<string, unknown>>(
      (resolve) => {
        resolveResponseBody = resolve;
      },
    );
    harness.webContents.debugger.results.set(
      "Network.getResponseBody",
      responseBodyPromise,
    );
    await harness.start();

    harness.webContents.debugger.emitMessage("Network.requestWillBeSent", {
      requestId: "in-flight-body",
      timestamp: 7,
      type: "Fetch",
      request: {
        url: "https://app.example.test/in-flight",
        method: "GET",
        headers: {},
      },
    });
    harness.webContents.debugger.emitMessage("Network.responseReceived", {
      requestId: "in-flight-body",
      timestamp: 7.1,
      hasExtraInfo: false,
      response: {
        status: 200,
        statusText: "OK",
        mimeType: "application/json",
        headers: {
          "Content-Type": "application/json",
        },
      },
    });
    harness.webContents.debugger.emitMessage("Network.loadingFinished", {
      requestId: "in-flight-body",
      timestamp: 7.2,
      encodedDataLength: 16,
    });
    await waitFor(() =>
      harness.webContents.debugger.commands.some(
        (command) => command.method === "Network.getResponseBody",
      ),
    );

    diagnostics.stopLensCdpDiagnostics(harness.webContentsId, true);
    expect(harness.webContents.debugger.isAttached()).toBe(true);

    resolveResponseBody?.({
      body: JSON.stringify({ ok: true }),
      base64Encoded: false,
    });
    await waitFor(() => !harness.webContents.debugger.isAttached());
    expect(harness.webContents.debugger.isAttached()).toBe(false);
  });

  test("stores console arguments behind opaque handles and releases them on stop", async () => {
    const harness = createHarness();
    harness.webContents.debugger.results.set("Runtime.getProperties", {
      result: [
        {
          name: "password",
          value: {
            type: "string",
            value: "fixture-object-password",
          },
        },
        {
          name: "name",
          value: {
            type: "string",
            value: "fixture-user",
          },
        },
      ],
    });
    await harness.start();

    harness.webContents.debugger.emitMessage(
      "Runtime.executionContextCreated",
      {
        context: {
          id: 7,
          name: "main",
          origin: "https://app.example.test/?token=fixture-context-token",
          auxData: {
            frameId: "frame-1",
            isDefault: true,
          },
        },
      },
    );
    harness.webContents.debugger.emitMessage("Runtime.consoleAPICalled", {
      type: "log",
      timestamp: 1_700_000_200_000,
      executionContextId: 7,
      args: [
        {
          type: "string",
          value: "loaded",
        },
        {
          type: "object",
          subtype: "object",
          description: "Object",
          objectId: "remote-object-1",
          preview: {
            description: "Object",
            overflow: false,
            properties: [
              {
                name: "token",
                type: "string",
                value: "fixture-preview-token",
              },
              {
                name: "name",
                type: "string",
                value: "fixture-user",
              },
            ],
          },
        },
      ],
      stackTrace: {
        callFrames: [
          {
            functionName: "render",
            url: "https://app.example.test/app.js?state=fixture-stack-state",
            lineNumber: 19,
            columnNumber: 2,
            scriptId: "script-7",
          },
        ],
      },
    });

    expect(harness.consoleEntries).toHaveLength(1);
    const entry = harness.consoleEntries[0];
    expect(entry).toMatchObject({
      level: "log",
      text: "loaded Object",
      executionContextId: 7,
      argumentCount: 2,
      hasObjectArguments: true,
      hasStackTrace: true,
      captureSource: "cdp",
      lineNumber: 20,
      columnNumber: 3,
    });
    expect(entry?.source).not.toContain("fixture-stack-state");

    const detail = diagnostics.getLensConsoleEntryDetail(
      harness.webContentsId,
      entry?.id ?? "",
    );
    expect(detail?.executionContext).toMatchObject({
      id: 7,
      name: "main",
      frameId: "frame-1",
      isDefault: true,
    });
    expect(detail?.executionContext?.origin).not.toContain(
      "fixture-context-token",
    );
    expect(detail?.arguments[1]?.preview?.properties).toEqual([
      {
        name: "token",
        type: "string",
        value: "[redacted]",
      },
      {
        name: "name",
        type: "string",
        value: "fixture-user",
      },
    ]);

    const objectHandle = detail?.arguments[1]?.objectHandle;
    expect(objectHandle).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    const properties = await diagnostics.getLensConsoleObjectProperties({
      webContentsId: harness.webContentsId,
      entryId: entry?.id ?? "",
      objectHandle: objectHandle ?? "",
      limit: 100,
    });
    expect(properties?.properties).toEqual([
      {
        name: "password",
        type: "accessor",
        value: "[redacted]",
      },
      {
        name: "name",
        type: "string",
        value: "fixture-user",
      },
    ]);

    diagnostics.stopLensCdpDiagnostics(harness.webContentsId, false, true);
    expect(
      diagnostics.getLensConsoleEntryDetail(
        harness.webContentsId,
        entry?.id ?? "",
      )?.arguments[1]?.objectHandle,
    ).toBeUndefined();
    await waitFor(() =>
      harness.webContents.debugger.commands.some(
        (command) =>
          command.method === "Runtime.releaseObject" &&
          command.params?.objectId === "remote-object-1",
      ),
    );
  });

  test("disposes closing targets without issuing remote object cleanup commands", async () => {
    const harness = createHarness();
    await harness.start();

    harness.webContents.debugger.emitMessage("Runtime.consoleAPICalled", {
      type: "log",
      timestamp: 1_700_000_200_100,
      args: [
        {
          type: "object",
          subtype: "object",
          description: "Object",
          objectId: "closing-remote-object",
        },
      ],
    });

    const entry = harness.consoleEntries.at(-1);
    expect(
      diagnostics.getLensConsoleEntryDetail(
        harness.webContentsId,
        entry?.id ?? "",
      )?.arguments[0]?.objectHandle,
    ).toBeDefined();

    const releaseCountBefore = harness.webContents.debugger.commands.filter(
      (command) => command.method === "Runtime.releaseObject",
    ).length;

    diagnostics.disposeLensCdpDiagnostics(harness.webContentsId);

    expect(
      diagnostics.getLensCdpDiagnosticsState(harness.webContentsId),
    ).toEqual({ enabled: false });
    expect(harness.webContents.debugger.isAttached()).toBe(false);
    expect(
      harness.webContents.debugger.commands.filter(
        (command) => command.method === "Runtime.releaseObject",
      ),
    ).toHaveLength(releaseCountBefore);
    await expect(harness.start()).rejects.toThrow(
      `WebContents ${harness.webContentsId} is closing`,
    );
  });

  test("releases accessor and truncated property remote objects", async () => {
    const harness = createHarness();
    harness.webContents.debugger.results.set("Runtime.getProperties", {
      result: [
        {
          name: "computed",
          get: {
            type: "function",
            objectId: "remote-getter-visible",
          },
          set: {
            type: "function",
            objectId: "remote-setter-visible",
          },
        },
        {
          name: "overflow",
          value: {
            type: "object",
            objectId: "remote-value-overflow",
          },
          get: {
            type: "function",
            objectId: "remote-getter-overflow",
          },
          set: {
            type: "function",
            objectId: "remote-setter-overflow",
          },
        },
      ],
    });
    await harness.start();

    harness.webContents.debugger.emitMessage("Runtime.consoleAPICalled", {
      type: "log",
      timestamp: 1_700_000_300_000,
      args: [
        {
          type: "object",
          subtype: "object",
          description: "Object",
          objectId: "remote-object-root",
        },
      ],
    });

    const entry = harness.consoleEntries.at(-1);
    const detail = diagnostics.getLensConsoleEntryDetail(
      harness.webContentsId,
      entry?.id ?? "",
    );
    const objectHandle = detail?.arguments[0]?.objectHandle;
    const properties = await diagnostics.getLensConsoleObjectProperties({
      webContentsId: harness.webContentsId,
      entryId: entry?.id ?? "",
      objectHandle: objectHandle ?? "",
      limit: 1,
    });

    expect(properties).toMatchObject({
      overflow: true,
      properties: [
        {
          name: "computed",
          type: "accessor",
          value: "[Getter]",
        },
      ],
    });

    const releasedObjectIds = harness.webContents.debugger.commands
      .filter((command) => command.method === "Runtime.releaseObject")
      .map((command) => command.params?.objectId);
    expect(releasedObjectIds).toEqual(
      expect.arrayContaining([
        "remote-getter-visible",
        "remote-setter-visible",
        "remote-value-overflow",
        "remote-getter-overflow",
        "remote-setter-overflow",
      ]),
    );
  });
});

describe("Lens diagnostics IPC contract", () => {
  test("validates strict capture, detail, object, and body requests", () => {
    expect(
      LensDiagnosticsCaptureArgsSchema.parse({
        workspaceId: "workspace-fixture",
        lensSessionId: "lens-fixture",
        enabled: true,
      }),
    ).toEqual({
      workspaceId: "workspace-fixture",
      lensSessionId: "lens-fixture",
      enabled: true,
    });
    expect(
      LensConsoleEntryDetailArgsSchema.safeParse({
        workspaceId: "workspace-fixture",
        entryId: "console-entry",
        extra: true,
      }).success,
    ).toBe(false);
    expect(
      LensConsoleObjectPropertiesArgsSchema.safeParse({
        workspaceId: "workspace-fixture",
        entryId: "console-entry",
        objectHandle: "8f78e171-f485-4ea9-8a63-38ef7ba8ef96",
        limit: 101,
      }).success,
    ).toBe(false);
    expect(
      LensNetworkEntryDetailArgsSchema.parse({
        workspaceId: "workspace-fixture",
        lensSessionId: "lens-fixture",
        entryId: "request-1:0",
      }),
    ).toEqual({
      workspaceId: "workspace-fixture",
      lensSessionId: "lens-fixture",
      entryId: "request-1:0",
    });
    expect(
      LensNetworkBodyArgsSchema.safeParse({
        workspaceId: "workspace-fixture",
        entryId: "request-1:0",
        kind: "all",
      }).success,
    ).toBe(false);
  });

  test("keeps preload, renderer types, and main IPC channels symmetric", () => {
    const repoRoot = path.join(import.meta.dir, "..");
    const preload = readFileSync(
      path.join(repoRoot, "electron", "preload.ts"),
      "utf8",
    );
    const rendererTypes = readFileSync(
      path.join(repoRoot, "src", "types", "window-api.d.ts"),
      "utf8",
    );
    const mainIpc = readFileSync(
      path.join(repoRoot, "electron", "main", "ipc", "browser.ts"),
      "utf8",
    );

    const endpoints = [
      ["getConsoleEntryDetail", "lens:get-console-entry-detail"],
      ["getConsoleObjectProperties", "lens:get-console-object-properties"],
      ["getNetworkEntryDetail", "lens:get-network-entry-detail"],
      ["getNetworkBody", "lens:get-network-body"],
      ["getDiagnosticsCaptureState", "lens:get-diagnostics-capture-state"],
      ["setDiagnosticsCapture", "lens:set-diagnostics-capture"],
    ] as const;

    for (const [bridgeMethod, channel] of endpoints) {
      expect(preload).toContain(`${bridgeMethod}:`);
      expect(preload).toContain(`"${channel}"`);
      expect(rendererTypes).toContain(`${bridgeMethod}?:`);
      expect(mainIpc).toContain(`"${channel}"`);
    }
  });
});
