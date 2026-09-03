import type {
  McpConfigProvider,
  McpServerConfigDraft,
  McpServerConfigMutationPreview,
} from "./mcp-config.types";

function formatMcpShareProviderLabel(provider: McpConfigProvider) {
  switch (provider) {
    case "claude-code":
      return "Claude";
    case "codex":
      return "Codex";
    case "cursor":
      return "Cursor";
    case "kiro":
      return "Kiro";
  }
}

export const MCP_SHAREABLE_PROVIDERS = [
  "claude-code",
  "codex",
  "cursor",
  "kiro",
] as const;

const SHARE_REVISION_PREFIX = "share:v1:";

export function normalizeMcpInstallProviders(
  providers: readonly McpConfigProvider[] | undefined,
  fallback: McpConfigProvider,
): McpConfigProvider[] {
  const unique = new Set<McpConfigProvider>();
  for (const provider of providers ?? []) {
    if (MCP_SHAREABLE_PROVIDERS.includes(provider)) {
      unique.add(provider);
    }
  }
  if (unique.size === 0) {
    unique.add(fallback);
  }
  return MCP_SHAREABLE_PROVIDERS.filter((provider) => unique.has(provider));
}

export function adaptMcpDraftForProvider(
  draft: McpServerConfigDraft,
  provider: McpConfigProvider,
): McpServerConfigDraft {
  if (provider === "codex") {
    if (draft.transport === "sse") {
      throw new Error("Codex does not support creating SSE MCP servers.");
    }
    return {
      ...draft,
      provider,
      scope: "user",
    };
  }
  if (
    (provider === "cursor" || provider === "kiro") &&
    draft.scope === "local"
  ) {
    return { ...draft, provider, scope: "project" };
  }
  return {
    ...draft,
    provider,
  };
}

export function resolveMcpShareDestinationScope(args: {
  sourceScope: McpServerConfigDraft["scope"];
  destinationProvider: McpConfigProvider;
}) {
  if (args.destinationProvider === "codex") return "user" as const;
  if (
    (args.destinationProvider === "cursor" ||
      args.destinationProvider === "kiro") &&
    args.sourceScope === "local"
  ) {
    return "project" as const;
  }
  return args.sourceScope;
}

export function describeMcpInstallAdaptation(args: {
  draft: McpServerConfigDraft;
  provider: McpConfigProvider;
}): string[] {
  const warnings: string[] = [];
  if (args.provider === "codex" && args.draft.scope !== "user") {
    warnings.push(
      "Codex will receive a user-scope copy. Project and local-project scope stay Claude-only.",
    );
  }
  if (args.provider === "codex" && args.draft.transport === "sse") {
    warnings.push("Codex cannot receive an SSE server.");
  }
  if (args.provider === "cursor" && args.draft.scope === "local") {
    warnings.push(
      "Cursor will receive a project-scope copy because it has no local-project MCP scope.",
    );
  }
  if (args.provider === "kiro" && args.draft.scope === "local") {
    warnings.push(
      "Kiro will receive a project-scope copy because it has no local-project MCP scope.",
    );
  }
  return warnings;
}

export function planMcpSharedInstall(args: {
  draft: McpServerConfigDraft;
  installProviders?: readonly McpConfigProvider[];
}): {
  providers: McpConfigProvider[];
  drafts: McpServerConfigDraft[];
  warnings: string[];
} {
  const providers = normalizeMcpInstallProviders(
    args.installProviders,
    args.draft.provider,
  );
  const drafts: McpServerConfigDraft[] = [];
  const warnings: string[] = [];

  for (const provider of providers) {
    warnings.push(
      ...describeMcpInstallAdaptation({ draft: args.draft, provider }),
    );
    drafts.push(adaptMcpDraftForProvider(args.draft, provider));
  }

  return { providers, drafts, warnings };
}

export function encodeMcpShareRevision(
  revisions: Readonly<Partial<Record<McpConfigProvider, string>>>,
) {
  const parts = MCP_SHAREABLE_PROVIDERS.flatMap((provider) => {
    const revision = revisions[provider]?.trim();
    return revision ? [`${provider}:${revision}`] : [];
  });
  if (parts.length === 0) {
    throw new Error("A shared MCP install requires at least one revision.");
  }
  if (parts.length === 1) {
    const only = Object.values(revisions).find((value) => value?.trim());
    return only ?? parts[0]!;
  }
  return `${SHARE_REVISION_PREFIX}${parts.join("|")}`;
}

