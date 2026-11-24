import { hasWorkspaceArchiveLeftover, trashWorkspaceArchiveLeftover } from "../../host-service/workspace-archive-leftovers";
import { runWorkspaceLifecycleGit } from "../../host-service/scm-runtime";
import { ensurePersistenceReady } from "../state";
import { z } from "zod";
import { WorkspaceCleanupRowSchema, WorkspaceCleanupListArgsSchema, WorkspaceCleanupActArgsSchema, WorkspaceCleanupPolicySchema, WorkspaceCleanupListResultSchema, WorkspaceCleanupResultSchema, WorkspaceCleanupRunResultSchema, WorkspaceCleanupChangedSchema, WorkspaceCleanupStateSchema, WorkspaceCleanupTrashResultSchema, WorkspaceDiskUsageArgsSchema, WorkspaceDiskUsageReportSchema } from "../../../src/lib/workspace-cleanup-contract";
import { WorkspaceExecutionArgsSchema, WorkspaceCleanupTrashArgsSchema } from "./schemas";
import { ipcMain, shell, webContents } from "electron";
import {
  CliSessionCreateSessionArgsSchema,
  CreateCursorChatIdArgsSchema,
  TerminalAckSessionOutputArgsSchema,
  TerminalAttachSessionArgsSchema,
  TerminalCreateSessionArgsSchema,
  TerminalDetachSessionArgsSchema,
  TerminalGetSessionResumeInfoArgsSchema,
  TerminalGetSlotStateArgsSchema,
  TerminalResumeSessionStreamArgsSchema,
} from "./schemas";
import { invokeHostService, onHostServiceEvent } from "../host-service-client";
import { runCommand, runCommandArgs } from "../utils/command";

const logDev = process.env.STAVE_DEV
  ? (...args: unknown[]) => console.error(...args)
  : (..._args: unknown[]) => {};

const terminalOwnerBySessionId = new Map<
  string,
  { ownerWebContentsId: number; attachmentId: string }
>();
let terminalEventBridgeRegistered = false;

function sendWorkspaceCleanupChanged(payload: unknown) {
  const event = WorkspaceCleanupChangedSchema.parse(payload);
  for (const contents of webContents.getAllWebContents()) if (!contents.isDestroyed()) contents.send("workspace:cleanup-changed", event);
}

function registerTerminalEventBridge() {
  if (terminalEventBridgeRegistered) {
    return;
  }
  terminalEventBridgeRegistered = true;
  onHostServiceEvent("workspace.cleanup-changed", sendWorkspaceCleanupChanged);

  onHostServiceEvent("terminal.output", (payload) => {
    const ownerRegistration = terminalOwnerBySessionId.get(payload.sessionId);
    if (
      !ownerRegistration ||
      (payload.attachmentId && payload.attachmentId !== ownerRegistration.attachmentId)
    ) {
      return;
    }

    const owner = webContents.fromId(ownerRegistration.ownerWebContentsId);
    if (!owner || owner.isDestroyed()) {
      terminalOwnerBySessionId.delete(payload.sessionId);
      void invokeHostService("terminal.buffer-session-output", {
        sessionId: payload.sessionId,
        output: payload.output,
      })
        .then(() =>
          invokeHostService("terminal.set-session-delivery-mode", {
            sessionId: payload.sessionId,
            deliveryMode: "poll",
          }),
        )
        .catch((error) => {
          logDev("[terminal] failed to fall back to poll delivery", error);
        });
      return;
    }

    owner.send("terminal:session-output", payload);
  });

  onHostServiceEvent("terminal.exit", (payload) => {
    const ownerRegistration = terminalOwnerBySessionId.get(payload.sessionId);
    terminalOwnerBySessionId.delete(payload.sessionId);
    if (!ownerRegistration) {
      return;
    }

    const owner = webContents.fromId(ownerRegistration.ownerWebContentsId);
    if (!owner || owner.isDestroyed()) {
      return;
    }
    owner.send("terminal:session-exit", payload);
  });

  onHostServiceEvent("terminal.status", (payload) => {
    const ownerRegistration = terminalOwnerBySessionId.get(payload.sessionId);
    if (!ownerRegistration) {
      return;
    }
    const owner = webContents.fromId(ownerRegistration.ownerWebContentsId);
    if (!owner || owner.isDestroyed()) {
      return;
    }
    owner.send("terminal:session-status", payload);
  });
}

function syncTerminalSessionOwner(args: {
  sessionId?: string;
  deliveryMode?: "poll" | "push";
  ownerWebContentsId?: number | null;
  attachmentId?: string;
}) {
  if (!args.sessionId) {
    return;
  }
  if (
    args.deliveryMode === "push" &&
    args.ownerWebContentsId != null &&
    args.attachmentId
  ) {
    terminalOwnerBySessionId.set(args.sessionId, {
      ownerWebContentsId: args.ownerWebContentsId,
      attachmentId: args.attachmentId,
    });
    return;
  }
  terminalOwnerBySessionId.delete(args.sessionId);
}

