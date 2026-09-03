import type {
  McpConfigMutationOperation,
  McpConfigProvider,
  McpServerConfigDraft,
  McpServerConfigListRequest,
  McpServerConfigListResponse,
  McpServerConfigMutationApplyRequest,
  McpServerConfigMutationPreviewResponse,
  McpServerConfigMutationProviderResult,
  McpServerConfigMutationRequest,
  McpServerConfigMutationResponse,
} from "../../src/lib/providers/mcp-config.types";
import {
  adaptMcpDraftForProvider,
  composeMcpSharePreview,
  expectedRevisionForProvider,
  planMcpSharedInstall,
  summarizeMcpShareResults,
} from "../../src/lib/providers/mcp-config-share";
import {
  applyClaudeMcpServerConfigMutation,
  listClaudeMcpServerConfigs,
  previewClaudeMcpServerConfigMutation,
  readClaudeMcpShareDraft,
} from "./claude-mcp-config-management";
import {
  applyCodexMcpServerConfigMutation,
  listCodexMcpServerConfigs,
  previewCodexMcpServerConfigMutation,
  readCodexMcpShareDraft,
} from "./codex-app-server-runtime";
import {
  applyCursorMcpServerConfigMutation,
  listCursorMcpServerConfigs,
  previewCursorMcpServerConfigMutation,
  readCursorMcpShareDraft,
} from "./cursor-mcp-config-management";
import {
  applyKiroMcpServerConfigMutation,
  listKiroMcpServerConfigs,
  previewKiroMcpServerConfigMutation,
  readKiroMcpShareDraft,
} from "./kiro-mcp-config-management";

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

function toSingleProviderRequest(
  args: McpServerConfigMutationRequest,
  draft: McpServerConfigDraft,
): McpServerConfigMutationRequest {
  return {
    cwd: args.cwd,
    runtimeOptions: args.runtimeOptions,
    operation: "create",
    draft,
  };
}

async function previewProviderMutation(args: McpServerConfigMutationRequest) {
  const provider: McpConfigProvider = getMutationProvider(args);
  switch (provider) {
    case "claude-code":
      return previewClaudeMcpServerConfigMutation(args);
    case "codex":
      return previewCodexMcpServerConfigMutation(args);
    case "cursor":
      return previewCursorMcpServerConfigMutation(args);
    case "kiro":
      return previewKiroMcpServerConfigMutation(args);
  }
}

async function applyProviderMutation(
  args: McpServerConfigMutationApplyRequest,
) {
  const provider: McpConfigProvider = getMutationProvider(args);
  switch (provider) {
    case "claude-code":
      return applyClaudeMcpServerConfigMutation(args);
    case "codex":
      return applyCodexMcpServerConfigMutation(args);
    case "cursor":
      return applyCursorMcpServerConfigMutation(args);
    case "kiro":
      return applyKiroMcpServerConfigMutation(args);
  }
}

async function readShareDraft(args: McpServerConfigMutationRequest) {
  if (!args.target) {
    throw new Error("Sharing an MCP server requires a source target.");
  }
  switch (args.target.provider) {
    case "claude-code":
      return readClaudeMcpShareDraft({
        cwd: args.cwd,
        runtimeOptions: args.runtimeOptions,
        target: args.target,
      });
    case "codex":
      return readCodexMcpShareDraft({
        cwd: args.cwd,
        runtimeOptions: args.runtimeOptions,
        target: args.target,
      });
    case "cursor":
      return readCursorMcpShareDraft({
        cwd: args.cwd,
        runtimeOptions: args.runtimeOptions,
        target: args.target,
      });
    case "kiro":
      return readKiroMcpShareDraft({
        cwd: args.cwd,
        runtimeOptions: args.runtimeOptions,
        target: args.target,
      });
  }
}

function buildSharedDestinationDraft(args: {
  sourceDraft: McpServerConfigDraft;
  destinationProvider: McpConfigProvider;
  destinationScope?: McpServerConfigDraft["scope"];
  name: string;
}) {
  const adapted = adaptMcpDraftForProvider(
    {
      ...args.sourceDraft,
      name: args.name,
    },
    args.destinationProvider,
  );
  if (args.destinationScope) {
    return {
      ...adapted,
      scope: args.destinationScope,
    };
  }
  return adapted;
}

