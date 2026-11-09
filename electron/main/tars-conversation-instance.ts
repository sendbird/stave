import { app } from "electron";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { secondaryRunCoordinator } from "./runs/secondary-run-coordinator-instance";
import { ensurePersistenceReady } from "./state";
import { invokeHostService, onHostServiceEvent } from "./host-service-client";
import { createTarsConversationService } from "./tars-conversation-service";
import { observeTarsContext } from "./tars-context";
import { areCustomAgentsSynced, getCustomAgents } from "./agents/agent-registry";
import { syncAgentsToHost } from "./agents/agent-host-sync";
import { listAgents } from "../../src/lib/agents/library";
import { tarsPlannerAgents } from "../../src/lib/tars/agents";
import { tarsExecutionTarget } from "../../src/lib/tars/execution-resources";
import { notifyTarsChanged } from "./tars-events";

let instance: Promise<ReturnType<typeof createTarsConversationService>> | null = null;
let stopping = false;

export function getTarsConversationService() {
  if (!instance) instance = ensurePersistenceReady().then((store) => {
    const cwd = path.join(app.getPath("userData"), "representative");
    mkdirSync(cwd, { recursive: true });
    // Main writes the conversation (messages, answers, failures); renderers read it again on push.
    store.tarsConversations.onChange(notifyTarsChanged);
    store.tars.onChange(notifyTarsChanged);
    const service = createTarsConversationService({
      conversations: store.tarsConversations,
      coordinator: secondaryRunCoordinator,
      responsibilities: store.tars,
      context: async (message) => {
        const execution = tarsExecutionTarget(message);
        return { ...observeTarsContext(store, new Date().toISOString()), cwd,
          agents: tarsPlannerAgents({ agents: listAgents({ custom: getCustomAgents(), activeOnly: true }),
            allowedAgentIds: message.allowedAgentIds ?? [], executionProviderId: execution.providerId, executionModel: execution.model }) };
      },
      agentCatalogReady: areCustomAgentsSynced, resyncAgentCatalog: syncAgentsToHost,
      applyDecision: (input) => invokeHostService("tars.apply-decision", input),
      // Decision answers that control work take the same host path as a click.
      act: (input) => invokeHostService("tars.act", input),
      onError: () => console.error("[tars] conversation scheduling failed"),
    });
    // The host moves responsibilities; a move can invalidate a waiting decision, which Tars asks about once.
    onHostServiceEvent("tars.changed", (event) => { if (event.scope === "snapshot") service.wake(); });
    if (!stopping) service.start();
    return service;
  }).catch((error: unknown) => {
    // A failed start must not stay cached: the next request tries again.
    instance = null;
    throw error;
  });
  return instance;
}

/** Retry work that waited for the saved agent catalog; a no-op before the service exists. */
export function wakeTarsConversationService() {
  if (instance) void instance.then((service) => service.wake()).catch(() => undefined);
}

export async function startTarsConversationService() {
  await getTarsConversationService();
}

export async function stopTarsConversationService() {
  stopping = true;
  if (instance) await (await instance).stop();
}
