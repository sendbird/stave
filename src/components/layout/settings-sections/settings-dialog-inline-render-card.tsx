import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import {
  normalizeInlineRenderNetworkPolicy,
  type InlineRenderNetworkPolicy,
} from "@/lib/inline-render/inline-render";
import { useAppStore } from "@/store/app.store";
import {
  ChoiceButtons,
  LabeledField,
  SettingsCard,
  SwitchField,
} from "../settings-dialog.shared";

/** Settings → Chat → Inline HTML pages: what an agent's page may load. */
export function InlineRenderSettingsCard() {
  const networkPolicy = useAppStore((state) =>
    normalizeInlineRenderNetworkPolicy(state.settings.inlineRenderNetworkPolicy),
  );
  const mcpAppViewsEnabled = useAppStore((state) => state.settings.mcpAppViewsEnabled !== false);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const { t } = useTranslation(I18N_NAMESPACES);

  return (
    <SettingsCard
      title={t("settings:chatSection.inlineRenders.title")}
      description={t("settings:chatSection.inlineRenders.description")}
    >
      <LabeledField
        layout="stacked"
        title={t("settings:chatSection.inlineRenders.network.title")}
        description={t("settings:chatSection.inlineRenders.network.description")}
      >
        <ChoiceButtons<InlineRenderNetworkPolicy>
          columns={3}
          value={networkPolicy}
          onChange={(value) =>
            updateSettings({ patch: { inlineRenderNetworkPolicy: value } })
          }
          options={[
            {
              value: "open",
              label: t("settings:chatSection.inlineRenders.network.open.label"),
              description: t("settings:chatSection.inlineRenders.network.open.description"),
            },
            {
              value: "cdn",
              label: t("settings:chatSection.inlineRenders.network.cdn.label"),
              description: t("settings:chatSection.inlineRenders.network.cdn.description"),
            },
            {
              value: "blocked",
              label: t("settings:chatSection.inlineRenders.network.blocked.label"),
              description: t("settings:chatSection.inlineRenders.network.blocked.description"),
            },
          ]}
        />
      </LabeledField>
      <SwitchField
        title={t("settings:chatSection.inlineRenders.mcpAppViews.title")}
        description={t("settings:chatSection.inlineRenders.mcpAppViews.description")}
        checked={mcpAppViewsEnabled}
        onCheckedChange={(checked) =>
          updateSettings({ patch: { mcpAppViewsEnabled: checked } })
        }
      />
    </SettingsCard>
  );
}
