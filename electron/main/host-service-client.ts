import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  HOST_SERVICE_PROTOCOL_BUFFER_MAX_BYTES,
  HOST_SERVICE_PROTOCOL_MESSAGE_MAX_BYTES,
} from "../shared/host-service-transport";
import {
  JsonMessageFrameDecoder,
  serializeJsonFramedMessage,
} from "../shared/json-message-framing";
import {
  HOST_SERVICE_READY_TIMEOUT_MS,
  type HostServiceInvokeOptions,
  resolveHostServiceRequestTimeoutMs,
} from "./host-service-request-timeouts";
import type {
  AnyHostServiceEventEnvelope,
  AnyHostServiceMessage,
  AnyHostServiceResponseEnvelope,
  HostServiceEventMap,
  HostServiceMethod,
  HostServiceRequestEnvelope,
  HostServiceRequestMap,
  HostServiceResponseMap,
} from "../host-service/protocol";

interface PendingRequest {
  method: HostServiceMethod;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

const HOST_SERVICE_STDOUT_BUFFER_MAX_BYTES =
  HOST_SERVICE_PROTOCOL_BUFFER_MAX_BYTES;
const HOST_SERVICE_STDOUT_MESSAGE_MAX_BYTES =
  HOST_SERVICE_PROTOCOL_MESSAGE_MAX_BYTES;

interface HostServiceDiagnosticStream {
  on(event: "error", listener: (error: Error) => void): unknown;
  write(chunk: string, callback?: (error?: Error | null) => void): unknown;
}

const guardedDiagnosticStreams = new WeakSet<object>();

/**
 * Host-service stderr is diagnostic-only. A detached development launcher can
 * leave Electron's inherited stderr revoked, and a failed diagnostic write
 * must not take down the main process or interrupt an otherwise valid IPC
 * response.
 */
export function forwardHostServiceStderr(
  chunk: string,
  stream: HostServiceDiagnosticStream = process.stderr,
) {
  const text = chunk.trim();
  if (!text) {
    return;
  }

  const streamObject = stream as object;
  if (!guardedDiagnosticStreams.has(streamObject)) {
    guardedDiagnosticStreams.add(streamObject);
    stream.on("error", () => {});
  }

  try {
    stream.write(`[host-service] ${text}\n`, () => {});
  } catch {
    // Best-effort diagnostics must never affect host-service availability.
  }
}

export function resolveHostServiceScriptPath(args: {
  moduleUrl: string;
  pathExists?: (path: string) => boolean;
}) {
  const pathExists = args.pathExists ?? existsSync;
  const modulePath = fileURLToPath(args.moduleUrl);
  const moduleDir = path.dirname(modulePath);
  const siblingCandidate = path.join(moduleDir, "host-service.js");
  if (pathExists(siblingCandidate)) {
    return siblingCandidate;
  }
  const parentCandidate = path.join(moduleDir, "..", "host-service.js");
  if (pathExists(parentCandidate)) {
    return path.normalize(parentCandidate);
  }
  return siblingCandidate;
}

export function measureSerializedHostServiceRequestBytes(args: {
  method: HostServiceMethod;
  params: HostServiceRequestMap[HostServiceMethod];
}) {
  return serializeJsonFramedMessage({
    type: "request",
    id: 1,
    method: args.method,
    params: args.params,
  }).serializedBytes;
}

class HostServiceClient {
  private child: ChildProcessWithoutNullStreams | null = null;

  /**
   * Stays non-null and resolved for the whole lifetime of a healthy child so
   * that every caller — not just the one that spawned it — awaits the `ready`
   * handshake before writing to stdin.
   */
  private startupPromise: Promise<void> | null = null;

  private startupResolve: (() => void) | null = null;

  private startupReject: ((reason?: unknown) => void) | null = null;

  private startupTimer: ReturnType<typeof setTimeout> | null = null;

  private nextRequestId = 1;

  private pending = new Map<number, PendingRequest>();

  private eventListeners = new Set<
    (event: AnyHostServiceEventEnvelope) => void
  >();

  private disconnectListeners = new Set<() => void>();

  private getScriptPath() {
    return resolveHostServiceScriptPath({ moduleUrl: import.meta.url });
  }

  private resetStartupState() {
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
    this.startupPromise = null;
    this.startupResolve = null;
    this.startupReject = null;
  }

