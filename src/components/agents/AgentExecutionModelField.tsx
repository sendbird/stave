import { useMemo } from "react";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ads/components/Button";
import { ModelSelector, buildModelSelectorValue } from "@/components/ai-elements/model-selector";
import { useSettingsModelSelectorOptions } from "@/components/layout/settings-dialog-model-fields";
import type { ProviderId } from "@/lib/providers/provider.types";
import { sx } from "@/components/ads/utils/stylex";
import { accountStyles } from "@/components/layout/provider-accounts.styles";

/** Fixed Agent models use the same account catalog and searchable picker as the composer. */
export function AgentExecutionModelField(props: { providerId: ProviderId; model?: string; onChange: (model?: string) => void }) {
  const { t } = useTranslation("agents");
  const providerIds = useMemo(() => [props.providerId], [props.providerId]);
  const { options } = useSettingsModelSelectorOptions({ providerIds });
  return <div className={sx(accountStyles.stackTight)}>
    <ModelSelector options={options} value={buildModelSelectorValue({ providerId: props.providerId, model: props.model ?? "" })}
      triggerAriaLabel={t("agentEditor.ariaLabel8")} onSelect={({ selection }) => props.onChange(selection.model)} />
    <Button variant="quiet" size="sm" onClick={() => props.onChange(undefined)}>{t("agentEditor.label3")}</Button>
  </div>;
}
