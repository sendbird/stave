import { ipcMain } from "electron";
import { z } from "zod";
import {
  PROPOSAL_IPC,
  PROPOSED_MISSION_STATES,
  type ProposalCommandResponse,
  type ProposalListResponse,
  type ProposedMission,
} from "../../../src/lib/missions/proposed";
import { ensureProposalEventBridge, invokeProposal } from "../proposals-service";

const IdSchema = z.string().trim().min(1).max(200);
const ObserveSchema = z
  .object({
    workspaceId: IdSchema,
    workspaceName: z.string().max(200),
    pr: z
      .object({
        number: z.number().int().positive(),
        url: z.url().max(2_048),
        title: z.string().max(500),
        state: z.enum(["OPEN", "MERGED", "CLOSED"]),
        checks: z.enum(["SUCCESS", "FAILURE", "PENDING"]).nullable(),
        reviewDecision: z.string().max(40).nullable(),
        headSha: z.string().max(80).nullable(),
      })
      .strict(),
  })
  .strict();

function message(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function handleCommand(channel: string, action: "dismiss" | "mark-started" | "observe-pull-request", schema: z.ZodType) {
  ipcMain.handle(channel, async (_event, args: unknown): Promise<ProposalCommandResponse> => {
    const parsed = schema.safeParse(args);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." };
    try {
      const result = await invokeProposal(action, parsed.data);
      return result.ok ? { ok: true } : { ok: false, message: result.message };
    } catch (error) {
      return { ok: false, message: message(error, "The request failed.") };
    }
  });
}

export function registerProposalHandlers() {
  ensureProposalEventBridge();
  ipcMain.handle(PROPOSAL_IPC.list, async (_event, args: unknown): Promise<ProposalListResponse> => {
    const parsed = z.object({ state: z.enum(PROPOSED_MISSION_STATES).optional() }).strict().safeParse(args ?? {});
    if (!parsed.success) return { ok: false, proposals: [], message: "Invalid request." };
    try {
      const result = await invokeProposal<{ proposals: ProposedMission[] }>("list", parsed.data);
      return result.ok ? { ok: true, proposals: result.value.proposals } : { ok: false, proposals: [], message: result.message };
    } catch (error) {
      return { ok: false, proposals: [], message: message(error, "Proposed missions could not be loaded.") };
    }
  });
  handleCommand(PROPOSAL_IPC.dismiss, "dismiss", z.object({ id: IdSchema }).strict());
  handleCommand(PROPOSAL_IPC.markStarted, "mark-started", z.object({ id: IdSchema, missionId: IdSchema.nullable().optional() }).strict());
  handleCommand(PROPOSAL_IPC.observePullRequest, "observe-pull-request", ObserveSchema);
}
