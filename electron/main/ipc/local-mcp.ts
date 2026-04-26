import { ipcMain } from "electron";
import {
  clearStaveMcpRequestLogs,
  getStaveMcpRequestLog,
  getStaveMcpServerStatus,
  listStaveMcpRequestLogs,
  rotateStaveMcpToken,
  updateStaveMcpServerConfig,
} from "../stave-mcp-server";
import {
  respondApproval,
  respondUserInput,
} from "../stave-mcp-service";
import {
  GetLocalMcpRequestLogArgsSchema,
  ListLocalMcpRequestLogsArgsSchema,
  LocalMcpApprovalResponseArgsSchema,
  LocalMcpConfigUpdateArgsSchema,
  LocalMcpUserInputResponseArgsSchema,
} from "./schemas";

export function registerLocalMcpHandlers() {
  ipcMain.handle("local-mcp:get-status", async () => {
    try {
      const status = await getStaveMcpServerStatus();
      return { ok: true, status };
    } catch (error) {
      return {
        ok: false,
        status: null,
        message: error instanceof Error ? error.message : "Failed to load local MCP status.",
      };
    }
  });

  ipcMain.handle("local-mcp:update-config", async (_event, args: unknown) => {
    const parsedArgs = LocalMcpConfigUpdateArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return { ok: false, status: null, message: "Invalid local MCP config." };
    }
    try {
      const status = await updateStaveMcpServerConfig(parsedArgs.data);
      return { ok: true, status };
    } catch (error) {
      return {
        ok: false,
        status: null,
        message: error instanceof Error ? error.message : "Failed to update local MCP config.",
      };
    }
  });

  ipcMain.handle("local-mcp:rotate-token", async () => {
    try {
      const status = await rotateStaveMcpToken();
      return { ok: true, status };
    } catch (error) {
      return {
        ok: false,
        status: null,
        message: error instanceof Error ? error.message : "Failed to rotate local MCP token.",
      };
    }
  });

  ipcMain.handle("local-mcp:list-request-logs", async (_event, args: unknown) => {
    const parsedArgs = ListLocalMcpRequestLogsArgsSchema.safeParse(args ?? {});
    if (!parsedArgs.success) {
      return {
        ok: false,
        logs: [],
        total: 0,
        limit: 0,
        offset: 0,
        hasMore: false,
        message: "Invalid local MCP request log query.",
      };
    }
    try {
      const page = await listStaveMcpRequestLogs({
        limit: parsedArgs.data.limit,
        offset: parsedArgs.data.offset,
        includePayload: parsedArgs.data.includePayload,
      });
      return { ok: true, ...page };
    } catch (error) {
      return {
        ok: false,
        logs: [],
        total: 0,
        limit: 0,
        offset: 0,
        hasMore: false,
        message: error instanceof Error ? error.message : "Failed to load local MCP request logs.",
      };
    }
  });

  ipcMain.handle("local-mcp:get-request-log", async (_event, args: unknown) => {
    const parsedArgs = GetLocalMcpRequestLogArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return { ok: false, log: null, message: "Invalid local MCP request log lookup." };
    }
    try {
      const log = await getStaveMcpRequestLog({
        id: parsedArgs.data.id,
        includePayload: parsedArgs.data.includePayload,
      });
      return { ok: true, log };
    } catch (error) {
      return {
        ok: false,
        log: null,
        message: error instanceof Error ? error.message : "Failed to load local MCP request log.",
      };
    }
  });

  ipcMain.handle("local-mcp:respond-approval", async (_event, args: unknown) => {
    const parsedArgs = LocalMcpApprovalResponseArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return { ok: false, message: "Invalid local MCP approval response." };
    }
    try {
      const result = await respondApproval(parsedArgs.data);
      return { ok: true, result };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to deliver local MCP approval response.",
      };
    }
  });

  ipcMain.handle("local-mcp:clear-request-logs", async () => {
    try {
      const cleared = await clearStaveMcpRequestLogs();
      return { ok: true, cleared };
    } catch (error) {
      return {
        ok: false,
        cleared: 0,
        message: error instanceof Error ? error.message : "Failed to clear local MCP request logs.",
      };
    }
  });

  ipcMain.handle("local-mcp:respond-user-input", async (_event, args: unknown) => {
    const parsedArgs = LocalMcpUserInputResponseArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return { ok: false, message: "Invalid local MCP user input response." };
    }
    try {
      const result = await respondUserInput(parsedArgs.data);
      return { ok: true, result };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to deliver local MCP user input response.",
      };
    }
  });
}
