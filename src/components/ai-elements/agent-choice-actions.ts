import { toast } from "@/components/ui";
import type { ModelSelectorOption } from "@/components/ai-elements/model-selector.utils";
import type { AgentsBridgeApi } from "@/lib/agents/api";
import type { AgentAssignment } from "@/lib/agents/assign";
import type { AgentConfig } from "@/lib/agents/schema";
import {
  fixedModelOf,
  planSelectorChoice,
  switchWidensPermission,
  type FixedAgentModel,
  type SelectorDraft,
} from "@/lib/agents/selector-choice";
import type { ModelShortcutEffort } from "@/lib/providers/model-shortcuts";
import type { TaskAgent } from "@/store/agent-assignments-store";

export interface ModelSelectArgs {
  selection: ModelSelectorOption;
  effort?: Exclude<ModelShortcutEffort, "">;
  fastMode?: boolean;
}

/** Everything a choice reads, as of the newest render. */
export interface AgentChoiceContext {
  taskId: string;
  /** The composer's model value: Stave Auto while the draft routes, else the model the draft holds. */
  selectedModel: ModelSelectorOption;
  modelOptions: readonly ModelSelectorOption[];
  hasTurns: boolean;
  /** The agent the task runs as; null for a Chat task. */
  current: TaskAgent | null;
  repositoryPath: string | null;
  workspaceId: string;
  taskTitle: string;
  /** "My standards" when they are on. */
  standards: string | undefined;
  api: Pick<AgentsBridgeApi, "recordTask" | "releaseTask"> | null;
  /** Puts a model into the task's draft. It never touches the task's agent. */
  onModelSelect: (args: ModelSelectArgs) => void;
  /** Shows an assignment the host just recorded or ended, in the same tick as the draft. */
  applyAssignment: (row: AgentAssignment) => void;
  reload: () => void;
  setPending: (pending: { agent: AgentConfig } | null) => void;
  setBusy: (busy: boolean) => void;
}

/** The model option an agent's fixed model names, when the composer offers it. */
export function optionForFixedModel(
  fixed: FixedAgentModel | null,
  options: readonly ModelSelectorOption[],
): ModelSelectorOption | null {
  if (!fixed) return null;
  return (
    options.find(
      (option) => option.available && option.providerId === fixed.providerId && (!fixed.model || option.model === fixed.model),
    ) ?? null
  );
}

const UNAVAILABLE = "Changing the task's agent is unavailable here.";

/**
 * What each choice in the selector does to the task's agent (a host call) and
 * to its draft. Every action reads the context again after it awaits the host,
 * so the draft is written from the newest render, not the click's.
 */
