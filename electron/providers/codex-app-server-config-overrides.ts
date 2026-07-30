import { CODEX_STAVE_MCP_SERVER_NAME } from "../main/codex-mcp";
import {
  readPrimaryStaveLocalMcpManifest,
  withUnattendedAutomationAuthorization,
} from "../main/stave-local-mcp-manifest";

export function buildCodexUnattendedAutomationMcpOverrides(args: {
  mcpUrl: string;
  authorizationToken: string;
}): Record<string, string> {
  return {
    [`mcp_servers.${JSON.stringify(CODEX_STAVE_MCP_SERVER_NAME)}.url`]:
      withUnattendedAutomationAuthorization({
        url: args.mcpUrl,
        authorizationToken: args.authorizationToken,
      }),
  };
}

export async function mergeCodexTurnConfigOverrides(args: {
  base?: Record<string, string | boolean>;
  secretShellOverrides: Record<string, string>;
  unattendedAutomationAuthorizationToken?: string;
}): Promise<Record<string, string | boolean> | undefined> {
  const manifest = args.unattendedAutomationAuthorizationToken
    ? await readPrimaryStaveLocalMcpManifest()
    : null;
  const combined = {
    ...(args.base ?? {}),
    ...(manifest
      ? buildCodexUnattendedAutomationMcpOverrides({
          mcpUrl: manifest.url,
          authorizationToken: args.unattendedAutomationAuthorizationToken!,
        })
      : {}),
    ...args.secretShellOverrides,
  };
  return Object.keys(combined).length > 0 ? combined : undefined;
}
