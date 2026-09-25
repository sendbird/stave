import { useMemo } from "react";
import {
  buildModelSelectorOptions,
  buildModelSelectorValue,
  buildRecommendedModelSelectorOptions,
  ModelSelector,
} from "@/components/ai-elements/model-selector";
import { SettingsModelVisibilitySection } from "@/components/layout/settings-dialog-model-visibility";
import { useShallow } from "zustand/react/shallow";
import { sx } from "@/components/ads/utils/stylex";
import { settingsSectionsStyles as styles } from "../settings-dialog-sections.styles";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getDefaultModelForProvider,
  normalizeModelSelection,
  resolveClaudeEffortForModelSwitch,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import { useCodexModelCatalog } from "@/lib/providers/use-codex-model-catalog";
import {
  CLAUDE_EFFORT_OPTIONS,
  listCodexEffortOptionsForModel,
} from "@/lib/providers/runtime-option-contract";
import { useAppStore } from "@/store/app.store";
import {
  LabeledField,
  SectionStack,
  SettingsCard,
} from "../settings-dialog.shared";

export function ModelsSection() {
  const [
    modelClaude,
    modelCodex,
    claudeEffort,
    codexReasoningEffort,
    codexBinaryPath,
    utilityInferenceProvider,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.modelClaude,
          state.settings.modelCodex,
          state.settings.claudeEffort,
          state.settings.codexReasoningEffort,
          state.settings.codexBinaryPath,
          state.settings.utilityInferenceProvider,
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const codexModelCatalog = useCodexModelCatalog({
    enabled: true,
    codexBinaryPath,
  });
  const codexModelEnrichment = useMemo(() => {
    if (codexModelCatalog.entries.length === 0) {
      return undefined;
    }
    const map = new Map<
      string,
      { description?: string; isDefault?: boolean }
    >();
    for (const entry of codexModelCatalog.entries) {
      const id = entry.model.trim();
      if (id) {
        map.set(id, {
          description: entry.description || undefined,
          isDefault: entry.isDefault || undefined,
        });
      }
    }
    return map.size > 0 ? map : undefined;
  }, [codexModelCatalog.entries]);
  const modelOptions = useMemo(
    () =>
      buildModelSelectorOptions({
        providerIds: ["claude-code", "codex"],
        modelsByProvider: {
          codex: codexModelCatalog.models,
        },
        enrichmentByModel: codexModelEnrichment,
      }),
    [codexModelCatalog.models, codexModelEnrichment],
  );
  const recommendedModelOptions = useMemo(
    () => buildRecommendedModelSelectorOptions({ options: modelOptions }),
    [modelOptions],
  );
  // Scoped to the default Codex model so, e.g., GPT-5.6 Luna never offers
  // "Ultra" here — a value only Sol/Terra accept.
  const codexEffortOptions = useMemo(
    () => listCodexEffortOptionsForModel({ model: modelCodex }),
    [modelCodex],
  );

  return (
    <>
      <SectionStack>
        <SettingsModelVisibilitySection />
        <SettingsCard
          title="Model Routing"
          description="Pick the default Claude and Codex models used for new turns. Stave falls back to its verified Codex baseline if the App Server catalog is unavailable."
        >
          <LabeledField title="Claude">
            <ModelSelector
              value={buildModelSelectorValue({
                providerId: "claude-code",
                model: modelClaude,
              })}
              triggerAriaLabel={`Claude model: ${toHumanModelName({
                model: modelClaude,
              })}`}
              options={modelOptions.filter(
                (option) => option.providerId === "claude-code",
              )}
              recommendedOptions={recommendedModelOptions.filter(
                (option) => option.providerId === "claude-code",
              )}
              className={sx(styles.fullWidth)}
              triggerClassName={sx(styles.modelTrigger)}
              menuClassName={sx(styles.modelMenu)}
              onSelect={({ selection }) => {
                const nextModel = normalizeModelSelection({
                  value: selection.model,
                  fallback: getDefaultModelForProvider({
                    providerId: "claude-code",
                  }),
                });
                updateSettings({
                  patch: {
                    modelClaude: nextModel,
                    claudeEffort: resolveClaudeEffortForModelSwitch({
                      previousModel: modelClaude,
                      nextModel,
                      currentEffort: claudeEffort,
                    }),
                  },
                });
              }}
            />
          </LabeledField>
          <LabeledField
            title="Claude Effort"
            description="Default reasoning effort applied to new Claude turns."
          >
            <Select
              value={claudeEffort}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    claudeEffort: value as typeof claudeEffort,
                  },
                })
              }
            >
              <SelectTrigger className={sx(styles.selectTrigger)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLAUDE_EFFORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabeledField>
          <LabeledField
            title="Codex"
            description={
              codexModelCatalog.detail.trim().length > 0
                ? codexModelCatalog.detail
                : undefined
            }
          >
            <ModelSelector
              value={buildModelSelectorValue({
                providerId: "codex",
                model: modelCodex,
              })}
              triggerAriaLabel={`Codex model: ${toHumanModelName({
                model: modelCodex,
              })}`}
              options={modelOptions.filter(
                (option) => option.providerId === "codex",
              )}
              recommendedOptions={recommendedModelOptions.filter(
                (option) => option.providerId === "codex",
              )}
              className={sx(styles.fullWidth)}
              triggerClassName={sx(styles.modelTrigger)}
              menuClassName={sx(styles.modelMenu)}
              onSelect={({ selection }) =>
                updateSettings({
                  patch: {
                    modelCodex: normalizeModelSelection({
                      value: selection.model,
                      fallback: getDefaultModelForProvider({
                        providerId: "codex",
                      }),
                    }),
                  },
                })
              }
            />
          </LabeledField>
          <LabeledField
            title="Codex Effort"
            description="Default reasoning effort applied to new Codex turns."
          >
            <Select
              value={codexReasoningEffort}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    codexReasoningEffort: value as typeof codexReasoningEffort,
                  },
                })
              }
            >
              <SelectTrigger className={sx(styles.selectTrigger)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {codexEffortOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabeledField>
          <LabeledField
            title="Utility AI"
            description="Provider used for task names, route classification, commit messages, and prompt enhancement. Auto prefers Claude or Codex from the active task, then falls back through installed utility runners."
          >
            <Select
              value={utilityInferenceProvider}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    utilityInferenceProvider: value as
                      "auto" | "claude-code" | "codex",
                  },
                })
              }
            >
              <SelectTrigger
                className={sx(styles.selectTrigger)}
                aria-label="Utility AI provider"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="claude-code">Claude</SelectItem>
                <SelectItem value="codex">Codex</SelectItem>
              </SelectContent>
            </Select>
          </LabeledField>
        </SettingsCard>
      </SectionStack>
    </>
  );
}
