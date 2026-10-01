import type { CallerGrant } from "../providers/caller-grants";
import type { StaveTurnGrants } from "../providers/stave-turn-grants";
import { invokeHostService } from "./host-service-client";

/**
 * Who a Local MCP call comes from. A Stave turn always carries a caller key,
 * so its identity is the host's grant, never the ids the model typed. A call
 * without a key comes from a client Stave did not start (a terminal CLI with
 * the user's token) and keeps naming its task explicitly.
 */
export type StaveMcpCaller =
  | { kind: "turn"; grant: CallerGrant }
  | { kind: "external" };

export class StaveMcpCallerError extends Error {}

export async function resolveStaveMcpCaller(grants: StaveTurnGrants): Promise<StaveMcpCaller> {
  const callerKey = grants.callerKey?.trim();
  if (!callerKey) return { kind: "external" };
  const grant = (await invokeHostService("local-mcp.invoke", {
    action: "resolve-caller-grant",
    args: { callerKey },
  })) as CallerGrant | null;
  if (!grant) {
    throw new StaveMcpCallerError("This turn has ended, so its Stave tools are closed. Start a new turn to continue.");
  }
  return { kind: "turn", grant };
}

/**
 * The task a call acts for: the calling task for a Stave turn, refusing any
 * other id the model passed; the passed id for an external client.
 */
export function callerTaskId(caller: StaveMcpCaller, requested?: string): string {
  const named = requested?.trim();
  if (caller.kind === "external") {
    if (!named) throw new StaveMcpCallerError("Name the task this call acts for (parentTaskId).");
    return named;
  }
  if (named && named !== caller.grant.taskId) {
    throw new StaveMcpCallerError("parentTaskId must be the calling task. A turn can only act for its own task.");
  }
  return caller.grant.taskId;
}
