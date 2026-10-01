import { useEffect, useMemo, useState } from "react";
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
import { useAgentAssignmentsStore } from "@/store/agent-assignments-store";
import { useAppStore } from "@/store/app.store";
import { PromptInput } from "@/components/ai-elements/prompt-input";
import { PromptInputAdvisorPill } from "@/components/ai-elements/prompt-input-advisor-mode";
import { PromptInputWorkerPill } from "@/components/ai-elements/prompt-input-worker-mode";
import { PromptInputContextMeter } from "@/components/ai-elements/prompt-input-context-meter";
import { TooltipProvider } from "@/components/ui";
import { ComposerWorkspaceBarView } from "@/components/session/composer-workspace-bar";
import { MacroControl } from "@/components/session/MacroControl";
import { MacroQuickPicks } from "@/components/session/MacroQuickPicks";
import { TurnActivitySurface } from "@/components/session/TurnActivity";
import {
  CLAUDE_PROVIDER_MODE_PRESETS,
  buildClaudeProviderModeSettingsPatch,
  resolveClaudeProviderModePresentation,
  type ProviderModePresetId,
} from "@/lib/providers/provider-mode-presets";
import { useComposerFrameFits } from "@/hooks/use-composer-frame-fits";
import { applyCustomTheme, applyThemeClass } from "@/lib/themes/apply";
import { BUILTIN_CUSTOM_THEMES } from "@/lib/themes/builtin-themes";
import type { ComposerLayoutMode } from "@/store/app-settings";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { composerFramePreviewStyles as f } from "./composer-frame-preview.styles";
import {
  PREVIEW_MACROS,
  PREVIEW_MODEL,
  PREVIEW_WORK_ITEMS,
  createPreviewActivity,
  createPreviewAdvisorArm,
} from "./fixtures";
import {
  buildWorkerRuntimeIntent,
  resolveWorkerArmState,
  resolveWorkerProfile,
  type WorkerEffortPreference,
  type WorkerPresetId,
  type WorkerProviderConfig,
} from "@/lib/providers/worker-mode";

const PREVIEW_TODOS = [
  {
    content: "Match the four shelves to one card",
    status: "in_progress" as const,
  },
  { content: "Keep the draft after compact", status: "pending" as const },
];

/**
 * Dev-only mount of the real composer tree. Opened from `src/main.tsx` when
 * `?stavePreview=composer-frame` is present, so App bootstrap does not run.
 */

const PREVIEW_TASK_ID = "preview-task";

/**
 * The preview runs the real Models | Agents selector against a small fake
 * host, so every choice works: pick an agent (Agent mode), pick a model (Chat),
 * pin a model beside the agent, go back to Auto.
 *
 * `?agent=<id>` starts the task as that agent; `&route=pinned|fixed` starts it
 * pinned to a model or on the agent's fixed model (Auto otherwise);
 * `&auto=off` turns Stave Auto off; `&theme=light` starts in light mode, and
 * `&theme=<built-in theme id>` renders under that theme.
 */
const previewParams = new URLSearchParams(window.location.search);
const PREVIEW_PINNED_MODEL = "claude-opus-5-5";

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
installAgentsBridge(INITIAL_AGENT);

