import type {
  CodexAppServerSnapshot,
  CodexAppServerSnapshotResponse,
  CodexExternalAgentConfigMigrationItem,
  CodexModelCatalogEntry,
  CodexPluginMarketplaceSnapshot,
} from "../../src/lib/providers/provider.types";
import { requestCodexRateLimitBuckets } from "./codex-rate-limits-cache";
import {
  mapCodexConfigSnapshot,
  mapCodexHookCatalogGroups,
  mapCodexMcpStatusSnapshot,
  mapCodexModelCatalogEntry,
  mapCodexPluginSummary,
  mapCodexSkillCatalogGroups,
  mapCodexThreadSnapshot,
} from "./codex-snapshot-mappers";
import { toCodexUserFacingErrorMessage } from "./codex-app-server-errors";

export interface CodexSnapshotRequester {
  request<T>(method: string, params: unknown): Promise<T>;
}

async function listPaginatedCodexData<T>(args: {
  client: CodexSnapshotRequester;
  method: string;
  params?: Record<string, unknown>;
  maxPages?: number;
  signal?: AbortSignal;
}): Promise<T[]> {
  const results: T[] = [];
  let cursor: string | null = null;
  let pages = 0;
  const maxPages = args.maxPages ?? 10;
  while (pages < maxPages) {
    // Checked per page rather than only up front: a sweep can run for up to
    // `maxPages` round trips, and a caller that has already been cancelled
    // should not keep paying for the rest of them.
    if (args.signal?.aborted) {
      break;
    }
    const response: { data?: T[]; nextCursor?: string | null } =
      await args.client.request<{
        data?: T[];
        nextCursor?: string | null;
      }>(args.method, {
        ...(args.params ?? {}),
        ...(cursor ? { cursor } : {}),
      });
    results.push(...(response.data ?? []));
    cursor = response.nextCursor ?? null;
    pages += 1;
    if (!cursor) {
      break;
    }
  }
  return results;
}

export async function listCodexModelCatalogEntries(args: {
  client: CodexSnapshotRequester;
  signal?: AbortSignal;
}): Promise<CodexModelCatalogEntry[]> {
  const models = await listPaginatedCodexData<any>({
    client: args.client,
    method: "model/list",
    params: { includeHidden: false, limit: 100 },
    ...(args.signal ? { signal: args.signal } : {}),
  });
  return models.map(mapCodexModelCatalogEntry);
}

