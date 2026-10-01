import type { Project } from "@/lib/projects/domain";
import type { AgentAssignment } from "./assign";
import type { AgentConfig } from "./schema";

/**
 * Where a saved agent is used, so deleting one can say what breaks and refuse
 * when another agent's workflow stage or a project still names it. Pure: the words the delete
 * dialog shows are decided and tested here, not in the component.
 *
 * A workflow stage or a project's allowed-agents list is a hard reference —
 * deleting the agent would leave a run or a project naming an id nothing
 * answers to, so deletion is blocked and the user archives instead. A running
 * or waiting task is a soft reference: it keeps its own snapshot and finishes,
 * so it is shown for context but does not block.
 */

export type AgentReferenceKind = "workflow-stage" | "project" | "task";

export interface AgentReference {
  kind: AgentReferenceKind;
  /** Human label, e.g. the agent name or the task's first line. */
  label: string;
  /** Extra context, e.g. the stage name. */
  detail?: string;
  /** Id of the owning agent, project, or task, for a link. */
  ownerId: string;
}

export interface AgentReferences {
  /** References that block deletion (workflow stages, projects). */
  blocking: AgentReference[];
  /** References that do not block (running or waiting tasks). */
  soft: AgentReference[];
}

/** Task states that still point at the live agent definition. */
const ACTIVE_TASK_STATES = new Set(["preparing", "started"]);

export function findAgentReferences(args: {
  agentConfigId: string;
  /** Agents whose workflow stages may name this one. */
  agents?: readonly AgentConfig[];
  projects?: readonly Project[];
  assignments?: readonly AgentAssignment[];
}): AgentReferences {
  const { agentConfigId } = args;
  const blocking: AgentReference[] = [];
  const soft: AgentReference[] = [];

  for (const agent of args.agents ?? []) {
    if (agent.id === agentConfigId) continue;
    for (const stage of agent.workflow ?? []) {
      if (stage.kind === "ai" && stage.agentConfigId === agentConfigId) {
        blocking.push({
          kind: "workflow-stage",
          label: agent.name,
          detail: stage.title,
          ownerId: agent.id,
        });
      }
    }
  }

  for (const project of args.projects ?? []) {
    if (project.settings.agents?.includes(agentConfigId)) {
      blocking.push({ kind: "project", label: project.name, ownerId: project.id });
    }
  }

  for (const assignment of args.assignments ?? []) {
    if (assignment.agentConfigId === agentConfigId && ACTIVE_TASK_STATES.has(assignment.state)) {
      soft.push({
        kind: "task",
        label: assignment.assignment.split("\n")[0] ?? assignment.assignment,
        ownerId: assignment.taskId ?? assignment.id,
      });
    }
  }

  return { blocking, soft };
}

export function agentIsDeletable(references: AgentReferences): boolean {
  return references.blocking.length === 0;
}
