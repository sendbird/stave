import { useLayoutEffect, useMemo, useState } from "react";
import { applyAppLocale, useTranslation } from "@/i18n";
import { applyThemeClass } from "@/lib/themes/apply";
import { ModelEffortSelector } from "@/components/ai-elements/model-effort-selector";
import {
  buildAutoModelSelectorOption,
  buildModelSelectorOptions,
  type ModelSelectorOption,
} from "@/components/ai-elements/model-selector.utils";
import { sx } from "@/components/aui/utils/stylex";
import { STANCE_LABELS } from "@/lib/providers/auto-routing-profile";
import { listProviderIds } from "@/lib/providers/model-catalog";
import { useAppStore } from "@/store/app.store";
import { previewStyles as styles } from "./preview.styles";

/**
 * Renders the real selector, not a replica, so the Auto rail tab and its
 * profile panel are checked in the component that ships.
 */
export function ModelAutoTabPreview() {
  const { t } = useTranslation(["composer"]);
  useLayoutEffect(() => {
    const params = new URLSearchParams(window.location.search);
    applyAppLocale(params.get("lang") === "ko" ? "ko" : "en");
    applyThemeClass({ enabled: params.get("theme") === "dark" });
    document.documentElement.dataset.uiDensity = params.get("density") === "compact" ? "compact" : "regular";
  }, []);
  const stance = useAppStore((state) => state.settings.autoRoutingProfile.stance);
  const rowsPreview = new URLSearchParams(window.location.search).get("modelRows") === "true";
  const options = useMemo<ModelSelectorOption[]>(() => [
    ...buildModelSelectorOptions({ providerIds: listProviderIds() }),
    ...(rowsPreview ? [{ key: "opencode:fable", providerId: "opencode" as const, model: "claude-fable-5-2", label: "Claude Fable 5.2",
      description: t("composer:modelSelectorUtils.extraCopy63"), available: true }] : []),
  ], [rowsPreview, t]);
  const autoOption = useMemo(
    () =>
      buildAutoModelSelectorOption({
        providerId: "claude-code",
        available: true,
        stanceLabel: STANCE_LABELS[stance],
      }),
    [stance],
  );
  const allOptions = useMemo(
    () => [...options, autoOption],
    [autoOption, options],
  );
  const [value, setValue] = useState<ModelSelectorOption>(
    () => (rowsPreview ? options.at(-1) : options[0]) ?? autoOption,
  );
  const selected = value.isAuto ? autoOption : value;

  return (
    <div className={sx(styles.page)}>
      <h1 className={sx(styles.heading)}>Stave Auto as a model-selector tab</h1>
      <p className={sx(styles.lede)}>
        Auto left the search row and became the last rail tab, below every
        provider. Its panel drops the model search and puts the profile picker
        where a provider tab puts its effort control.
      </p>
      <div className={sx(styles.stage)}>
        <ModelEffortSelector
          value={selected}
          options={allOptions}
          onSelect={({ selection }) => setValue(selection)}
        />
        <span className={sx(styles.readout)}>
          selected: {selected.isAuto ? `auto (${STANCE_LABELS[stance]})` : selected.key}
        </span>
      </div>
    </div>
  );
}
