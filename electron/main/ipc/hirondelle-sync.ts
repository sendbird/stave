import { randomUUID } from "node:crypto";
import { ipcMain } from "electron";

import type { StaveSyncEventKind } from "../../../src/lib/hirondelle-sync/contract";
import { AtelierConnectorHttpError } from "../atelier-connector/http-client";
import {
  linkHirondelleProject,
  listHirondelleProjects,
  refreshHirondelleContext,
  unlinkHirondelleProject,
} from "../hirondelle-sync/project-link";
import {
  configureHirondelleSync,
  enqueueHirondelleSyncEvent,
  getHirondelleSyncStatus,
  noteHirondelleWorkspaceLinksChanged,
  retryFailedHirondelleSync,
} from "../hirondelle-sync/service";
import {
  HirondelleLinkProjectArgsSchema,
  HirondelleListProjectsArgsSchema,
  HirondelleSyncConfigureArgsSchema,
  HirondelleSyncEnqueueArgsSchema,
  HirondelleSyncLinksChangedArgsSchema,
  HirondelleWorkspaceArgsSchema,
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

function safeHirondelleErrorMessage(error: unknown) {
  if (error instanceof AtelierConnectorHttpError) {
    switch (error.code) {
      case "unauthorized":
      case "forbidden":
        return "Atelier rejected this connector. Pair it again.";
      case "network_unavailable":
        return "Atelier is currently unreachable.";
      case "project_not_found":
        return "The Hirondelle project could not be found.";
      case "project_archived":
        return "The Hirondelle project is archived.";
      default:
        return `Hirondelle sync request failed (${error.code}).`;
    }
  }
  if (error instanceof Error) {
    switch (error.message) {
      case "connector_unpaired":
        return "Pair the Atelier connector first.";
      case "scope_missing":
        return "Pair the Atelier connector with Hirondelle access.";
      case "workspace_not_found":
        return "The Stave workspace could not be found.";
      case "hirondelle_project_not_linked":
        return "This workspace is not linked to a Hirondelle project.";
    }
  }
  return "The Hirondelle sync operation failed.";
}

export function registerHirondelleSyncHandlers() {
  ipcMain.handle("hirondelle-sync:get-status", () => ({
    ok: true,
    status: getHirondelleSyncStatus(),
  }));

  ipcMain.handle("hirondelle-sync:configure", (_event, args: unknown) => {
    const parsed = HirondelleSyncConfigureArgsSchema.safeParse(args);
    if (!parsed.success) {
      return {
        ok: false,
        status: getHirondelleSyncStatus(),
        message: "Invalid Hirondelle sync configuration.",
      };
    }
    return {
      ok: true,
      status: configureHirondelleSync(parsed.data),
    };
  });

  ipcMain.handle("hirondelle-sync:enqueue", (_event, args: unknown) => {
    const parsed = HirondelleSyncEnqueueArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, message: "Invalid Hirondelle sync event." };
    }
    try {
      enqueueHirondelleSyncEvent({
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
      return { ok: true, status: getHirondelleSyncStatus() };
    } catch (error) {
      return { ok: false, message: safeHirondelleErrorMessage(error) };
    }
  });

  ipcMain.handle(
    "hirondelle-sync:links-changed",
    (_event, args: unknown) => {
      const parsed = HirondelleSyncLinksChangedArgsSchema.safeParse(args);
      if (!parsed.success) {
        return { ok: false, message: "Invalid Hirondelle resource links." };
      }
      try {
        noteHirondelleWorkspaceLinksChanged(parsed.data);
        return { ok: true, status: getHirondelleSyncStatus() };
      } catch (error) {
        return { ok: false, message: safeHirondelleErrorMessage(error) };
      }
    },
  );

  ipcMain.handle("hirondelle-sync:retry-failed", () => ({
    ok: true,
    status: retryFailedHirondelleSync(),
  }));

  ipcMain.handle(
    "hirondelle-sync:list-projects",
    async (_event, args: unknown) => {
      const parsed = HirondelleListProjectsArgsSchema.safeParse(args ?? {});
      if (!parsed.success) {
        return {
          ok: false,
          projects: [],
          message: "Invalid Hirondelle project search.",
        };
      }
      try {
        return {
          ok: true,
          projects: await listHirondelleProjects(parsed.data),
        };
      } catch (error) {
        return {
          ok: false,
          projects: [],
          message: safeHirondelleErrorMessage(error),
        };
      }
    },
  );

  ipcMain.handle(
    "hirondelle-sync:link-project",
    async (_event, args: unknown) => {
      const parsed = HirondelleLinkProjectArgsSchema.safeParse(args);
      if (!parsed.success) {
        return { ok: false, message: "Invalid Hirondelle project link." };
      }
      try {
        return {
          ok: true,
          ...(await linkHirondelleProject(parsed.data)),
        };
      } catch (error) {
        return { ok: false, message: safeHirondelleErrorMessage(error) };
      }
    },
  );

  ipcMain.handle(
    "hirondelle-sync:unlink-project",
    async (_event, args: unknown) => {
      const parsed = HirondelleWorkspaceArgsSchema.safeParse(args);
      if (!parsed.success) {
        return { ok: false, message: "Invalid Hirondelle project unlink." };
      }
      try {
        return await unlinkHirondelleProject(parsed.data);
      } catch (error) {
        return { ok: false, message: safeHirondelleErrorMessage(error) };
      }
    },
  );

  ipcMain.handle(
    "hirondelle-sync:refresh-context",
    async (_event, args: unknown) => {
      const parsed = HirondelleWorkspaceArgsSchema.safeParse(args);
      if (!parsed.success) {
        return { ok: false, message: "Invalid Hirondelle context refresh." };
      }
      try {
        return {
          ok: true,
          ...(await refreshHirondelleContext(parsed.data)),
        };
      } catch (error) {
        return { ok: false, message: safeHirondelleErrorMessage(error) };
      }
    },
  );
}
