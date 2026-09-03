import { homedir } from "node:os";
import path from "node:path";
import type { McpServerConfigListRequest } from "../../src/lib/providers/mcp-config.types";
import { createJsonMcpConfigManagement } from "./json-mcp-config-management";

const kiroMcpManagement = createJsonMcpConfigManagement({
  provider: "kiro",
  label: "Kiro",
  envSyntax: "plain",
  opaqueAuthKeys: ["oauth", "oauthScopes"],
  resolveContext(args: McpServerConfigListRequest) {
    const cwd = path.resolve(args.cwd?.trim() || process.cwd());
    const kiroHome =
      process.env.KIRO_HOME?.trim() || path.join(homedir(), ".kiro");
    return {
      cwd,
      userFilePath: path.join(kiroHome, "settings", "mcp.json"),
      projectFilePath: path.join(cwd, ".kiro", "settings", "mcp.json"),
    };
  },
  previewWarning:
    "Kiro reads this native file in its CLI and ACP sessions. OAuth credentials remain in Kiro's own authentication storage.",
});

export const listKiroMcpServerConfigs = kiroMcpManagement.listConfigs;
export const previewKiroMcpServerConfigMutation =
  kiroMcpManagement.previewMutation;
export const applyKiroMcpServerConfigMutation = kiroMcpManagement.applyMutation;
export const readKiroMcpShareDraft = kiroMcpManagement.readShareDraft;

export const __kiroMcpConfigManagementTest = {
  buildKiroServerEntry: kiroMcpManagement.test.buildServerEntry,
  isSecretLikeKiroEntry: kiroMcpManagement.test.isSecretLikeEntry,
  listKiroMcpServerConfigsWithContext: kiroMcpManagement.test.listWithContext,
  prepareKiroMutation: kiroMcpManagement.test.prepareMutation,
  readKiroDocument: kiroMcpManagement.test.readDocument,
  toKiroShareDraft: kiroMcpManagement.test.toShareDraft,
  toKiroSnapshot: kiroMcpManagement.test.toSnapshot,
};
