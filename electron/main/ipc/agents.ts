import { ipcMain, webContents } from "electron";
import { z } from "zod";
import { AGENT_IPC, type AgentInvokeResult, type HostAgentAction } from "../../../src/lib/agents/api";
import { AssignAgentInputSchema } from "../../../src/lib/agents/assign";
import { invokeHostService, onHostServiceEvent } from "../host-service-client";

/**
 * Main-process bridge for agents. The host validates an assign request again;
 * main checks its shape first so a malformed renderer call never reaches it.
 */

const ListSchema = z
  .object({
    agentConfigId: z.string().trim().min(1).max(80).optional(),
    limit: z.number().int().min(1).max(500).optional(),
  })
  .strict();

function invokeAgent<T>(action: HostAgentAction, args: unknown): Promise<AgentInvokeResult<T>> {
  return invokeHostService("agent.invoke", { action, args }) as Promise<AgentInvokeResult<T>>;
}

function failed(error: unknown, fallback: string): AgentInvokeResult<never> {
  return { ok: false, code: "failed", message: error instanceof Error && error.message ? error.message : fallback };
}

let bridgeRegistered = false;

export function registerAgentHandlers() {
  if (!bridgeRegistered) {
    bridgeRegistered = true;
    onHostServiceEvent("agent.changed", () => {
      for (const contents of webContents.getAllWebContents()) {
        if (!contents.isDestroyed()) contents.send(AGENT_IPC.changed);
      }
    });
  }
  ipcMain.handle(AGENT_IPC.assign, async (_event, args: unknown) => {
    const parsed = AssignAgentInputSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, code: "invalid", message: parsed.error.issues[0]?.message ?? "The assignment request was not valid." };
    }
    try {
      return await invokeAgent("assign", parsed.data);
    } catch (error) {
      return failed(error, "The work could not be assigned.");
    }
  });
  ipcMain.handle(AGENT_IPC.listAssignments, async (_event, args: unknown) => {
    const parsed = ListSchema.safeParse(args ?? {});
    if (!parsed.success) return { ok: false, code: "invalid", message: "Invalid request." };
    try {
      return await invokeAgent("list-assignments", parsed.data);
    } catch (error) {
      return failed(error, "Assignments could not be loaded.");
    }
  });
}
