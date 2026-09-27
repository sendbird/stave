/**
 * Main-process bridge to the host service's proposed missions: the renderer's
 * Issues → Proposed tab, pull request start conditions, and the
 * `stave_propose_mission` tool of a triage mission's turns.
 */
import { webContents } from "electron";
import { PROPOSAL_IPC } from "../../src/lib/missions/proposed";
import type { HostProposalAction } from "../host-service/supervision/proposal-runtime";
import { invokeHostService, onHostServiceEvent } from "./host-service-client";

type ProposalResult<T> = { ok: true; value: T } | { ok: false; message: string };

export function invokeProposal<T>(action: HostProposalAction, args: unknown): Promise<ProposalResult<T>> {
  return invokeHostService("proposal.invoke", { action, args }) as Promise<ProposalResult<T>>;
}

let bridgeRegistered = false;

/** Forwards `proposal.changed` from the host to every renderer. */
export function ensureProposalEventBridge() {
  if (bridgeRegistered) return;
  bridgeRegistered = true;
  onHostServiceEvent("proposal.changed", () => {
    for (const contents of webContents.getAllWebContents()) {
      if (!contents.isDestroyed()) contents.send(PROPOSAL_IPC.changed);
    }
  });
}

/** For the triage tool: a refusal becomes the tool's error text. */
export async function proposeMissionForGrant(args: { missionKey: string; input: unknown }) {
  const result = await invokeProposal<{ state: string; message: string }>("propose-for-grant", args);
  if (!result.ok) throw new Error(result.message);
  return result.value;
}
