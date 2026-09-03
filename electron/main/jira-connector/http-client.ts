import { z } from "zod";

import { normalizeJiraSiteUrl } from "../../../src/lib/jira-connector/types";

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const RETRY_AFTER_MS_MAX = 5 * 60 * 1_000;

/**
 * Per-call ceilings rather than one global budget: `myself` returns a single
 * small user record, a search page is bounded by `maxResults` but each issue
 * carries a nested status/priority/user graph, and one issue additionally
 * carries a description that Jira itself allows to be very large.
 */
export const JIRA_MYSELF_MAX_RESPONSE_BYTES = 24_000;
export const JIRA_SEARCH_MAX_RESPONSE_BYTES = 1_048_576;
export const JIRA_ISSUE_MAX_RESPONSE_BYTES = 262_144;

const LIST_FIELDS = [
  "summary",
  "status",
  "priority",
  "issuetype",
  "assignee",
  "labels",
  "duedate",
  "updated",
  "created",
  "resolutiondate",
  "project",
  "parent",
] as const;

const DETAIL_FIELDS = [...LIST_FIELDS, "description"] as const;

const MyselfResponseSchema = z.object({
  accountId: z.string().trim().min(1).max(128),
  displayName: z.string().trim().min(1).max(200).nullish(),
});

const SearchResponseSchema = z.object({
  issues: z.array(z.unknown()).max(500).nullish(),
  nextPageToken: z.string().trim().min(1).max(4_096).nullish(),
  isLast: z.boolean().nullish(),
});

export interface JiraCredential {
  email: string;
  token: string;
}

/**
 * A Jira failure reduced to a stable code.
 *
 * The message is derived from the code alone. Neither the credential nor the
 * server's response body may appear on this error: it is rendered in the
 * Settings surface, written to logs, and serialized across IPC, so anything it
 * carries is effectively public.
 */
export class JiraHttpError extends Error {
  constructor(
    readonly code: string,
    readonly status?: number,
    readonly retryAfterMs?: number,
  ) {
    super(`Jira request failed (${code}).`);
    this.name = "JiraHttpError";
  }
}

/**
 * `Retry-After` is either delta-seconds or an HTTP-date; Jira Cloud uses both
 * depending on which edge rate-limits the call.
 */
export function parseJiraRetryAfterMs(
  header: string | null,
): number | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  if (trimmed.length === 0) return undefined;
  if (/^\d+$/.test(trimmed)) {
    return Math.min(Number(trimmed) * 1_000, RETRY_AFTER_MS_MAX);
  }
  const at = Date.parse(trimmed);
  if (!Number.isFinite(at)) return undefined;
  return Math.min(Math.max(at - Date.now(), 0), RETRY_AFTER_MS_MAX);
}

function toErrorCode(status: number): string {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 400) return "invalid_jql";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  return "request_failed";
}

async function readBoundedJson(
  response: Response,
  maxResponseBytes: number,
): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
    throw new JiraHttpError("response_too_large", response.status);
  }
  if (!response.body) {
    throw new JiraHttpError("invalid_response", response.status);
  }

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
        throw new JiraHttpError("response_too_large", response.status);
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
    throw new JiraHttpError("invalid_response", response.status);
  }
}

export class JiraHttpClient {
  readonly siteUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly requestTimeoutMs: number;

  constructor(args: {
    siteUrl: string;
    fetch?: typeof fetch;
    requestTimeoutMs?: number;
  }) {
    this.siteUrl = normalizeJiraSiteUrl(args.siteUrl);
    this.fetchImpl = args.fetch ?? fetch;
    this.requestTimeoutMs = Math.max(
      1,
      args.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    );
  }

