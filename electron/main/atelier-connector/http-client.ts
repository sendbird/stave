import { z } from "zod";

import { normalizeCraneConnectorBaseUrl } from "../crane-connector/http-client";
import { atelierApiBaseUrl } from "../../../src/lib/atelier-connector/hosts";
import { CraneStaveJobV1Schema } from "../../../src/lib/crane-connector/contract";
import {
  CRANE_TASKS_LIMITS,
  CraneTaskDetailResponseV1Schema,
  CraneTaskJobClaimRequestV1Schema,
  CraneTaskListResponseV1Schema,
} from "../../../src/lib/tracker-issues/contract";
import type { TrackerStatusCategory } from "../../../src/lib/tracker-issues/types";

const DEFAULT_MAX_RESPONSE_BYTES = 24_000;
const RETRY_AFTER_MS_MAX = 5 * 60 * 1_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

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

/**
 * What a claimed task job looks like coming back.
 *
 * Deliberately a copy of the dispatch client's private `ClaimResponseSchema`
 * (`electron/main/crane-connector/http-client.ts`) rather than an import: that
 * one is module-private, and the two routes reach the same job record from
 * opposite directions - Crane pushing a job at Stave, and Stave asking Crane to
 * open one. They answer identically today, so keep the two in step by hand
 * until one of them has a reason to diverge.
 */
const CraneTaskJobClaimResponseSchema = z.object({
  job: CraneStaveJobV1Schema,
  leaseId: z.string().trim().startsWith("stl_").max(128),
  leaseExpiresAt: z.string().datetime({ offset: true }),
  nextSequence: z.number().int().min(1),
  retryAfterMs: z.number().int().min(1).max(RETRY_AFTER_MS_MAX),
});

export type CraneTaskJobClaimResponse = z.infer<
  typeof CraneTaskJobClaimResponseSchema
>;

/**
 * Codes to use when a failed response carries no machine-readable body.
 *
 * The body is still authoritative when it parses - this only stops a bare
 * status from collapsing into `request_failed`, which the task routes would
 * otherwise do for the two outcomes the caller has to tell apart: a ticket that
 * is gone and a ticket the connector's scope does not cover. 409 stays generic
 * because `job_active` and `task_closed` are only distinguishable from the body.
 */
const STATUS_FALLBACK_CODES: Readonly<Record<number, string>> = Object.freeze({
  403: "forbidden",
  404: "not_found",
  409: "conflict",
});

export class AtelierConnectorHttpError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly retryAfterMs?: number,
  ) {
    super(`Atelier connector request failed (${code}).`);
    this.name = "AtelierConnectorHttpError";
  }
}

export function normalizeAtelierBaseUrl(
  input: string,
  options?: { allowInsecureLocalhost?: boolean },
) {
  try {
    return normalizeCraneConnectorBaseUrl(input, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid URL.";
    throw new Error(message.replaceAll("Crane", "Atelier"));
  }
}

async function readBoundedJson(
  response: Response,
  maxResponseBytes: number,
): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
    throw new AtelierConnectorHttpError("response_too_large", response.status);
  }
  if (!response.body) return null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maxResponseBytes) {
        await reader.cancel();
        throw new AtelierConnectorHttpError(
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
    throw new AtelierConnectorHttpError("invalid_response", response.status);
  }
}

export class AtelierConnectorHttpClient {
  /** Where requests go: the API host derived from the configured Atelier URL. */
  private readonly apiBaseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly requestTimeoutMs: number;

  constructor(args: {
    baseUrl: string;
    fetch?: typeof fetch;
    allowInsecureLocalhost?: boolean;
    requestTimeoutMs?: number;
  }) {
    this.apiBaseUrl = atelierApiBaseUrl(
      normalizeAtelierBaseUrl(args.baseUrl, {
        allowInsecureLocalhost: args.allowInsecureLocalhost,
      }),
    );
    this.fetchImpl = args.fetch ?? fetch;
    this.requestTimeoutMs = Math.max(
      1,
      args.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    );
  }

