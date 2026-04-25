export interface StaveLocalMcpConfig {
  enabled: boolean;
  port: number;
  token: string;
  claudeCodeAutoRegister: boolean;
  codexAutoRegister: boolean;
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
