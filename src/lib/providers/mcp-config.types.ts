import type { ProviderRuntimeOptions } from "./provider.types";

export type McpConfigProvider = "claude-code" | "codex";
export type McpConfigScope = "user" | "project" | "local";
export type McpConfigTransport = "stdio" | "http" | "sse";
export type McpConfigMutationOperation = "create" | "update" | "delete";

export interface McpHeaderEnvBinding {
  name: string;
  envVar: string;
}

/**
 * Renderer-safe MCP configuration input. Credentials are referenced by
 * environment-variable name and never carried as values across IPC.
 *
 * `args` and `url` are optional during updates: omission preserves an existing
 * value that Stave intentionally withheld from the renderer.
 */
export interface McpServerConfigDraft {
  provider: McpConfigProvider;
  scope: McpConfigScope;
  name: string;
  transport: McpConfigTransport;
  command?: string;
  args?: string[];
  url?: string;
  envVars: string[];
  bearerTokenEnvVar?: string;
  headerEnvBindings: McpHeaderEnvBinding[];
  enabled: boolean;
}

export interface McpServerConfigTarget {
  provider: McpConfigProvider;
  scope: McpConfigScope;
  name: string;
}

/** A sanitized view of one native provider configuration entry. */
export interface McpServerConfigSnapshot extends McpServerConfigTarget {
  id: string;
  revision: string;
  transport: McpConfigTransport;
  command?: string;
  url?: string;
  urlRedacted: boolean;
  envVars: string[];
  bearerTokenEnvVar?: string;
  headerEnvBindings: McpHeaderEnvBinding[];
  enabled: boolean;
  argumentCount: number;
  hiddenValueCount: number;
  sourceLabel: string;
  canEdit: boolean;
  canDelete: boolean;
}

export interface McpServerConfigListRequest {
  cwd?: string;
  runtimeOptions?: ProviderRuntimeOptions;
}

export interface McpServerConfigListResponse {
  ok: boolean;
  detail: string;
  servers: McpServerConfigSnapshot[];
  errors: string[];
  loadedAt: number;
}

export interface McpServerConfigMutationRequest extends McpServerConfigListRequest {
  operation: McpConfigMutationOperation;
  target?: McpServerConfigTarget;
  draft?: McpServerConfigDraft;
}

export interface McpServerConfigMutationPreview {
  operation: McpConfigMutationOperation;
  revision: string;
  title: string;
  changes: string[];
  warnings: string[];
}

export interface McpServerConfigMutationPreviewResponse {
  ok: boolean;
  detail: string;
  preview?: McpServerConfigMutationPreview;
}

export interface McpServerConfigMutationApplyRequest extends McpServerConfigMutationRequest {
  expectedRevision: string;
}

export interface McpServerConfigMutationResponse {
  ok: boolean;
  detail: string;
  operation: McpConfigMutationOperation;
  server?: McpServerConfigSnapshot;
}
