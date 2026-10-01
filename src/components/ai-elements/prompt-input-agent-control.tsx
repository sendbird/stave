import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { AgentAvatar } from "@/components/agents/AgentAvatar";
import {
  ComposerOptionCard,
  ComposerOptionMenuCallout,
  ComposerOptionMenuHint,
  ComposerOptionMenuSection,
} from "@/components/ai-elements/composer-option-menu";
import type { ModelSelectorOption } from "@/components/ai-elements/model-selector.utils";
import {
  createAgentChoiceActions,
  optionForFixedModel,
  type AgentChoiceContext,
  type ModelSelectArgs,
} from "@/components/ai-elements/agent-choice-actions";
import type { ModelPickerAgents } from "@/components/ai-elements/model-effort-selector";
import { AGENT_PERMISSION_LABELS, type AgentConfig } from "@/lib/agents/schema";
import { activeStandards } from "@/lib/agents/standards";
import {
  awaitsFirstAgentTurn,
  fixedModelOf,
  matchAgents,
  resolveAgentModelRoute,
  selectableMainAgents,
} from "@/lib/agents/selector-choice";
import { useAgentAssignmentsStore, useAgentAssignmentsSync, type TaskAgent } from "@/store/agent-assignments-store";
import { useAppStore } from "@/store/app.store";
import { sx } from "../ads/utils/stylex";
import { agentControlStyles as styles } from "./prompt-input-agent-control.styles";

/** The model option a fixed-model agent asks for, when the composer offers it. */
export function fixedAgentModelOption(
  agent: Pick<AgentConfig, "model">,
  options: readonly ModelSelectorOption[],
): ModelSelectorOption | null {
  return optionForFixedModel(fixedModelOf(agent), options);
}

/**
 * The task's side of the selector: which agent runs it, the agents it can
 * switch to, and what each choice does. Picking a model is Chat (it releases
 * the agent), picking an agent is Agent mode (it records the agent and leaves
 * the model to Stave Auto or to the agent), and a pin is a model that binds
 * the agent's turns without releasing it. See `selector-choice.ts` for the
 * rules and `agent-choice-actions.ts` for what each choice does.
 *
 * Choices apply from the next turn: the host records the agent, every later
 * turn resolves it. A switch between agents that widens what the task may do
 * waits for a confirm.
 */
export function useTaskAgentChoice(props: {
  taskId: string;
  /** The composer's model value: Stave Auto while the draft routes, else the model the draft holds. */
  selectedModel: ModelSelectorOption;
  modelOptions: readonly ModelSelectorOption[];
  /** Puts a model into the task's draft. It never touches the task's agent. */
  onModelSelect: (args: ModelSelectArgs) => void;
}) {
  useAgentAssignmentsSync();
  const current = useAgentAssignmentsStore((state) => state.byTaskId[props.taskId]) ?? null;
  const loadAssignments = useAgentAssignmentsStore((state) => state.load);
  const applyAssignment = useAgentAssignmentsStore((state) => state.apply);
  const customAgents = useAppStore((state) => state.settings.customAgents);
  const myStandards = useAppStore((state) => state.settings.myStandards);
  const repositoryPath = useAppStore((state) => state.repositoryPath);
  const workspaceId = useAppStore((state) => state.taskWorkspaceIdById[props.taskId] ?? state.activeWorkspaceId);
  const taskTitle = useAppStore((state) => state.tasks.find((task) => task.id === props.taskId)?.title ?? "");
  const hasTurns = useAppStore((state) => (state.messagesByTask[props.taskId]?.length ?? 0) > 0);
  const assignmentId = current?.assignmentId;
  const assignOnSend = useAppStore((state) =>
    awaitsFirstAgentTurn({ assignmentId, messages: state.messagesByTask[props.taskId] }),
  );
  const choices = useMemo(() => selectableMainAgents(customAgents), [customAgents]);
  const [pending, setPending] = useState<{ agent: AgentConfig } | null>(null);
  const [busy, setBusy] = useState(false);
  // A choice awaits the host; it then writes the draft from the newest render's
  // context, not the one the click saw.
  const context: AgentChoiceContext = {
    taskId: props.taskId,
    selectedModel: props.selectedModel,
    modelOptions: props.modelOptions,
    hasTurns,
    current,
    repositoryPath,
    workspaceId,
    taskTitle,
    standards: activeStandards(myStandards),
    api: typeof window === "undefined" ? null : (window.api?.agents ?? null),
    onModelSelect: props.onModelSelect,
    applyAssignment,
    reload: () => void loadAssignments(),
    setPending,
    setBusy,
  };
  const latest = useRef(context);
  useEffect(() => {
    latest.current = context;
  });
  const actions = useMemo(() => createAgentChoiceActions(() => latest.current), []);

  const route = current
    ? resolveAgentModelRoute({
        fixed: current.agentFixedModel,
        autoRouting: props.selectedModel.isAuto === true,
        providerId: props.selectedModel.providerId,
        model: props.selectedModel.model,
      })
    : null;

  return {
    current,
    choices,
    pending,
    busy,
    route,
    autoAvailable: props.modelOptions.some((option) => option.isAuto && option.available),
    /** The next send assigns the agent; later sends are plain sends. */
    assignOnSend,
    choose: actions.choose,
    confirm: () => (pending ? actions.apply(pending.agent) : Promise.resolve(false)),
    cancel: () => setPending(null),
    selectModel: actions.selectModel,
    pin: actions.pin,
    unpin: actions.unpin,
  };
}

