/**
 * Stable loopback port for the local MCP server.
 *
 * The previous default of `0` picked a fresh ephemeral port on every launch,
 * which silently invalidated every endpoint already handed to a running agent
 * session, stdio proxy, or external CLI. `0` remains a valid explicit choice.
 */
export const DEFAULT_LOCAL_MCP_PORT = 39_517;

/**
 * Bumped when a default changes in a way that must be migrated onto configs
 * written by an older build.
 */
export const LOCAL_MCP_CONFIG_VERSION = 2;

export interface StaveLocalMcpConfig {
  enabled: boolean;
  /** Fixed loopback port, or `0` to let the OS assign an ephemeral one. */
  port: number;
  token: string;
  claudeCodeAutoRegister: boolean;
  codexAutoRegister: boolean;
  /**
   * Whether the Lens browser tools are exposed by the local MCP server.
   *
   * They are ~27 of the server's tools, and every tool schema is part of the
   * prompt of every fresh provider session that attaches the server. Turning
   * them off removes that cost for users who never drive a browser from an
   * agent turn.
   */
  browserToolsEnabled: boolean;
  /** Schema version used to migrate defaults written by older builds. */
  configVersion: number;
}

export interface ClaudeCodeMcpRegistrationStatus {
  autoRegister: boolean;
  configPath: string;
  installed: boolean;
  matchesCurrentManifest: boolean;
  transportType: string | null;
  url: string | null;
  detail: string;
  error?: string;
}

export interface CodexMcpRegistrationStatus {
  autoRegister: boolean;
  configPath: string;
  installed: boolean;
  matchesCurrentManifest: boolean;
  url: string | null;
  bearerTokenEnvVar: string | null;
  detail: string;
  error?: string;
}

export interface StaveLocalMcpManifest {
  version: 1;
  name: "stave-local-mcp";
  mode: "local-only";
  url: string;
  healthUrl: string;
  token: string;
  host: string;
  port: number;
  pid: number;
  appVersion: string;
  startedAt: string;
  /**
   * Absolute path to the compiled stdio proxy script.
   * Consumers (e.g. Agentize) that cannot reach the 127.0.0.1 loopback
   * endpoint directly — such as Codex — should spawn:
   *   node <stdioProxyScript>
   * and use it as a stdio-transport MCP server instead.
   */
  stdioProxyScript: string;
}

export interface StaveLocalMcpStatus {
  config: StaveLocalMcpConfig;
  running: boolean;
  manifest: StaveLocalMcpManifest | null;
  manifestPaths: string[];
  configPath: string;
  claudeCodeRegistration: ClaudeCodeMcpRegistrationStatus;
  codexRegistration: CodexMcpRegistrationStatus;
}

export interface StaveLocalMcpRequestLog {
  id: string;
  httpMethod: string;
  path: string;
  rpcMethod: string | null;
  rpcRequestId: string | null;
  toolName: string | null;
  statusCode: number;
  durationMs: number;
  hasRequestPayload: boolean;
  requestPayload: unknown | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface StaveLocalMcpRequestLogQuery {
  limit?: number;
  offset?: number;
  includePayload?: boolean;
}

export interface StaveLocalMcpRequestLogPage {
  logs: StaveLocalMcpRequestLog[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}
