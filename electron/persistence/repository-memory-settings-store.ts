import {
  DEFAULT_REPOSITORY_MEMORY_SETTINGS,
  RepositoryMemorySettingsPatchSchema,
  type RepositoryMemorySettings,
  type RepositoryMemorySettingsPatch,
} from "../../src/lib/repository-memory-settings";

interface Database {
  exec(sql: string): unknown;
  prepare(sql: string): {
    get(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
    run(...args: unknown[]): { changes?: number | bigint };
  };
}

export class RepositoryMemorySettingsStore {
  private readonly db: Database;
  constructor(database: unknown) {
    this.db = database as Database;
    this.db.exec(`CREATE TABLE IF NOT EXISTS repository_memory_settings (
      project_path TEXT PRIMARY KEY,
      settings_json TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0,
      reset_before INTEGER NOT NULL DEFAULT 0
    )`);
    // Older saves included the then-enabled default, so they are not proof
    // that the user chose collection. Require a fresh choice after upgrading.
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const columns = this.db
        .prepare("PRAGMA table_info(repository_memory_settings)")
        .all() as Array<{ name: string }>;
      if (!columns.some((column) => column.name === "collection_opt_in")) {
        this.db.exec(
          "ALTER TABLE repository_memory_settings ADD COLUMN collection_opt_in INTEGER NOT NULL DEFAULT 0",
        );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  get(repositoryPath: string): RepositoryMemorySettings {
    const row = this.db
      .prepare("SELECT * FROM repository_memory_settings WHERE project_path = ?")
      .get(repositoryPath) as
      | {
          settings_json: string;
          revision: number;
          reset_before: number;
          collection_opt_in: number;
        }
      | undefined;
    const settings = {
      ...DEFAULT_REPOSITORY_MEMORY_SETTINGS,
      kinds: [...DEFAULT_REPOSITORY_MEMORY_SETTINGS.kinds],
      ...(row
        ? RepositoryMemorySettingsPatchSchema.parse(JSON.parse(row.settings_json))
        : {}),
      revision: row?.revision ?? 0,
      resetBefore: row?.reset_before ?? 0,
    };
    return {
      ...settings,
      collectAutomatically:
        row?.collection_opt_in === 1 && settings.collectAutomatically,
    };
  }

  save(args: {
    repositoryPath: string;
    patch: RepositoryMemorySettingsPatch;
    expectedRevision: number;
  }) {
    const patch = RepositoryMemorySettingsPatchSchema.parse(args.patch);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.get(args.repositoryPath);
      if (current.revision !== args.expectedRevision) {
        throw new Error(
          "Memory settings changed elsewhere. Reload before saving again.",
        );
      }
      const next = { ...current, ...patch, revision: current.revision + 1 };
      this.write(args.repositoryPath, next);
      this.db.exec("COMMIT");
      return next;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  clear(args: {
    repositoryPath: string;
    scope: "candidates" | "all";
    now?: number;
  }) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const now = args.now ?? Date.now();
      const current = this.get(args.repositoryPath);
      const result = this.db
        .prepare(
          `UPDATE repository_memories SET deleted_at = ?, updated_at = ?
        WHERE project_path = ? AND deleted_at IS NULL ${args.scope === "candidates" ? "AND recall_mode = 'candidate'" : ""}`,
        )
        .run(now, now, args.repositoryPath);
      this.write(args.repositoryPath, {
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

  private write(repositoryPath: string, settings: RepositoryMemorySettings) {
    const { revision, resetBefore, ...values } = settings;
    this.db
      .prepare(
        `INSERT INTO repository_memory_settings (project_path, settings_json, revision, reset_before, collection_opt_in)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(project_path) DO UPDATE SET
      settings_json = excluded.settings_json, revision = excluded.revision, reset_before = excluded.reset_before,
      collection_opt_in = excluded.collection_opt_in`,
      )
      .run(
        repositoryPath,
        JSON.stringify(values),
        revision,
        resetBefore,
        settings.collectAutomatically ? 1 : 0,
      );
  }
}