export function createAgentChoiceActions(read: () => AgentChoiceContext) {
  /** The fixed model the picker may move to; a task with turns keeps its provider. */
  function fixedOptionFor(c: AgentChoiceContext, fixed: FixedAgentModel | null): ModelSelectorOption | null {
    const option = optionForFixedModel(fixed, c.modelOptions);
    return option && (!c.hasTurns || option.providerId === c.selectedModel.providerId) ? option : null;
  }

  function autoOptionOf(c: AgentChoiceContext): ModelSelectorOption | null {
    return c.modelOptions.find((option) => option.isAuto && option.available) ?? null;
  }

  function writeDraft(c: AgentChoiceContext, draft: SelectorDraft, fixedOption: ModelSelectorOption | null) {
    const selection = draft === "agent-fixed" ? fixedOption : draft === "auto" ? autoOptionOf(c) : null;
    if (selection) c.onModelSelect({ selection });
  }

  function currentAgent(c: AgentChoiceContext) {
    return c.current ? { agentConfigId: c.current.agentConfigId, permission: c.current.agentPermission } : null;
  }

  async function apply(next: AgentConfig): Promise<boolean> {
    const c = read();
    if (!c.api) {
      toast.error(UNAVAILABLE);
      return false;
    }
    c.setBusy(true);
    try {
      if (!c.repositoryPath) throw new Error("Open a repository before choosing an agent.");
      const fixedOption = fixedOptionFor(c, fixedModelOf(next));
      const { draft } = planSelectorChoice({
        choice: { kind: "agent", agent: next },
        current: null,
        fixedModelAvailable: fixedOption !== null,
        autoAvailable: autoOptionOf(c) !== null,
      });
      // The record says where the first turn runs: the agent's model, Stave
      // Auto (no model, routed when the turn is sent) or, with Stave Auto
      // off, the model the task already has.
      const route = fixedOption
        ? { providerId: fixedOption.providerId, model: fixedOption.model }
        : {
            providerId: c.selectedModel.providerId,
            model: draft === "auto" || c.selectedModel.isAuto ? null : c.selectedModel.model,
          };
      const outcome = await c.api.recordTask({
        requestId: `composer:${crypto.randomUUID()}`,
        taskId: c.taskId,
        workspaceId: c.workspaceId,
        repositoryPath: c.repositoryPath,
        agent: next,
        assignment: c.taskTitle.trim() || `Runs as ${next.name}`,
        providerId: route.providerId,
        model: route.model,
        ...(c.standards ? { standards: c.standards } : {}),
      });
      if (!outcome.ok) throw new Error(outcome.message);
      // One tick: the task becomes an agent task and its draft takes the
      // agent's route, so the trigger never shows the Chat model in between.
      const latest = read();
      writeDraft(latest, draft, fixedOption);
      latest.applyAssignment(outcome.value);
      latest.setPending(null);
      latest.reload();
      return true;
    } catch (error) {
      toast.error("The task's agent was not changed", {
        description: error instanceof Error ? error.message : undefined,
      });
      return false;
    } finally {
      read().setBusy(false);
    }
  }

  /** Ends the task's agent so a model runs it; true when it is done. */
  async function release(): Promise<boolean> {
    const c = read();
    if (!c.api) {
      toast.error(UNAVAILABLE);
      return false;
    }
    try {
      const outcome = await c.api.releaseTask({ taskId: c.taskId });
      if (!outcome.ok) throw new Error(outcome.message);
      const latest = read();
      if (outcome.value) latest.applyAssignment(outcome.value);
      latest.reload();
      return true;
    } catch (error) {
      toast.error("The task's agent was not released", {
        description: error instanceof Error ? error.message : undefined,
      });
      return false;
    }
  }

  return {
    apply,

    /** Resolves true when the choice is done (applied or unchanged), false while it waits or failed. */
    async choose(next: AgentConfig): Promise<boolean> {
      const c = read();
      const { assignment } = planSelectorChoice({
        choice: { kind: "agent", agent: next },
        current: currentAgent(c),
        fixedModelAvailable: fixedOptionFor(c, fixedModelOf(next)) !== null,
        autoAvailable: autoOptionOf(c) !== null,
      });
      if (assignment === "keep") {
        c.setPending(null);
        return true;
      }
      if (assignment === "confirm") {
        c.setPending({ agent: next });
        return false;
      }
      return apply(next);
    },

    /**
     * A model from the Models section: Chat. The agent is released first, so a
     * model never leaves the task silently pinned under an agent. A task with
     * no agent takes the model at once, as it always did.
     */
    selectModel(selectionArgs: ModelSelectArgs) {
      const c = read();
      const { current } = c;
      if (!current) {
        c.onModelSelect(selectionArgs);
        return;
      }
      const released = currentAgent(c);
      void release().then((done) => {
        if (!done) return;
        read().onModelSelect(selectionArgs);
        if (released && switchWidensPermission({ from: released, to: null })) {
          toast.info(`${current.agentName} no longer runs this task`, {
            description: "It runs with its own permissions now.",
          });
        }
      });
    },

    /** "Back to Auto": the agent's own route again — its fixed model, else Stave Auto. */
    unpin() {
      const c = read();
      const fixedOption = fixedOptionFor(c, c.current?.agentFixedModel ?? null);
      const { draft } = planSelectorChoice({
        choice: { kind: "unpin" },
        current: currentAgent(c),
        fixedModelAvailable: fixedOption !== null,
        autoAvailable: autoOptionOf(c) !== null,
      });
      writeDraft(c, draft, fixedOption);
    },

    /** A model in the pin segment: it binds the agent's turns and leaves the agent assigned. */
    pin(selectionArgs: ModelSelectArgs) {
      read().onModelSelect(selectionArgs);
    },
  };
}
