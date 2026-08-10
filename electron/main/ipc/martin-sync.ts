import { randomUUID } from "node:crypto";
import { ipcMain } from "electron";

import type { StaveSyncEventKind } from "../../../src/lib/martin-sync/contract";
import { AtelierConnectorHttpError } from "../atelier-connector/http-client";
import {
  linkMartinProject,
  listMartinProjects,
  refreshMartinContext,
  unlinkMartinProject,
} from "../martin-sync/project-link";
import {
  configureMartinSync,
  enqueueMartinSyncEvent,
  getMartinSyncStatus,
  noteMartinWorkspaceLinksChanged,
  retryFailedMartinSync,
} from "../martin-sync/service";
import {
  MartinLinkProjectArgsSchema,
  MartinListProjectsArgsSchema,
  MartinSyncConfigureArgsSchema,
  MartinSyncEnqueueArgsSchema,
  MartinSyncLinksChangedArgsSchema,
  MartinWorkspaceArgsSchema,
} from "./schemas";

function eventTier(kind: StaveSyncEventKind): "factual" | "interpretive" {
  switch (kind) {
    case "work_update":
      return "interpretive";
    case "pr_opened":
    case "task_completed":
    case "workspace_linked":
    case "workspace_unlinked":
      return "factual";
    default:
      kind satisfies never;
      return "factual";
  }
}

function safeMartinErrorMessage(error: unknown) {
  if (error instanceof AtelierConnectorHttpError) {
    switch (error.code) {
      case "unauthorized":
      case "forbidden":
        return "Atelier rejected this connector. Pair it again.";
      case "network_unavailable":
        return "Atelier is currently unreachable.";
      case "project_not_found":
        return "The Martin project could not be found.";
      case "project_archived":
        return "The Martin project is archived.";
      default:
        return `Martin sync request failed (${error.code}).`;
    }
  }
  if (error instanceof Error) {
    switch (error.message) {
      case "connector_unpaired":
        return "Pair the Atelier connector first.";
      case "scope_missing":
        return "Pair the Atelier connector with Martin access.";
      case "workspace_not_found":
        return "The Stave workspace could not be found.";
      case "martin_project_not_linked":
        return "This workspace is not linked to a Martin project.";
    }
  }
  return "The Martin sync operation failed.";
}

export function registerMartinSyncHandlers() {
  ipcMain.handle("martin-sync:get-status", () => ({
    ok: true,
    status: getMartinSyncStatus(),
  }));

  ipcMain.handle("martin-sync:configure", (_event, args: unknown) => {
    const parsed = MartinSyncConfigureArgsSchema.safeParse(args);
    if (!parsed.success) {
      return {
        ok: false,
        status: getMartinSyncStatus(),
        message: "Invalid Martin sync configuration.",
      };
    }
    return {
      ok: true,
      status: configureMartinSync(parsed.data),
    };
  });

  ipcMain.handle("martin-sync:enqueue", (_event, args: unknown) => {
    const parsed = MartinSyncEnqueueArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, message: "Invalid Martin sync event." };
    }
    try {
      enqueueMartinSyncEvent({
        workspaceId: parsed.data.workspaceId,
        projectRef: parsed.data.projectRef,
        event: {
          staveEventId: randomUUID(),
          kind: parsed.data.kind,
          summary: parsed.data.summary,
          sourceUrl: parsed.data.sourceUrl ?? null,
          tier: eventTier(parsed.data.kind),
          workspaceName: parsed.data.workspaceName,
          branch: parsed.data.branch,
        },
      });
      return { ok: true, status: getMartinSyncStatus() };
    } catch (error) {
      return { ok: false, message: safeMartinErrorMessage(error) };
    }
  });

  ipcMain.handle(
    "martin-sync:links-changed",
    (_event, args: unknown) => {
      const parsed = MartinSyncLinksChangedArgsSchema.safeParse(args);
      if (!parsed.success) {
        return { ok: false, message: "Invalid Martin resource links." };
      }
      try {
        noteMartinWorkspaceLinksChanged(parsed.data);
        return { ok: true, status: getMartinSyncStatus() };
      } catch (error) {
        return { ok: false, message: safeMartinErrorMessage(error) };
      }
    },
  );

  ipcMain.handle("martin-sync:retry-failed", () => ({
    ok: true,
    status: retryFailedMartinSync(),
  }));

  ipcMain.handle(
    "martin-sync:list-projects",
    async (_event, args: unknown) => {
      const parsed = MartinListProjectsArgsSchema.safeParse(args ?? {});
      if (!parsed.success) {
        return {
          ok: false,
          projects: [],
          message: "Invalid Martin project search.",
        };
      }
      try {
        return {
          ok: true,
          projects: await listMartinProjects(parsed.data),
        };
      } catch (error) {
        return {
          ok: false,
          projects: [],
          message: safeMartinErrorMessage(error),
        };
      }
    },
  );

  ipcMain.handle(
    "martin-sync:link-project",
    async (_event, args: unknown) => {
      const parsed = MartinLinkProjectArgsSchema.safeParse(args);
      if (!parsed.success) {
        return { ok: false, message: "Invalid Martin project link." };
      }
      try {
        return {
          ok: true,
          ...(await linkMartinProject(parsed.data)),
        };
      } catch (error) {
        return { ok: false, message: safeMartinErrorMessage(error) };
      }
    },
  );

  ipcMain.handle(
    "martin-sync:unlink-project",
    async (_event, args: unknown) => {
      const parsed = MartinWorkspaceArgsSchema.safeParse(args);
      if (!parsed.success) {
        return { ok: false, message: "Invalid Martin project unlink." };
      }
      try {
        return await unlinkMartinProject(parsed.data);
      } catch (error) {
        return { ok: false, message: safeMartinErrorMessage(error) };
      }
    },
  );

  ipcMain.handle(
    "martin-sync:refresh-context",
    async (_event, args: unknown) => {
      const parsed = MartinWorkspaceArgsSchema.safeParse(args);
      if (!parsed.success) {
        return { ok: false, message: "Invalid Martin context refresh." };
      }
      try {
        return {
          ok: true,
          ...(await refreshMartinContext(parsed.data)),
        };
      } catch (error) {
        return { ok: false, message: safeMartinErrorMessage(error) };
      }
    },
  );
}
