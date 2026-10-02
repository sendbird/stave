// temporary-migration: claude-gateway-api-connections
import {
  VERCEL_AI_GATEWAY,
  apiConnectionEndpoints,
} from "../../src/lib/providers/api-connections";
import type { ClaudeGateway } from "../../src/lib/providers/claude-gateway";
import { SavedApiConnectionSchema, type SavedApiConnection } from "./api-connection-records";

interface LegacyProfile {
  id: string;
  providerId: string;
  label: string;
  kind: string;
  configDirectory: string;
  gateway?: ClaudeGateway;
}

/**
 * Builds up to 0.22.2 stored a gateway as a Claude account profile with a
 * `gateway` field and its own managed folder. It becomes an API connection
 * with the same id, label, key reference, models and folder, so selections,
 * queued turns, session cursors and CLI tabs that name the id keep working,
 * and its Claude session history stays where it was. A Vercel AI Gateway
 * profile also gains its Codex endpoint, because the same key serves both.
 * Idempotent: a profile whose id is already a connection is only dropped.
 */
export function migrateLegacyGatewayProfiles<P extends LegacyProfile>(state: {
  profiles: P[];
  connections: SavedApiConnection[];
}): { profiles: P[]; connections: SavedApiConnection[]; migrated: number } {
  const legacy = state.profiles.filter((profile) => profile.gateway);
  if (legacy.length === 0) return { ...state, migrated: 0 };
  const connections = [...state.connections];
  for (const profile of legacy) {
    if (profile.providerId !== "claude-code" || profile.kind !== "managed")
      throw new Error("A gateway was stored on an account that cannot hold one.");
    if (connections.some((connection) => connection.id === profile.id)) continue;
    const gateway = profile.gateway!;
    const vercel = gateway.baseUrl === VERCEL_AI_GATEWAY.endpoints["claude-code"];
    connections.push(SavedApiConnectionSchema.parse({
      id: profile.id,
      label: profile.label,
      kind: vercel ? "vercel-ai-gateway" : "custom",
      secretId: gateway.secretId,
      endpoints: vercel ? apiConnectionEndpoints("vercel-ai-gateway") : { "claude-code": gateway.baseUrl },
      models: gateway.models.map((id) => ({ id })),
      directories: { "claude-code": profile.configDirectory },
    }));
  }
  return {
    profiles: state.profiles.filter((profile) => !profile.gateway),
    connections,
    migrated: legacy.length,
  };
}
// end temporary-migration: claude-gateway-api-connections
