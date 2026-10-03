import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  buildModelPickerAgents,
  useTaskAgentChoice,
} from "@/components/ai-elements/prompt-input-agent-control";
import { getBuiltinAgent } from "@/lib/agents/starters";
import type { AgentAssignment } from "@/lib/agents/assign";
import type { AgentConfig } from "@/lib/agents/schema";
import {
  buildAutoModelSelectorOption,
  buildModelSelectorOptions,
  type ModelSelectorOption,
} from "@/components/ai-elements/model-selector.utils";
import type { ModelEffortValue } from "@/components/ai-elements/model-effort-selector.utils";
import { STANCE_LABELS } from "@/lib/providers/auto-routing-profile";
import { listProviderIds } from "@/lib/providers/model-catalog";
import { CLAUDE_EFFORT_OPTIONS, findOptionLabel } from "@/lib/providers/runtime-option-contract";
import { useAgentAssignmentsStore } from "@/store/agent-assignments-store";
import { useAppStore } from "@/store/app.store";
import { PromptInput } from "@/components/ai-elements/prompt-input";
import { PromptInputContextMeter } from "@/components/ai-elements/prompt-input-context-meter";
import { TooltipProvider } from "@/components/ui";
import { ChildRequestView, type ChildPendingRequest } from "@/components/session/ChildRequestSlot";
import { ComposerWorkspaceBarView } from "@/components/session/composer-workspace-bar";
import { MacroControl } from "@/components/session/MacroControl";
import { MacroQuickPicks } from "@/components/session/MacroQuickPicks";
import { ChatInputApprovalQueue } from "@/components/session/chat-input-approval-queue";
import { ComposerShelf } from "@/components/session/composer-shelf/ComposerShelf";
import { reorderQueuedTurns } from "@/components/session/composer-shelf/composer-shelf.utils";
import { useComposerShelfQueue } from "@/components/session/composer-shelf/use-composer-shelf-queue";
import { TaskScopeProvider } from "@/components/session/task-scope-context";
import { TurnActivity } from "@/components/session/TurnActivity";
import { TurnActivityPanel } from "@/components/session/TurnActivityPanel";
import {
  CLAUDE_PROVIDER_MODE_PRESETS,
  buildClaudeProviderModeSettingsPatch,
  resolveClaudeProviderModePresentation,
  type ProviderModePresetId,
} from "@/lib/providers/provider-mode-presets";
import { useComposerFrameFits } from "@/hooks/use-composer-frame-fits";
import { applyCustomTheme, applyThemeClass } from "@/lib/themes/apply";
import { BUILTIN_CUSTOM_THEMES } from "@/lib/themes/builtin-themes";
import {
  normalizeTurnActivityPlacement,
  type ComposerLayoutMode,
  type TurnActivityPlacement,
} from "@/store/app-settings";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { composerFramePreviewStyles as f } from "./composer-frame-preview.styles";
import {
  PREVIEW_CHILD_APPROVAL,
  PREVIEW_CHILD_QUESTION,
  PREVIEW_MACROS,
  PREVIEW_MODEL,
} from "./fixtures";
import {
  caseHasQueue,
  isShelfCaseId,
  PREVIEW_APPROVALS,
  PREVIEW_QUEUE,
  PREVIEW_TASK_ID,
  SHELF_CASES,
  seedShelfCase,
  type ShelfCaseId,
} from "./shelf-cases";

/**
 * Dev-only mount of the real composer tree. Opened from `src/main.tsx` when
 * `?stavePreview=composer-frame` is present, so App bootstrap does not run.
 */


