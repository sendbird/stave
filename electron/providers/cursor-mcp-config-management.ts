import { homedir } from "node:os";
import path from "node:path";
import type { McpServerConfigListRequest } from "../../src/lib/providers/mcp-config.types";
import { createJsonMcpConfigManagement } from "./json-mcp-config-management";

const cursorMcpManagement = createJsonMcpConfigManagement({
  provider: "cursor",
  label: "Cursor",
  envSyntax: "cursor",
  opaqueAuthKeys: ["auth"],
  resolveContext(args: McpServerConfigListRequest) {
    const cwd = path.resolve(args.cwd?.trim() || process.cwd());
    return {
      cwd,
      userFilePath: path.join(homedir(), ".cursor", "mcp.json"),
      projectFilePath: path.join(cwd, ".cursor", "mcp.json"),
    };
  },
  previewWarning:
    "Cursor reads this native file in both the editor and ACP sessions. OAuth credentials remain in Cursor's own authentication storage.",
});

export const listCursorMcpServerConfigs = cursorMcpManagement.listConfigs;
export const previewCursorMcpServerConfigMutation =
  cursorMcpManagement.previewMutation;
export const applyCursorMcpServerConfigMutation =
  cursorMcpManagement.applyMutation;
export const readCursorMcpShareDraft = cursorMcpManagement.readShareDraft;

export const __cursorMcpConfigManagementTest = {
  buildCursorServerEntry: cursorMcpManagement.test.buildServerEntry,
  isSecretLikeCursorEntry: cursorMcpManagement.test.isSecretLikeEntry,
  listCursorMcpServerConfigsWithContext:
    cursorMcpManagement.test.listWithContext,
  prepareCursorMutation: cursorMcpManagement.test.prepareMutation,
  readCursorDocument: cursorMcpManagement.test.readDocument,
  toCursorShareDraft: cursorMcpManagement.test.toShareDraft,
  toCursorSnapshot: cursorMcpManagement.test.toSnapshot,
};
