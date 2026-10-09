import { randomUUID } from "node:crypto";
import type { ProviderId } from "../../../src/lib/providers/provider.types";
import {
  normalizeEnvVarName,
  type SecretMetadata,
  type SecretUpsertInput,
} from "../../../src/lib/secrets/secrets";
import {
  MAX_PENDING_SECRET_REQUESTS_PER_TASK,
  SECRET_REQUEST_LABEL_MAX_LENGTH,
  SECRET_REQUEST_REASON_MAX_LENGTH,
  SECRET_REQUEST_TIMEOUT_MS,
  type PendingSecretRequest,
  type SecretRequestRespondResult,
  type SecretRequestResponse,
  type SecretRequestToolResult,
} from "../../../src/lib/secrets/secret-request";

/** A request the broker refuses before any card is shown. The message is model-facing. */
export class SecretRequestError extends Error {}

export interface SecretRequestCaller {
  taskId: string;
  workspaceId: string | null;
  turnId: string;
  providerId: ProviderId;
}

export interface SecretRequestBrokerDeps {
  /** Vault metadata only. */
  listSecrets: () => Promise<SecretMetadata[]>;
  upsertSecret: (input: SecretUpsertInput) => Promise<SecretMetadata>;
  /** Push the pending set to the renderer. Called with metadata only. */
  publish: (requests: PendingSecretRequest[]) => void;
  timeoutMs?: number;
  now?: () => number;
  createId?: () => string;
}

interface PendingEntry {
  view: PendingSecretRequest;
  resolve: (result: SecretRequestToolResult) => void;
  timer: ReturnType<typeof setTimeout>;
  detachAbort: () => void;
  /** A save or bind is in flight; the deadline waits for it. */
  settling: boolean;
  expiredWhileSettling: boolean;
}