/**
 * The preview runs the real Models | Agents selector against a small fake
 * host, so every choice works: pick an agent (Agent mode), pick a model (Chat),
 * pin a model beside the agent, go back to Auto.
 *
 * `?agent=<id>` starts the task as that agent; `&route=pinned|fixed` starts it
 * pinned to a model or on the agent's fixed model (Auto otherwise);
 * `&auto=off` turns Stave Auto off; `&effort=xhigh` passes the label of a
 * Claude effort setting, as the real composer always does; `&theme=light`
 * starts in light mode, and `&theme=<built-in theme id>` renders under that
 * theme.
 * `&childRequest=question|approval` shows a delegated task's request above the
 * composer, the slot `ChatInputComposer` mounts.
 *
 * The composer shelf: `&case=<id>` (see `SHELF_CASES`) seeds the stores with a
 * turn, an agent run, a pending approval or a queue; `&placement=docked|
 * floating|panel` picks where details open; `&open=1` starts them open; `&w=420`
 * caps the composer measure; `&panel=1` adds the Task panel's Activity tab
 * at its usual 384px.
 */
const previewParams = new URLSearchParams(window.location.search);
const PREVIEW_PINNED_MODEL = "claude-opus-5-5";
const PREVIEW_EFFORT = previewParams.get("effort");
const PREVIEW_EFFORT_LABEL = PREVIEW_EFFORT ? findOptionLabel(CLAUDE_EFFORT_OPTIONS, PREVIEW_EFFORT) : undefined;

function previewAgent(): AgentConfig | null {
  const agent = getBuiltinAgent(previewParams.get("agent") ?? "");
  if (!agent) return null;
  return previewParams.get("route") === "fixed"
    ? { ...agent, model: { mode: "fixed", providerId: "claude-code", model: PREVIEW_PINNED_MODEL } }
    : agent;
}

function previewAssignment(agent: AgentConfig, id: string, endedAt?: string): AgentAssignment {
  return {
    id,
    taskId: PREVIEW_TASK_ID,
    agentConfigId: agent.id,
    agentName: agent.name,
    agent,
    agentContentHash: id,
    received: [],
    support: [],
    state: "started",
    providerId: "claude-code",
    model: null,
    workspaceMode: "same-workspace",
    branch: null,
    detail: null,
    createdAt: "",
    updatedAt: "",
    ...(endedAt ? { endedAt } : {}),
  } as unknown as AgentAssignment;
}

/** A host that keeps the assignment ledger in memory. */
function installAgentsBridge(initial: AgentConfig | null) {
  const rows: AgentAssignment[] = initial ? [previewAssignment(initial, "preview-initial")] : [];
  const api = ((window as { api?: Record<string, unknown> }).api ??= {});
  api.agents = {
    recordTask: async (input: { agent: AgentConfig }) => {
      const row = previewAssignment(input.agent, `preview-${rows.length + 1}`);
      rows.unshift(row);
      return { ok: true, value: row };
    },
    releaseTask: async () => {
      const current = rows[0];
      if (!current || current.endedAt) return { ok: true, value: null };
      rows[0] = previewAssignment(current.agent, current.id, "now");
      return { ok: true, value: rows[0] };
    },
    listAssignments: async () => ({ ok: true, value: [...rows] }),
    subscribeChanged: () => () => {},
  };
}
const INITIAL_AGENT = previewAgent();
const CHILD_REQUESTS: Record<string, ChildPendingRequest> = {
  question: PREVIEW_CHILD_QUESTION,
  approval: PREVIEW_CHILD_APPROVAL,
};
const CHILD_REQUEST = CHILD_REQUESTS[previewParams.get("childRequest") ?? ""] ?? null;
installAgentsBridge(INITIAL_AGENT);