export function registerTerminalHandlers() {
  registerTerminalEventBridge();
  ipcMain.handle("workspace:cleanup-archives", async () => {
    const store = await ensurePersistenceReady();
    const repositories = store.loadRepositoryRegistry();
    const recent = WorkspaceCleanupStateSchema.safeParse(store.readWorkspaceCleanupState()).data?.recent ?? [];
    return z.array(WorkspaceCleanupRowSchema).parse(store.listArchivedWorkspacesPersistence().map(record => ({
      id: record.workspaceId, repositoryPath: record.repositoryPath,
      repositoryName: repositories.find(repository => repository.repositoryPath === record.repositoryPath)?.repositoryName ?? "",
      name: record.name, path: record.path, branch: record.branch, archived: true, savedChanges: Boolean(record.savedChangesRef),
      leftoverFiles: hasWorkspaceArchiveLeftover(record, recent),
      readOnly: record.readOnly, branchOnly: false, archivedAt: record.archivedAt, lastActive: record.archivedAt,
      blockers: [], reasons: [], bytes: null, branchDeletable: false,
    })));
  });
  ipcMain.handle("workspace:cleanup-list", async (_event, input: unknown) => WorkspaceCleanupListResultSchema.parse(await invokeHostService("workspace.cleanup-list", WorkspaceCleanupListArgsSchema.parse(input ?? {}))));
  ipcMain.handle("workspace:disk-usage", async (_event, input: unknown) => WorkspaceDiskUsageReportSchema.parse(await invokeHostService("workspace.disk-usage", WorkspaceDiskUsageArgsSchema.parse(input ?? {}))));
  ipcMain.handle("workspace:cleanup-act", async (_event, input: unknown) => WorkspaceCleanupResultSchema.parse(await invokeHostService("workspace.cleanup-act", WorkspaceCleanupActArgsSchema.parse(input))));
  ipcMain.handle("workspace:cleanup-trash-leftover", async (_event, input: unknown) => {
    const args = WorkspaceCleanupTrashArgsSchema.parse(input);
    const result = await trashWorkspaceArchiveLeftover(args, await ensurePersistenceReady(), runWorkspaceLifecycleGit, path => shell.trashItem(path));
    if (result.ok) sendWorkspaceCleanupChanged(args);
    return WorkspaceCleanupTrashResultSchema.parse(result);
  });
  ipcMain.handle("workspace:cleanup-configure", async (_event, input: unknown) => WorkspaceCleanupPolicySchema.parse(await invokeHostService("workspace.cleanup-configure", WorkspaceCleanupPolicySchema.parse(input))));
  ipcMain.handle("workspace:cleanup-run", async (_event, input: unknown) => { z.object({}).strict().parse(input ?? {}); return WorkspaceCleanupRunResultSchema.parse(await invokeHostService("workspace.cleanup-run", {})); });
  ipcMain.handle("workspace:execution-status", () => invokeHostService("workspace.execution-status", undefined));
  ipcMain.handle("workspace:execution", async (_event, input: unknown) => {
    const args = WorkspaceExecutionArgsSchema.parse(input);
    return invokeHostService("workspace.execution", args);
  });

  ipcMain.handle(
    "terminal:run-command",
    async (_event, { command, commandArgs, cwd }: { command: string; commandArgs?: string[]; cwd?: string }) =>
      commandArgs
        ? runCommandArgs({ command, commandArgs, cwd, env: { ...process.env, LC_ALL: "C" } })
        : runCommand({ command, cwd }),
  );

  ipcMain.handle("terminal:create-session", async (_event, args) => {
    const parsed = TerminalCreateSessionArgsSchema.safeParse(args);
    if (!parsed.success) {
      logDev(
        "[terminal:create-session] schema validation failed:",
        parsed.error.flatten().formErrors,
      );
      return {
        ok: false,
        stderr: parsed.error.flatten().formErrors.join("\n"),
      };
    }

    const result = await invokeHostService(
      "terminal.create-session",
      parsed.data,
    );
    return result;
  });

  ipcMain.handle("terminal:create-cli-session", async (_event, args) => {
    const parsed = CliSessionCreateSessionArgsSchema.safeParse(args);
    if (!parsed.success) {
      logDev(
        "[terminal:create-cli-session] schema validation failed:",
        parsed.error.flatten().formErrors,
      );
      return {
        ok: false,
        stderr: parsed.error.flatten().formErrors.join("\n"),
      };
    }

    const result = await invokeHostService(
      "terminal.create-cli-session",
      parsed.data,
    );
    return result;
  });

  ipcMain.handle("terminal:create-cursor-chat-id", async (_event, args) => {
    const parsed = CreateCursorChatIdArgsSchema.safeParse(args);
    if (!parsed.success) {
      logDev(
        "[terminal:create-cursor-chat-id] schema validation failed:",
        parsed.error.flatten().formErrors,
      );
      return {
        ok: false,
        stderr: parsed.error.flatten().formErrors.join("\n"),
      };
    }

    return invokeHostService("terminal.create-cursor-chat-id", parsed.data);
  });

  ipcMain.handle(
    "terminal:write-session",
    (_event, args: { sessionId: string; input: string }) =>
      invokeHostService("terminal.write-session", args),
  );

  ipcMain.handle(
    "terminal:read-session",
    (_event, args: { sessionId: string }) =>
      invokeHostService("terminal.read-session", args),
  );

  ipcMain.handle("terminal:ack-session-output", async (_event, args) => {
    const parsed = TerminalAckSessionOutputArgsSchema.safeParse(args);
    if (!parsed.success) {
      return {
        ok: false,
        stderr: parsed.error.flatten().formErrors.join("\n"),
      };
    }
    return invokeHostService("terminal.ack-session-output", parsed.data);
  });

  ipcMain.handle(
    "terminal:set-session-delivery-mode",
    async (
      event,
      args: { sessionId: string; deliveryMode: "poll" | "push" },
    ) => {
      const result = await invokeHostService(
        "terminal.set-session-delivery-mode",
        args,
      );
      if (result.ok) {
        const currentOwner = terminalOwnerBySessionId.get(args.sessionId);
        syncTerminalSessionOwner({
          sessionId: args.sessionId,
          deliveryMode: args.deliveryMode,
          ownerWebContentsId:
            args.deliveryMode === "push" ? event.sender.id : null,
          attachmentId: currentOwner?.attachmentId,
        });
      }
      return result;
    },
  );

  ipcMain.handle(
    "terminal:resize-session",
    (_event, args: { sessionId: string; cols: number; rows: number }) =>
      invokeHostService("terminal.resize-session", args),
  );

  ipcMain.handle(
    "terminal:close-session",
    async (_event, args: { sessionId: string }) => {
      terminalOwnerBySessionId.delete(args.sessionId);
      return invokeHostService("terminal.close-session", args);
    },
  );

  ipcMain.handle("terminal:attach-session", async (event, args) => {
    const parsed = TerminalAttachSessionArgsSchema.safeParse(args);
    if (!parsed.success) {
      logDev("[terminal:attach-session] schema validation failed");
      return {
        ok: false,
        stderr: parsed.error.flatten().formErrors.join("\n"),
      };
    }

    const result = await invokeHostService(
      "terminal.attach-session",
      parsed.data,
    );
    if (result.ok) {
      syncTerminalSessionOwner({
        sessionId: parsed.data.sessionId,
        deliveryMode: parsed.data.deliveryMode,
        ownerWebContentsId:
          parsed.data.deliveryMode === "push" ? event.sender.id : null,
        attachmentId: result.attachmentId,
      });
    }
    return result;
  });

  ipcMain.handle("terminal:detach-session", async (_event, args) => {
    const parsed = TerminalDetachSessionArgsSchema.safeParse(args);
    if (!parsed.success) {
      return {
        ok: false,
        stderr: parsed.error.flatten().formErrors.join("\n"),
      };
    }

    const result = await invokeHostService(
      "terminal.detach-session",
      parsed.data,
    );
    if (result.ok) {
      const currentOwner = terminalOwnerBySessionId.get(parsed.data.sessionId);
      if (
        !parsed.data.attachmentId ||
        currentOwner?.attachmentId === parsed.data.attachmentId
      ) {
        terminalOwnerBySessionId.delete(parsed.data.sessionId);
      }
    }
    return result;
  });

  ipcMain.handle("terminal:resume-session-stream", async (_event, args) => {
    const parsed = TerminalResumeSessionStreamArgsSchema.safeParse(args);
    if (!parsed.success) {
      logDev("[terminal:resume-session-stream] schema validation failed");
      return {
        ok: false,
        stderr: parsed.error.flatten().formErrors.join("\n"),
      };
    }

    const result = await invokeHostService(
      "terminal.resume-session-stream",
      parsed.data,
    );
    return result;
  });

  ipcMain.handle("terminal:get-slot-state", async (_event, args) => {
    const parsed = TerminalGetSlotStateArgsSchema.safeParse(args);
    if (!parsed.success) {
      return {
        state: "idle" as const,
      };
    }

    return invokeHostService("terminal.get-slot-state", parsed.data);
  });

  ipcMain.handle("terminal:get-session-resume-info", async (_event, args) => {
    const parsed = TerminalGetSessionResumeInfoArgsSchema.safeParse(args);
    if (!parsed.success) {
      return {
        ok: false,
        stderr: parsed.error.flatten().formErrors.join("\n"),
      };
    }

    return invokeHostService("terminal.get-session-resume-info", parsed.data);
  });

  ipcMain.handle(
    "terminal:close-sessions-by-slot-prefix",
    async (_event, args: { prefix: string }) => {
      if (!args.prefix || args.prefix.length > 600) {
        return { ok: true, closedCount: 0 };
      }
      return invokeHostService("terminal.close-sessions-by-slot-prefix", args);
    },
  );
}