function boundedText(value: string | undefined, max: number) {
  const trimmed = (value ?? "").trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/**
 * A vault name that no other secret uses (names are unique case-insensitively).
 * Starts from the agent's label, then qualifies it with the variable name.
 */
export function uniqueSecretName(
  base: string,
  envVarName: string,
  secrets: readonly SecretMetadata[],
) {
  const taken = new Set(secrets.map((secret) => secret.name.toLowerCase()));
  const candidates = [base, `${base} (${envVarName})`];
  for (const candidate of candidates) {
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  for (let index = 2; ; index += 1) {
    const candidate = `${base} (${envVarName}) ${index}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/**
 * Owns the requests agents make through `stave_request_secret`: one pending
 * entry per card, settled by the user's answer, the deadline, or the tool call
 * being cancelled. The tool's promise resolves to metadata only; the value is
 * accepted solely by `respond`, written to the vault, and dropped.
 */
export class SecretRequestBroker {
  private readonly pending = new Map<string, PendingEntry>();

  constructor(private readonly deps: SecretRequestBrokerDeps) {}

  list(): PendingSecretRequest[] {
    return [...this.pending.values()].map((entry) => entry.view);
  }

  async request(args: {
    caller: SecretRequestCaller;
    envVar: string;
    reason: string;
    label?: string;
    signal?: AbortSignal;
  }): Promise<SecretRequestToolResult> {
    let envVarName: string | undefined;
    try {
      envVarName = normalizeEnvVarName(args.envVar);
    } catch (error) {
      throw new SecretRequestError(error instanceof Error ? error.message : String(error));
    }
    if (!envVarName) {
      throw new SecretRequestError("Name the environment variable the secret should be exposed as.");
    }
    const reason = boundedText(args.reason, SECRET_REQUEST_REASON_MAX_LENGTH);
    if (!reason) {
      throw new SecretRequestError("Say briefly why the secret is needed; the user reads it on the card.");
    }
    const label = boundedText(args.label, SECRET_REQUEST_LABEL_MAX_LENGTH) || null;
    this.assertRoomForRequest(args.caller.taskId, envVarName);

    let secrets: SecretMetadata[];
    try {
      secrets = await this.deps.listSecrets();
    } catch (error) {
      throw new SecretRequestError(
        `Stave's secret storage is unavailable (${error instanceof Error ? error.message : String(error)}). Ask the user to check Settings > Secrets.`,
      );
    }
    // Checked again after the await: from here to `pending.set` is synchronous,
    // so two concurrent calls cannot both open a card for one variable.
    this.assertRoomForRequest(args.caller.taskId, envVarName);
    if (args.signal?.aborted) {
      return { status: "cancelled", envVar: envVarName };
    }
    const existing = secrets.find((secret) => secret.envVarName === envVarName);
    const now = (this.deps.now ?? Date.now)();
    const timeoutMs = this.deps.timeoutMs ?? SECRET_REQUEST_TIMEOUT_MS;
    const view: PendingSecretRequest = {
      id: (this.deps.createId ?? randomUUID)(),
      taskId: args.caller.taskId,
      workspaceId: args.caller.workspaceId,
      turnId: args.caller.turnId,
      providerId: args.caller.providerId,
      envVarName,
      reason,
      label,
      existingSecret: existing
        ? { id: existing.id, name: existing.name, valuePreview: existing.valuePreview }
        : null,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + timeoutMs).toISOString(),
    };

    return new Promise<SecretRequestToolResult>((resolve) => {
      const onAbort = () => this.settle(view.id, { status: "cancelled", envVar: view.envVarName });
      args.signal?.addEventListener("abort", onAbort, { once: true });
      const entry: PendingEntry = {
        view,
        resolve,
        timer: setTimeout(() => this.expire(view.id), timeoutMs),
        detachAbort: () => args.signal?.removeEventListener("abort", onAbort),
        settling: false,
        expiredWhileSettling: false,
      };
      this.pending.set(view.id, entry);
      this.publish();
    });
  }

  /**
   * The user's answer from the card. `save` writes the value to the vault and
   * returns only the secret id; the value is not kept, logged or published.
   */
  async respond(response: SecretRequestResponse): Promise<SecretRequestRespondResult> {
    const entry = this.pending.get(response.requestId);
    if (!entry || entry.settling) {
      return { ok: false, reason: "not-pending" };
    }
    const { view } = entry;
    if (response.action === "decline") {
      this.settle(view.id, { status: "declined", envVar: view.envVarName });
      return { ok: true };
    }
    entry.settling = true;
    let outcome: SecretRequestRespondResult = { ok: false, reason: "invalid" };
    try {
      outcome = response.action === "use-existing"
        ? await this.useExisting(view)
        : await this.saveValue(view, response.value);
    } catch (error) {
      outcome = {
        ok: false,
        reason: "vault-error",
        message: error instanceof Error ? error.message : String(error),
      };
    } finally {
      entry.settling = false;
    }
    if (outcome.ok) {
      this.settle(view.id, {
        status: "saved",
        envVar: view.envVarName,
        availableFrom: "next-turn",
        ...(response.action === "use-existing" ? { reusedExisting: true } : {}),
      });
    } else if (entry.expiredWhileSettling) {
      this.settle(view.id, { status: "timed_out", envVar: view.envVarName });
    }
    return outcome;
  }

  private assertRoomForRequest(taskId: string, envVarName: string) {
    const forTask = this.list().filter((view) => view.taskId === taskId);
    if (forTask.some((view) => view.envVarName === envVarName)) {
      throw new SecretRequestError(
        `A request for ${envVarName} is already waiting for the user in this task.`,
      );
    }
    if (forTask.length >= MAX_PENDING_SECRET_REQUESTS_PER_TASK) {
      throw new SecretRequestError(
        `This task already has ${MAX_PENDING_SECRET_REQUESTS_PER_TASK} secret requests waiting for the user.`,
      );
    }
  }

  private async useExisting(view: PendingSecretRequest): Promise<SecretRequestRespondResult> {
    const existing = view.existingSecret;
    if (!existing) {
      return { ok: false, reason: "invalid" };
    }
    const secrets = await this.deps.listSecrets();
    const match = secrets.find(
      (secret) => secret.id === existing.id && secret.envVarName === view.envVarName,
    );
    return match ? { ok: true, secretId: match.id } : { ok: false, reason: "existing-missing" };
  }

  private async saveValue(view: PendingSecretRequest, value: string): Promise<SecretRequestRespondResult> {
    if (value.length === 0) {
      return { ok: false, reason: "invalid" };
    }
    const secrets = await this.deps.listSecrets();
    // Variable names are unique in the vault, so a value for a name that is
    // already taken replaces that secret's value in place.
    const sameVariable = secrets.find((secret) => secret.envVarName === view.envVarName);
    const saved = await this.deps.upsertSecret(
      sameVariable
        ? {
            id: sameVariable.id,
            name: sameVariable.name,
            description: sameVariable.description,
            envVarName: view.envVarName,
            value,
          }
        : {
            name: uniqueSecretName(view.label ?? view.envVarName, view.envVarName, secrets),
            description: view.reason,
            envVarName: view.envVarName,
            value,
          },
    );
    return { ok: true, secretId: saved.id };
  }

  private expire(id: string) {
    const entry = this.pending.get(id);
    if (!entry) return;
    if (entry.settling) {
      // The user answered before the deadline; let that answer finish.
      entry.expiredWhileSettling = true;
      return;
    }
    this.settle(id, { status: "timed_out", envVar: entry.view.envVarName });
  }

  private settle(id: string, result: SecretRequestToolResult) {
    const entry = this.pending.get(id);
    if (!entry) return;
    this.pending.delete(id);
    clearTimeout(entry.timer);
    entry.detachAbort();
    entry.resolve(result);
    this.publish();
  }

  private publish() {
    try {
      this.deps.publish(this.list());
    } catch (error) {
      console.warn(
        `[secrets] failed to publish secret requests: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
