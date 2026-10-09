/**
 * An agent's request for a secret: `stave_request_secret` shows a masked card
 * in the calling task and waits for the user. The value never travels through
 * the tool. It goes renderer -> main through `secret-requests:respond`, is
 * written to the vault there, and only the secret's id comes back so the
 * renderer can bind it to the task for the next turn.
 *
 * Everything in this module except `SecretRequestResponse` is metadata that is
 * safe to publish to the renderer and to return to the model.
 *
 * Used by `electron/main/browser/secret-request-broker.ts`,
 * `electron/main/ipc/secret-requests.ts`, `electron/preload.ts`,
 * `src/types/window-api.d.ts` and `src/store/secret-requests-store.ts`.
 */
import type { ProviderId } from "@/lib/providers/provider.types";
import { MAX_BOUND_SECRETS } from "./secrets";

export const SECRET_REQUEST_IPC = Object.freeze({
  list: "secret-requests:list",
  respond: "secret-requests:respond",
  /** Main -> renderer: a `SecretRequestsChangedEvent`. */
  changed: "secret-requests:changed",
});

/** How long a request waits for the user before the tool returns `timed_out`. */
export const SECRET_REQUEST_TIMEOUT_MS = 10 * 60_000;
export const SECRET_REQUEST_REASON_MAX_LENGTH = 500;
export const SECRET_REQUEST_LABEL_MAX_LENGTH = 120;
/** Requests one task may have waiting at once, so a looping agent cannot stack cards. */
export const MAX_PENDING_SECRET_REQUESTS_PER_TASK = 4;

export type SecretRequestStatus = "saved" | "declined" | "timed_out" | "cancelled";

/**
 * The whole tool result. It names the variable and never carries the value.
 * A type alias, not an interface, so it satisfies MCP's structured content.
 */
export type SecretRequestToolResult = {
  status: SecretRequestStatus;
  envVar: string;
  /** Present only when saved: a running turn cannot receive a new variable. */
  availableFrom?: "next-turn";
  /** The user bound a secret that was already in the vault instead of entering one. */
  reusedExisting?: boolean;
};

/** A vault secret that already uses the requested variable name. */
export interface SecretRequestExistingSecret {
  id: string;
  name: string;
  /** The vault's non-secret preview (last four characters at most). */
  valuePreview: string;
}

/** A request waiting for the user, as the renderer sees it. */
export interface PendingSecretRequest {
  id: string;
  taskId: string;
  workspaceId: string | null;
  turnId: string;
  providerId: ProviderId;
  envVarName: string;
  /** Model-authored, plain text. */
  reason: string;
  /** Model-authored label used as the vault name when the user saves. */
  label: string | null;
  existingSecret: SecretRequestExistingSecret | null;
  createdAt: string;
  expiresAt: string;
}

export interface SecretRequestsChangedEvent {
  requests: PendingSecretRequest[];
}

/**
 * The user's answer. `save` carries the value; it is the only shape here that
 * does, and it crosses IPC renderer -> main only.
 */
export type SecretRequestResponse =
  | { requestId: string; action: "save"; value: string }
  | { requestId: string; action: "use-existing" }
  | { requestId: string; action: "decline" };

export type SecretRequestRespondFailure =
  | "not-pending"
  | "invalid"
  | "existing-missing"
  | "vault-error";

export interface SecretRequestRespondResult {
  ok: boolean;
  /** The saved or reused secret, for the renderer to bind. Never a value. */
  secretId?: string;
  reason?: SecretRequestRespondFailure;
  /** Untranslated technical detail, shown after a translated summary. */
  message?: string;
}

export interface SecretRequestListResult {
  ok: boolean;
  requests: PendingSecretRequest[];
}

export interface SecretRequestsBridgeApi {
  list: () => Promise<SecretRequestListResult>;
  respond: (args: SecretRequestResponse) => Promise<SecretRequestRespondResult>;
  subscribeChanged: (listener: (event: SecretRequestsChangedEvent) => void) => () => void;
}

export type BindRequestedSecretOutcome = "bound" | "already-bound" | "at-cap";

/**
 * What binding would do, without changing anything. `secretId` is null for a
 * secret the user has not saved yet, which cannot be bound already.
 */
export function previewSecretBinding(
  current: readonly string[] | undefined,
  secretId: string | null,
  max: number = MAX_BOUND_SECRETS,
): BindRequestedSecretOutcome {
  const ids = new Set(current ?? []);
  if (secretId && ids.has(secretId)) return "already-bound";
  return ids.size >= max ? "at-cap" : "bound";
}

/**
 * The task's next bound-secret set after binding `secretId`. A secret that is
 * already bound changes nothing; a full set refuses rather than dropping one.
 */
export function nextBoundSecretIds(
  current: readonly string[] | undefined,
  secretId: string,
  max: number = MAX_BOUND_SECRETS,
): { ids: string[]; outcome: BindRequestedSecretOutcome } {
  const ids = [...new Set(current ?? [])];
  if (ids.includes(secretId)) {
    return { ids, outcome: "already-bound" };
  }
  if (ids.length >= max) {
    return { ids, outcome: "at-cap" };
  }
  return { ids: [...ids, secretId], outcome: "bound" };
}