  private failChild(args: {
    child: ChildProcessWithoutNullStreams | null;
    error: Error;
  }) {
    if (args.child && this.child && this.child !== args.child) {
      return;
    }

    const activeChild = args.child ?? this.child;
    this.child = null;
    this.startupReject?.(args.error);
    this.resetStartupState();
    for (const pending of this.pending.values()) {
      this.settlePending(pending, () => pending.reject(args.error));
    }
    this.pending.clear();
    for (const listener of this.disconnectListeners) {
      listener();
    }

    if (activeChild && activeChild.exitCode === null) {
      activeChild.kill();
    }
  }

  private settlePending(pending: PendingRequest, settle: () => void) {
    if (pending.timer) {
      clearTimeout(pending.timer);
      pending.timer = null;
    }
    settle();
  }

  private handleResponse(message: AnyHostServiceResponseEnvelope) {
    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }
    this.pending.delete(message.id);
    this.settlePending(pending, () => {
      if (message.ok) {
        pending.resolve(message.result);
        return;
      }
      pending.reject(
        new Error(`[host-service] ${pending.method} failed: ${message.error}`),
      );
    });
  }

  private handleEvent(message: AnyHostServiceEventEnvelope) {
    for (const listener of this.eventListeners) {
      listener(message);
    }
  }

  private handleMessage(raw: string) {
    let message: AnyHostServiceMessage;
    try {
      message = JSON.parse(raw) as AnyHostServiceMessage;
    } catch {
      return;
    }
    if (message.type === "ready") {
      // Keep `startupPromise` in place (now resolved) so later callers still
      // await readiness instead of racing ahead of the handshake.
      if (this.startupTimer) {
        clearTimeout(this.startupTimer);
        this.startupTimer = null;
      }
      this.startupResolve?.();
      this.startupResolve = null;
      this.startupReject = null;
      return;
    }
    if (message.type === "response") {
      this.handleResponse(message);
      return;
    }
    if (message.type === "event") {
      this.handleEvent(message);
    }
  }

  private attachChild(child: ChildProcessWithoutNullStreams) {
    const stdoutFrameDecoder = new JsonMessageFrameDecoder({
      label: "host-service stdout",
      maxBufferBytes: HOST_SERVICE_STDOUT_BUFFER_MAX_BYTES,
      maxMessageBytes: HOST_SERVICE_STDOUT_MESSAGE_MAX_BYTES,
    });
    child.stdout.on("data", (chunk: Buffer) => {
      let messages: string[];
      try {
        messages = stdoutFrameDecoder.append(chunk);
      } catch (error) {
        this.failChild({
          child,
          error: error instanceof Error ? error : new Error(String(error)),
        });
        return;
      }
      for (const message of messages) {
        if (message.length > 0) {
          this.handleMessage(message);
        }
      }
    });

    child.stderr.setEncoding("utf8");
    if (process.env.STAVE_DEV) {
      child.stderr.on("data", (chunk: string) => {
        forwardHostServiceStderr(chunk);
      });
    } else {
      child.stderr.resume();
    }

    // Without these, a spawn failure (ENOENT/EACCES/EMFILE) or a destroyed
    // stdin becomes an unhandled 'error' event and takes down the main process.
    child.on("error", (error) => {
      this.failChild({
        child,
        error: new Error(`[host-service] process error: ${String(error)}`),
      });
    });

    child.stdin.on("error", (error) => {
      this.failChild({
        child,
        error: new Error(`[host-service] stdin error: ${String(error)}`),
      });
    });

    child.on("exit", (code, signal) => {
      this.failChild({
        child,
        error: new Error(
          `[host-service] exited unexpectedly (code=${code ?? "null"}, signal=${signal ?? "null"})`,
        ),
      });
    });
  }

