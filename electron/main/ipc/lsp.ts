import { ipcMain } from "electron";
import {
  closeLspDocument,
  requestLspCompletion,
  requestLspDefinition,
  requestLspHover,
  stopLspSessions,
  syncLspDocument,
} from "../lsp/session-manager";
import {
  LspCloseDocumentArgsSchema,
  LspRequestArgsSchema,
  LspStopSessionsArgsSchema,
  LspSyncDocumentArgsSchema,
} from "./schemas";

export function registerLspHandlers() {
  ipcMain.handle("lsp:sync-document", async (event, args: unknown) => {
    const parsed = LspSyncDocumentArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, detail: "Invalid LSP document sync request." };
    }
    return syncLspDocument({
      ...parsed.data,
      sender: event.sender,
    });
  });

  ipcMain.handle("lsp:close-document", async (event, args: unknown) => {
    const parsed = LspCloseDocumentArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, detail: "Invalid LSP document close request." };
    }
    return closeLspDocument({
      ...parsed.data,
      sender: event.sender,
    });
  });

  ipcMain.handle("lsp:hover", async (event, args: unknown) => {
    const parsed = LspRequestArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, detail: "Invalid LSP hover request." };
    }
    return requestLspHover({
      ...parsed.data,
      sender: event.sender,
    });
  });

  ipcMain.handle("lsp:completion", async (event, args: unknown) => {
    const parsed = LspRequestArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, detail: "Invalid LSP completion request." };
    }
    return requestLspCompletion({
      ...parsed.data,
      sender: event.sender,
    });
  });

  ipcMain.handle("lsp:definition", async (event, args: unknown) => {
    const parsed = LspRequestArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, detail: "Invalid LSP definition request." };
    }
    return requestLspDefinition({
      ...parsed.data,
      sender: event.sender,
    });
  });

  ipcMain.handle("lsp:stop-sessions", async (_event, args: unknown) => {
    const parsed = LspStopSessionsArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, detail: "Invalid LSP stop request." };
    }
    return stopLspSessions(parsed.data);
  });
}
