import { LinkProjectTaskArgsSchema, UnlinkProjectTaskArgsSchema, RecordProjectIntegrationArgsSchema } from "../../../src/lib/projects/task-integration";
import { ipcMain } from "electron";
import { z } from "zod";
import { PROJECT_IPC, type ProjectDetail, type ProjectResponse } from "../../../src/lib/projects/api";
import type { Project } from "../../../src/lib/projects/domain";
import {
  MEMORY_STATUSES,
  MISSION_PROVIDERS,
  PROJECT_LIMITS,
  ProjectCreateInputSchema,
  ProjectSettingsPatchSchema,
} from "../../../src/lib/projects/domain";
import { MAX_PLAYBOOKS, PlaybookSchema, type Playbook } from "../../../src/lib/playbooks/schema";
import type { HostProjectAction } from "../../host-service/protocol";
import { ensureProjectEventBridge, ensureProjectIssueBridge, invokeProject, syncPlaybooksToHost } from "../projects-service";

const IdSchema = z.string().trim().min(1).max(200);
const ProjectIdArgsSchema = z.object({ projectId: IdSchema }).strict();
const ProposalArgsSchema = z.object({ projectId: IdSchema, proposalId: IdSchema }).strict();
const ApproveArgsSchema = ProposalArgsSchema.extend({
  providerId: z.enum(MISSION_PROVIDERS).optional(),
  model: z.string().trim().min(1).max(120).nullable().optional(),
}).strict();
const EndArgsSchema = z.object({ projectId: IdSchema, outcome: z.enum(["completed", "cancelled"]) }).strict();
const SettingsArgsSchema = z.object({ projectId: IdSchema, settings: ProjectSettingsPatchSchema }).strict();
const MemoryArgsSchema = z
  .object({ projectId: IdSchema, memoryId: IdSchema, status: z.enum([...MEMORY_STATUSES, "removed"]) })
  .strict();
const ListArgsSchema = z.object({ openOnly: z.boolean().optional() }).strict();
const MessageArgsSchema = z
  .object({ projectId: IdSchema, text: z.string().trim().min(1).max(PROJECT_LIMITS.coordinatorMessage) })
  .strict();
const SyncArgsSchema = z.object({ playbooks: z.array(z.unknown()).max(MAX_PLAYBOOKS * 4) }).strict();

/** Each playbook on its own: one that fails validation is left out, not the whole sync. */
function parsePlaybooks(raw: readonly unknown[]): Playbook[] {
  const playbooks: Playbook[] = [];
  let dropped = 0;
  for (const candidate of raw) {
    const parsed = PlaybookSchema.safeParse(candidate);
    if (parsed.success) playbooks.push(parsed.data);
    else dropped += 1;
  }
  if (dropped > 0) console.warn(`[projects] left out ${dropped} playbook(s) that failed validation`);
  if (playbooks.length > MAX_PLAYBOOKS) console.warn(`[projects] kept the first ${MAX_PLAYBOOKS} of ${playbooks.length} playbooks`);
  return playbooks.slice(0, MAX_PLAYBOOKS);
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Every project command answers with the project as it is afterwards, or the refusal. */
function handleCommand(channel: string, action: HostProjectAction, schema: z.ZodType) {
  ipcMain.handle(channel, async (_event, args: unknown): Promise<ProjectResponse> => {
    const parsed = schema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, project: null, code: "invalid-args", message: parsed.error.issues[0]?.message ?? "Invalid project request." };
    }
    try {
      const result = await invokeProject<ProjectDetail>(action, parsed.data);
      return result.ok
        ? { ok: true, project: result.value }
        : { ok: false, project: null, code: result.code, message: result.message };
    } catch (error) {
      return { ok: false, project: null, code: "failed", message: errorMessage(error, "The project request failed.") };
    }
  });
}

export function registerProjectHandlers() {
  ensureProjectEventBridge();
  ensureProjectIssueBridge();
  handleCommand(PROJECT_IPC.linkTask, "link-task", LinkProjectTaskArgsSchema);
  handleCommand(PROJECT_IPC.unlinkTask, "unlink-task", UnlinkProjectTaskArgsSchema);
  handleCommand(PROJECT_IPC.recordIntegration, "record-integration", RecordProjectIntegrationArgsSchema);
  handleCommand(PROJECT_IPC.get, "get", ProjectIdArgsSchema);
  handleCommand(PROJECT_IPC.create, "create", ProjectCreateInputSchema);
  handleCommand(PROJECT_IPC.approveProposal, "approve-proposal", ApproveArgsSchema);
  handleCommand(PROJECT_IPC.messageCoordinator, "message-coordinator", MessageArgsSchema);
  handleCommand(PROJECT_IPC.rejectProposal, "reject-proposal", ProposalArgsSchema);
  handleCommand(PROJECT_IPC.pause, "pause", ProjectIdArgsSchema);
  handleCommand(PROJECT_IPC.resume, "resume", ProjectIdArgsSchema);
  handleCommand(PROJECT_IPC.end, "end", EndArgsSchema);
  handleCommand(PROJECT_IPC.updateSettings, "update-settings", SettingsArgsSchema);
  handleCommand(PROJECT_IPC.setMemoryStatus, "set-memory-status", MemoryArgsSchema);

  ipcMain.handle(PROJECT_IPC.list, async (_event, args: unknown) => {
    const parsed = ListArgsSchema.safeParse(args ?? {});
    if (!parsed.success) return { ok: false, projects: [], message: "Invalid project list request." };
    try {
      const result = await invokeProject<{ projects: Project[] }>("list", parsed.data);
      return result.ok ? { ok: true, projects: result.value.projects } : { ok: false, projects: [], message: result.message };
    } catch (error) {
      return { ok: false, projects: [], message: errorMessage(error, "Failed to list projects.") };
    }
  });

  ipcMain.handle(PROJECT_IPC.syncPlaybooks, async (_event, args: unknown) => {
    const parsed = SyncArgsSchema.safeParse(args);
    if (!parsed.success) {
      console.warn("[projects] ignored a malformed playbook sync");
      return { ok: false };
    }
    try {
      const result = await syncPlaybooksToHost({ playbooks: parsePlaybooks(parsed.data.playbooks) });
      return { ok: result.ok };
    } catch {
      return { ok: false };
    }
  });
}
