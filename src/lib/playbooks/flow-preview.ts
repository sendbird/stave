import { resolveStageSignOff } from "./sign-off";
import { STAVE_ACTION_LABELS, type Playbook } from "./schema";

/**
 * A playbook as the flow a mission will follow, before it runs: who does
 * each stage, where it stops for the user, and what it does outside the
 * workspace. Pure and read-only; the preview never changes the playbook.
 */

export type FlowPreviewDoer =
  | { kind: "lead" }
  | { kind: "agent"; agentConfigId: string; name: string | null }
  | { kind: "stave" };

export interface FlowPreviewNode {
  stageId: string;
  position: number;
  title: string;
  doer: FlowPreviewDoer;
  /** The mission waits for the user before this stage. */
  asksFirst: boolean;
  /** Writes outside the workspace (a publish stage or a Stave action). */
  externalEffect: boolean;
  /** A delegated stage pinned to the commit it starts on. */
  pinned: boolean;
  detail: string;
}

export interface FlowPreviewSummary {
  nodes: FlowPreviewNode[];
  stops: number;
  agents: number;
  /** Stages naming an agent the preview could not find. */
  missingAgents: string[];
}

export function buildPlaybookFlowPreview(
  playbook: Pick<Playbook, "stages" | "checkIns">,
  agentNames: Readonly<Record<string, string>>,
): FlowPreviewSummary {
  const missingAgents: string[] = [];
  const nodes = playbook.stages.map((stage, index): FlowPreviewNode => {
    const asksFirst = resolveStageSignOff(playbook, index) === "ask";
    if (stage.kind === "action") {
      return {
        stageId: stage.id,
        position: index + 1,
        title: stage.title,
        doer: { kind: "stave" },
        asksFirst,
        externalEffect: true,
        pinned: false,
        detail: STAVE_ACTION_LABELS[stage.action.type],
      };
    }
    let doer: FlowPreviewDoer = { kind: "lead" };
    if (stage.agentConfigId) {
      const name = agentNames[stage.agentConfigId] ?? null;
      if (!name) missingAgents.push(stage.agentConfigId);
      doer = { kind: "agent", agentConfigId: stage.agentConfigId, name };
    }
    return {
      stageId: stage.id,
      position: index + 1,
      title: stage.title,
      doer,
      asksFirst,
      externalEffect: stage.role === "publish",
      pinned: Boolean(stage.agentConfigId && stage.pinCommit),
      detail: stage.role === "plan" ? "Plans; changes no files" : stage.doneWhen,
    };
  });
  return {
    nodes,
    stops: nodes.filter((node) => node.asksFirst).length,
    agents: new Set(nodes.flatMap((node) => (node.doer.kind === "agent" ? [node.doer.agentConfigId] : []))).size,
    missingAgents,
  };
}

export function describeFlowPreviewDoer(doer: FlowPreviewDoer): string {
  switch (doer.kind) {
    case "lead":
      return "Mission's task";
    case "stave":
      return "Stave";
    case "agent":
      return doer.name ? `${doer.name} · delegated task` : `${doer.agentConfigId} · not found`;
  }
}