export function decodeMcpShareRevision(revision: string) {
  const trimmed = revision.trim();
  if (!trimmed.startsWith(SHARE_REVISION_PREFIX)) {
    return null;
  }
  const encoded = trimmed.slice(SHARE_REVISION_PREFIX.length);
  const parsed: Partial<Record<McpConfigProvider, string>> = {};
  for (const part of encoded.split("|")) {
    const separator = part.indexOf(":");
    if (separator < 1) continue;
    const provider = part.slice(0, separator);
    const value = part.slice(separator + 1).trim();
    if (
      (provider === "claude-code" ||
        provider === "codex" ||
        provider === "cursor" ||
        provider === "kiro") &&
      value.length > 0
    ) {
      parsed[provider] = value;
    }
  }
  return Object.keys(parsed).length > 0 ? parsed : null;
}

export function expectedRevisionForProvider(args: {
  provider: McpConfigProvider;
  revision: string;
}) {
  const shared = decodeMcpShareRevision(args.revision);
  if (!shared) {
    return args.revision;
  }
  const matched = shared[args.provider];
  if (!matched) {
    throw new Error(
      `The shared MCP preview is missing a ${formatMcpShareProviderLabel(args.provider)} revision.`,
    );
  }
  return matched;
}

export function composeMcpSharePreview(args: {
  operation: McpServerConfigMutationPreview["operation"];
  name: string;
  previews: Array<{
    provider: McpConfigProvider;
    preview: McpServerConfigMutationPreview;
  }>;
  extraWarnings?: string[];
}): McpServerConfigMutationPreview {
  if (args.previews.length === 0) {
    throw new Error("A shared MCP install requires at least one target.");
  }
  if (args.previews.length === 1) {
    const only = args.previews[0]!;
    const warnings = [...only.preview.warnings, ...(args.extraWarnings ?? [])];
    if (args.operation === "share") {
      return {
        ...only.preview,
        operation: "share",
        title: `Share ${args.name} to ${formatMcpShareProviderLabel(only.provider)}`,
        warnings,
      };
    }
    return {
      ...only.preview,
      warnings,
    };
  }

  const labels = args.previews.map((entry) =>
    formatMcpShareProviderLabel(entry.provider),
  );
  const verb =
    args.operation === "share"
      ? "Share"
      : args.operation === "create"
        ? "Add"
        : args.operation === "update"
          ? "Update"
          : "Delete";

  return {
    operation: args.operation,
    revision: encodeMcpShareRevision(
      Object.fromEntries(
        args.previews.map((entry) => [entry.provider, entry.preview.revision]),
      ),
    ),
    title: `${verb} ${args.name} on ${labels.join(" and ")}`,
    changes: args.previews.flatMap((entry) => {
      const label = formatMcpShareProviderLabel(entry.provider);
      return entry.preview.changes.map((change) => `${label}: ${change}`);
    }),
    warnings: [
      ...args.previews.flatMap((entry) => entry.preview.warnings),
      ...(args.extraWarnings ?? []),
    ],
  };
}

export function summarizeMcpShareResults(args: {
  operation: McpServerConfigMutationPreview["operation"];
  results: Array<{
    provider: McpConfigProvider;
    ok: boolean;
    detail: string;
  }>;
}) {
  const succeeded = args.results.filter((result) => result.ok);
  const failed = args.results.filter((result) => !result.ok);
  const verb =
    args.operation === "share"
      ? "Shared"
      : args.operation === "create"
        ? "Added"
        : args.operation === "update"
          ? "Updated"
          : "Deleted";

  if (failed.length === 0) {
    return {
      ok: true,
      detail:
        succeeded.length > 1
          ? `${verb} the MCP server on ${succeeded
              .map((result) => formatMcpShareProviderLabel(result.provider))
              .join(" and ")}.`
          : (succeeded[0]?.detail ?? `${verb} the MCP server.`),
    };
  }

  if (succeeded.length === 0) {
    return {
      ok: false,
      detail: failed.map((result) => result.detail).join(" "),
    };
  }

  return {
    ok: false,
    detail: `Partial MCP update: ${succeeded
      .map((result) => formatMcpShareProviderLabel(result.provider))
      .join(" and ")} succeeded. ${failed
      .map(
        (result) =>
          `${formatMcpShareProviderLabel(result.provider)} failed: ${result.detail}`,
      )
      .join(" ")}`,
  };
}
