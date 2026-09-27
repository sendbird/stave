/**
 * The stage-reporting tools a mission turn uses. They are registered only on
 * a connection that carries a mission grant key, and the host resolves the
 * mission, stage and attempt from that key's active grant. No tool takes an
 * id, so a model cannot report for another stage.
 *
 * Used by: `electron/main/stave-mcp-server.ts`.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MISSION_TOOL_NAMES } from "../../src/lib/missions/briefing";
import {
  StageBlockInputSchema,
  StageCompleteReportInputSchema,
} from "../../src/lib/missions/domain";
import type { StaveTurnGrants } from "../providers/stave-turn-grants";
import { ProposeMissionToolInputSchema } from "../../src/lib/missions/proposed";
import type {
  blockMissionStage,
  getMissionForGrant,
  reportMissionStage,
} from "./missions-service";
import type { proposeMissionForGrant } from "./proposals-service";

export function registerMissionTools(
  server: McpServer,
  grants: StaveTurnGrants,
  handlers: {
    getMissionForGrant: typeof getMissionForGrant;
    reportMissionStage: typeof reportMissionStage;
    blockMissionStage: typeof blockMissionStage;
    proposeMissionForGrant: typeof proposeMissionForGrant;
  },
) {
  const { missionKey } = grants;
  if (!missionKey) return;
  const toStructuredResult = <T extends Record<string, unknown>>(value: T) => ({
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value,
  });

  server.registerTool(
    MISSION_TOOL_NAMES.get,
    {
      description:
        "Read the mission this turn belongs to: the playbook's purpose, the assignment, every stage with its status, the current stage's instruction and Done when, earlier stages' summaries, and the acceptance criteria. Read-only. Available only in turns a Stave mission started.",
      annotations: { readOnlyHint: true },
    },
    async () =>
      toStructuredResult({
        mission: await handlers.getMissionForGrant({ missionKey }),
      }),
  );

  server.registerTool(
    MISSION_TOOL_NAMES.report,
    {
      description:
        "Report the current mission stage as done before this turn ends. Give a short summary, the decisions you made and why, the evidence you gathered, links to artifacts, and the status of each acceptance criterion. Cite the command you ran or the tool call id for evidence: Stave marks evidence verified only when it saw that call succeed in this stage's turns. Never report unverified work as complete. Stave knows which stage this turn belongs to; do not pass ids.",
      inputSchema: StageCompleteReportInputSchema.shape,
    },
    async (report) =>
      toStructuredResult({
        report: await handlers.reportMissionStage({ missionKey, report }),
      }),
  );

  server.registerTool(
    MISSION_TOOL_NAMES.block,
    {
      description:
        "Report that you cannot finish the current mission stage, and name exactly what is missing: input from the user, a permission, something in the environment, or an external system. The mission waits for the user, and a reply in the task resumes the stage.",
      inputSchema: StageBlockInputSchema.shape,
    },
    async (block) =>
      toStructuredResult({
        block: await handlers.blockMissionStage({ missionKey, block }),
      }),
  );

  server.registerTool(
    MISSION_TOOL_NAMES.propose,
    {
      description:
        "Propose a mission for a request you found while triaging, such as a Slack message or a ticket asking for work. It waits in Issues → Proposed until the user starts or dismisses it; nothing starts on its own. Give a short title, a self-contained assignment with the source link, and the playbook that fits. The same key (default: the link) is never proposed twice.",
      inputSchema: ProposeMissionToolInputSchema.shape,
    },
    async (input) =>
      toStructuredResult({
        proposal: await handlers.proposeMissionForGrant({ missionKey, input }),
      }),
  );
}
