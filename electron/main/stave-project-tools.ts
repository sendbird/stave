/**
 * The tools a project's coordinator uses. They are registered only on a
 * connection that carries a project grant key — every turn on a coordinator
 * task — and the host resolves the project from that key. No tool takes a
 * project id, so a coordinator cannot act for another project.
 *
 * Used by: `electron/main/stave-mcp-server.ts`.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PROJECT_TOOL_NAMES } from "../../src/lib/projects/briefing";
import { PROJECT_LIMITS, StartMissionToolInputSchema } from "../../src/lib/projects/domain";
import type { StaveTurnGrants } from "../providers/stave-turn-grants";
import type { getProjectForGrant, getProjectMissionReport, noteProject, startProjectMission } from "./projects-service";

export function registerProjectTools(
  server: McpServer,
  grants: StaveTurnGrants,
  handlers: {
    getProjectForGrant: typeof getProjectForGrant;
    startProjectMission: typeof startProjectMission;
    getProjectMissionReport: typeof getProjectMissionReport;
    noteProject: typeof noteProject;
  },
) {
  const { projectKey } = grants;
  if (!projectKey) return;
  const toStructuredResult = <T extends Record<string, unknown>>(value: T) => ({
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value,
  });

  server.registerTool(
    PROJECT_TOOL_NAMES.get,
    {
      description:
        "Read the project this task coordinates: its goal, settings, missions with their states and one-line summaries, proposals waiting for the user, the playbooks you can start missions with, and the project's accepted memory. Read-only.",
      annotations: { readOnlyHint: true },
    },
    async () => toStructuredResult({ project: await handlers.getProjectForGrant({ projectKey }) }),
  );

  server.registerTool(
    PROJECT_TOOL_NAMES.listMissions,
    {
      description: "List this project's missions with their states and one-line summaries. Read-only.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const project = await handlers.getProjectForGrant({ projectKey });
      return toStructuredResult({ missions: project.missions });
    },
  );

  server.registerTool(
    PROJECT_TOOL_NAMES.startMission,
    {
      description:
        "Start a mission for this project: Stave creates a new worktree and task and runs the playbook on it. When the project asks before starting, this records a proposal the user approves first. Give each mission a start key and reuse it if you retry; the same key never starts a second mission.",
      inputSchema: StartMissionToolInputSchema.shape,
    },
    async (input) => toStructuredResult({ result: await handlers.startProjectMission({ projectKey, input }) }),
  );

  server.registerTool(
    PROJECT_TOOL_NAMES.getReport,
    {
      description:
        "Read one mission's report — what it did, why, the evidence and links — or, while it runs, where it stands. Only missions of this project. Read-only.",
      inputSchema: { missionId: z.string().trim().min(1).max(200) },
      annotations: { readOnlyHint: true },
    },
    async ({ missionId }) => toStructuredResult(await handlers.getProjectMissionReport({ projectKey, missionId })),
  );

  server.registerTool(
    PROJECT_TOOL_NAMES.note,
    {
      description:
        "Record what the project learned (a note that later missions of this project will follow once accepted) and/or a one-line status summary the user sees on the project.",
      inputSchema: {
        note: z.string().trim().min(1).max(PROJECT_LIMITS.note).optional(),
        summary: z.string().trim().min(1).max(PROJECT_LIMITS.note).optional(),
      },
    },
    async (args) => toStructuredResult(await handlers.noteProject({ projectKey, ...args })),
  );
}
