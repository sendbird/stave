import path from "node:path";
import { z } from "zod";
import {
  ApiConnectionCreateArgsSchema,
  ApiConnectionSchema,
  ApiConnectionUpdateArgsSchema,
  MAX_API_CONNECTIONS,
  apiConnectionEndpoints,
  apiConnectionRuntimes,
  type ApiConnection,
  type ApiConnectionCreateArgs,
  type ApiConnectionRuntime,
  type ApiConnectionUpdateArgs,
} from "../../src/lib/providers/api-connections";
import type { ClaudeGateway } from "../../src/lib/providers/claude-gateway";
import type { ProviderAccountProfile } from "../../src/lib/providers/provider-accounts";

/**
 * A stored connection. `directories` pins a runtime's configuration folder
 * when it already existed (a migrated Claude gateway keeps its folder and its
 * session history); otherwise the folder is derived from the id.
 */
export const SavedApiConnectionSchema = ApiConnectionSchema.extend({
  directories: z.object({
    "claude-code": z.string().min(1).max(4096).optional(),
    codex: z.string().min(1).max(4096).optional(),
  }).strict().optional(),
}).strict();
export type SavedApiConnection = z.infer<typeof SavedApiConnectionSchema>;

export function publicApiConnection(connection: SavedApiConnection): ApiConnection {
  const { directories: _directories, ...rest } = connection;
  return rest;
}

/** The managed folder a runtime uses for a connection: its own history, no sign-in. */
export function apiConnectionDirectory(connection: SavedApiConnection, runtime: ApiConnectionRuntime, managedRoot: string) {
  return connection.directories?.[runtime] ?? path.join(managedRoot, "connections", connection.id, runtime);
}

/** The runtime adapter's view: this runtime's endpoint, key reference and model IDs. */
export function apiConnectionGateway(connection: ApiConnection, runtime: ApiConnectionRuntime): ClaudeGateway | undefined {
  const baseUrl = connection.endpoints[runtime];
  return baseUrl ? { baseUrl, secretId: connection.secretId, models: connection.models.map((model) => model.id) } : undefined;
}

/** One selectable entry per runtime the connection serves, next to that runtime's sign-in accounts. */
export function apiConnectionAccountProfiles(connections: readonly SavedApiConnection[]): ProviderAccountProfile[] {
  return connections.flatMap((connection) => apiConnectionRuntimes(connection).map((runtime) => ({
    id: connection.id,
    providerId: runtime,
    label: connection.label,
    kind: "managed" as const,
    gateway: apiConnectionGateway(connection, runtime),
    apiConnection: { label: connection.label, kind: connection.kind, models: connection.models },
  })));
}

export function createApiConnectionRecord(connections: readonly SavedApiConnection[], input: ApiConnectionCreateArgs, id: string): SavedApiConnection {
  const parsed = ApiConnectionCreateArgsSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid API connection details.");
  if (connections.length >= MAX_API_CONNECTIONS) throw new Error("The API connection limit has been reached.");
  const args = parsed.data;
  return SavedApiConnectionSchema.parse({
    id,
    label: args.label,
    kind: args.kind,
    secretId: args.secretId,
    endpoints: apiConnectionEndpoints(args.kind, args.endpoints),
    models: args.models,
  });
}

export function updateApiConnectionRecord(connections: SavedApiConnection[], input: ApiConnectionUpdateArgs) {
  const parsed = ApiConnectionUpdateArgsSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid API connection details.");
  const index = connections.findIndex((connection) => connection.id === parsed.data.id);
  if (index < 0) throw new Error("The API connection no longer exists.");
  const { id: _id, ...patch } = parsed.data;
  const updated = SavedApiConnectionSchema.parse({ ...connections[index], ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) });
  return { connections: connections.map((connection, position) => (position === index ? updated : connection)), connection: updated };
}

export function removeApiConnectionRecord(connections: readonly SavedApiConnection[], id: string) {
  if (!connections.some((connection) => connection.id === id)) throw new Error("The API connection no longer exists.");
  // Its folders keep their session history; like sign-in accounts, removal only forgets them.
  return connections.filter((connection) => connection.id !== id);
}
