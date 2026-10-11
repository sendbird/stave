/**
 * Caller grants: which task and turn a Stave Local MCP call comes from.
 *
 * `runtime.ts` registers one for every primary turn that has a task, and
 * revokes it when the turn ends. The key travels in a request header the host
 * sets on the turn's Local MCP connection, never in the prompt, so a tool can
 * resolve its caller here instead of trusting ids a model typed:
 *
 * - `stave_delegate_task` and the other subagent tools refuse a
 *   `parentTaskId` that is not the calling task.
 * - `stave_run_task` caps the spawned turn at the caller's autonomy.
 * - A subagent or spawned turn runs on the calling turn's accounts.
 *
 * The key is derived from the task and a host secret, so a resumed Codex
 * thread, which keeps the headers it started with, still names its task after
 * a restart. It resolves only while that task has a live turn.
 *
 * Lives in the host service process, beside the agent run grants, because that
 * is where turns start.
 */
import { createHmac, randomBytes } from "node:crypto";
import type { Autonomy } from "../../src/lib/policy/turn-policy";
import type { ProviderId } from "../../src/lib/providers/provider.types";
import type { ProviderAccountSelection } from "../../src/lib/providers/provider-account-selection";

export interface CallerGrant {
  taskId: string;
  turnId: string;
  workspaceId: string | null;
  providerId: ProviderId;
  /** The calling turn's resolved autonomy; null when it had no turn policy. */
  autonomy: Autonomy | null;
  /** Whether the calling turn ran in Agent mode, so a turn it starts keeps the guardrails. */
  agentMode?: boolean;
  /** The calling turn's resolved accounts, so a turn it starts never falls back to System default. */
  accounts?: ProviderAccountSelection;
}

const grantsByKey = new Map<string, CallerGrant>();
let secret: string | null = null;
let loadSecret: (() => string) | null = null;

/** The host supplies a secret that survives restarts; without one, a per-process secret is used. */
export function setCallerGrantSecretSource(source: () => string) {
  loadSecret = source;
  secret = null;
}

function grantSecret() {
  if (secret) return secret;
  try {
    secret = loadSecret?.() || null;
  } catch (error) {
    console.warn("[caller-grants] falling back to a per-process secret", error);
  }
  secret ??= randomBytes(32).toString("hex");
  return secret;
}

export function callerKeyForTask(taskId: string) {
  return createHmac("sha256", grantSecret()).update(`caller:${taskId}`).digest("hex");
}

export function registerCallerGrant(grant: CallerGrant) {
  const key = callerKeyForTask(grant.taskId);
  const stored = { ...grant };
  grantsByKey.set(key, stored);
  return {
    key,
    revoke() {
      // A later turn of the same task may already own the key.
      if (grantsByKey.get(key) === stored) grantsByKey.delete(key);
    },
  };
}

/** The live grant for a key, or null once its turn has ended. */
export function resolveCallerGrant(callerKey: string): CallerGrant | null {
  const key = callerKey.trim();
  return key ? (grantsByKey.get(key) ?? null) : null;
}

export function clearCallerGrantsForTest() {
  grantsByKey.clear();
  secret = null;
  loadSecret = null;
}
