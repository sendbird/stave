import { z } from "zod";
import {
  CraneStaveJobV1Schema,
  CraneStaveReceiptV1Schema,
  type CraneStaveReceiptV1,
} from "../../../src/lib/crane-connector/contract";
import {
  CraneConnectorMetadataSchema,
  type CraneConnectorMetadata,
} from "../../../src/lib/crane-connector/types";

const MAX_RESPONSE_BYTES = 24_000;
const RETRY_AFTER_MS_MAX = 5 * 60 * 1_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

const ServerConnectorSchema = CraneConnectorMetadataSchema.extend({
  secretPrefix: z.string().trim().min(1).max(16),
  revokedAt: z.string().datetime({ offset: true }).nullable(),
}).strict();

const ExchangeResponseSchema = z
  .object({
    connector: ServerConnectorSchema,
    secret: z.string().trim().startsWith("stc_").max(128),
    pollRetryMs: z.number().int().min(1).max(RETRY_AFTER_MS_MAX),
  })
  .strict();

const NextJobResponseSchema = z
  .object({
    job: CraneStaveJobV1Schema,
    retryAfterMs: z.number().int().min(0).max(RETRY_AFTER_MS_MAX),
  })
  .strict();

const ClaimResponseSchema = z
  .object({
    job: CraneStaveJobV1Schema,
    leaseId: z.string().trim().startsWith("stl_").max(128),
    leaseExpiresAt: z.string().datetime({ offset: true }),
    nextSequence: z.number().int().min(1),
    retryAfterMs: z.number().int().min(1).max(RETRY_AFTER_MS_MAX),
  })
  .strict();

const ReceiptResponseSchema = z
  .object({
    ok: z.literal(true),
    duplicate: z.boolean(),
    jobState: z.string().trim().min(1).max(64),
    sequence: z.number().int().min(1),
    nextSequence: z.number().int().min(2),
  })
  .strict();

const HeartbeatResponseSchema = z.object({
  ok: z.literal(true),
  jobState: z.string().trim().min(1).max(64).optional(),
  leaseExpiresAt: z.string().datetime({ offset: true }).optional(),
  retryAfterMs: z.number().int().min(1).max(RETRY_AFTER_MS_MAX),
  tasksEnabled: z.boolean().optional(),
});

/**
 * Capability header on heartbeat and `jobs/next`.
 *
 * The idle poll is a 204 with no body, so the list flag cannot ride on JSON
 * there. A header is ignored by older clients and is how an idle connector
 * learns the flag without a second request.
 */
const TASKS_ENABLED_HEADER = "x-crane-tasks-enabled";

export function readCraneTasksEnabledHeader(
  response: Pick<Response, "headers">,
): boolean | null {
  const raw = response.headers.get(TASKS_ENABLED_HEADER);
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return null;
}

const RevokeResponseSchema = z.object({ ok: z.literal(true) }).strict();

const ErrorResponseSchema = z
  .object({
    error: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z][a-z0-9_]*$/),
    retryAfterMs: z.number().int().min(1).max(RETRY_AFTER_MS_MAX).optional(),
  })
  .passthrough();

export class CraneConnectorHttpError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly retryAfterMs?: number,
  ) {
    super(`Crane connector request failed (${code}).`);
    this.name = "CraneConnectorHttpError";
  }
}

