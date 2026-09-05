import type { HostServiceMethod } from "../host-service/protocol";

/**
 * Backstop deadline for a host-service request.
 *
 * This is deliberately far longer than any MCP or renderer caller's own
 * deadline: its job is to guarantee that a request can never leak a `pending`
 * entry forever when a response is dropped, not to police slow work. Methods
 * that legitimately run unbounded opt out via the override table below.
 */
export const HOST_SERVICE_DEFAULT_REQUEST_TIMEOUT_MS = 10 * 60_000;

/** Deadline for the child's `ready` handshake before we treat the spawn as failed. */
export const HOST_SERVICE_READY_TIMEOUT_MS = 60_000;

/**
 * Backstop for one Advisor consult.
 *
 * Exported because it is a rung on a ladder, not a local detail: every caller
 * *above* this one — the host-service client, the MCP tool-call deadline handed
 * to primaries, the stdio proxy — has to sit above it, so the innermost layer
 * is always the one that reports. See `STAVE_LOCAL_MCP_TOOL_TIMEOUT_MS`.
 */
export const HOST_SERVICE_ADVISOR_CONSULT_TIMEOUT_MS = 30 * 60_000;

/**
 * `null` means "no backstop": user-paced turns, streaming reads, OAuth logins
 * and long-lived script runs have no meaningful upper bound.
 */
const HOST_SERVICE_REQUEST_TIMEOUT_OVERRIDES_MS: Partial<
  Record<HostServiceMethod, number | null>
> = {
  "service.shutdown": 30_000,
  // One Advisor consult is bounded by `resolveAdvisorTimeoutMs`, which tops out
  // at 25 minutes for the `ultra` tier. The backstop stays bounded but must sit
  // above that ceiling, otherwise it would pre-empt the runtime's own
  // `advisor-timeout` outcome with a transport error the primary cannot read.
  "provider.consult-advisor": HOST_SERVICE_ADVISOR_CONSULT_TIMEOUT_MS,
  "provider.stream-turn": null,
  "provider.start-stream-turn": null,
  "provider.start-push-turn": null,
  "provider.read-stream-turn": null,
  "provider.steer-turn": null,
  "provider.review-diff": null,
  "provider.start-codex-review": null,
  "provider.start-codex-mcp-oauth-login": null,
  "provider.start-cursor-mcp-oauth-login": null,
  "runs.execute-secondary": null,
  "crane.run-task": null,
  "routine.invoke": null,
  "task-supervisor.invoke": null,
  "workspace-scripts.run-entry": null,
  "workspace-scripts.run-hook": null,
};

export interface HostServiceInvokeOptions {
  /**
   * Per-call backstop override in milliseconds, or `null` to disable it.
   * Omit to use the method's default.
   */
  timeoutMs?: number | null;
}

export function resolveHostServiceRequestTimeoutMs(args: {
  method: HostServiceMethod;
  override?: number | null;
}): number | null {
  if (args.override !== undefined) {
    return args.override;
  }
  const configured = HOST_SERVICE_REQUEST_TIMEOUT_OVERRIDES_MS[args.method];
  return configured === undefined
    ? HOST_SERVICE_DEFAULT_REQUEST_TIMEOUT_MS
    : configured;
}
