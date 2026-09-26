import { ipcMain } from "electron";
import {
  RepositoryMemorySettingsArgsSchema,
  RepositoryMemorySaveSettingsArgsSchema,
  RepositoryMemoryClearArgsSchema,
} from "../../../src/lib/repository-memory-settings";
import { resolveRepositoryMemoryConfidence } from "../../../src/lib/repository-memory";
import type { RepositoryMemoryRememberResult } from "../../../src/lib/repository-memory";
import {
  ProjectMemoryDeleteArgsSchema,
  ProjectMemoryListArgsSchema,
  ProjectMemoryRecallArgsSchema,
  ProjectMemoryRememberArgsSchema,
  ProjectMemoryUpdateArgsSchema,
} from "./schemas";
import { ensurePersistenceReady } from "../state";

function failureMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Project memory request failed.";
}

/**
 * Renderer access to project memory: the Information panel's Memory section
 * (list/update/delete), the turn-start recall that builds the
 * `stave:project-memory` block, and the auto-extracted facts the turn summary
 * hands back. Agent-side writes go through the Local MCP tools instead.
 */
export function registerRepositoryMemoryHandlers() {
  ipcMain.handle(
    "repository-memory:get-settings",
    async (_event, args: unknown) => {
      try {
        const { repositoryPath } = RepositoryMemorySettingsArgsSchema.parse(args);
        return {
          ok: true,
          settings: (await ensurePersistenceReady()).getRepositoryMemorySettings(
            repositoryPath,
          ),
        };
      } catch (error) {
        return { ok: false, message: failureMessage(error) };
      }
    },
  );
  ipcMain.handle(
    "repository-memory:save-settings",
    async (_event, args: unknown) => {
      try {
        const parsed = RepositoryMemorySaveSettingsArgsSchema.parse(args);
        return {
          ok: true,
          settings: (await ensurePersistenceReady()).saveRepositoryMemorySettings(
            parsed,
          ),
        };
      } catch (error) {
        return { ok: false, message: failureMessage(error) };
      }
    },
  );
  ipcMain.handle("repository-memory:clear", async (_event, args: unknown) => {
    try {
      const parsed = RepositoryMemoryClearArgsSchema.parse(args);
      return {
        ok: true,
        deleted: (await ensurePersistenceReady()).clearRepositoryMemories(parsed),
      };
    } catch (error) {
      return { ok: false, message: failureMessage(error) };
    }
  });
  ipcMain.handle("repository-memory:list", async (_event, args: unknown) => {
    const parsed = ProjectMemoryListArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, items: [], message: "Invalid project memory list." };
    }
    try {
      const store = await ensurePersistenceReady();
      return { ok: true, items: store.listRepositoryMemories(parsed.data) };
    } catch (error) {
      return { ok: false, items: [], message: failureMessage(error) };
    }
  });

  ipcMain.handle("repository-memory:recall", async (_event, args: unknown) => {
    const parsed = ProjectMemoryRecallArgsSchema.safeParse(args);
    if (!parsed.success) {
      return {
        ok: false,
        items: [],
        message: "Invalid project memory recall.",
      };
    }
    try {
      const store = await ensurePersistenceReady();
      return { ok: true, items: store.recallRepositoryMemories(parsed.data) };
    } catch (error) {
      return { ok: false, items: [], message: failureMessage(error) };
    }
  });

  ipcMain.handle("repository-memory:remember", async (_event, args: unknown) => {
    const parsed = ProjectMemoryRememberArgsSchema.safeParse(args);
    if (!parsed.success) {
      return {
        ok: false,
        results: [],
        message: "Invalid project memory remember request.",
      };
    }
    try {
      const store = await ensurePersistenceReady();
      const confidence = resolveRepositoryMemoryConfidence(parsed.data.source);
      const results: RepositoryMemoryRememberResult[] = [];
      for (const fact of parsed.data.facts) {
        const result = store.rememberRepositoryMemory({
          repositoryPath: parsed.data.repositoryPath,
          kind: fact.kind,
          content: fact.content,
          confidence,
          collectionRevision: parsed.data.collectionRevision,
          sourceTaskId: parsed.data.sourceTaskId ?? null,
          sourceTurnId: parsed.data.sourceTurnId ?? null,
        });
        if (result) {
          results.push(result);
        }
      }
      return { ok: true, results };
    } catch (error) {
      return { ok: false, results: [], message: failureMessage(error) };
    }
  });

  ipcMain.handle("repository-memory:update", async (_event, args: unknown) => {
    const parsed = ProjectMemoryUpdateArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, message: "Invalid project memory update." };
    }
    try {
      const store = await ensurePersistenceReady();
      return { ok: true, memory: store.updateRepositoryMemory(parsed.data) };
    } catch (error) {
      return { ok: false, message: failureMessage(error) };
    }
  });

  ipcMain.handle("repository-memory:delete", async (_event, args: unknown) => {
    const parsed = ProjectMemoryDeleteArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, message: "Invalid project memory delete." };
    }
    try {
      const store = await ensurePersistenceReady();
      return { ok: true, deleted: store.deleteRepositoryMemory(parsed.data.id) };
    } catch (error) {
      return { ok: false, message: failureMessage(error) };
    }
  });
}