  async ensureStarted() {
    // Always await the handshake. Returning early on a live-but-unready child
    // let concurrent callers write to stdin before the child installed its
    // reader, which stalled those requests indefinitely.
    if (this.startupPromise) {
      return this.startupPromise;
    }

    const startupPromise = new Promise<void>((resolve, reject) => {
      this.startupResolve = resolve;
      this.startupReject = reject;
    });
    this.startupPromise = startupPromise;
    // Keep an unawaited rejection from surfacing as an unhandled rejection when
    // the child dies while no caller happens to be waiting on startup.
    void startupPromise.catch(() => {});

    const child = spawn(process.execPath, [this.getScriptPath()], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.startupTimer = setTimeout(() => {
      this.startupTimer = null;
      this.failChild({
        child,
        error: new Error(
          `[host-service] did not become ready within ${HOST_SERVICE_READY_TIMEOUT_MS}ms`,
        ),
      });
    }, HOST_SERVICE_READY_TIMEOUT_MS);
    this.startupTimer.unref?.();

    this.child = child;
    this.attachChild(child);
    return startupPromise;
  }

  async invoke<TMethod extends HostServiceMethod>(
    method: TMethod,
    params: HostServiceRequestMap[TMethod],
    options?: HostServiceInvokeOptions,
  ): Promise<HostServiceResponseMap[TMethod]> {
    await this.ensureStarted();
    if (
      !this.child ||
      this.child.exitCode !== null ||
      !this.child.stdin.writable
    ) {
      throw new Error("[host-service] child process is not available");
    }

    const requestId = this.nextRequestId;
    this.nextRequestId += 1;

    const request: HostServiceRequestEnvelope<TMethod> = {
      type: "request",
      id: requestId,
      method,
      params,
    };
    const serializedRequest = serializeJsonFramedMessage(request);
    if (
      serializedRequest.messageBytes > HOST_SERVICE_PROTOCOL_MESSAGE_MAX_BYTES
    ) {
      throw new Error(
        `[host-service] ${method} request exceeded protocol message limit (${serializedRequest.messageBytes} bytes > ${HOST_SERVICE_PROTOCOL_MESSAGE_MAX_BYTES})`,
      );
    }

    const timeoutMs = resolveHostServiceRequestTimeoutMs({
      method,
      override: options?.timeoutMs,
    });

    const resultPromise = new Promise<HostServiceResponseMap[TMethod]>(
      (resolve, reject) => {
        const pending: PendingRequest = {
          method,
          resolve: resolve as (value: unknown) => void,
          reject,
          timer: null,
        };
        if (timeoutMs !== null) {
          pending.timer = setTimeout(() => {
            pending.timer = null;
            this.pending.delete(requestId);
            reject(
              new Error(
                `[host-service] ${method} timed out after ${timeoutMs}ms without a response. The host service may be wedged or the response was dropped.`,
              ),
            );
          }, timeoutMs);
          pending.timer.unref?.();
        }
        this.pending.set(requestId, pending);
      },
    );

    this.child.stdin.write(serializedRequest.serialized, (error) => {
      if (!error) {
        return;
      }
      const pending = this.pending.get(requestId);
      if (!pending) {
        return;
      }
      this.pending.delete(requestId);
      this.settlePending(pending, () => pending.reject(error));
    });

    return resultPromise;
  }

  onEvent(listener: (event: AnyHostServiceEventEnvelope) => void) {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  onDisconnect(listener: () => void) {
    this.disconnectListeners.add(listener);
    return () => {
      this.disconnectListeners.delete(listener);
    };
  }

  async stop() {
    const child = this.child;
    if (!child || child.exitCode !== null) {
      this.child = null;
      this.resetStartupState();
      return;
    }

    try {
      await this.invoke("service.shutdown", undefined);
    } catch {
      child.kill();
    }

    await Promise.race([
      new Promise<void>((resolve) => {
        child.once("exit", () => resolve());
      }),
      new Promise<void>((resolve) => {
        setTimeout(() => {
          child.kill();
          resolve();
        }, 5_000);
      }),
    ]);
  }
}

const hostServiceClient = new HostServiceClient();

export function startHostService() {
  return hostServiceClient.ensureStarted();
}

export function stopHostService() {
  return hostServiceClient.stop();
}

export function invokeHostService<TMethod extends HostServiceMethod>(
  method: TMethod,
  params: HostServiceRequestMap[TMethod],
  options?: HostServiceInvokeOptions,
) {
  return hostServiceClient.invoke(method, params, options);
}

export function onHostServiceEvent<TEvent extends keyof HostServiceEventMap>(
  eventName: TEvent,
  listener: (payload: HostServiceEventMap[TEvent]) => void,
) {
  return hostServiceClient.onEvent((event) => {
    if (event.event === eventName) {
      listener(event.payload as HostServiceEventMap[TEvent]);
    }
  });
}

export function onHostServiceDisconnect(listener: () => void) {
  return hostServiceClient.onDisconnect(listener);
}
