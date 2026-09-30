import { useEffect, useMemo, useRef, useState } from "react";
import { Bot } from "lucide-react";
import { Button, toast } from "@/components/ui";
import { AgentAvatar } from "@/components/agents/AgentAvatar";
import {
  ComposerOptionCard,
  ComposerOptionMenuCallout,
  ComposerOptionMenuHint,
  ComposerOptionMenuSettingsLink,
} from "@/components/ai-elements/composer-option-menu";
import type { ModelSelectorOption } from "@/components/ai-elements/model-selector.utils";
import type { ModelPickerAgents } from "@/components/ai-elements/model-effort-selector";
import { AGENT_PERMISSION_LABELS, type AgentConfig } from "@/lib/agents/schema";
import { activeStandards } from "@/lib/agents/standards";
import { planComposerAgentChoice, selectableMainAgents } from "@/lib/agents/task-mode";
import type { ProviderId } from "@/lib/providers/provider.types";
import { useAgentAssignmentsStore, useAgentAssignmentsSync, type TaskAgent } from "@/store/agent-assignments-store";
import { useAppStore } from "@/store/app.store";
import { sx } from "../ads/utils/stylex";
import { agentControlStyles as styles } from "./prompt-input-agent-control.styles";

/** The model option a fixed-model agent asks for, when the composer offers it. */
export function fixedAgentModelOption(
  agent: Pick<AgentConfig, "model">,
  options: readonly ModelSelectorOption[],
): ModelSelectorOption | null {
  if (agent.model.mode !== "fixed") return null;
  const { providerId, model } = agent.model;
  return (
    options.find((option) => option.available && option.providerId === providerId && (!model || option.model === model)) ??
    null
  );
}

type Choice = AgentConfig | null;

/**
 * The task's agent choice for agentic tasks: which agent it runs as, the
 * agents it can switch to, and the switch itself. Choosing applies from the
 * next turn (the host records it; every later turn resolves it). `null` is
 * "No agent": the task runs on the model the user picks. A choice that widens
 * what the task may do waits for a confirm.
 */
