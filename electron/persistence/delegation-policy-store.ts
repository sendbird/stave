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
      this.db
        .prepare("DELETE FROM app_state WHERE key = ?")
        .run(`delegation.effective-policy:${taskId}`);
      return;
    }
    this.write(`delegation.effective-policy:${taskId}`, {
      providerId,
      source: "parent-turn",
      requestedProfile: "inherit",
      options: normalizedPermissionOptions(providerId, options),
    });
  }
}
