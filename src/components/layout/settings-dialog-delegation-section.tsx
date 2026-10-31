import { I18N_NAMESPACES, useTranslation, i18n } from "@/i18n";
import { Badge } from "@/components/ui";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { DraftInput, LabeledField, SettingsCard, readInt } from "@/components/layout/settings-dialog.shared";
import { delegationStyles } from "./settings-dialog-delegation-section.styles";
import { SettingsAdvancedDisclosure } from "./settings-dialog-advanced-disclosure";
import { DELEGATION_FIELD_ID } from "./settings-dialog-providers-focus";
import { settingsSectionsStyles } from "./settings-dialog-sections.styles";
import { TEAM_LIMITS, clampTeamLimit } from "@/lib/agent-runs/resources";
import {
  resolveLocalMcpReadiness,
  useLocalMcpReadiness,
} from "@/lib/local-mcp-readiness";
import {
  getProviderLabel,
  listProviderIdsForCapability,
} from "@/lib/providers/model-catalog";
import { STAVE_OPEN_SETTINGS_EVENT, useAppStore } from "@/store/app.store";

/**
 * How many helper Agents one Agent run can call. A run freezes these when it
 * starts, beside its shared turn budget (its max turns), so a change applies
 * to the runs that start after it.
 */
function TeamLimitFields() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const concurrent = useAppStore((state) => state.settings.agentRunConcurrentHelpers);
  const total = useAppStore((state) => state.settings.agentRunTotalHelpers);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const fields = [
    { key: "concurrentHelpers" as const, setting: "agentRunConcurrentHelpers" as const, value: clampTeamLimit("concurrentHelpers", concurrent) },
    { key: "totalHelpers" as const, setting: "agentRunTotalHelpers" as const, value: clampTeamLimit("totalHelpers", total) },
  ];
  return fields.map((field) => (
    <LabeledField
      key={field.key}
      title={t(`settingsProviders:delegationSection.teamLimits.${field.key}.title`)}
      description={t(`settingsProviders:delegationSection.teamLimits.${field.key}.description`, {
        min: TEAM_LIMITS[field.key].min, max: TEAM_LIMITS[field.key].max, value: TEAM_LIMITS[field.key].default })}
    >
      <DraftInput
        xstyle={settingsSectionsStyles.input40}
        type="number"
        min={TEAM_LIMITS[field.key].min}
        max={TEAM_LIMITS[field.key].max}
        data-testid={`team-limit-${field.key}`}
        value={String(field.value)}
        onCommit={(next) => updateSettings({ patch: { [field.setting]: clampTeamLimit(field.key, readInt(next, field.value)) } })}
      />
    </LabeledField>
  ));
}

/**
 * Delegation has no arming control: the agent decides to delegate mid-turn
 * from the tools it was given. The card says in one line per provider whether
 * that would work right now, so a broken Local MCP link is not mistaken for an
 * agent that chose not to delegate. The helper limits for Agent runs sit
 * folded below; their defaults suit most work.
 */
export function SettingsDelegationSection() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const providerIds = listProviderIdsForCapability({
    capability: "unattendedRuns",
  });
  const { status } = useLocalMcpReadiness({
    // No task context here, so readiness is resolved per provider below rather
    // than for one "current" primary.
    primaryProviderId: "claude-code",
  });
  const readinessByProvider = providerIds.map((providerId) => ({
    providerId,
    readiness: resolveLocalMcpReadiness({
      status,
      primaryProviderId: providerId,
    }),
  }));
  const blocked = readinessByProvider.filter(
    (entry) => entry.readiness.state === "unavailable",
  );
  const unknown = readinessByProvider.some(
    (entry) => entry.readiness.state === "unknown",
  );
  // Every provider is blocked by the same server, so its reason shows once.
  const blockedDetail = blocked.find((entry) => entry.readiness.detail)?.readiness.detail;

  return (
    <SettingsCard
      id={DELEGATION_FIELD_ID}
      tabIndex={-1}
      title={t("settingsProviders:delegationSection.title")}
      description={t("settingsProviders:delegationSection.description")}
      titleAccessory={
        <Badge
          variant={
            unknown
              ? "outline"
              : blocked.length === providerIds.length
                ? "destructive"
                : blocked.length > 0
                  ? "warning"
                  : "secondary"
          }
        >
          {unknown
            ? t("settingsProviders:delegationSection.badge.checking")
            : blocked.length === providerIds.length
              ? t("settingsProviders:toolingSection.state.error")
              : blocked.length > 0
                ? t("settingsProviders:delegationSection.badge.partial")
                : t("settingsProviders:delegationSection.badge.available")}
        </Badge>
      }
    >
      <div data-testid="delegation-readiness" className={sx(delegationStyles.status)}>
        <ul className={sx(delegationStyles.list)}>
          {readinessByProvider.map((entry) => (
            <li key={entry.providerId} data-delegation-provider={entry.providerId}>
              <span className={sx(delegationStyles.emphasis)}>
                {t("settings:whole.providerTasks", { provider: getProviderLabel({ providerId: entry.providerId }) })}
              </span>{" "}
              {entry.readiness.state === "ready"
                ? i18n.t("settingsProviders:delegationSection.availability.ready")
                : entry.readiness.state === "unknown"
                  ? i18n.t("settingsProviders:delegationSection.availability.checking")
                  : <span className={sx(delegationStyles.blocked)}>{i18n.t("settingsProviders:delegationSection.availability.blocked")}</span>}
            </li>
          ))}
        </ul>
        {blocked.length > 0 ? (
          <p className={sx(delegationStyles.blockedDetail)}>
            {blockedDetail}{" "}
            <Button
              type="button"
              variant="link"
              flushInline
              data-testid="delegation-open-mcp-settings"
              xstyle={delegationStyles.openSettingsLink}
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent(STAVE_OPEN_SETTINGS_EVENT, {
                    detail: { section: "mcp" },
                  }),
                );
              }}
            >
              {t("settingsProviders:delegationSection.availability.openSettings")}
            </Button>
          </p>
        ) : null}
      </div>
      <SettingsAdvancedDisclosure
        compact
        title={t("settingsProviders:delegationSection.advanced.title")}
        description={t("settingsProviders:delegationSection.advanced.description")}
      >
        <TeamLimitFields />
      </SettingsAdvancedDisclosure>
    </SettingsCard>
  );
}