export function ComposerFramePreviewApp() {
  const [dark, setDark] = useState(previewParams.get("theme") !== "light");
  const [layoutPreference, setLayoutPreference] =
    useState<ComposerLayoutMode>("framed");
  const [squeezed, setSqueezed] = useState(false);
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
  const [advisorEnabled, setAdvisorEnabled] = useState(true);
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [workerEnabled, setWorkerEnabled] = useState(false);
  const [workerOpen, setWorkerOpen] = useState(false);
  // The selector lists Models and Agents; with an agent running the task the
  // trigger splits into agent | model and the Worker is gone.
  const autoOn = previewParams.get("auto") !== "off";
  const modelOptions = useMemo<ModelSelectorOption[]>(
    () => [
      buildAutoModelSelectorOption({
        providerId: "claude-code",
        available: autoOn,
        stanceLabel: STANCE_LABELS.balanced,
      }),
      ...buildModelSelectorOptions({ providerIds: listProviderIds() }),
    ],
    [autoOn],
  );
  const [selectedModel, setSelectedModel] = useState<ModelSelectorOption>(() => {
    const model = modelOptions.find((option) => option.model === PREVIEW_PINNED_MODEL) ?? PREVIEW_MODEL;
    if (!INITIAL_AGENT) return model;
    const route = previewParams.get("route");
    return route === "pinned" || route === "fixed" || !autoOn ? model : (modelOptions[0] ?? model);
  });
  const [effort, setEffort] = useState<ModelEffortValue | undefined>();
  const agentChoice = useTaskAgentChoice({
    taskId: PREVIEW_TASK_ID,
    selectedModel,
    modelOptions,
    onModelSelect: ({ selection, effort: picked }) => {
      setSelectedModel(selection);
      setEffort(picked);
    },
  });
  const agentic = agentChoice.current !== null;
  useEffect(() => {
    useAppStore.setState({ repositoryPath: "/tmp/preview-repo" });
    void useAgentAssignmentsStore.getState().load();
  }, []);
  const [workerConfig, setWorkerConfig] = useState<WorkerProviderConfig>({
    presetId: "verified-patch",
    model: "auto",
    effort: "auto",
  });

  useEffect(() => {
    document.title = "Composer frame mock";
    // `&theme=<built-in theme id>` renders under that theme.
    const builtin = BUILTIN_CUSTOM_THEMES.find((theme) => theme.id === previewParams.get("theme")) ?? null;
    applyThemeClass({ enabled: builtin ? builtin.baseMode === "dark" : dark });
    applyCustomTheme({ theme: builtin });
  }, [dark]);

  const activity = useMemo(() => createPreviewActivity(), []);

  const advisorArm = useMemo(
    () => createPreviewAdvisorArm(advisorEnabled),
    [advisorEnabled],
  );
  const workerArm = useMemo(
    () =>
      resolveWorkerArmState({
        providerId: "claude-code",
        overrides: {
          workerEnabled,
          workerConfigByProvider: { "claude-code": workerConfig },
        },
      }),
    [workerConfig, workerEnabled],
  );
  const workerResolution = useMemo(
    () =>
      resolveWorkerProfile({
        providerId: "claude-code",
        primaryModel: PREVIEW_MODEL.model,
        intent: buildWorkerRuntimeIntent(workerArm),
      }),
    [workerArm],
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
      <div className={sx(f.page)}>
        <header className={sx(f.header)}>
          <h1 className={sx(f.headerTitle)}>Composer frame preview</h1>
          <p className={sx(f.headerNote)}>
            Real PromptInput, TurnActivitySurface, and workspace bar
          </p>
          <div className={sx(f.headerControls)}>
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
          </div>

          <div className={sx(f.composerDock)}>
            <div className={sx(f.composerPad)}>
              <div
                ref={composerMeasureRef}
                className={sx(
                  f.composerMeasure,
                  squeezed ? f.composerMeasureSqueezed : f.composerMeasureWide,
                )}
              >
                {framed ? null : (
                  <TurnActivitySurface
                    activeTurnId="preview-turn"
                    activity={activity}
                    isPlanPreparing={false}
                    workItems={PREVIEW_WORK_ITEMS}
                    todos={PREVIEW_TODOS}
                    expandedByDefault
                  />
                )}
                <PromptInput
                  framed={framed}
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
                  advisorActive={advisorEnabled}
                  advisorControl={
                    <PromptInputAdvisorPill
                      arm={advisorArm}
                      primaryProviderId="claude-code"
                      primaryModel={PREVIEW_MODEL.model}
                      selectedProviderId="claude-code"
                      advisorModelOptions={[PREVIEW_MODEL.model]}
                      open={advisorOpen}
                      onOpenChange={setAdvisorOpen}
                      onSetEnabled={setAdvisorEnabled}
                      onSelectProvider={() => {}}
                      onSelectModel={() => {}}
                      onSelectEffort={() => {}}
                    />
                  }
                  modelPickerAgents={buildModelPickerAgents(agentChoice, { locked: false })}
                  assignOnSend={agentChoice.assignOnSend}
                  workerActive={!agentic && workerEnabled}
                  workerControl={
                    agentic ? null : (
                    <PromptInputWorkerPill
                      arm={workerArm}
                      resolution={workerResolution}
                      primaryProviderId="claude-code"
                      primaryModel={PREVIEW_MODEL.model}
                      open={workerOpen}
                      onOpenChange={setWorkerOpen}
                      onToggle={() => setWorkerEnabled((value) => !value)}
                      onSelectPreset={(presetId: WorkerPresetId) =>
                        setWorkerConfig((current) => ({
                          ...current,
                          presetId,
                        }))
                      }
                      onSelectModel={(model) =>
                        setWorkerConfig((current) => ({ ...current, model }))
                      }
                      onSelectEffort={(effort: WorkerEffortPreference) =>
                        setWorkerConfig((current) => ({ ...current, effort }))
                      }
                    />
                    )
                  }
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
                  frameTop={
                    framed ? (
                      <TurnActivitySurface
                        activeTurnId="preview-turn"
                        activity={activity}
                        isPlanPreparing={false}
                        workItems={PREVIEW_WORK_ITEMS}
                        todos={PREVIEW_TODOS}
                        expandedByDefault
                        frameInset
                      />
                    ) : undefined
                  }
                  frameBottom={
                    framed ? (
                      <ComposerWorkspaceBarView
                        repositoryLabel="stave"
                        workspaceLabel="fix-benchmark"
                        folderLabel="fix__benchmark-new-ade--12tr7n2"
                        branchLabel="fix/benchmark-new-ade"
                      />
                    ) : undefined
                  }
                  onComposerControlPlacementsChange={() => {}}
                  onModelSelect={agentChoice.selectModel}
                  onAttachFilesChange={() => {}}
                  onSubmit={() => {}}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