export function useTaskAgentChoice(props: {
  taskId: string;
  providerId: ProviderId;
  model: string;
  modelOptions: readonly ModelSelectorOption[];
  onModelSelect: (selection: ModelSelectorOption) => void;
}) {
  useAgentAssignmentsSync();
  const current = useAgentAssignmentsStore((state) => state.byTaskId[props.taskId]);
  const loadAssignments = useAgentAssignmentsStore((state) => state.load);
  const customAgents = useAppStore((state) => state.settings.customAgents);
  const myStandards = useAppStore((state) => state.settings.myStandards);
  const repositoryPath = useAppStore((state) => state.repositoryPath);
  const workspaceId = useAppStore((state) => state.taskWorkspaceIdById[props.taskId] ?? state.activeWorkspaceId);
  const taskTitle = useAppStore((state) => state.tasks.find((task) => task.id === props.taskId)?.title ?? "");
  const hasTurns = useAppStore((state) => (state.messagesByTask[props.taskId]?.length ?? 0) > 0);
  const choices = useMemo(() => selectableMainAgents(customAgents), [customAgents]);
  const [pending, setPending] = useState<{ agent: Choice } | null>(null);
  const [busy, setBusy] = useState(false);

  async function apply(next: Choice): Promise<boolean> {
    const api = typeof window === "undefined" ? null : window.api?.agents;
    if (!api) {
      toast.error("Changing the task's agent is unavailable here.");
      return false;
    }
    setBusy(true);
    try {
      if (!next) {
        const outcome = await api.releaseTask({ taskId: props.taskId });
        if (!outcome.ok) throw new Error(outcome.message);
      } else {
        if (!repositoryPath) throw new Error("Open a repository before choosing an agent.");
        // A fixed model moves the picker; switching providers mid-task is left to the user.
        const fixed = fixedAgentModelOption(next, props.modelOptions);
        const moveModel = fixed && (!hasTurns || fixed.providerId === props.providerId) ? fixed : null;
        if (moveModel) props.onModelSelect(moveModel);
        const route = moveModel
          ? { providerId: moveModel.providerId, model: moveModel.model }
          : { providerId: props.providerId, model: props.model };
        const standards = activeStandards(myStandards);
        const outcome = await api.recordTask({
          requestId: `composer:${crypto.randomUUID()}`,
          taskId: props.taskId,
          workspaceId,
          repositoryPath,
          agent: next,
          assignment: taskTitle.trim() || `Runs as ${next.name}`,
          providerId: route.providerId,
          model: route.model,
          ...(standards ? { standards } : {}),
        });
        if (!outcome.ok) throw new Error(outcome.message);
      }
      await loadAssignments();
      setPending(null);
      return true;
    } catch (error) {
      toast.error("The task's agent was not changed", {
        description: error instanceof Error ? error.message : undefined,
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** Resolves true when the choice is done (applied or unchanged), false while it waits or failed. */
  async function choose(next: Choice): Promise<boolean> {
    const plan = planComposerAgentChoice({
      current: current ? { agentConfigId: current.agentConfigId, permission: current.agentPermission } : null,
      next,
    });
    if (plan === "keep") {
      setPending(null);
      return true;
    }
    if (plan === "confirm") {
      setPending({ agent: next });
      return false;
    }
    return apply(next);
  }

  return {
    current: current ?? null,
    choices,
    pending,
    busy,
    choose,
    confirm: () => (pending ? apply(pending.agent) : Promise.resolve(false)),
    cancel: () => setPending(null),
  };
}

export type TaskAgentChoice = ReturnType<typeof useTaskAgentChoice>;

export function taskAgentIdentity(current: TaskAgent | null): ModelPickerAgents["active"] {
  return current ? { id: current.agentConfigId, name: current.agentName, appearance: current.agentAppearance } : null;
}

const NO_AGENT_LABEL = "No agent";

/**
 * The model picker's Agents tab: "No agent" (the picked model runs the task,
 * with a Worker available) and every agent the task can run as.
 */
export function ModelPickerAgentPanel(props: { choice: TaskAgentChoice; disabled?: boolean; onDone: () => void }) {
  const { choice } = props;
  const currentLabel = choice.current?.agentName ?? NO_AGENT_LABEL;
  // The panel scrolls; bring the confirm (and its Switch button) into view.
  const confirmRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (choice.pending) confirmRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [choice.pending]);
  const pick = (next: Choice) => {
    if (props.disabled) return;
    void choice.choose(next).then((done) => done && props.onDone());
  };
  return (
    <div className={sx(styles.panel)} data-testid="composer-agent-options">
      <div role="listbox" aria-label="Agents" className={sx(styles.list)}>
        <ComposerOptionCard
          label={NO_AGENT_LABEL}
          summary="The model you pick runs the task, with a Worker if you arm one."
          icon={<Bot aria-hidden className={sx(styles.icon)} />}
          active={!choice.current}
          onSelect={() => pick(null)}
          testId="composer-agent-none"
        />
        {choice.choices.map((agent) => (
          <ComposerOptionCard
            key={agent.id}
            label={agent.name}
            summary={agent.description}
            description={AGENT_PERMISSION_LABELS[agent.permission]}
            icon={<AgentAvatar agent={agent} size="xs" aria-label={null} />}
            active={choice.current?.agentConfigId === agent.id}
            onSelect={() => pick(agent)}
            testId={`composer-agent-${agent.id}`}
          />
        ))}
      </div>

      {choice.pending ? (
        <div ref={confirmRef}>
        <ComposerOptionMenuCallout tone="warning" testId="composer-agent-confirm">
          {choice.pending.agent
            ? `${choice.pending.agent.name} may do more than ${currentLabel} (${AGENT_PERMISSION_LABELS[choice.pending.agent.permission]}).`
            : `Without an agent the task runs with its own permissions, which may allow more than ${currentLabel}.`}{" "}
          Switch from the next turn?
          <span className={sx(styles.confirmActions)}>
            <Button type="button" size="sm" variant="ghost" onClick={choice.cancel}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={choice.busy || props.disabled}
              onClick={() => void choice.confirm().then((done) => done && props.onDone())}
            >
              Switch
            </Button>
          </span>
        </ComposerOptionMenuCallout>
        </div>
      ) : null}

      {props.disabled ? (
        <ComposerOptionMenuCallout tone="note" testId="composer-agent-locked">
          Finish or answer the current turn to switch agents.
        </ComposerOptionMenuCallout>
      ) : null}

      <ComposerOptionMenuHint>
        Applies from the next turn; earlier turns keep the agent they ran as. The agent's model policy picks the model;
        a model you pick on a provider tab overrides it. It calls other agents itself, so there is no Worker.
      </ComposerOptionMenuHint>
      <ComposerOptionMenuSettingsLink section="chat" testId="composer-agent-open-settings">
        Running tasks as agents is experimental. Turn it off in Settings → Chat → Agents.
      </ComposerOptionMenuSettingsLink>
    </div>
  );
}
