import { I18N_NAMESPACES, Trans, useTranslation, i18n } from "@/i18n";
import { Badge } from "@/components/ui";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { SettingsCard } from "@/components/layout/settings-dialog.shared";
import { delegationStyles } from "./settings-dialog-delegation-section.styles";
import {
  resolveLocalMcpReadiness,
  useLocalMcpReadiness,
} from "@/lib/local-mcp-readiness";
import {
  getProviderLabel,
  listProviderIdsForCapability,
} from "@/lib/providers/model-catalog";
import { STAVE_OPEN_SETTINGS_EVENT } from "@/store/app.store";

/**
 * Each knob a delegation carries, and what it does when the agent leaves it
 * out. This is a *reference*, not a form: delegation parameters are per call,
 * and what a call leaves out follows the delegating task — its provider,
 * effort and permissions, which the agent can see — never a global default
 * hidden from the agent when it decides what to ask for.
 */
const DELEGATION_PARAMETERS: ReadonlyArray<{
  name: string;
  required: boolean;
  detail: string;
}> = [
  {
    name: "prompt",
    required: true,
    get detail() { return i18n.t("settingsProviders:delegationSection.parameters.prompt"); },
  },
  {
    name: "access",
    required: false,
    get detail() { return i18n.t("settingsProviders:delegationSection.parameters.access"); },
  },
  {
    name: "provider",
    required: false,
    get detail() { return i18n.t("settingsProviders:delegationSection.parameters.provider"); },
  },
  {
    name: "lifecycle",
    required: false,
    get detail() { return i18n.t("settingsProviders:delegationSection.parameters.lifecycle"); },
  },
  {
    name: "workspace",
    required: false,
    get detail() { return i18n.t("settingsProviders:delegationSection.parameters.workspace"); },
  },
  {
    name: "model",
    required: false,
    get detail() { return i18n.t("settingsProviders:delegationSection.parameters.model"); },
  },
  {
    name: "effort",
    required: false,
    get detail() { return i18n.t("settingsProviders:delegationSection.parameters.effort"); },
  },
];

/**
 * Delegation is the one capability here with no arming control: the agent
 * decides to delegate, mid-turn, from the tools it was given. That makes it
 * invisible until it happens — a user who never hears the words "delegated task"
 * has no way to learn the feature exists, and no way to tell a broken Local MCP
 * link from an agent that simply chose not to delegate.
 *
 * So this card is deliberately read-only. It answers the two questions the
 * absent UI leaves open: what can be asked for, and would it work right now.
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

  return (
    <SettingsCard
      id="settings-field-delegation"
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
      <div
        data-testid="delegation-readiness"
        className={sx(delegationStyles.panel)}
      >
        <p className={sx(delegationStyles.panelHeading)}>{t("settingsProviders:delegationSection.availability.heading")}</p>
        <ul className={sx(delegationStyles.list)}>
          {readinessByProvider.map((entry) => (
            <li key={entry.providerId}>
              <span className={sx(delegationStyles.emphasis)}>
                {t("settings:whole.providerTasks", { provider: getProviderLabel({ providerId: entry.providerId }) })}
              </span>{" "}
              {entry.readiness.state === "ready"
                ? i18n.t("settingsProviders:delegationSection.availability.ready")
                : entry.readiness.state === "unknown"
                  ? i18n.t("settingsProviders:delegationSection.availability.checking")
                  : entry.readiness.detail}
            </li>
          ))}
        </ul>
        <p className={sx(delegationStyles.paragraphSpaced)}>
          {t("settingsProviders:delegationSection.availability.note")}</p>
        <Button
          type="button"
          variant="link"
          flushInline
          data-testid="delegation-open-developer-settings"
          xstyle={delegationStyles.openSettingsLink}
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent(STAVE_OPEN_SETTINGS_EVENT, {
                detail: { section: "developer" },
              }),
            );
          }}
        >
          {t("settingsProviders:delegationSection.availability.openSettings")}</Button>
      </div>

      <div className={sx(delegationStyles.panel)}>
        <p className={sx(delegationStyles.panelHeading)}>
          {t("settingsProviders:delegationSection.asking.heading")}</p>
        <p className={sx(delegationStyles.paragraphTight)}><Trans t={t} i18nKey="settings:whole.delegationGuide" components={{ code: <code className={sx(delegationStyles.code)} />, em: <span className={sx(delegationStyles.emphasis)} /> }} /></p>
        <ul className={sx(delegationStyles.detailList)}>
          {DELEGATION_PARAMETERS.map((parameter) => (
            <li key={parameter.name}>
              <code className={sx(delegationStyles.codeInline)}>
                {parameter.name}
              </code>{" "}
              <span className={sx(delegationStyles.requiredTag)}>
                {parameter.required ? i18n.t("settingsProviders:delegationSection.asking.required") : i18n.t("settingsProviders:delegationSection.asking.optional")}
              </span>{" "}
              — {parameter.detail}
            </li>
          ))}
        </ul>
        <p className={sx(delegationStyles.paragraphSpaced)}>{t("settings:whole.delegationActivity")}</p>
      </div>
    </SettingsCard>
  );
}
