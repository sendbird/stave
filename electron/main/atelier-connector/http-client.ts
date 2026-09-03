import { z } from "zod";

import {
  AtelierConnectorScopeSchema,
  type AtelierConnectorScope,
} from "../../../src/lib/atelier-connector/types";
import {
  MartinContextBundleV1Schema,
  MartinProjectListResponseV1Schema,
  STAVE_SYNC_CONTRACT_VERSION,
  StaveSyncEventsRequestV1Schema,
  StaveSyncEventsResponseV1Schema,
  StaveSyncLinksMergeRequestV1Schema,
  StaveSyncLinksMergeResponseV1Schema,
  toMartinProjectSummary,
  type MartinContextBundleV1,
  type StaveSyncEventV1,
  type StaveSyncLinkV1,
} from "../../../src/lib/martin-sync/contract";
import {
  CraneConnectorMetadataSchema,
  type CraneConnectorMetadata,
} from "../../../src/lib/crane-connector/types";
import { normalizeCraneConnectorBaseUrl } from "../crane-connector/http-client";
import { CraneStaveJobV1Schema } from "../../../src/lib/crane-connector/contract";
import {
  CRANE_TASKS_LIMITS,
  CraneTaskDetailResponseV1Schema,
  CraneTaskJobClaimRequestV1Schema,
  CraneTaskListResponseV1Schema,
} from "../../../src/lib/tracker-tasks/contract";
import type { TrackerStatusCategory } from "../../../src/lib/tracker-tasks/types";

const DEFAULT_MAX_RESPONSE_BYTES = 24_000;
const SYNC_MAX_RESPONSE_BYTES = 64_000;
const CONTEXT_BUNDLE_MAX_RESPONSE_BYTES = 512 * 1_024;
const RETRY_AFTER_MS_MAX = 5 * 60 * 1_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

const ServerConnectorSchema = CraneConnectorMetadataSchema.extend({
  secretPrefix: z.string().trim().min(1).max(16),
  revokedAt: z.string().datetime({ offset: true }).nullable(),
  scopes: z.array(AtelierConnectorScopeSchema).min(1).max(2).optional(),
}).strict();

const ExchangeResponseSchema = z
  .object({
    connector: ServerConnectorSchema,
    secret: z.string().trim().startsWith("stc_").max(128),
    pollRetryMs: z.number().int().min(1).max(RETRY_AFTER_MS_MAX),
  })
  .strict();

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
const CraneTaskJobClaimResponseSchema = z
  .object({
    job: CraneStaveJobV1Schema,
    leaseId: z.string().trim().startsWith("stl_").max(128),
    leaseExpiresAt: z.string().datetime({ offset: true }),
    nextSequence: z.number().int().min(1),
    retryAfterMs: z.number().int().min(1).max(RETRY_AFTER_MS_MAX),
  })
  .strict();

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

export class AtelierConnectorHttpClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly requestTimeoutMs: number;

  constructor(args: {
    baseUrl: string;
    fetch?: typeof fetch;
    allowInsecureLocalhost?: boolean;
    requestTimeoutMs?: number;
  }) {
    this.baseUrl = normalizeAtelierBaseUrl(args.baseUrl, {
      allowInsecureLocalhost: args.allowInsecureLocalhost,
    });
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

  async exchangePairingCode(args: {
    code: string;
    name: string;
    appVersion: string;
    requestedScopes: AtelierConnectorScope[];
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
        requestedScopes: args.requestedScopes,
      },
      signal: args.signal,
      schema: ExchangeResponseSchema,
    });
    return {
      connector: toPublicMetadata(response.connector),
      secret: response.secret,
      pollRetryMs: response.pollRetryMs,
      scopes:
        response.connector.scopes ?? (["crane"] as AtelierConnectorScope[]),
    };
  }

  async listMartinProjects(args: {
    secret: string;
    query?: string;
    limit?: number;
    signal?: AbortSignal;
  }) {
    const search = new URLSearchParams();
    if (args.query) search.set("query", args.query);
    if (args.limit !== undefined) search.set("limit", String(args.limit));
    const suffix = search.size > 0 ? `?${search}` : "";
    const response = await this.request({
      path: `/api/martin/stave/projects${suffix}`,
      secret: args.secret,
      signal: args.signal,
      schema: MartinProjectListResponseV1Schema,
      maxResponseBytes: SYNC_MAX_RESPONSE_BYTES,
    });
    return response.projects.map((project) =>
      toMartinProjectSummary(project, this.baseUrl),
    );
  }

  async getMartinContextBundle(args: {
    secret: string;
    projectRef: string;
    signal?: AbortSignal;
  }): Promise<MartinContextBundleV1> {
    return this.request({
      path: `/api/martin/stave/projects/${encodeURIComponent(args.projectRef)}/context-bundle`,
      secret: args.secret,
      signal: args.signal,
      schema: MartinContextBundleV1Schema,
      maxResponseBytes: CONTEXT_BUNDLE_MAX_RESPONSE_BYTES,
    });
  }

  async postMartinEvents(args: {
    secret: string;
    projectRef: string;
    events: StaveSyncEventV1[];
    signal?: AbortSignal;
  }) {
    const body = StaveSyncEventsRequestV1Schema.parse({
      contract: STAVE_SYNC_CONTRACT_VERSION,
      events: args.events,
    });
    const response = await this.request({
      path: `/api/martin/stave/projects/${encodeURIComponent(args.projectRef)}/events`,
      method: "POST",
      secret: args.secret,
      body,
      signal: args.signal,
      schema: StaveSyncEventsResponseV1Schema,
      maxResponseBytes: SYNC_MAX_RESPONSE_BYTES,
    });
    return response.results;
  }

  async mergeMartinLinks(args: {
    secret: string;
    projectRef: string;
    links: StaveSyncLinkV1[];
    signal?: AbortSignal;
  }) {
    const body = StaveSyncLinksMergeRequestV1Schema.parse({
      contract: STAVE_SYNC_CONTRACT_VERSION,
      links: args.links,
    });
    const response = await this.request({
      path: `/api/martin/stave/projects/${encodeURIComponent(args.projectRef)}/links/merge`,
      method: "POST",
      secret: args.secret,
      body,
      signal: args.signal,
      schema: StaveSyncLinksMergeResponseV1Schema,
      maxResponseBytes: SYNC_MAX_RESPONSE_BYTES,
    });
    const counts = { inserted: 0, updated: 0, skipped: 0 };
    for (const result of response.results) counts[result.action] += 1;
    return { ok: true as const, ...counts };
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
