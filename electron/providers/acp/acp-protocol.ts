import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { z, type ZodType } from "zod";
import { AcpNdjsonDecoder } from "./acp-ndjson";
import {
  AcpInitializeResponseSchema,
  AcpJsonRpcErrorSchema,
  AcpJsonRpcIdSchema,
  AcpLoadSessionResponseSchema,
  AcpNewSessionResponseSchema,
  AcpPromptResponseSchema,
  type AcpInitializeResponse,
  type AcpSessionConfigOption,
  type AcpSessionModeState,
} from "./acp-schemas";

const ACP_JSON_RPC_VERSION = "2.0";
const ACP_PROTOCOL_VERSION = 1;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_LINE_BYTES = 1024 * 1024;
const DEFAULT_MAX_STDERR_BYTES = 32 * 1024;
const ACP_KILL_ESCALATION_MS = 2_000;

type JsonRpcId = z.infer<typeof AcpJsonRpcIdSchema>;

export class AcpProtocolError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = "AcpProtocolError";
  }
}

export type AcpInboundRequestContext = {
  id: JsonRpcId;
  method: string;
  signal: AbortSignal;
};

export type AcpInboundRequestHandler = (
  params: unknown,
  context: AcpInboundRequestContext,
) => Promise<unknown> | unknown;

export interface AcpProtocolClientOptions {
  command: string;
  args: readonly string[];
  cwd: string;
  env: Record<string, string | undefined>;
  requestTimeoutMs?: number;
  maxLineBytes?: number;
  maxStderrBytes?: number;
  requestHandlers?: ReadonlyMap<string, AcpInboundRequestHandler>;
  onNotification?: (method: string, params: unknown) => boolean | void;
  onUnknownNotification?: (method: string) => void;
  onDiagnostic?: (message: string) => void;
  spawnProcess?: typeof spawn;
}

