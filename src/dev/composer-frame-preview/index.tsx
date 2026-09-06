import { useEffect, useMemo, useState } from "react";
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
import { applyThemeClass } from "@/lib/themes/apply";
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

export function ComposerFramePreviewApp() {
  const [dark, setDark] = useState(true);
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
  const [workerConfig, setWorkerConfig] = useState<WorkerProviderConfig>({
    presetId: "verified-patch",
    model: "auto",
    effort: "auto",
  });

  useEffect(() => {
    document.title = "Composer frame mock";
    applyThemeClass({ enabled: dark });
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
                  selectedModel={PREVIEW_MODEL}
                  modelOptions={[PREVIEW_MODEL]}
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
                  workerActive={workerEnabled}
                  workerControl={
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
                        projectLabel="stave"
                        workspaceLabel="fix-benchmark"
                        folderLabel="fix__benchmark-new-ade--12tr7n2"
                        branchLabel="fix/benchmark-new-ade"
                      />
                    ) : undefined
                  }
                  onComposerControlPlacementsChange={() => {}}
                  onModelSelect={() => {}}
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
