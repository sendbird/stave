import { I18N_NAMESPACES, Trans, useTranslation, i18n } from "@/i18n";
import { useCallback, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Badge, Input, toast } from "@/components/ui";
import { Button } from "@/components/ads/components/Button";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { sx } from "@/components/ads/utils/stylex";
import { normalizeLensHostEntry } from "@/lib/lens/lens-security";
import { useAppStore } from "@/store/app.store";
import { settingsSectionsStyles as styles } from "../settings-dialog-sections.styles";
import { SettingsAdvancedDisclosure } from "../settings-dialog-advanced-disclosure";
import { SettingsCard, SwitchField } from "../settings-dialog.shared";

/**
 * Settings → Browser → Lens → Developer Mode: the CDP tools switch and the
 * hosts approved for CDP actions, folded into a closed Advanced disclosure.
 */
export function LensDeveloperModeCard() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const [developerModeCdp, cdpApprovedHosts] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.lensDeveloperModeCdp,
          state.settings.lensCdpApprovedHosts,
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const [cdpHostDraft, setCdpHostDraft] = useState("");
  const addCdpApprovedHost = useCallback(() => {
    const host = normalizeLensHostEntry(cdpHostDraft);
    if (!host) {
      toast.error(i18n.t("settings:lensSection.toasts.invalidHost"));
      return;
    }

    const alreadyApproved = cdpApprovedHosts.some(
      (entry) => normalizeLensHostEntry(entry) === host,
    );
    if (alreadyApproved) {
      toast.message(i18n.t("settings:lensSection.toasts.hostAlreadyApproved"), {
        description: host,
      });
      setCdpHostDraft("");
      return;
    }

    updateSettings({
      patch: {
        lensCdpApprovedHosts: [...cdpApprovedHosts, host],
      },
    });
    setCdpHostDraft("");
  }, [cdpApprovedHosts, cdpHostDraft, updateSettings]);

  return (
    <SettingsCard
      title={t("settings:lensSection.developerMode.title")}
      description={t("settings:lensSection.developerMode.description")}
    >
      <SettingsAdvancedDisclosure
        compact
        title={t("settings:lensSection.developerMode.advanced.title")}
        description={t("settings:lensSection.developerMode.advanced.description")}
      >
        <SwitchField
          title={t("settings:lensSection.developerMode.cdpTools.title")}
          description={t("settings:lensSection.developerMode.cdpTools.description")}
          checked={developerModeCdp}
          onCheckedChange={(checked) =>
            updateSettings({
              patch: { lensDeveloperModeCdp: checked },
            })
          }
        />
        <div className={sx(styles.spaceY2)}>
          <div className={sx(styles.cdpLabel)}>{t("settings:lensSection.developerMode.approvedHosts")}</div>
          <div className={sx(styles.cdpInputRow)}>
            <Input
              value={cdpHostDraft}
              placeholder={t("settings:lensSection.developerMode.hostPlaceholder")}
              aria-label={t("settings:lensSection.developerMode.hostAriaLabel")}
              xstyle={styles.input8Mono}
              onChange={(event) => setCdpHostDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addCdpApprovedHost();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              xstyle={styles.cdpAddButton}
              onClick={addCdpApprovedHost}
            >
              <Plus className={sx(styles.iconSm)} />
              {t("settings:lensSection.developerMode.addHost")}</Button>
          </div>
          <p className={sx(styles.cdpHelp)}><Trans t={t} i18nKey="settings:whole.lensHostScope" components={{ host: <code />, portA: <code />, portB: <code /> }} /></p>
          {cdpApprovedHosts.length > 0 ? (
            <div className={sx(styles.cdpHostList)}>
              {cdpApprovedHosts.map((host) => (
                <Badge
                  key={host}
                  variant="secondary"
                  className={sx(styles.cdpHostBadge)}
                >
                  <span className={sx(styles.cdpHostText)}>{host}</span>
                  <Tooltip content={i18n.t("settings:settingsDialogLensSection.remove", { value1: host })}>
                    <Button
                      type="button"
                      size="xs"
                      iconOnly
                      variant="quiet"
                      aria-label={i18n.t("settings:settingsDialogLensSection.remove", { value1: host })}
                      onClick={() =>
                        updateSettings({
                          patch: {
                            lensCdpApprovedHosts: cdpApprovedHosts.filter(
                              (entry) => entry !== host,
                            ),
                          },
                        })
                      }
                    >
                      <Trash2 className={sx(styles.iconXs)} />
                    </Button>
                  </Tooltip>
                </Badge>
              ))}
            </div>
          ) : (
            <p className={sx(styles.captionMuted)}>
              {t("settings:lensSection.developerMode.noHosts")}</p>
          )}
        </div>
      </SettingsAdvancedDisclosure>
    </SettingsCard>
  );
}
