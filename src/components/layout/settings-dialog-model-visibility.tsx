import { RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import { ModelIcon } from "@/components/ai-elements/model-icon";
import {
  getClaudeContextBaseLabel,
  getCursorModelPresentation,
  listDefaultModelOptions,
} from "@/components/ai-elements/model-effort-selector.utils";
import {
  buildModelSelectorOptions,
  type ModelEnrichment,
  type ModelSelectorOption,
} from "@/components/ai-elements/model-selector.utils";
import {
  getProviderLabel,
  listProviderIds,
} from "@/lib/providers/model-catalog";
import {
  clearProviderModelVisibility,
  getModelVisibilityKey,
  type ModelVisibility,
  setModelVisibilityOverride,
} from "@/lib/providers/model-visibility";
import type { ProviderId } from "@/lib/providers/provider.types";
import { useProviderModelCatalogs } from "@/lib/providers/use-provider-model-catalogs";
import { useAppStore } from "@/store/app.store";
import { useShallow } from "zustand/react/shallow";
import { SettingsCard } from "./settings-dialog.shared";
import { sx } from "@/components/ads/utils/stylex";
import { modelVisibilityStyles as styles } from "./settings-dialog-model-visibility.styles";

const PROVIDER_IDS = listProviderIds();

interface ModelVisibilityRow {
  key: string;
  option: ModelSelectorOption;
  label: string;
  current: boolean;
  visible: boolean;
}

function resolveRowLabel(option: ModelSelectorOption) {
  if (option.providerId === "cursor") {
    return getCursorModelPresentation(option).label;
  }
  if (option.providerId === "claude-code") {
    return getClaudeContextBaseLabel(option.label);
  }
  return option.label;
}

/**
 * One row per selector row, not per catalog model id.
 *
 * Cursor advertises each fast/context/effort combination as a separate model id
 * and Claude ships a `[1m]` twin of every context-capable model; both render as
 * controls on a single selector row, so a per-variant toggle here would read as
 * duplicate entries that cannot be turned off independently.
 */
function buildModelVisibilityRows(args: {
  providerId: ProviderId;
  options: readonly ModelSelectorOption[];
  visibility: ModelVisibility;
}): ModelVisibilityRow[] {
  const currentKeys = new Set(
    listDefaultModelOptions({
      providerId: args.providerId,
      options: args.options,
    }).map((option) =>
      getModelVisibilityKey({
        providerId: args.providerId,
        model: option.model,
      }),
    ),
  );
  const visibleKeys = new Set(
    listDefaultModelOptions({
      providerId: args.providerId,
      options: args.options,
      visibility: args.visibility,
    }).map((option) =>
      getModelVisibilityKey({
        providerId: args.providerId,
        model: option.model,
      }),
    ),
  );
  const rows = new Map<string, ModelVisibilityRow>();
  for (const option of args.options) {
    const key = getModelVisibilityKey({
      providerId: args.providerId,
      model: option.model,
    });
    if (!key || rows.has(key)) {
      continue;
    }
    rows.set(key, {
      key,
      option,
      label: resolveRowLabel(option),
      current: currentKeys.has(key),
      visible: visibleKeys.has(key),
    });
  }
  return [...rows.values()];
}

function ModelVisibilityProviderPanel(args: {
  providerId: ProviderId;
  options: readonly ModelSelectorOption[];
  visibility: ModelVisibility;
  catalogDetail?: string;
  onChange: (visibility: ModelVisibility) => void;
}) {
  const rows = useMemo(
    () =>
      buildModelVisibilityRows({
        providerId: args.providerId,
        options: args.options,
        visibility: args.visibility,
      }),
    [args.options, args.providerId, args.visibility],
  );
  const overrideCount = Object.keys(
    args.visibility[args.providerId] ?? {},
  ).length;
  const visibleCount = rows.filter((row) => row.visible).length;

  if (rows.length === 0) {
    return (
      <p className={sx(styles.emptyPanel)}>
        {args.catalogDetail ||
          `No ${getProviderLabel({ providerId: args.providerId })} models are available yet. Sign in to the runtime, then reopen this section.`}
      </p>
    );
  }

  return (
    <div className={sx(styles.panel)}>
      <div className={sx(styles.panelHead)}>
        <p className={sx(styles.panelSummary)}>
          {visibleCount} of {rows.length} shown by default
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={overrideCount === 0}
          onClick={() =>
            args.onChange(
              clearProviderModelVisibility({
                visibility: args.visibility,
                providerId: args.providerId,
              }),
            )
          }
          xstyle={styles.resetButton}
        >
          <RotateCcw className={sx(styles.resetIcon)} aria-hidden="true" />
          Reset to current models
        </Button>
      </div>
      <ul className={sx(styles.list)}>
        {rows.map((row) => (
          <li
            key={row.key}
            data-model-visibility-row={row.key}
            className={sx(styles.listItem)}
          >
            <div className={sx(styles.rowMain)}>
              <ModelIcon
                providerId={row.option.providerId}
                model={row.option.model}
                className={sx(styles.rowIcon)}
              />
              <div className={sx(styles.rowLabelWrap)}>
                <p className={sx(styles.rowLabel)}>{row.label}</p>
                {row.key.toLowerCase() === row.label.toLowerCase() ? null : (
                  <p className={sx(styles.rowKey)}>{row.key}</p>
                )}
              </div>
              {row.current ? (
                <Badge variant="secondary" className={sx(styles.rowBadge)}>
                  Current
                </Badge>
              ) : row.visible ? (
                <Badge variant="outline" className={sx(styles.rowBadge)}>
                  Pinned
                </Badge>
              ) : null}
            </div>
            <Switch
              checked={row.visible}
              aria-label={`Show ${row.label} in the model selector`}
              onCheckedChange={(checked) =>
                args.onChange(
                  setModelVisibilityOverride({
                    visibility: args.visibility,
                    providerId: args.providerId,
                    model: row.option.model,
                    // Matching the baseline again drops the override instead of
                    // freezing today's baseline into stored state.
                    visible: checked === row.current ? undefined : checked,
                  }),
                )
              }
              className={sx(styles.rowSwitch)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Per-provider control over which models the composer's model selector lists.
 *
 * The selector's default is the current model per lineage, because a runtime
 * catalog can advertise its entire history and listing all of it turns the
 * picker into an archive. This card is where that default is overridden in
 * either direction; nothing here removes a model from search or from the
 * selector's "Show all models" expansion.
 */
export function SettingsModelVisibilitySection() {
  const [
    modelVisibility,
    codexBinaryPath,
    cursorBinaryPath,
    kiroBinaryPath,
    workspaceCwd,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.modelVisibility,
          state.settings.codexBinaryPath,
          state.settings.cursorBinaryPath,
          state.settings.kiroBinaryPath,
          state.workspacePathById[state.activeWorkspaceId] ??
            state.projectPath ??
            undefined,
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const [activeProviderId, setActiveProviderId] = useState<ProviderId>(
    PROVIDER_IDS[0] ?? "claude-code",
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
  const optionsByProvider = useMemo(() => {
    const enrichmentByModel = new Map<string, ModelEnrichment>();
    for (const providerId of PROVIDER_IDS) {
      for (const entry of modelCatalogs.catalogs[providerId].entries) {
        const model = entry.model.trim();
        if (model) {
          enrichmentByModel.set(`${providerId}:${model}`, {
            ...(entry.displayName ? { label: entry.displayName } : {}),
            ...(entry.description ? { description: entry.description } : {}),
            ...(entry.isDefault ? { isDefault: true } : {}),
            ...(entry.defaultEffort
              ? { defaultEffort: entry.defaultEffort }
              : {}),
            supportedEfforts: entry.supportedEfforts,
          });
        }
      }
    }
    const options = buildModelSelectorOptions({
      providerIds: PROVIDER_IDS,
      modelsByProvider: Object.fromEntries(
        PROVIDER_IDS.map((providerId) => [
          providerId,
          modelCatalogs.catalogs[providerId].models,
        ]),
      ),
      enrichmentByModel,
    });
    return new Map(
      PROVIDER_IDS.map((providerId) => [
        providerId,
        options.filter((option) => option.providerId === providerId),
      ]),
    );
  }, [modelCatalogs.catalogs]);

  return (
    <SettingsCard
      id="settings-field-model-visibility"
      tabIndex={-1}
      title="Selector Models"
      description="The model selector lists the current model of each family by default. Turn a model on to pin it into that list, or off to keep it out. Search and the selector's “Show all models” expansion still reach every catalog model."
      titleAccessory={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={Object.keys(modelVisibility).length === 0}
          onClick={() => updateSettings({ patch: { modelVisibility: {} } })}
          xstyle={styles.titleResetButton}
        >
          <RotateCcw className={sx(styles.resetIcon)} aria-hidden="true" />
          Reset all providers
        </Button>
      }
    >
      <Tabs
        value={activeProviderId}
        onValueChange={(value) => setActiveProviderId(value as ProviderId)}
      >
        <TabsList
          aria-label="Model visibility provider"
          className={sx(styles.tabsList)}
        >
          {PROVIDER_IDS.map((providerId) => (
            <TabsTrigger
              key={providerId}
              value={providerId}
              className={sx(styles.tabsTrigger)}
            >
              <ModelIcon
                providerId={providerId}
                className={sx(styles.tabIcon)}
              />
              {getProviderLabel({ providerId })}
            </TabsTrigger>
          ))}
        </TabsList>
        {PROVIDER_IDS.map((providerId) => (
          <TabsContent
            key={providerId}
            value={providerId}
            className={sx(styles.tabsContent)}
          >
            <ModelVisibilityProviderPanel
              providerId={providerId}
              options={optionsByProvider.get(providerId) ?? []}
              visibility={modelVisibility}
              catalogDetail={modelCatalogs.catalogs[providerId].detail}
              onChange={(visibility) =>
                updateSettings({ patch: { modelVisibility: visibility } })
              }
            />
          </TabsContent>
        ))}
      </Tabs>
    </SettingsCard>
  );
}
