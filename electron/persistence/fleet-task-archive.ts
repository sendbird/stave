import type Database from "better-sqlite3";
import type { SqliteStore } from "./sqlite-store";
import type { WorkspaceArchiveStore } from "./workspace-archive-store";
import { archiveTaskSnapshot } from "./task-archive";
import { isTaskManaged } from "../../src/lib/tasks";
import { findTarsResponsibility } from "../../src/lib/tars/ownership";
import type { FleetArchiveArgs, FleetArchiveResult } from "../../src/lib/fleet/host-control";

export function archiveFleetTask(store: Pick<SqliteStore, "loadWorkspaceSnapshot" | "previewFleetStop" | "upsertWorkspace">, db: Database.Database, archives: WorkspaceArchiveStore, args: FleetArchiveArgs, responsibilities: { responsibilities: Parameters<typeof findTarsResponsibility>[0] }): FleetArchiveResult {
    return db.transaction((): FleetArchiveResult => {
      if (archives.listDeletedIds().includes(args.workspaceId)) return { ok: false, reason: "workspace-deleted" };
      if (archives.isWriteProtected(args.workspaceId)) return { ok: false, reason: "workspace-archived" };
      const snapshot = store.loadWorkspaceSnapshot({ workspaceId: args.workspaceId });
      const task = snapshot?.tasks.find((item) => item.id === args.taskId);
      if (!task || !snapshot) return { ok: false, reason: "not-found" };
      if (isTaskManaged({ controlMode: task.controlMode ?? "interactive" }) || findTarsResponsibility(responsibilities.responsibilities, args)) return { ok: false, reason: "managed" };
      if (args.restore) {
        if (!task.archivedAt || (args.expectedArchivedAt && args.expectedArchivedAt !== task.archivedAt)) return { ok: false, reason: "changed" };
      } else {
        if (task.archivedAt) return { ok: false, reason: "changed" };
        const pending = snapshot.messagesByTask[args.taskId]?.some((message) => message.parts.some((part) => {
          if (!part || typeof part !== "object") return false;
          const interaction = part as { type?: string; state?: string };
          return (interaction.type === "approval" && interaction.state === "approval-requested") ||
            (interaction.type === "user_input" && interaction.state === "input-requested");
        }));
        if (pending) return { ok: false, reason: "pending-interaction" };
        const preview = store.previewFleetStop({ targets: [args] });
        if (preview.turns || preview.children || preview.runs) return { ok: false, reason: "live-work" };
      }
      const archivedAt = args.restore ? null : new Date().toISOString();
      store.upsertWorkspace({ id: args.workspaceId, name: (db.prepare("SELECT name FROM workspaces WHERE id = ?").get(args.workspaceId) as { name: string }).name, snapshot: archiveTaskSnapshot(snapshot, args.taskId, archivedAt) });
      return { ok: true, archivedAt };
    }).immediate();
}
