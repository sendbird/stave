import {
  CODEX_STAVE_MCP_SERVER_NAME,
  CODEX_STAVE_MCP_TOKEN_ENV_VAR,
} from "../main/codex-mcp";
import type { StaveLocalMcpManifest } from "../../src/lib/local-mcp";
import type { CodexConfigOverrides } from "./codex-app-server-params";
import {
  STAVE_LOCAL_MCP_TOOL_TIMEOUT_MS,
  withUnattendedAutomationAuthorization,
} from "../main/stave-local-mcp-manifest";

/**
 * Bare server name in the key. Codex splits an override key on `.` and takes
 * each segment verbatim, so the quoted form registered the server under the
 * literal name `"stave-local"` — quote characters included — which is not the
 * name anything else in Stave looks for.
 *
 * A flat `mcp_servers.<name>.<field>` key is deliberate here: it coexists with
 * the nested `mcp_servers` table an isolated turn sends (verified against
 * codex-cli 0.146.0), whereas a second nested `mcp_servers` value would replace
 * the first instead of merging with it.
 */
export function buildCodexUnattendedAutomationMcpOverrides(args: {
  mcpUrl: string;
  authorizationToken: string;
}): Record<string, string> {
  return {
    [`mcp_servers.${CODEX_STAVE_MCP_SERVER_NAME}.url`]:
      withUnattendedAutomationAuthorization({
        url: args.mcpUrl,
        authorizationToken: args.authorizationToken,
      }),
  };
}

export async function mergeCodexTurnConfigOverrides(args: {
  base?: CodexConfigOverrides;
  secretShellOverrides: Record<string, string>;
  staveLocalMcpManifest: StaveLocalMcpManifest | null;
  secondaryReadOnly: boolean;
  unattendedAutomationAuthorizationToken?: string;
}): Promise<CodexConfigOverrides | undefined> {
  const manifest = args.secondaryReadOnly ? null : args.staveLocalMcpManifest;
  const combined = {
    ...(args.base ?? {}),
    ...(manifest
      ? {
          // Internal turns own this connection independently of CLI registration.
          // Only the env-var name crosses the config boundary, never the token.
          [`mcp_servers.${CODEX_STAVE_MCP_SERVER_NAME}.url`]:
            withUnattendedAutomationAuthorization({
              url: manifest.url,
              authorizationToken: args.unattendedAutomationAuthorizationToken,
            }),
          [`mcp_servers.${CODEX_STAVE_MCP_SERVER_NAME}.enabled`]: true,
          [`mcp_servers.${CODEX_STAVE_MCP_SERVER_NAME}.bearer_token_env_var`]:
            CODEX_STAVE_MCP_TOKEN_ENV_VAR,
          [`mcp_servers.${CODEX_STAVE_MCP_SERVER_NAME}.tool_timeout_sec`]:
            STAVE_LOCAL_MCP_TOOL_TIMEOUT_MS / 1000,
        }
      : {}),
    ...args.secretShellOverrides,
  };
  return Object.keys(combined).length > 0 ? combined : undefined;
}
