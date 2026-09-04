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
import { cn } from "@/lib/utils";
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
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2">
          <h1 className="text-sm font-semibold">Composer frame preview</h1>
          <p className="text-xs text-muted-foreground">
            Real PromptInput, TurnActivitySurface, and workspace bar
          </p>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-medium",
                layoutPreference === "framed"
                  ? "border-primary bg-primary/15"
                  : "border-border text-muted-foreground",
              )}
              onClick={() =>
                setLayoutPreference((value) =>
                  value === "framed" ? "classic" : "framed",
                )
              }
            >
              {layoutPreference === "framed" ? "Framed" : "Classic"}
            </button>
            <button
              type="button"
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-medium",
                squeezed
                  ? "border-primary bg-primary/15"
                  : "border-border text-muted-foreground",
              )}
              onClick={() => setSqueezed((value) => !value)}
            >
              {squeezed ? "Squeezed" : "Full width"}
            </button>
            <span className="text-xs text-muted-foreground">
              {framed ? "frame on" : "frame off"}
            </span>
            <button
              type="button"
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-medium",
                dark
                  ? "border-primary bg-primary/15"
                  : "border-border text-muted-foreground",
              )}
              onClick={() => setDark((value) => !value)}
            >
              {dark ? "Dark" : "Light"}
            </button>
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden px-4 py-6 text-sm text-muted-foreground">
            <div className="mx-auto w-full max-w-6xl px-3 sm:px-5">
              <p>Earlier turn</p>
              <p className="mt-3 max-w-2xl text-foreground">
                Message column stays at the conversation measure. The raised
                card is narrower so hovered side shelves fit inside that
                measure.
              </p>
            </div>
          </div>

          <div className="relative z-30 shrink-0">
            <div className="bg-background px-3 py-2.5 sm:px-4">
              <div
                ref={composerMeasureRef}
                className={cn(
                  "mx-auto",
                  squeezed ? "max-w-[820px]" : "max-w-6xl",
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
