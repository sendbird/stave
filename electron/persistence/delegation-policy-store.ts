import type Database from "better-sqlite3";
import {
  DelegationPermissionPolicySchema,
  DelegationPermissionSettingsSchema,
  normalizedPermissionOptions,
  type DelegationPermissionPolicy,
  type DelegationPermissionSettings,
} from "../../src/lib/runs/delegation-policy";
import type {
  ProviderId,
  ProviderRuntimeOptions,
} from "../../src/lib/providers/provider.types";
import {
  AgentRouteSettingsSchema,
  type AgentRouteSettings,
  type AgentRouteSettingsInput,
} from "../../src/lib/routing/agent-run-route";
import {
  DelegatedTaskEffortSchema,
  type DelegatedTaskEffort,
} from "../../src/lib/runs/delegated-task";

/** Durable host snapshots contain only whitelisted permission fields. */
export class DelegationPolicyStore {
  constructor(private readonly db: Database.Database) {}
  private read(key: string): unknown {
    const row = this.db
      .prepare("SELECT value_json FROM app_state WHERE key = ?")
      .get(key) as { value_json: string } | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.value_json);
    } catch {
      throw new Error(
        "The saved delegation permission snapshot is unreadable.",
      );
    }
  }
  private write(key: string, value: unknown) {
    this.db
      .prepare(
        "INSERT INTO app_state (key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
      )
      .run(key, JSON.stringify(value), new Date().toISOString());
  }
  loadSettings() {
    const parsed = DelegationPermissionSettingsSchema.safeParse(
      this.read("delegation.permission-settings"),
    );
    return parsed.success ? parsed.data : null;
  }
  saveSettings(settings: DelegationPermissionSettings) {
    this.write(
      "delegation.permission-settings",
      DelegationPermissionSettingsSchema.parse(settings),
    );
  }
  /** The user's Stave Auto settings, for the turns the host routes (`agent-run-route.ts`). */
  loadRouteSettings(): AgentRouteSettings | null {
    const parsed = AgentRouteSettingsSchema.safeParse(this.read("routing.agent-route-settings"));
    return parsed.success ? parsed.data : null;
  }
  saveRouteSettings(settings: AgentRouteSettingsInput) {
    this.write("routing.agent-route-settings", AgentRouteSettingsSchema.parse(settings));
  }
  loadTask(taskId: string) {
    const raw = this.read(`delegation.task-policy:${taskId}`);
    return raw === null ? null : DelegationPermissionPolicySchema.parse(raw);
  }
  saveTask(taskId: string, policy: DelegationPermissionPolicy) {
    this.write(
      `delegation.task-policy:${taskId}`,
      DelegationPermissionPolicySchema.parse(policy),
    );
  }
  loadEffective(taskId: string) {
    const raw = this.read(`delegation.effective-policy:${taskId}`);
    return raw === null ? null : DelegationPermissionPolicySchema.parse(raw);
  }
  saveEffective(
    taskId: string,
    providerId: ProviderId,
    options: ProviderRuntimeOptions,
  ) {
    if (providerId !== "claude-code" && providerId !== "codex") {
      const remove = this.db.prepare("DELETE FROM app_state WHERE key = ?");
      remove.run(`delegation.effective-policy:${taskId}`);
      remove.run(`delegation.effective-effort:${taskId}`);
      return;
    }
    this.write(`delegation.effective-policy:${taskId}`, {
      providerId,
      source: "parent-turn",
      requestedProfile: "inherit",
      options: normalizedPermissionOptions(providerId, options),
    });
    // Kept apart from the permission snapshot: effort is a default the child
    // may take, never a permission it inherits.
    const effort = DelegatedTaskEffortSchema.safeParse(
      providerId === "codex"
        ? options.codexReasoningEffort === "minimal"
          ? "low"
          : options.codexReasoningEffort
        : options.claudeEffort,
    );
    this.write(`delegation.effective-effort:${taskId}`, {
      effort: effort.success ? effort.data : null,
    });
  }
  /** The host secret caller grants are derived from (`caller-grants.ts`); created once. */
  loadOrCreateCallerGrantSecret(create: () => string): string {
    const raw = this.read("subagents.caller-grant-secret");
    if (typeof raw === "string" && raw.length >= 32) return raw;
    const secret = create();
    this.write("subagents.caller-grant-secret", secret);
    return secret;
  }
  /** The provider and effort of the parent's latest Claude or Codex turn. */
  loadParentTurnDefaults(taskId: string): {
    providerId: "claude-code" | "codex";
    effort?: DelegatedTaskEffort;
  } | null {
    const policy = this.loadEffective(taskId);
    if (!policy) return null;
    const raw = this.read(`delegation.effective-effort:${taskId}`);
    const effort = DelegatedTaskEffortSchema.safeParse(
      raw && typeof raw === "object" ? (raw as { effort?: unknown }).effort : undefined,
    );
    return {
      providerId: policy.providerId,
      ...(effort.success ? { effort: effort.data } : {}),
    };
  }
}
