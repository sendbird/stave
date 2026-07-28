/**
 * Shared types for the general secret store (API tokens and other secret
 * values). Unlike Lens saved accounts, secrets are not bound to a hostname and
 * are never auto-filled anywhere; they are stored encrypted at rest and only
 * revealed on explicit user request.
 */

/** Metadata safe to send to the renderer. Never carries the secret value. */
export interface SecretMetadata {
  id: string;
  /** Human-friendly label, unique per store, e.g. "OpenAI API key". */
  name: string;
  /** Optional free-form note describing where the secret is used. */
  description: string;
  /** Non-secret preview of the value, e.g. the last 4 characters. */
  valuePreview: string;
  createdAt: string;
  updatedAt: string;
}

export interface SecretUpsertInput {
  id?: string;
  name: string;
  description?: string;
  /** Required when creating an entry. Omit while editing to keep the value. */
  value?: string;
}

export interface SecretRevealResult {
  id: string;
  value: string;
}

/** Longest value we accept, matching the IPC/vault schema bound. */
export const SECRET_VALUE_MAX_LENGTH = 8192;

/**
 * Build a non-secret preview of a value. Shows only the last few characters so
 * the list can distinguish entries without exposing the full secret. Short
 * values are fully masked.
 */
export function buildSecretPreview(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "";
  }
  if (trimmed.length <= 4) {
    return "•".repeat(trimmed.length);
  }
  return `••••${trimmed.slice(-4)}`;
}

/**
 * Normalize a secret name to a trimmed, non-empty label. Returns null when the
 * name is empty after trimming so a blank entry never saves.
 */
export function normalizeSecretName(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