async function previewSharedCreates(args: {
  request: McpServerConfigMutationRequest;
  drafts: McpServerConfigDraft[];
  extraWarnings?: string[];
}): Promise<McpServerConfigMutationPreviewResponse> {
  const previews: Array<{
    provider: McpConfigProvider;
    preview: NonNullable<McpServerConfigMutationPreviewResponse["preview"]>;
  }> = [];
  for (const draft of args.drafts) {
    const result = await previewProviderMutation(
      toSingleProviderRequest(args.request, draft),
    );
    if (!result.ok || !result.preview) {
      return result;
    }
    previews.push({ provider: draft.provider, preview: result.preview });
  }
  return {
    ok: true,
    detail:
      previews.length > 1
        ? "MCP configuration changes are ready to review."
        : "MCP configuration change is ready to review.",
    preview: composeMcpSharePreview({
      operation: args.request.operation,
      name: args.drafts[0]?.name ?? args.request.draft?.name ?? "server",
      previews,
      extraWarnings: args.extraWarnings,
    }),
  };
}

async function applySharedCreates(
  args: {
    request: McpServerConfigMutationApplyRequest;
    drafts: McpServerConfigDraft[];
  },
  applyMutation = applyProviderMutation,
): Promise<McpServerConfigMutationResponse> {
  const results: McpServerConfigMutationProviderResult[] = [];
  let lastServer = undefined;
  for (const draft of args.drafts) {
    const result = await applyMutation({
      ...toSingleProviderRequest(args.request, draft),
      expectedRevision: expectedRevisionForProvider({
        provider: draft.provider,
        revision: args.request.expectedRevision,
      }),
    });
    results.push({
      provider: draft.provider,
      ok: result.ok,
      detail: result.detail,
    });
    if (result.server) {
      lastServer = result.server;
    }
  }
  const summary = summarizeMcpShareResults({
    operation: args.request.operation,
    results,
  });
  return {
    ok: summary.ok,
    detail: summary.detail,
    operation: args.request.operation,
    ...(lastServer ? { server: lastServer } : {}),
    results,
  };
}

export const __mcpConfigManagementTest = {
  applySharedCreates,
};

export async function listMcpServerConfigs(
  args: McpServerConfigListRequest,
): Promise<McpServerConfigListResponse> {
  const loadedAt = Date.now();
  const [claude, codex, cursor, kiro] = await Promise.all([
    listClaudeMcpServerConfigs(args),
    listCodexMcpServerConfigs(args),
    listCursorMcpServerConfigs(args),
    listKiroMcpServerConfigs(args),
  ]);
  const servers = [
    ...claude.servers,
    ...codex.servers,
    ...cursor.servers,
    ...kiro.servers,
  ].sort(
    (left, right) =>
      left.name.localeCompare(right.name) ||
      left.provider.localeCompare(right.provider) ||
      left.scope.localeCompare(right.scope),
  );
  const errors = [
    ...claude.errors,
    ...codex.errors,
    ...cursor.errors,
    ...kiro.errors,
  ];
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
    if (args.operation === "share") {
      if (!args.target || !args.destination) {
        throw new Error(
          "Sharing an MCP server requires a source and a destination.",
        );
      }
      if (args.target.provider === args.destination.provider) {
        throw new Error(
          "Choose a different provider to share this MCP server with.",
        );
      }
      const source = await readShareDraft(args);
      const draft = buildSharedDestinationDraft({
        sourceDraft: source.draft,
        destinationProvider: args.destination.provider,
        destinationScope: args.destination.scope,
        name: args.destination.name,
      });
      return previewSharedCreates({
        request: args,
        drafts: [draft],
        extraWarnings: source.warnings,
      });
    }

    if (args.operation === "create" && args.draft) {
      const plan = planMcpSharedInstall({
        draft: args.draft,
        installProviders: args.installProviders,
      });
      if (plan.drafts.length > 1) {
        return previewSharedCreates({
          request: args,
          drafts: plan.drafts,
          extraWarnings: plan.warnings,
        });
      }
    }

    return previewProviderMutation(args);
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
    if (args.operation === "share") {
      if (!args.target || !args.destination) {
        throw new Error(
          "Sharing an MCP server requires a source and a destination.",
        );
      }
      if (args.target.provider === args.destination.provider) {
        throw new Error(
          "Choose a different provider to share this MCP server with.",
        );
      }
      const source = await readShareDraft(args);
      const draft = buildSharedDestinationDraft({
        sourceDraft: source.draft,
        destinationProvider: args.destination.provider,
        destinationScope: args.destination.scope,
        name: args.destination.name,
      });
      return applySharedCreates({
        request: args,
        drafts: [draft],
      });
    }

    if (args.operation === "create" && args.draft) {
      const plan = planMcpSharedInstall({
        draft: args.draft,
        installProviders: args.installProviders,
      });
      if (plan.drafts.length > 1) {
        return applySharedCreates({
          request: args,
          drafts: plan.drafts,
        });
      }
    }

    return applyProviderMutation(args);
  } catch (error) {
    return failedMutationResponse(args.operation, error);
  }
}
