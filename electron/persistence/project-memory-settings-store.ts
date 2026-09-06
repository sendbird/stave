import {
  DEFAULT_PROJECT_MEMORY_SETTINGS,
  ProjectMemorySettingsPatchSchema,
  type ProjectMemorySettings,
  type ProjectMemorySettingsPatch,
} from "../../src/lib/project-memory-settings";

interface Database {
  exec(sql: string): unknown;
  prepare(sql: string): {
    get(...args: unknown[]): unknown;
    run(...args: unknown[]): { changes?: number | bigint };
  };
}

export class ProjectMemorySettingsStore {
  private readonly db: Database;
  constructor(database: unknown) {
    this.db = database as Database;
    this.db.exec(`CREATE TABLE IF NOT EXISTS project_memory_settings (
      project_path TEXT PRIMARY KEY,
      settings_json TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0,
      reset_before INTEGER NOT NULL DEFAULT 0
    )`);
  }

  get(projectPath: string): ProjectMemorySettings {
    const row = this.db
      .prepare("SELECT * FROM project_memory_settings WHERE project_path = ?")
      .get(projectPath) as
      | { settings_json: string; revision: number; reset_before: number }
      | undefined;
    return {
      ...DEFAULT_PROJECT_MEMORY_SETTINGS,
      kinds: [...DEFAULT_PROJECT_MEMORY_SETTINGS.kinds],
      ...(row
        ? ProjectMemorySettingsPatchSchema.parse(JSON.parse(row.settings_json))
        : {}),
      revision: row?.revision ?? 0,
      resetBefore: row?.reset_before ?? 0,
    };
  }

  save(args: {
    projectPath: string;
    patch: ProjectMemorySettingsPatch;
    expectedRevision: number;
  }) {
    const patch = ProjectMemorySettingsPatchSchema.parse(args.patch);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.get(args.projectPath);
      if (current.revision !== args.expectedRevision) {
        throw new Error(
          "Memory settings changed elsewhere. Reload before saving again.",
        );
      }
      const next = { ...current, ...patch, revision: current.revision + 1 };
      this.write(args.projectPath, next);
      this.db.exec("COMMIT");
      return next;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  clear(args: {
    projectPath: string;
    scope: "candidates" | "all";
    now?: number;
  }) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const now = args.now ?? Date.now();
      const current = this.get(args.projectPath);
      const result = this.db
        .prepare(
          `UPDATE project_memories SET deleted_at = ?, updated_at = ?
        WHERE project_path = ? AND deleted_at IS NULL ${args.scope === "candidates" ? "AND recall_mode = 'candidate'" : ""}`,
        )
        .run(now, now, args.projectPath);
      this.write(args.projectPath, {
        ...current,
        revision: current.revision + 1,
        resetBefore: Math.max(current.resetBefore, now),
      });
      this.db.exec("COMMIT");
      return Number(result.changes ?? 0);
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private write(projectPath: string, settings: ProjectMemorySettings) {
    const { revision, resetBefore, ...values } = settings;
    this.db
      .prepare(
        `INSERT INTO project_memory_settings (project_path, settings_json, revision, reset_before)
      VALUES (?, ?, ?, ?) ON CONFLICT(project_path) DO UPDATE SET
      settings_json = excluded.settings_json, revision = excluded.revision, reset_before = excluded.reset_before`,
      )
      .run(projectPath, JSON.stringify(values), revision, resetBefore);
  }
}