export function normalizeCraneConnectorBaseUrl(
  input: string,
  options?: { allowInsecureLocalhost?: boolean },
) {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("Enter a valid Crane URL.");
  }
  const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const protocolAllowed =
    url.protocol === "https:" ||
    (options?.allowInsecureLocalhost === true &&
      isLocalhost &&
      url.protocol === "http:");
  if (!protocolAllowed || url.username || url.password) {
    throw new Error(
      "Crane must use HTTPS. HTTP is allowed only for localhost in development.",
    );
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Use the Crane origin without a path, query, or hash.");
  }
  return url.origin;
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new CraneConnectorHttpError("response_too_large", response.status);
  }
  if (!response.body) {
    return null;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      byteLength += value.byteLength;
      if (byteLength > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new CraneConnectorHttpError(
          "response_too_large",
          response.status,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new CraneConnectorHttpError("invalid_response", response.status);
  }
}

function toPublicMetadata(
  connector: z.infer<typeof ServerConnectorSchema>,
): CraneConnectorMetadata {
  return {
    id: connector.id,
    name: connector.name,
    protocolVersion: connector.protocolVersion,
    appVersion: connector.appVersion,
    capabilities: connector.capabilities,
    createdAt: connector.createdAt,
    lastSeenAt: connector.lastSeenAt,
  };
}

export class CraneConnectorHttpClient {
  private readonly baseUrl: string;
  private readonly requestTimeoutMs: number;
  private lastTasksEnabled: boolean | null = null;

  constructor(args: {
    baseUrl: string;
    fetch?: typeof fetch;
    allowInsecureLocalhost?: boolean;
    requestTimeoutMs?: number;
  }) {
    this.baseUrl = normalizeCraneConnectorBaseUrl(args.baseUrl, {
      allowInsecureLocalhost: args.allowInsecureLocalhost,
    });
    this.fetchImpl = args.fetch ?? fetch;
    this.requestTimeoutMs = Math.max(
      1,
      args.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    );
  }

  private readonly fetchImpl: typeof fetch;

  /**
   * Last `X-Crane-Tasks-Enabled` the idle poll or a heartbeat reported.
   *
   * Null until a response carries the header or JSON field. The tracker source
   * reads this instead of guessing from a collection 404.
   */
  getLastTasksEnabled(): boolean | null {
    return this.lastTasksEnabled;
  }

  private async request<T>(args: {
    path: string;
    method?: "GET" | "POST" | "DELETE";
    secret?: string;
    body?: unknown;
    signal?: AbortSignal;
    schema: z.ZodType<T>;
    allowNoContent?: boolean;
  }): Promise<T | null> {
    let response: Response;
    const timeoutSignal = AbortSignal.timeout(this.requestTimeoutMs);
    const signal = args.signal
      ? AbortSignal.any([args.signal, timeoutSignal])
      : timeoutSignal;
    try {
      response = await this.fetchImpl(new URL(args.path, this.baseUrl), {
        method: args.method ?? "GET",
        headers: {
          Accept: "application/json",
          ...(args.body === undefined
            ? {}
            : { "Content-Type": "application/json" }),
          ...(args.secret ? { Authorization: `Bearer ${args.secret}` } : {}),
        },
        body: args.body === undefined ? undefined : JSON.stringify(args.body),
        signal,
        cache: "no-store",
        redirect: "error",
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      throw new CraneConnectorHttpError("network_unavailable", 0);
    }

    const headerFlag = readCraneTasksEnabledHeader(response);
    if (headerFlag !== null) {
      this.lastTasksEnabled = headerFlag;
    }

    if (response.status === 204 && args.allowNoContent) {
      return null;
    }
    const payload = await readBoundedJson(response);
    if (!response.ok) {
      const parsedError = ErrorResponseSchema.safeParse(payload);
      throw new CraneConnectorHttpError(
        parsedError.success ? parsedError.data.error : "request_failed",
        response.status,
        parsedError.success ? parsedError.data.retryAfterMs : undefined,
      );
    }
    const parsed = args.schema.safeParse(payload);
    if (!parsed.success) {
      throw new CraneConnectorHttpError("invalid_response", response.status);
    }
    return parsed.data;
  }

  async exchangePairingCode(args: {
    code: string;
    name: string;
    appVersion: string;
    signal?: AbortSignal;
  }) {
    const response = await this.request({
      path: "/api/crane/stave/connectors/exchange",
      method: "POST",
      body: {
        code: args.code,
        name: args.name,
        protocolVersion: 1,
        appVersion: args.appVersion,
        capabilities: ["run_task"],
      },
      signal: args.signal,
      schema: ExchangeResponseSchema,
    });
    if (!response) {
      throw new CraneConnectorHttpError("invalid_response", 200);
    }
    return {
      connector: toPublicMetadata(response.connector),
      secret: response.secret,
      pollRetryMs: response.pollRetryMs,
    };
  }

  async getNextJob(args: { secret: string; signal?: AbortSignal }) {
    return this.request({
      path: "/api/crane/stave/connectors/jobs/next",
      secret: args.secret,
      signal: args.signal,
      schema: NextJobResponseSchema,
      allowNoContent: true,
    });
  }

  async claimJob(args: {
    secret: string;
    jobId: string;
    signal?: AbortSignal;
  }) {
    const response = await this.request({
      path: `/api/crane/stave/connectors/jobs/${encodeURIComponent(args.jobId)}/claim`,
      method: "POST",
      secret: args.secret,
      body: {},
      signal: args.signal,
      schema: ClaimResponseSchema,
    });
    if (!response) {
      throw new CraneConnectorHttpError("invalid_response", 200);
    }
    return response;
  }

  async postReceipt(args: {
    secret: string;
    jobId: string;
    leaseId: string;
    receipt: CraneStaveReceiptV1;
    signal?: AbortSignal;
  }) {
    const receipt = CraneStaveReceiptV1Schema.parse(args.receipt);
    const response = await this.request({
      path: `/api/crane/stave/connectors/jobs/${encodeURIComponent(args.jobId)}/receipts`,
      method: "POST",
      secret: args.secret,
      body: { leaseId: args.leaseId, receipt },
      signal: args.signal,
      schema: ReceiptResponseSchema,
    });
    if (!response) {
      throw new CraneConnectorHttpError("invalid_response", 200);
    }
    return response;
  }

  async heartbeat(args: {
    secret: string;
    jobId?: string;
    leaseId?: string;
    signal?: AbortSignal;
  }) {
    const response = await this.request({
      path: "/api/crane/stave/connectors/heartbeat",
      method: "POST",
      secret: args.secret,
      body:
        args.jobId && args.leaseId
          ? { jobId: args.jobId, leaseId: args.leaseId }
          : {},
      signal: args.signal,
      schema: HeartbeatResponseSchema,
    });
    if (!response) {
      throw new CraneConnectorHttpError("invalid_response", 200);
    }
    if (typeof response.tasksEnabled === "boolean") {
      this.lastTasksEnabled = response.tasksEnabled;
    }
    return response;
  }

  async revokeSelf(args: { secret: string; signal?: AbortSignal }) {
    const response = await this.request({
      path: "/api/crane/stave/connectors/self",
      method: "DELETE",
      secret: args.secret,
      signal: args.signal,
      schema: RevokeResponseSchema,
    });
    if (!response) {
      throw new CraneConnectorHttpError("invalid_response", 200);
    }
    return response;
  }
}
