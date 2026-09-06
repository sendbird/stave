import { ipcMain } from "electron";
import {
  ProjectMemorySettingsArgsSchema,
  ProjectMemorySaveSettingsArgsSchema,
  ProjectMemoryClearArgsSchema,
} from "../../../src/lib/project-memory-settings";
import { resolveProjectMemoryConfidence } from "../../../src/lib/project-memory";
import type { ProjectMemoryRememberResult } from "../../../src/lib/project-memory";
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
export function registerProjectMemoryHandlers() {
  ipcMain.handle(
    "project-memory:get-settings",
    async (_event, args: unknown) => {
      try {
        const { projectPath } = ProjectMemorySettingsArgsSchema.parse(args);
        return {
          ok: true,
          settings: (await ensurePersistenceReady()).getProjectMemorySettings(
            projectPath,
          ),
        };
      } catch (error) {
        return { ok: false, message: failureMessage(error) };
      }
    },
  );
  ipcMain.handle(
    "project-memory:save-settings",
    async (_event, args: unknown) => {
      try {
        const parsed = ProjectMemorySaveSettingsArgsSchema.parse(args);
        return {
          ok: true,
          settings: (await ensurePersistenceReady()).saveProjectMemorySettings(
            parsed,
          ),
        };
      } catch (error) {
        return { ok: false, message: failureMessage(error) };
      }
    },
  );
  ipcMain.handle("project-memory:clear", async (_event, args: unknown) => {
    try {
      const parsed = ProjectMemoryClearArgsSchema.parse(args);
      return {
        ok: true,
        deleted: (await ensurePersistenceReady()).clearProjectMemories(parsed),
      };
    } catch (error) {
      return { ok: false, message: failureMessage(error) };
    }
  });
  ipcMain.handle("project-memory:list", async (_event, args: unknown) => {
    const parsed = ProjectMemoryListArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, items: [], message: "Invalid project memory list." };
    }
    try {
      const store = await ensurePersistenceReady();
      return { ok: true, items: store.listProjectMemories(parsed.data) };
    } catch (error) {
      return { ok: false, items: [], message: failureMessage(error) };
    }
  });

  ipcMain.handle("project-memory:recall", async (_event, args: unknown) => {
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
      return { ok: true, items: store.recallProjectMemories(parsed.data) };
    } catch (error) {
      return { ok: false, items: [], message: failureMessage(error) };
    }
  });

  ipcMain.handle("project-memory:remember", async (_event, args: unknown) => {
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
      const confidence = resolveProjectMemoryConfidence(parsed.data.source);
      const results: ProjectMemoryRememberResult[] = [];
      for (const fact of parsed.data.facts) {
        const result = store.rememberProjectMemory({
          projectPath: parsed.data.projectPath,
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

  ipcMain.handle("project-memory:update", async (_event, args: unknown) => {
    const parsed = ProjectMemoryUpdateArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, message: "Invalid project memory update." };
    }
    try {
      const store = await ensurePersistenceReady();
      return { ok: true, memory: store.updateProjectMemory(parsed.data) };
    } catch (error) {
      return { ok: false, message: failureMessage(error) };
    }
  });

  ipcMain.handle("project-memory:delete", async (_event, args: unknown) => {
    const parsed = ProjectMemoryDeleteArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, message: "Invalid project memory delete." };
    }
    try {
      const store = await ensurePersistenceReady();
      return { ok: true, deleted: store.deleteProjectMemory(parsed.data.id) };
    } catch (error) {
      return { ok: false, message: failureMessage(error) };
    }
  });
}