export async function collectCodexAppServerSnapshot(args: {
  client: CodexSnapshotRequester;
  cwd: string;
  hooksInventory: boolean;
}): Promise<CodexAppServerSnapshotResponse> {
  const client = args.client;
  const cwd = args.cwd;
  const snapshot: CodexAppServerSnapshot = {
    account: null,
    rateLimits: [],
    skills: [],
    hooks: [],
    pluginMarketplaces: [],
    plugins: [],
    pluginMarketplaceLoadErrors: [],
    apps: [],
    experimentalFeatures: [],
    mcpServers: [],
    threads: [],
    archivedThreads: [],
    config: null,
    configRequirements: null,
    externalAgentConfigItems: [],
  };
  const sectionErrors: Record<string, string> = {};
  let loadedSectionCount = 0;

  const loadSection = async (key: string, loader: () => Promise<void>) => {
    try {
      await loader();
      loadedSectionCount += 1;
    } catch (error) {
      sectionErrors[key] = toCodexUserFacingErrorMessage({
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  await Promise.all([
    loadSection("account", async () => {
      const response = await client.request<any>("account/read", {
        refreshToken: false,
      });
      const account = response?.account;
      snapshot.account = {
        type: typeof account?.type === "string" ? account.type : "unknown",
        email: typeof account?.email === "string" ? account.email : null,
        planType:
          typeof account?.planType === "string" ? account.planType : null,
        requiresOpenaiAuth: Boolean(response?.requiresOpenaiAuth),
      };
    }),
    loadSection("rateLimits", async () => {
      snapshot.rateLimits = await requestCodexRateLimitBuckets(client);
    }),
    loadSection("skills", async () => {
      const response = await client.request<any>("skills/list", {
        cwds: [cwd],
        forceReload: false,
      });
      snapshot.skills = mapCodexSkillCatalogGroups(response?.data, cwd);
    }),
    ...(args.hooksInventory
      ? [
          loadSection("hooks", async () => {
            const response = await client.request<any>("hooks/list", {
              cwds: [cwd],
            });
            snapshot.hooks = mapCodexHookCatalogGroups(response?.data, cwd);
          }),
        ]
      : []),
    loadSection("plugins", async () => {
      const response = await client.request<any>("plugin/list", {
        cwds: [cwd],
        forceRemoteSync: false,
      });
      snapshot.pluginMarketplaces = Array.isArray(response?.marketplaces)
        ? response.marketplaces.map(
            (marketplace: any): CodexPluginMarketplaceSnapshot => ({
              name: String(marketplace?.name ?? ""),
              path: String(marketplace?.path ?? ""),
              displayName:
                typeof marketplace?.interface?.displayName === "string"
                  ? marketplace.interface.displayName
                  : null,
            }),
          )
        : [];
      snapshot.plugins = Array.isArray(response?.marketplaces)
        ? response.marketplaces.flatMap((marketplace: any) =>
            Array.isArray(marketplace?.plugins)
              ? marketplace.plugins.map((plugin: any) =>
                  mapCodexPluginSummary(plugin, marketplace),
                )
              : [],
          )
        : [];
      snapshot.pluginMarketplaceLoadErrors = Array.isArray(
        response?.marketplaceLoadErrors,
      )
        ? response.marketplaceLoadErrors.map((error: any) =>
            typeof error?.message === "string"
              ? error.message
              : JSON.stringify(error ?? {}),
          )
        : [];
    }),
    loadSection("apps", async () => {
      const apps = await listPaginatedCodexData<any>({
        client,
        method: "app/list",
        params: { limit: 100, forceRefetch: false },
      });
      snapshot.apps = apps.map((app: any) => ({
        id: String(app?.id ?? ""),
        name: String(app?.name ?? ""),
        description:
          typeof app?.description === "string" ? app.description : null,
        logoUrl: typeof app?.logoUrl === "string" ? app.logoUrl : null,
        logoUrlDark:
          typeof app?.logoUrlDark === "string" ? app.logoUrlDark : null,
        distributionChannel:
          typeof app?.distributionChannel === "string"
            ? app.distributionChannel
            : null,
        installUrl:
          typeof app?.installUrl === "string" ? app.installUrl : null,
        isAccessible: Boolean(app?.isAccessible),
        isEnabled: Boolean(app?.isEnabled),
        pluginDisplayNames: Array.isArray(app?.pluginDisplayNames)
          ? app.pluginDisplayNames
              .map((name: unknown) => String(name ?? "").trim())
              .filter(Boolean)
          : [],
        labels:
          app?.labels && typeof app.labels === "object"
            ? Object.fromEntries(
                Object.entries(app.labels).map(([key, value]) => [
                  key,
                  String(value ?? ""),
                ]),
              )
            : null,
      }));
    }),
    loadSection("experimentalFeatures", async () => {
      const features = await listPaginatedCodexData<any>({
        client,
        method: "experimentalFeature/list",
        params: { limit: 100 },
      });
      snapshot.experimentalFeatures = features.map((feature: any) => ({
        name: String(feature?.name ?? ""),
        stage: typeof feature?.stage === "string" ? feature.stage : "unknown",
        displayName:
          typeof feature?.displayName === "string"
            ? feature.displayName
            : null,
        description:
          typeof feature?.description === "string"
            ? feature.description
            : null,
        announcement:
          typeof feature?.announcement === "string"
            ? feature.announcement
            : null,
        enabled: Boolean(feature?.enabled),
        defaultEnabled: Boolean(feature?.defaultEnabled),
      }));
    }),
    loadSection("mcpServers", async () => {
      const response = await client.request<{ data?: any[] }>(
        "mcpServerStatus/list",
        {
          detail: "full",
        },
      );
      snapshot.mcpServers = (response.data ?? []).map(
        mapCodexMcpStatusSnapshot,
      );
    }),
    loadSection("threads", async () => {
      const threads = await listPaginatedCodexData<any>({
        client,
        method: "thread/list",
        params: {
          cwd,
          archived: false,
          limit: 100,
        },
      });
      snapshot.threads = threads.map((thread: any) =>
        mapCodexThreadSnapshot(thread, false),
      );
    }),
    loadSection("archivedThreads", async () => {
      const threads = await listPaginatedCodexData<any>({
        client,
        method: "thread/list",
        params: {
          cwd,
          archived: true,
          limit: 100,
        },
      });
      snapshot.archivedThreads = threads.map((thread: any) =>
        mapCodexThreadSnapshot(thread, true),
      );
    }),
    loadSection("config", async () => {
      const response = await client.request<any>("config/read", {
        includeLayers: true,
        cwd,
      });
      snapshot.config = mapCodexConfigSnapshot(response);
    }),
    loadSection("configRequirements", async () => {
      const response = await client.request<any>(
        "configRequirements/read",
        {},
      );
      snapshot.configRequirements = response?.requirements
        ? {
            allowedApprovalPolicies: Array.isArray(
              response.requirements.allowedApprovalPolicies,
            )
              ? response.requirements.allowedApprovalPolicies.map(
                  (entry: unknown) => String(entry ?? ""),
                )
              : null,
            allowedSandboxModes: Array.isArray(
              response.requirements.allowedSandboxModes,
            )
              ? response.requirements.allowedSandboxModes.map(
                  (entry: unknown) => String(entry ?? ""),
                )
              : null,
            allowedWebSearchModes: Array.isArray(
              response.requirements.allowedWebSearchModes,
            )
              ? response.requirements.allowedWebSearchModes.map(
                  (entry: unknown) => String(entry ?? ""),
                )
              : null,
            featureRequirements:
              response.requirements.featureRequirements &&
              typeof response.requirements.featureRequirements === "object"
                ? Object.fromEntries(
                    Object.entries(
                      response.requirements.featureRequirements,
                    ).map(([key, value]) => [key, Boolean(value)]),
                  )
                : null,
            enforceResidency:
              typeof response.requirements.enforceResidency === "string"
                ? response.requirements.enforceResidency
                : null,
          }
        : null;
    }),
    loadSection("externalAgentConfig", async () => {
      const response = await client.request<any>(
        "externalAgentConfig/detect",
        {
          includeHome: true,
          cwds: [cwd],
        },
      );
      snapshot.externalAgentConfigItems = Array.isArray(response?.items)
        ? response.items.map(
            (item: any): CodexExternalAgentConfigMigrationItem => ({
              itemType: String(item?.itemType ?? ""),
              description: String(item?.description ?? ""),
              cwd: typeof item?.cwd === "string" ? item.cwd : null,
            }),
          )
        : [];
    }),
  ]);

  if (loadedSectionCount === 0) {
    return {
      ok: false,
      detail: "Failed to load Codex App Server snapshot.",
      sectionErrors,
    };
  }

  return {
    ok: true,
    detail:
      Object.keys(sectionErrors).length === 0
        ? "Loaded Codex App Server snapshot."
        : `Loaded Codex App Server snapshot with ${Object.keys(sectionErrors).length} section error(s).`,
    sectionErrors,
    snapshot,
  };
}
