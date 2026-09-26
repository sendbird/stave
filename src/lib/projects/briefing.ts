/**
 * What a project's coordinator is told and what it may do: the coordination
 * instruction, the tool names, the read-oriented runtime options its turns
 * run with, and the briefing `stave_get_project` returns. Pure.
 */
import type { ProviderRuntimeOptions } from "@/lib/providers/provider.types";
import type { MissionProposal, MissionProviderId, Project, ProjectMemory } from "./domain";
import { PROJECT_MISSION_MODELS } from "./models";
import type { ProjectMissionSnapshot } from "./policy";

export const PROJECT_TOOL_NAMES = {
  get: "stave_get_project",
  startMission: "stave_start_mission",
  listMissions: "stave_list_missions",
  getReport: "stave_get_mission_report",
  note: "stave_note_project",
} as const;

export const PROJECT_CONTEXT_SOURCE_ID = "stave:project-coordinator";

/** The standing instruction of every coordinator turn Stave starts. */
export function buildCoordinatorInstruction(project: Pick<Project, "name" | "goal" | "settings">): string {
  return [
    `You coordinate the project "${project.name}". Goal: ${project.goal}`,
    "",
    "You plan the work as missions and follow them through; you do not edit files yourself.",
    `- Read the project with ${PROJECT_TOOL_NAMES.get}: its missions, proposals, playbooks and memory.`,
    `- Start work with ${PROJECT_TOOL_NAMES.startMission}: one mission per independent piece, each on its own worktree,`,
    "  with a clear assignment and a start key you reuse if you retry. Pick the provider and model that fit the piece",
    "  (a smaller model for routine changes); leave the model out for the provider's default.",
    project.settings.askBeforeStarting
      ? "  Each start becomes a proposal the user approves in the project; say what you proposed and why."
      : `  Missions start right away, up to ${project.settings.parallelLimit} at a time.`,
    `- When missions change, read their reports with ${PROJECT_TOOL_NAMES.getReport}, never their transcripts.`,
    `- Record what the project learned, and a one-line status, with ${PROJECT_TOOL_NAMES.note}.`,
    "- When the goal is met, say so and summarize what was delivered.",
  ].join("\n");
}

/** Coordinator turns read and plan; they never write files. */
export function coordinatorRuntimeOptions(providerId: string): ProviderRuntimeOptions {
  if (providerId === "codex") return { codexFileAccess: "read-only", codexApprovalPolicy: "untrusted" };
  return {
    claudePermissionMode: "default",
    claudeDisallowedTools: ["Edit", "Write", "MultiEdit", "NotebookEdit"],
  };
}

export interface PlaybookOption {
  id: string;
  name: string;
  purpose: string;
  stages: string[];
  source: "saved" | "template";
}

/** What `stave_get_project` returns. */
export interface ProjectBriefing {
  name: string;
  goal: string;
  state: Project["state"];
  settings: Project["settings"];
  summary: string | null;
  missions: Array<{
    missionId: string;
    title: string;
    state: string;
    stage: string | null;
    summary: string | null;
  }>;
  proposals: Array<{ startKey: string; assignment: string; playbook: string; state: MissionProposal["state"]; detail: string | null }>;
  playbooks: PlaybookOption[];
  /** The models `stave_start_mission` accepts, per provider. */
  models: Record<MissionProviderId, readonly string[]>;
  memory: string[];
}

export function buildProjectBriefing(args: {
  project: Project;
  missions: readonly (ProjectMissionSnapshot & { stageTitle: string | null })[];
  proposals: readonly MissionProposal[];
  playbooks: readonly PlaybookOption[];
  memories: readonly ProjectMemory[];
}): ProjectBriefing {
  return {
    name: args.project.name,
    goal: args.project.goal,
    state: args.project.state,
    settings: args.project.settings,
    summary: args.project.summary,
    missions: args.missions.map((mission) => ({
      missionId: mission.missionId,
      title: mission.title,
      state: mission.state === "running" ? `running · ${mission.currentStageStatus}` : mission.state,
      stage: mission.stageTitle,
      summary: mission.summary,
    })),
    proposals: args.proposals
      .filter((proposal) => proposal.state === "pending" || proposal.state === "approved" || proposal.state === "failed")
      .map((proposal) => ({
        startKey: proposal.startKey,
        assignment: proposal.assignment,
        playbook: proposal.playbook.name,
        state: proposal.state,
        detail: proposal.detail,
      })),
    playbooks: [...args.playbooks],
    models: PROJECT_MISSION_MODELS,
    memory: args.memories.filter((memory) => memory.status === "accepted").map((memory) => memory.content),
  };
}

/** The retrieved context a project mission carries: what the project already decided. */
export function buildProjectMemoryContext(args: { projectName: string; memories: readonly ProjectMemory[] }) {
  const accepted = args.memories.filter((memory) => memory.status === "accepted");
  if (accepted.length === 0) return null;
  return [
    `This mission is part of the project "${args.projectName}". The project has already decided:`,
    ...accepted.map((memory) => `- ${memory.content}`),
    "Follow these unless the assignment says otherwise.",
  ].join("\n");
}