export type TaskAgentChoice = ReturnType<typeof useTaskAgentChoice>;

export function taskAgentIdentity(current: TaskAgent | null): NonNullable<ModelPickerAgents["active"]> | null {
  return current ? { id: current.agentConfigId, name: current.agentName, appearance: current.agentAppearance } : null;
}

/** What the model selector needs from the task's agent choice. */
export function buildModelPickerAgents(choice: TaskAgentChoice, opts: { locked: boolean }): ModelPickerAgents {
  const { current } = choice;
  return {
    active: taskAgentIdentity(current),
    route: choice.route,
    fixedModel: current?.agentFixedModel != null,
    autoAvailable: choice.autoAvailable,
    count: choice.choices.length,
    renderPanel: ({ variant, query, close }) => (
      <ModelPickerAgentPanel choice={choice} variant={variant} query={query} disabled={opts.locked} onDone={close} />
    ),
    onPin: choice.pin,
    onUnpin: choice.unpin,
  };
}

/**
 * The selector's Agents section: every agent the task can run as, filtered by
 * the selector's search. `matches` is the compact form under a model search:
 * the matching agents only, headed, and nothing when none match.
 */
export function ModelPickerAgentPanel(props: {
  choice: TaskAgentChoice;
  query: string;
  variant: "tab" | "matches";
  disabled?: boolean;
  onDone: () => void;
}) {
  const { choice } = props;
  const openAgents = useAppStore((state) => state.openAgents);
  const currentLabel = choice.current?.agentName ?? "";
  const agents = useMemo(() => matchAgents(choice.choices, props.query), [choice.choices, props.query]);
  // The panel scrolls; bring the confirm (and its Switch button) into view.
  const confirmRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (choice.pending) confirmRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [choice.pending]);
  const pick = (next: AgentConfig) => {
    if (props.disabled) return;
    void choice.choose(next).then((done) => done && props.onDone());
  };
  const list = (
    <div role="listbox" aria-label="Agents" className={sx(styles.list)}>
      {agents.map((agent) => (
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
      {agents.length === 0 && props.variant === "tab" ? (
        <p className={sx(styles.empty)}>No agents match this search.</p>
      ) : null}
    </div>
  );
  const callouts = (
    <>
      {choice.pending ? (
        <div ref={confirmRef}>
          <ComposerOptionMenuCallout tone="warning" testId="composer-agent-confirm">
            {choice.pending.agent.name} may do more than {currentLabel} (
            {AGENT_PERMISSION_LABELS[choice.pending.agent.permission]}). Switch from the next turn?
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
    </>
  );

  if (props.variant === "matches") {
    if (agents.length === 0 && !choice.pending) return null;
    return (
      <div className={sx(styles.matches)} data-testid="composer-agent-matches">
        <ComposerOptionMenuSection title="Agents">{list}</ComposerOptionMenuSection>
        {callouts}
      </div>
    );
  }
  return (
    <div className={sx(styles.panel)} data-testid="composer-agent-options">
      {list}
      {callouts}
      <ComposerOptionMenuHint>
        Applies from the next turn. An agent picks its own model through Stave Auto; pin one beside the agent. Pick
        a model to go back to Chat.
      </ComposerOptionMenuHint>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={sx(styles.manage)}
        onClick={() => {
          openAgents();
          props.onDone();
        }}
      >
        Manage agents…
      </Button>
    </div>
  );
}
