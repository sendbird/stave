import type {
  McpConfigMutationOperation,
  McpConfigProvider,
  McpServerConfigListRequest,
  McpServerConfigListResponse,
  McpServerConfigMutationApplyRequest,
  McpServerConfigMutationPreviewResponse,
  McpServerConfigMutationRequest,
  McpServerConfigMutationResponse,
} from "../../src/lib/providers/mcp-config.types";
import {
  applyClaudeMcpServerConfigMutation,
  listClaudeMcpServerConfigs,
  previewClaudeMcpServerConfigMutation,
} from "./claude-mcp-config-management";
import {
  applyCodexMcpServerConfigMutation,
  listCodexMcpServerConfigs,
  previewCodexMcpServerConfigMutation,
} from "./codex-app-server-runtime";

function getMutationProvider(args: McpServerConfigMutationRequest) {
  const provider = args.draft?.provider ?? args.target?.provider;
  if (!provider) {
    throw new Error("MCP configuration mutation requires a provider.");
  }
  if (
    args.draft &&
    args.target &&
    args.draft.provider !== args.target.provider
  ) {
    throw new Error(
      "Move a server between providers by adding and deleting it.",
    );
  }
  return provider;
}

function failedMutationResponse(
  operation: McpConfigMutationOperation,
  error: unknown,
): McpServerConfigMutationResponse {
  return {
    ok: false,
    detail: error instanceof Error ? error.message : String(error),
    operation,
  };
}

export async function listMcpServerConfigs(
  args: McpServerConfigListRequest,
): Promise<McpServerConfigListResponse> {
  const loadedAt = Date.now();
  const [claude, codex] = await Promise.all([
    listClaudeMcpServerConfigs(args),
    listCodexMcpServerConfigs(args),
  ]);
  const servers = [...claude.servers, ...codex.servers].sort(
    (left, right) =>
      left.name.localeCompare(right.name) ||
      left.provider.localeCompare(right.provider) ||
      left.scope.localeCompare(right.scope),
  );
  const errors = [...claude.errors, ...codex.errors];
  return {
    ok: errors.length === 0,
    detail:
      servers.length > 0
        ? `Loaded ${servers.length} editable MCP configuration${servers.length === 1 ? "" : "s"}.`
        : errors.length > 0
          ? "MCP configurations could not be loaded."
          : "No editable MCP configurations were found.",
    servers,
    errors,
    loadedAt,
  };
}

export async function previewMcpServerConfigMutation(
  args: McpServerConfigMutationRequest,
): Promise<McpServerConfigMutationPreviewResponse> {
  try {
    const provider: McpConfigProvider = getMutationProvider(args);
    return provider === "claude-code"
      ? previewClaudeMcpServerConfigMutation(args)
      : previewCodexMcpServerConfigMutation(args);
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function applyMcpServerConfigMutation(
  args: McpServerConfigMutationApplyRequest,
): Promise<McpServerConfigMutationResponse> {
  try {
    const provider: McpConfigProvider = getMutationProvider(args);
    return provider === "claude-code"
      ? applyClaudeMcpServerConfigMutation(args)
      : applyCodexMcpServerConfigMutation(args);
  } catch (error) {
    return failedMutationResponse(args.operation, error);
  }
}
