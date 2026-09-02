import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  buildModelSelectorOptions,
  buildModelSelectorValue,
  buildRecommendedModelSelectorOptions,
  ModelSelector,
} from "@/components/ai-elements/model-selector";
import { LabeledField } from "@/components/layout/settings-dialog.shared";
import type { ProviderId } from "@/lib/providers/provider.types";
import { useProviderModelCatalogs } from "@/lib/providers/use-provider-model-catalogs";
import { useAppStore } from "@/store/app.store";

/**
 * Model-picker fields shared by the Settings sections that choose a model for a
 * non-primary call (prompt templates, background AI lanes). Kept out of
 * `settings-dialog.shared.tsx` deliberately: that module holds store-free
 * presentational primitives, while these hooks read the store and the live
 * provider model catalogs.
 */

export const PROMPT_MODEL_PROVIDER_IDS = ["claude-code", "codex"] as const;

export function useSettingsModelSelectorOptions(args: {
  providerIds: readonly ProviderId[];
}) {
  const [codexBinaryPath, cursorBinaryPath, kiroBinaryPath, workspaceCwd] =
    useAppStore(
      useShallow(
        (state) =>
          [
            state.settings.codexBinaryPath,
            state.settings.cursorBinaryPath,
            state.settings.kiroBinaryPath,
            state.workspacePathById[state.activeWorkspaceId] ??
              state.projectPath ??
              undefined,
          ] as const,
      ),
    );
  const catalogRuntimeOptions = useMemo(
    () => ({
      ...(codexBinaryPath ? { codexBinaryPath } : {}),
      ...(cursorBinaryPath ? { cursorBinaryPath } : {}),
      ...(kiroBinaryPath ? { kiroBinaryPath } : {}),
    }),
    [codexBinaryPath, cursorBinaryPath, kiroBinaryPath],
  );
  const modelCatalogs = useProviderModelCatalogs({
    enabled: true,
    cwd: workspaceCwd,
    runtimeOptions: catalogRuntimeOptions,
  });
  const modelEnrichmentForPrompt = useMemo(() => {
    const map = new Map<
      string,
      {
        label?: string;
        description?: string;
        isDefault?: boolean;
        defaultEffort?: string;
        supportedEfforts?: readonly string[];
      }
    >();
    for (const providerId of args.providerIds) {
      for (const entry of modelCatalogs.catalogs[providerId].entries) {
        const id = entry.model.trim();
        if (!id) {
          continue;
        }
        map.set(`${providerId}:${id}`, {
          label: entry.displayName || undefined,
          description: entry.description || undefined,
          isDefault: entry.isDefault || undefined,
          defaultEffort: entry.defaultEffort || undefined,
          supportedEfforts: entry.supportedEfforts,
        });
        if (providerId === "codex") {
          map.set(id, {
            description: entry.description || undefined,
            isDefault: entry.isDefault || undefined,
          });
        }
      }
    }
    return map.size > 0 ? map : undefined;
  }, [args.providerIds, modelCatalogs.catalogs]);
  const promptModelOptions = useMemo(
    () =>
      buildModelSelectorOptions({
        providerIds: args.providerIds,
        modelsByProvider: Object.fromEntries(
          args.providerIds.map((providerId) => [
            providerId,
            modelCatalogs.catalogs[providerId].models,
          ]),
        ),
        enrichmentByModel: modelEnrichmentForPrompt,
      }),
    [args.providerIds, modelCatalogs.catalogs, modelEnrichmentForPrompt],
  );
  const promptRecommendedModelOptions = useMemo(
    () => buildRecommendedModelSelectorOptions({ options: promptModelOptions }),
    [promptModelOptions],
  );

  return {
    options: promptModelOptions,
    recommendedOptions: promptRecommendedModelOptions,
  };
}

export function PromptModelField(args: {
  title: string;
  description: string;
  value: string;
  onSelect: (model: string) => void;
}) {
  const {
    options: promptModelOptions,
    recommendedOptions: promptRecommendedModelOptions,
  } = useSettingsModelSelectorOptions({
    providerIds: PROMPT_MODEL_PROVIDER_IDS,
  });

  return (
    <LabeledField title={args.title} description={args.description}>
      <ModelSelector
        value={buildModelSelectorValue({ model: args.value })}
        options={promptModelOptions}
        recommendedOptions={promptRecommendedModelOptions}
        className="w-full"
        triggerClassName="h-10 w-full max-w-none rounded-md border border-border/80 bg-background px-3 hover:bg-muted/40"
        menuClassName="sm:max-w-lg"
        onSelect={({ selection }) => args.onSelect(selection.model)}
      />
    </LabeledField>
  );
}