  private async request<T>(args: {
    path: string;
    query?: Record<string, string>;
    credential: JiraCredential;
    maxResponseBytes: number;
    schema: z.ZodType<T>;
    signal?: AbortSignal;
  }): Promise<T> {
    // The site may be mounted under a path prefix, so the API path is appended
    // to it instead of resolved against the origin.
    const url = new URL(`${this.siteUrl}${args.path}`);
    for (const [key, value] of Object.entries(args.query ?? {})) {
      url.searchParams.set(key, value);
    }

    const timeoutSignal = AbortSignal.timeout(this.requestTimeoutMs);
    const signal = args.signal
      ? AbortSignal.any([args.signal, timeoutSignal])
      : timeoutSignal;

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(
            `${args.credential.email}:${args.credential.token}`,
            "utf8",
          ).toString("base64")}`,
        },
        signal,
        cache: "no-store",
        redirect: "error",
      });
    } catch (error) {
      // A caller-initiated abort is a cancellation, not a connectivity fault:
      // reporting it as one would raise an error banner every time the tracker
      // surface is closed mid-refresh.
      if (args.signal?.aborted) throw error;
      throw new JiraHttpError("network_unavailable", 0);
    }

    if (!response.ok) {
      // The body is discarded unread. Jira error payloads echo the JQL and can
      // quote request headers, and none of that may reach a log line.
      await response.body?.cancel().catch(() => undefined);
      throw new JiraHttpError(
        toErrorCode(response.status),
        response.status,
        response.status === 429
          ? parseJiraRetryAfterMs(response.headers.get("retry-after"))
          : undefined,
      );
    }

    const payload = await readBoundedJson(response, args.maxResponseBytes);
    const parsed = args.schema.safeParse(payload);
    if (!parsed.success) {
      throw new JiraHttpError("invalid_response", response.status);
    }
    return parsed.data;
  }

  /** Identity of the token holder, used to validate a credential before it is stored. */
  async getMyself(args: {
    email: string;
    token: string;
    signal?: AbortSignal;
  }): Promise<{ accountId: string; displayName: string | null }> {
    const response = await this.request({
      path: "/rest/api/3/myself",
      credential: { email: args.email, token: args.token },
      maxResponseBytes: JIRA_MYSELF_MAX_RESPONSE_BYTES,
      schema: MyselfResponseSchema,
      signal: args.signal,
    });
    return {
      accountId: response.accountId,
      displayName: response.displayName ?? null,
    };
  }

  async searchIssues(args: {
    email: string;
    token: string;
    jql: string;
    maxResults: number;
    nextPageToken?: string;
    signal?: AbortSignal;
  }): Promise<{
    issues: unknown[];
    nextPageToken: string | null;
    hasMore: boolean;
  }> {
    const response = await this.request({
      path: "/rest/api/3/search/jql",
      query: {
        jql: args.jql,
        maxResults: String(args.maxResults),
        fields: LIST_FIELDS.join(","),
        ...(args.nextPageToken ? { nextPageToken: args.nextPageToken } : {}),
      },
      credential: { email: args.email, token: args.token },
      maxResponseBytes: JIRA_SEARCH_MAX_RESPONSE_BYTES,
      schema: SearchResponseSchema,
      signal: args.signal,
    });
    return {
      issues: response.issues ?? [],
      nextPageToken: response.nextPageToken ?? null,
      // A continuation token and `isLast: false` both mean "there is more";
      // the endpoint has sent either spelling depending on deployment.
      hasMore: Boolean(response.nextPageToken) || response.isLast === false,
    };
  }

  async getIssue(args: {
    email: string;
    token: string;
    key: string;
    signal?: AbortSignal;
  }): Promise<unknown> {
    return this.request({
      path: `/rest/api/3/issue/${encodeURIComponent(args.key)}`,
      query: { fields: DETAIL_FIELDS.join(",") },
      credential: { email: args.email, token: args.token },
      maxResponseBytes: JIRA_ISSUE_MAX_RESPONSE_BYTES,
      schema: z.unknown(),
      signal: args.signal,
    });
  }
}
