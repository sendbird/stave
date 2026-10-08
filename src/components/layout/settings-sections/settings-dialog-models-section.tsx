import { I18N_NAMESPACES, useTranslation } from "@/i18n";
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
  getDefaultModelForProvider,
  normalizeModelSelection,
  resolveClaudeEffortForModelSwitch,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import { useCodexModelCatalog } from "@/lib/providers/use-codex-model-catalog";
import { useAppStore } from "@/store/app.store";
import type { SectionId } from "../settings-dialog.schema";
import { SettingsSectionLink } from "../settings-dialog-section-link";
import {
  LabeledField,
  SectionStack,
  SettingsCard,
} from "../settings-dialog.shared";
import {
  AcpDefaultModelRows,
  ClaudeEffortGuide,
  ClaudeEffortSelect,
  CodexEffortGuide,
  CodexEffortSelect,
  ModelEffortRow,
} from "./settings-dialog-model-default-fields";

export function ModelsSection(args: {
  onNavigateSection?: (id: SectionId) => void;
} = {}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const [
    modelClaude,
    modelCodex,
    claudeEffort,
    codexBinaryPath,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.modelClaude,
          state.settings.modelCodex,
          state.settings.claudeEffort,
          state.settings.codexBinaryPath,
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

  return (
    <SectionStack>
      <SettingsModelVisibilitySection />
      <SettingsCard
        title={t("settings:modelsSection.routing.title")}
        description={t("settings:modelsSection.routing.description")}
      >
        <LabeledField title="Claude" guide={<ClaudeEffortGuide />}>
          <ModelEffortRow
            model={
              <ModelSelector
                value={buildModelSelectorValue({
                  providerId: "claude-code",
                  model: modelClaude,
                })}
                triggerAriaLabel={t("settings:settingsDialogModelsSection.claudeModel", { value1: toHumanModelName({
                  model: modelClaude,
                }) })}
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
            }
            effort={<ClaudeEffortSelect />}
          />
        </LabeledField>
        <LabeledField
          title="Codex"
          guide={<CodexEffortGuide />}
          description={
            codexModelCatalog.detail.trim().length > 0
              ? codexModelCatalog.detail
              : undefined
          }
        >
          <ModelEffortRow
            model={
              <ModelSelector
                value={buildModelSelectorValue({
                  providerId: "codex",
                  model: modelCodex,
                })}
                triggerAriaLabel={t("settings:settingsDialogModelsSection.codexModel", { value1: toHumanModelName({
                  model: modelCodex,
                }) })}
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
            }
            effort={<CodexEffortSelect />}
          />
        </LabeledField>
        <AcpDefaultModelRows />
        {/* Background AI owns the utility model; this row only points there. */}
        <SettingsSectionLink
          title={t("settings:modelsSection.routing.utility.title")}
          description={t("settings:modelsSection.routing.utility.description")}
          actionLabel={t("settings:modelsSection.routing.utility.action")}
          target="auxiliaryInference"
          onNavigateSection={args.onNavigateSection}
        />
      </SettingsCard>
    </SectionStack>
  );
}