type PendingRequest = {
  method: string;
  schema: ZodType<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export interface AcpOpenSessionResult {
  sessionId: string;
  resumed: boolean;
  modes?: AcpSessionModeState | null;
  configOptions?: AcpSessionConfigOption[] | null;
}

export class AcpProtocolClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly stdoutDecoder: AcpNdjsonDecoder;
  private readonly pendingRequests = new Map<JsonRpcId, PendingRequest>();
  private readonly inboundRequests = new Map<JsonRpcId, AbortController>();
  private readonly requestHandlers: ReadonlyMap<
    string,
    AcpInboundRequestHandler
  >;
  private nextRequestId = 1;
  private initialized: AcpInitializeResponse | null = null;
  private stderrText = "";
  private closed = false;
  private closeError: Error | null = null;

  constructor(private readonly options: AcpProtocolClientOptions) {
    const spawnProcess = options.spawnProcess ?? spawn;
    this.requestHandlers = options.requestHandlers ?? new Map();
    this.stdoutDecoder = new AcpNdjsonDecoder(
      options.maxLineBytes ?? DEFAULT_MAX_LINE_BYTES,
    );
    this.child = spawnProcess(options.command, [...options.args], {
      cwd: options.cwd,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.bindProcess();
  }

  get stderr() {
    return this.stderrText;
  }

  get initializeResult() {
    return this.initialized;
  }

  async initialize(args: {
    clientName: string;
    clientVersion: string;
    clientCapabilities?: Record<string, unknown>;
  }) {
    const result = await this.request(
      "initialize",
      {
        protocolVersion: ACP_PROTOCOL_VERSION,
        clientInfo: {
          name: args.clientName,
          version: args.clientVersion,
        },
        clientCapabilities: args.clientCapabilities ?? {},
      },
      AcpInitializeResponseSchema,
    );
    if (result.protocolVersion !== ACP_PROTOCOL_VERSION) {
      throw new AcpProtocolError(
        `ACP protocol version ${result.protocolVersion} is unsupported.`,
      );
    }
    this.initialized = result;
    return result;
  }

  authenticate(methodId: string) {
    return this.request(
      "authenticate",
      { methodId },
      z.object({}).passthrough(),
    );
  }

  async openSession(args: {
    cwd: string;
    resumeSessionId?: string;
    mcpServers?: readonly unknown[];
  }): Promise<AcpOpenSessionResult> {
    const canResume = Boolean(
      args.resumeSessionId && this.initialized?.agentCapabilities.loadSession,
    );
    if (canResume) {
      const result = await this.request(
        "session/load",
        {
          sessionId: args.resumeSessionId,
          cwd: args.cwd,
          mcpServers: [...(args.mcpServers ?? [])],
        },
        AcpLoadSessionResponseSchema,
      );
      return {
        sessionId: args.resumeSessionId!,
        resumed: true,
        modes: result.modes,
        configOptions: result.configOptions,
      };
    }

    const result = await this.request(
      "session/new",
      {
        cwd: args.cwd,
        mcpServers: [...(args.mcpServers ?? [])],
      },
      AcpNewSessionResponseSchema,
    );
    return {
      sessionId: result.sessionId,
      resumed: false,
      modes: result.modes,
      configOptions: result.configOptions,
    };
  }

  setMode(args: { sessionId: string; modeId: string }) {
    return this.request(
      "session/set_mode",
      args,
      z.object({}).passthrough(),
    );
  }

  setConfigOption(args: {
    sessionId: string;
    configId: string;
    value: string | boolean;
  }) {
    return this.request(
      "session/set_config_option",
      args,
      z.object({}).passthrough(),
    );
  }

  prompt(args: {
    sessionId: string;
    prompt: readonly Record<string, unknown>[];
    parameterName?: "prompt" | "content";
  }) {
    return this.request(
      "session/prompt",
      {
        sessionId: args.sessionId,
        [args.parameterName ?? "prompt"]: [...args.prompt],
      },
      AcpPromptResponseSchema,
      { timeoutMs: 0 },
    );
  }

  setModel(args: { sessionId: string; modelId: string }) {
    return this.request(
      "session/set_model",
      args,
      z.object({}).passthrough(),
    );
  }

  cancel(sessionId: string) {
    return this.notify("session/cancel", { sessionId });
  }

  request<T>(
    method: string,
    params: unknown,
    schema: ZodType<T>,
    options: { timeoutMs?: number } = {},
  ): Promise<T> {
    if (this.closed) {
      return Promise.reject(
        this.closeError ?? new AcpProtocolError("ACP process is closed."),
      );
    }
    const id = this.nextRequestId++;
    const timeoutMs = options.timeoutMs ?? this.options.requestTimeoutMs ??
      DEFAULT_REQUEST_TIMEOUT_MS;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(
          new AcpProtocolError(
            `ACP request ${method} timed out after ${timeoutMs}ms.`,
          ),
        );
      }, timeoutMs > 0 ? timeoutMs : 2 ** 31 - 1);
      timer.unref?.();
      this.pendingRequests.set(id, {
        method,
        schema,
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });
      try {
        this.write({ jsonrpc: ACP_JSON_RPC_VERSION, id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  notify(method: string, params: unknown) {
    if (this.closed) {
      return Promise.reject(
        this.closeError ?? new AcpProtocolError("ACP process is closed."),
      );
    }
    this.write({ jsonrpc: ACP_JSON_RPC_VERSION, method, params });
    return Promise.resolve();
  }

  close(message = "ACP process closed by Stave.") {
    if (this.closed) {
      return;
    }
    this.fail(new AcpProtocolError(message));
    if (!this.child.killed) {
      this.child.kill("SIGTERM");
    }
    if (this.child.exitCode === null && this.child.signalCode === null) {
      const timer = setTimeout(() => {
        if (
          this.child.exitCode === null &&
          this.child.signalCode === null
        ) {
          this.child.kill("SIGKILL");
        }
      }, ACP_KILL_ESCALATION_MS);
      timer.unref?.();
    }
  }

  private bindProcess() {
    this.child.stdout.on("data", (chunk: Buffer) => {
      try {
        for (const line of this.stdoutDecoder.push(chunk)) {
          this.handleLine(line);
        }
      } catch (error) {
        this.fail(
          error instanceof Error ? error : new AcpProtocolError(String(error)),
        );
      }
    });
    this.child.stderr.on("data", (chunk: Buffer) => {
      const maxBytes =
        this.options.maxStderrBytes ?? DEFAULT_MAX_STDERR_BYTES;
      if (Buffer.byteLength(this.stderrText, "utf8") >= maxBytes) {
        return;
      }
      const remaining = maxBytes - Buffer.byteLength(this.stderrText, "utf8");
      this.stderrText += chunk.subarray(0, remaining).toString("utf8");
    });
    this.child.on("error", (error) => this.fail(error));
    this.child.on("exit", (code, signal) => {
      try {
        for (const line of this.stdoutDecoder.finish()) {
          this.handleLine(line);
        }
      } catch (error) {
        this.options.onDiagnostic?.(
          error instanceof Error ? error.message : String(error),
        );
      }
      this.fail(
        new AcpProtocolError(
          `ACP process exited (${code ?? "null"}/${signal ?? "none"}).`,
        ),
      );
    });
  }

  private handleLine(line: string) {
    if (this.closed) {
      return;
    }
    if (!line.trim()) {
      return;
    }
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      this.options.onDiagnostic?.("Ignored malformed ACP JSON message.");
      return;
    }
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      this.options.onDiagnostic?.("Ignored invalid ACP JSON-RPC envelope.");
      return;
    }
    const record = message as Record<string, unknown>;
    if (record.jsonrpc !== ACP_JSON_RPC_VERSION) {
      this.options.onDiagnostic?.("Ignored ACP message with invalid version.");
      return;
    }
    if (typeof record.method === "string") {
      const id = AcpJsonRpcIdSchema.safeParse(record.id);
      if (id.success) {
        void this.handleInboundRequest({
          id: id.data,
          method: record.method,
          params: record.params,
        });
      } else {
        const handled = this.options.onNotification?.(
          record.method,
          record.params,
        );
        if (!this.options.onNotification || handled === false) {
          this.options.onUnknownNotification?.(record.method);
        }
      }
      return;
    }
    const id = AcpJsonRpcIdSchema.safeParse(record.id);
    if (!id.success) {
      this.options.onDiagnostic?.("Ignored ACP response without a valid id.");
      return;
    }
    this.handleResponse(id.data, record);
  }

  private handleResponse(id: JsonRpcId, record: Record<string, unknown>) {
    const pending = this.pendingRequests.get(id);
    if (!pending) {
      this.options.onDiagnostic?.("Ignored ACP response for an unknown id.");
      return;
    }
    this.pendingRequests.delete(id);
    clearTimeout(pending.timer);
    if (record.error !== undefined) {
      const parsedError = AcpJsonRpcErrorSchema.safeParse(record.error);
      pending.reject(
        parsedError.success
          ? new AcpProtocolError(
              parsedError.data.message,
              parsedError.data.code,
              parsedError.data.data,
            )
          : new AcpProtocolError(
              `ACP request ${pending.method} returned an invalid error.`,
            ),
      );
      return;
    }
    const parsed = pending.schema.safeParse(record.result);
    if (!parsed.success) {
      pending.reject(
        new AcpProtocolError(
          `ACP response for ${pending.method} failed validation.`,
        ),
      );
      return;
    }
    pending.resolve(parsed.data);
  }

  private async handleInboundRequest(args: {
    id: JsonRpcId;
    method: string;
    params: unknown;
  }) {
    const handler = this.requestHandlers.get(args.method);
    if (!handler) {
      this.writeError(args.id, -32601, `Method not found: ${args.method}`);
      return;
    }
    const controller = new AbortController();
    this.inboundRequests.set(args.id, controller);
    try {
      const result = await handler(args.params, {
        id: args.id,
        method: args.method,
        signal: controller.signal,
      });
      if (!this.closed && !controller.signal.aborted) {
        this.write({
          jsonrpc: ACP_JSON_RPC_VERSION,
          id: args.id,
          result: result ?? {},
        });
      }
    } catch (error) {
      if (!this.closed && !controller.signal.aborted) {
        this.writeError(
          args.id,
          -32603,
          error instanceof Error ? error.message : "ACP request failed.",
        );
      }
    } finally {
      this.inboundRequests.delete(args.id);
    }
  }

  private writeError(id: JsonRpcId, code: number, message: string) {
    this.write({
      jsonrpc: ACP_JSON_RPC_VERSION,
      id,
      error: { code, message },
    });
  }

  private write(message: Record<string, unknown>) {
    if (this.closed || this.child.stdin.destroyed) {
      throw this.closeError ?? new AcpProtocolError("ACP stdin is closed.");
    }
    this.child.stdin.write(`${JSON.stringify(message)}\n`, "utf8");
  }

  private fail(error: Error) {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.closeError = error;
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pendingRequests.clear();
    for (const controller of this.inboundRequests.values()) {
      controller.abort(error);
    }
    this.inboundRequests.clear();
    this.options.onDiagnostic?.(error.message);
    if (!this.child.killed) {
      this.child.kill("SIGTERM");
    }
  }
}

export function createAcpRequestId() {
  return randomUUID();
}
