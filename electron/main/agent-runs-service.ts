/**
 * Main-process bridge to the host service's agent run supervisor.
 *
 * Used by:
 * - `electron/main/ipc/agent-runs.ts` (the renderer's `window.api.agentRuns`)
 * - `electron/main/stave-mcp-server.ts` (the stage-reporting tools, through
 *   `electron/main/stave-agent-run-tools.ts`)
 */
import { webContents } from "electron";
import {
  AGENT_RUN_IPC,
  type AgentRunChangedEvent,
  type AgentRunInvokeResult,
} from "../../src/lib/agent-runs/api";
import type { AgentRunBriefing } from "../../src/lib/agent-runs/briefing";
import type { AgentRunReportReceipt } from "../host-service/supervision/agent-run-runtime";
import type { HostAgentRunAction } from "../host-service/protocol";
import { invokeHostService, onHostServiceEvent } from "./host-service-client";

let agentRunEventBridgeRegistered = false;

/** Forwards `agent-run.changed` from the host to every renderer. */
export function ensureAgentRunEventBridge() {
  if (agentRunEventBridgeRegistered) return;
  agentRunEventBridgeRegistered = true;
  onHostServiceEvent("agent-run.changed", (payload: AgentRunChangedEvent) => {
    for (const contents of webContents.getAllWebContents()) {
      if (!contents.isDestroyed()) contents.send(AGENT_RUN_IPC.changed, payload);
    }
  });
}

export function invokeAgentRun<T>(
  action: HostAgentRunAction,
  args: unknown,
): Promise<AgentRunInvokeResult<T>> {
  return invokeHostService("agent-run.invoke", { action, args }) as Promise<
    AgentRunInvokeResult<T>
  >;
}

/** For the stage-reporting tools: a refusal becomes the tool's error text. */
async function invokeForTool<T>(action: HostAgentRunAction, args: unknown): Promise<T> {
  const result = await invokeAgentRun<T>(action, args);
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

export function getAgentRunForGrant(args: { agentRunKey: string }) {
  return invokeForTool<AgentRunBriefing>("get-for-grant", args);
}

export function reportAgentRunStage(args: { agentRunKey: string; report: unknown }) {
  return invokeForTool<AgentRunReportReceipt>("report-stage", args);
}

export function blockAgentRunStage(args: { agentRunKey: string; block: unknown }) {
  return invokeForTool<AgentRunReportReceipt>("block-stage", args);
}