  private async request<T>(args: {
    path: string;
    method?: "GET" | "POST";
    secret?: string;
    body?: unknown;
    signal?: AbortSignal;
    schema: z.ZodType<T>;
    maxResponseBytes?: number;
  }): Promise<T> {
    let response: Response;
    const timeoutSignal = AbortSignal.timeout(this.requestTimeoutMs);
    const signal = args.signal
      ? AbortSignal.any([args.signal, timeoutSignal])
      : timeoutSignal;
    try {
      response = await this.fetchImpl(new URL(args.path, this.apiBaseUrl), {
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
      throw new AtelierConnectorHttpError("network_unavailable", 0);
    }

    const payload = await readBoundedJson(
      response,
      args.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
    );
    if (!response.ok) {
      const parsedError = ErrorResponseSchema.safeParse(payload);
      throw new AtelierConnectorHttpError(
        parsedError.success
          ? parsedError.data.error
          : (STATUS_FALLBACK_CODES[response.status] ?? "request_failed"),
        response.status,
        parsedError.success ? parsedError.data.retryAfterMs : undefined,
      );
    }
    const parsed = args.schema.safeParse(payload);
    if (!parsed.success) {
      throw new AtelierConnectorHttpError("invalid_response", response.status);
    }
    return parsed.data;
  }

  /**
   * One page of the caller's Crane work list.
   *
   * Paging is left to the caller: this client stays a single request per call so
   * an abort signal cancels exactly one round trip, and the page budget lives
   * next to the code that owns the list.
   */
  async listCraneTasks(args: {
    secret: string;
    status?: readonly TrackerStatusCategory[];
    updatedAfter?: string;
    limit?: number;
    cursor?: string;
    signal?: AbortSignal;
  }) {
    const search = new URLSearchParams();
    // `status` repeats instead of joining on a separator so the filter can never
    // become ambiguous if a status value ever contains one.
    for (const status of args.status ?? []) search.append("status", status);
    if (args.updatedAfter) search.set("updatedAfter", args.updatedAfter);
    if (args.limit !== undefined) search.set("limit", String(args.limit));
    if (args.cursor) search.set("cursor", args.cursor);
    const suffix = search.size > 0 ? `?${search}` : "";
    return this.request({
      path: `/api/crane/stave/tasks${suffix}`,
      secret: args.secret,
      signal: args.signal,
      schema: CraneTaskListResponseV1Schema,
      maxResponseBytes: CRANE_TASKS_LIMITS.listBytes,
    });
  }

  async getCraneTask(args: {
    secret: string;
    taskRef: string;
    signal?: AbortSignal;
  }) {
    return this.request({
      path: `/api/crane/stave/tasks/${encodeURIComponent(args.taskRef)}`,
      secret: args.secret,
      signal: args.signal,
      schema: CraneTaskDetailResponseV1Schema,
      maxResponseBytes: CRANE_TASKS_LIMITS.detailBytes,
    });
  }

  /**
   * Ask Crane to open a job for a ticket this Stave is about to run.
   *
   * The body is validated locally first so an instruction that is empty or over
   * budget fails here, where the caller can still show the user their own text,
   * rather than as an opaque 400 after the round trip.
   */
  async createCraneTaskJob(args: {
    secret: string;
    taskRef: string;
    instruction: string;
    signal?: AbortSignal;
  }): Promise<CraneTaskJobClaimResponse> {
    const body = CraneTaskJobClaimRequestV1Schema.parse({
      protocolVersion: 1,
      instruction: args.instruction,
    });
    return this.request({
      path: `/api/crane/stave/tasks/${encodeURIComponent(args.taskRef)}/stave-jobs/claim`,
      method: "POST",
      secret: args.secret,
      body,
      signal: args.signal,
      schema: CraneTaskJobClaimResponseSchema,
    });
  }
}
