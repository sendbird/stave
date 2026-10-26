import { ChevronRight } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import { Badge } from "@/components/ui";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import {
  providerBrowserModeSettingsPatch,
  resolveProviderBrowserMode,
  type ProviderBrowserMode,
} from "@/lib/provider-browser";
import { WORKSPACE_INFORMATION_REFERENCE_SECTIONS } from "@/lib/workspace-information-references";
import { useAppStore } from "@/store/app.store";
import type { SettingsI18nKey, SectionId } from "../settings-dialog.schema";
import { SectionStack, SettingsCard } from "../settings-dialog.shared";
import { ProviderBrowserAccessSettingsCard } from "../ProviderBrowserAccessSettingsCard";
import { mentionsSectionStyles as styles } from "./settings-dialog-mentions-section.styles";

const BROWSER_MODE_STATUS_KEYS = {
  explicit: "settings:mentionsSection.webStatus.explicit",
  auto: "settings:mentionsSection.webStatus.auto",
  always: "settings:mentionsSection.webStatus.always",
} as const satisfies Record<ProviderBrowserMode, SettingsI18nKey>;

/** `@lens` and `@web` have their own tokens; the rest go through `@info:`. */
const INFO_SECTION_MENTIONS = WORKSPACE_INFORMATION_REFERENCE_SECTIONS.filter(
  (section) => section !== "lens" && section !== "web",
).map((section) => `@info:${section}`);

function MentionRow(args: {
  mention: string;
  name: string;
  description: string;
  status: string;
  statusTone?: "accent" | "neutral";
  aliases?: readonly string[];
  action?: { label: string; onClick: () => void };
}) {
  return (
    <li className={sx(styles.row)}>
      <div className={sx(styles.body)}>
        <div className={sx(styles.head)}>
          <code className={sx(styles.mention)}>{args.mention}</code>
          <span className={sx(styles.name)}>{args.name}</span>
          <Badge variant={args.statusTone === "accent" ? "secondary" : "outline"}>
            {args.status}
          </Badge>
        </div>
        <p className={sx(styles.description)}>{args.description}</p>
        {args.aliases && args.aliases.length > 0 ? (
          <div className={sx(styles.aliases)}>
            {args.aliases.map((alias) => (
              <code key={alias} className={sx(styles.alias)}>
                {alias}
              </code>
            ))}
          </div>
        ) : null}
      </div>
      {args.action ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          xstyle={styles.action}
          onClick={args.action.onClick}
        >
          {args.action.label}
          <ChevronRight aria-hidden className={sx(styles.actionIcon)} />
        </Button>
      ) : null}
    </li>
  );
}

/** Reference list of every `@` prompt mention and its current status. */
export function PromptMentionsCard(args: {
  browserMode: ProviderBrowserMode;
  onNavigateSection?: (id: SectionId) => void;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const browserMode = args.browserMode;
  const navigate = args.onNavigateSection;

  return (
    <SettingsCard
      id="settings-field-prompt-mentions"
      title={t("settings:mentionsSection.title")}
      description={t("settings:mentionsSection.description")}
    >
      <ul className={sx(styles.list)}>
        <MentionRow
          mention="@web"
          name={t("settings:mentionsSection.web.name")}
          description={t("settings:mentionsSection.web.description")}
          status={t(BROWSER_MODE_STATUS_KEYS[browserMode])}
          statusTone={browserMode === "explicit" ? "neutral" : "accent"}
        />
        <MentionRow
          mention="@lens"
          name={t("settings:mentionsSection.lens.name")}
          description={t("settings:mentionsSection.lens.description")}
          status={t("settings:mentionsSection.alwaysAvailable")}
          action={
            navigate
              ? {
                  label: t("settings:mentionsSection.lens.action"),
                  onClick: () => navigate("lens"),
                }
              : undefined
          }
        />
        <MentionRow
          mention="@info"
          name={t("settings:mentionsSection.info.name")}
          description={t("settings:mentionsSection.info.description")}
          status={t("settings:mentionsSection.alwaysAvailable")}
          aliases={INFO_SECTION_MENTIONS}
        />
      </ul>
    </SettingsCard>
  );
}

/**
 * One place for every `@` prompt mention: what each one does, whether it is
 * active, and the options that change how far Stave acts without it.
 */
export function MentionsSection(args: {
  onNavigateSection?: (id: SectionId) => void;
}) {
  const [autoFallback, alwaysOn, autoFallbackDomains] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.providerBrowserAutoFallback,
          state.settings.providerBrowserAlwaysOn,
          state.settings.providerBrowserAutoFallbackDomains,
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const browserMode = resolveProviderBrowserMode({ autoFallback, alwaysOn });

  return (
    <SectionStack>
      <PromptMentionsCard
        browserMode={browserMode}
        onNavigateSection={args.onNavigateSection}
      />
      <ProviderBrowserAccessSettingsCard
        mode={browserMode}
        onModeChange={(mode) =>
          updateSettings({ patch: providerBrowserModeSettingsPatch(mode) })
        }
        autoFallbackDomains={autoFallbackDomains}
        onAutoFallbackDomainsChange={(value) =>
          updateSettings({
            patch: { providerBrowserAutoFallbackDomains: value },
          })
        }
      />
    </SectionStack>
  );
}
