import { z } from "zod";
import { ProviderAccountSelectionSchema } from "../../src/lib/providers/provider-accounts";
import { getProviderAccountRegistry } from "../provider-accounts/registry";
import { revealSecret } from "./browser/secret-service";
import { resolveHostGatewayCredential } from "./provider-gateway-credential";
import type { HostGatewayCredentialResponse } from "../provider-accounts/host-gateway-credentials";

const RequestSchema = z.object({
  type: z.literal("gateway-credential-request"), id: z.uuid(),
  accounts: ProviderAccountSelectionSchema,
  decisionConnectionId: z.uuid().optional(),
}).strict();

/** Resolve anew for each host-started turn, including after restart or key rotation. */
export async function resolveHostGatewayCredentialRequest(input: unknown, resolveSecret = revealSecret): Promise<HostGatewayCredentialResponse | undefined> {
  const parsed = RequestSchema.safeParse(input);
  if (!parsed.success) return undefined;
  const { id, accounts, decisionConnectionId } = parsed.data;
  const credentials = await resolveHostGatewayCredential({ runtimeOptions: accounts }, resolveSecret);
  let decisionToken: string | undefined;
  if (decisionConnectionId) {
    try {
      const connection = getProviderAccountRegistry().listApiConnections().find((entry) => entry.id === decisionConnectionId);
      // Decision endpoint is fixed; a custom connection must never receive a key for this preset.
      if (connection?.kind === "vercel-ai-gateway") {
        const token = (await resolveSecret(connection.secretId))?.value.trim();
        if (token && !/[\r\n\0]/.test(token)) decisionToken = token;
      }
    } catch { /* Missing or locked keys are handled without exposing exception text. */ }
  }
  return { type: "gateway-credential-response", id, ...(credentials ? { credentials } : {}), ...(decisionToken ? { decisionToken } : {}) };
}