export function ComposerFramePreviewApp() {
  const [dark, setDark] = useState(previewParams.get("theme") !== "light");
  const [layoutPreference, setLayoutPreference] =
    useState<ComposerLayoutMode>("framed");
  const [squeezed, setSqueezed] = useState(false);
  const [caseId, setCaseId] = useState<ShelfCaseId>(() => {
    const requested = previewParams.get("case");
    return isShelfCaseId(requested) ? requested : "running";
  });
  const [placement, setPlacement] = useState<TurnActivityPlacement>(() =>
    normalizeTurnActivityPlacement(previewParams.get("placement")),
  );
  const [queue, setQueue] = useState(PREVIEW_QUEUE);
  const measureWidth = Number(previewParams.get("w")) || null;
  const showPanel = previewParams.get("panel") === "1" || placement === "panel";
  const { ref: composerMeasureRef, fits: composerFrameFits } =
    useComposerFrameFits();
  const framed = layoutPreference === "framed" && composerFrameFits;
  const [draft, setDraft] = useState(
    "Tighten the four-bar composer so the side shelves match the input card height.",
  );
  const [planMode, setPlanMode] = useState(true);
  const [thinkingMode, setThinkingMode] = useState<
    "adaptive" | "enabled" | "disabled"
  >("enabled");
  const [providerMode, setProviderMode] =
    useState<ProviderModePresetId>("guided");
  // The selector lists Models and Agents; with an agent running the task the
  // trigger splits into agent | model.
  const autoOn = previewParams.get("auto") !== "off";
  // The Auto option names the saved preference, as the real composer's does.
  const stance = useAppStore((state) => state.settings.autoRoutingProfile.stance);
  const modelOptions = useMemo<ModelSelectorOption[]>(
    () => [
      buildAutoModelSelectorOption({
        providerId: "claude-code",
        available: autoOn,
        stanceLabel: STANCE_LABELS[stance],
      }),
      ...buildModelSelectorOptions({ providerIds: listProviderIds() }),
    ],
    [autoOn, stance],
  );
  const [pickedModel, setPickedModel] = useState<ModelSelectorOption>(() => {
    const model = modelOptions.find((option) => option.model === PREVIEW_PINNED_MODEL) ?? PREVIEW_MODEL;
    if (!INITIAL_AGENT) return model;
    const route = previewParams.get("route");
    return route === "pinned" || route === "fixed" || !autoOn ? model : (modelOptions[0] ?? model);
  });
  const selectedModel = pickedModel.isAuto ? (modelOptions[0] ?? pickedModel) : pickedModel;
  const [effort, setEffort] = useState<ModelEffortValue | undefined>();
  const agentChoice = useTaskAgentChoice({
    taskId: PREVIEW_TASK_ID,
    selectedModel,
    modelOptions,
    onModelSelect: ({ selection, effort: picked }) => {
      setPickedModel(selection);
      setEffort(picked);
    },
  });
  useEffect(() => {
    useAppStore.setState({ repositoryPath: "/tmp/preview-repo" });
    void useAgentAssignmentsStore.getState().load();
  }, []);
  useLayoutEffect(() => {
    seedShelfCase({ caseId, placement, detailsOpen: previewParams.get("open") === "1" });
  }, [caseId, placement]);
  useEffect(() => {
    document.title = "Composer frame mock";
    // `&theme=<built-in theme id>` renders under that theme.
    const builtin = BUILTIN_CUSTOM_THEMES.find((theme) => theme.id === previewParams.get("theme")) ?? null;
    applyThemeClass({ enabled: builtin ? builtin.baseMode === "dark" : dark });
    applyCustomTheme({ theme: builtin });
  }, [dark]);

  const turnActive = caseId !== "idle" && caseId !== "agent-needs";
  const shelfQueue = useComposerShelfQueue({
    listId: PREVIEW_TASK_ID,
    queuedTurns: caseHasQueue(caseId) ? queue : [],
    queuedNextTurn: null,
    submitMode: turnActive ? "steer-or-queue" : "send",
    disabled: caseId === "needs-input" || caseId === "steering",
    isTurnActive: turnActive,
    canSteerQueuedTurn: turnActive && caseId !== "stalled",
    selectedModel,
    modelOptions,
    onSteer: (itemId) => setQueue((items) => items.filter((item) => item.id !== itemId)),
    onSend: (itemId) => setQueue((items) => items.filter((item) => item.id !== itemId)),
    onUpdate: ({ itemId, content }) =>
      setQueue((items) => items.map((item) => (item.id === itemId ? { ...item, content } : item))),
    onRemove: (itemId) => setQueue((items) => items.filter((item) => item.id !== itemId)),
    onClearAll: () => setQueue([]),
    onReorder: (move) => setQueue((items) => [...reorderQueuedTurns(items, move)]),
  });
  const shelf = (
    <ComposerShelf framed={framed} steering={caseId === "steering"} queue={shelfQueue} />
  );

  const providerModeStatus = useMemo(() => {
    const presentation = resolveClaudeProviderModePresentation({
      settings: buildClaudeProviderModeSettingsPatch({
        presetId: providerMode,
      }),
      planMode,
    });
    return {
      ...presentation,
      providerLabel: "Claude",
    };
  }, [planMode, providerMode]);

  return (
    <TooltipProvider>
      <TaskScopeProvider taskId={PREVIEW_TASK_ID}>
      <div className={sx(f.page)}>
        <header className={sx(f.header)}>
          <h1 className={sx(f.headerTitle)}>Composer frame preview</h1>
          <p className={sx(f.headerNote)}>
            Real PromptInput, composer shelf, and workspace bar
          </p>
          <div className={sx(f.headerControls)}>
            {SHELF_CASES.map((item) => (
              <Button
                key={item.id}
                layout="host"
                type="button"
                data-preview-case={item.id}
                xstyle={[f.toggle, caseId === item.id && f.toggleActive]}
                onClick={() => {
                  setQueue(PREVIEW_QUEUE);
                  setCaseId(item.id);
                }}
              >
                {item.label}
              </Button>
            ))}
            <Button
              layout="host"
              type="button"
              data-preview-placement={placement}
              xstyle={[f.toggle]}
              onClick={() =>
                setPlacement((value) =>
                  value === "docked" ? "floating" : value === "floating" ? "panel" : "docked",
                )
              }
            >
              {`Details: ${placement}`}
            </Button>
            <Button
              layout="host"
              type="button"
              xstyle={[
                f.toggle,
                layoutPreference === "framed" && f.toggleActive,
              ]}
              onClick={() =>
                setLayoutPreference((value) =>
                  value === "framed" ? "classic" : "framed",
                )
              }
            >
              {layoutPreference === "framed" ? "Framed" : "Classic"}
            </Button>
            <Button
              layout="host"
              type="button"
              xstyle={[f.toggle, squeezed && f.toggleActive]}
              onClick={() => setSqueezed((value) => !value)}
            >
              {squeezed ? "Squeezed" : "Full width"}
            </Button>
            <span className={sx(f.statusNote)} data-testid="preview-task-mode">
              {agentChoice.current
                ? `Agent · ${agentChoice.current.agentName} · ${agentChoice.route}`
                : "Chat"}
            </span>
            <span className={sx(f.statusNote)}>
              {framed ? "frame on" : "frame off"}
            </span>
            <Button
              layout="host"
              type="button"
              xstyle={[f.toggle, dark && f.toggleActive]}
              onClick={() => setDark((value) => !value)}
            >
              {dark ? "Dark" : "Light"}
            </Button>
          </div>
        </header>

        <div className={sx(f.workspace)}>
        <div className={sx(f.main)}>
          <div className={sx(f.conversation)}>
            <div className={sx(f.conversationMeasure)}>
              <p>Earlier turn</p>
              <p className={sx(f.conversationBody)}>
                Message column stays at the conversation measure. The raised
                card is narrower so hovered side shelves fit inside that
                measure.
              </p>
            </div>
            <div className={sx(f.overlay)}>
              <TurnActivity host="floating" />
            </div>
          </div>

          <div className={sx(f.composerDock)}>
            <div className={sx(f.composerPad)}>
              <div
                ref={composerMeasureRef}
                data-testid="preview-composer-measure"
                style={measureWidth ? { maxWidth: measureWidth } : undefined}
                className={sx(
                  f.composerMeasure,
                  squeezed ? f.composerMeasureSqueezed : f.composerMeasureWide,
                )}
              >
                {caseId === "needs-input" ? (
                  <ChatInputApprovalQueue approvals={PREVIEW_APPROVALS} onResolveApproval={() => {}} />
                ) : null}
                {framed ? null : shelf}
                {CHILD_REQUEST ? (
                  <ChildRequestView
                    requestId={CHILD_REQUEST.part.requestId}
                    childTitle="Migrate settings sections to the new tokens"
                    providerId="codex"
                    pending={CHILD_REQUEST}
                    queuedCount={1}
                    busy={false}
                    error={null}
                    loaded
                    onRespond={() => {}}
                  />
                ) : null}
                <PromptInput
                  framed={framed}
                  isTurnActive={turnActive}
                  submitMode={turnActive ? "steer-or-queue" : "send"}
                  disabled={caseId === "needs-input"}
                  macroControl={
                    <MacroControl macros={PREVIEW_MACROS} onSelect={() => {}} />
                  }
                  macroQuickPicks={
                    <MacroQuickPicks
                      macros={PREVIEW_MACROS}
                      onSelect={() => {}}
                    />
                  }
                  value={draft}
                  onValueChange={setDraft}
                  selectedModel={selectedModel}
                  modelOptions={modelOptions}
                  effortValue={effort}
                  {...(PREVIEW_EFFORT_LABEL ? { effortLabel: PREVIEW_EFFORT_LABEL } : {})}
                  attachedFilePaths={[]}
                  reviewModelOptions={[PREVIEW_MODEL]}
                  preferredReviewModelKey={PREVIEW_MODEL.key}
                  onLocalChangeReview={() => true}
                  planMode={planMode}
                  onPlanModeChange={setPlanMode}
                  thinkingMode={thinkingMode}
                  onThinkingModeChange={setThinkingMode}
                  providerModeStatus={providerModeStatus}
                  providerModePresets={CLAUDE_PROVIDER_MODE_PRESETS}
                  activeProviderModePresetId={providerMode}
                  onProviderModeSelect={setProviderMode}
                  modelPickerAgents={buildModelPickerAgents(agentChoice, { locked: false })}
                  assignOnSend={agentChoice.assignOnSend}
                  runtimeStatusItems={[
                    {
                      id: "sandbox",
                      label: "Sandbox",
                      value: "workspace-write",
                    },
                    { id: "approval", label: "Approval", value: "on-request" },
                  ]}
                  contextMeter={
                    <PromptInputContextMeter
                      usage={{
                        usedPercent: 72,
                        usedTokens: 72_000,
                        windowTokens: 100_000,
                        messageId: "assistant-preview",
                      }}
                      compactAvailable
                      compactDisabled={false}
                      onCompact={() => {}}
                    />
                  }
                  frameTop={framed ? shelf : undefined}
                  frameBottom={
                    framed ? (
                      <ComposerWorkspaceBarView
                        repositoryLabel="stave"
                        workspaceLabel="Agentic Workflow"
                        folderLabel="feat__agent-manager--1dlzwt1"
                        branchLabel="feat/agent-manager"
                      />
                    ) : undefined
                  }
                  onComposerControlPlacementsChange={() => {}}
                  onModelSelect={agentChoice.selectModel}
                  onAttachFilesChange={() => {}}
                  onSubmit={() => {}}
                  onAbort={() => {}}
                />
              </div>
            </div>
          </div>
        </div>
        {showPanel ? (
          <aside className={sx(f.panel)} data-testid="preview-task-panel" aria-label="Task panel, Activity tab">
            <TurnActivityPanel />
          </aside>
        ) : null}
        </div>
      </div>
      </TaskScopeProvider>
    </TooltipProvider>
  );
}
