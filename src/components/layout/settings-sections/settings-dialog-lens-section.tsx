import { I18N_NAMESPACES, Trans, useTranslation, i18n } from "@/i18n";
import { useCallback, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Badge, Input, toast } from "@/components/ui";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { settingsSectionsStyles as styles } from "../settings-dialog-sections.styles";
import {
  LensAgentPresentationMode,
  LensSessionScope,
} from "@/lib/lens/lens.types";
import { normalizeLensHostEntry } from "@/lib/lens/lens-security";
import { useAppStore } from "@/store/app.store";
import { LensCredentialsSettingsCard } from "../settings-dialog-lens-credentials";
import {
  ChoiceButtons,
  LabeledField,
  SectionStack,
  SettingsCard,
  SwitchField,
} from "../settings-dialog.shared";
import { DraftTextarea } from "../settings-dialog.shared";

function parseLensHostList(value: string): string[] {
  const seen = new Set<string>();
  const hosts: string[] = [];

  for (const line of value.split("\n")) {
    const host = line.trim().toLowerCase();
    if (!host || seen.has(host)) {
      continue;
    }
    seen.add(host);
    hosts.push(host);
  }

  return hosts;
}

function formatLensHostList(hosts: readonly string[]): string {
  return hosts.join("\n");
}

export function LensSection() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const [
    heuristic,
    reactDebugSource,
    sessionScope,
    agentPresentationMode,
    developerModeCdp,
    visualCommentScreenshotsAsImageContext,
    cdpApprovedHosts,
    allowedHosts,
    blockedHosts,
    activeWorkspaceId,
    repositoryPath,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.lensSourceMappingHeuristic,
          state.settings.lensSourceMappingReactDebugSource,
          state.settings.lensSessionScope,
          state.settings.lensAgentPresentationMode,
          state.settings.lensDeveloperModeCdp,
          state.settings.lensVisualCommentScreenshotsAsImageContext,
          state.settings.lensCdpApprovedHosts,
          state.settings.lensAllowedHosts,
          state.settings.lensBlockedHosts,
          state.activeWorkspaceId,
          state.repositoryPath,
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const [clearingScope, setClearingScope] = useState<LensSessionScope | null>(
    null,
  );
  const [cdpHostDraft, setCdpHostDraft] = useState("");
  const allowedHostsText = useMemo(
    () => formatLensHostList(allowedHosts),
    [allowedHosts],
  );
  const blockedHostsText = useMemo(
    () => formatLensHostList(blockedHosts),
    [blockedHosts],
  );
  const clearLensSessionData = useCallback(
    async (scope: LensSessionScope) => {
      if (!activeWorkspaceId) {
        toast.error(i18n.t("settings:lensSection.toasts.selectWorkspace"));
        return;
      }

      const clearSessionData = window.api?.lens?.clearSessionData;
      if (!clearSessionData) {
        toast.error(i18n.t("settings:lensSection.toasts.controlsUnavailable"));
        return;
      }

      setClearingScope(scope);
      try {
        const result = await clearSessionData({
          workspaceId: activeWorkspaceId,
          sessionScope: scope,
          repositoryKey: repositoryPath,
        });
        if (!result.ok) {
          toast.error(i18n.t("settings:lensSection.toasts.clearFailed"), {
            description: result.message,
          });
          return;
        }
        toast.success(
          scope === "project"
            ? i18n.t("settings:lensSection.toasts.repositoryCleared")
            : i18n.t("settings:lensSection.toasts.workspaceCleared"),
        );
      } catch (err) {
        toast.error(i18n.t("settings:lensSection.toasts.clearFailed"), {
          description: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setClearingScope(null);
      }
    },
    [activeWorkspaceId, repositoryPath],
  );
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
    <SectionStack>
      <SettingsCard
        title={t("settings:lensSection.session.title")}
        description={t("settings:lensSection.session.description")}
      >
        <ChoiceButtons<LensSessionScope>
          value={sessionScope}
          columns={2}
          options={[
            {
              value: "project",
              label: t("settings:lensSection.session.repositoryProfile.label"),
              description:
                t("settings:lensSection.session.repositoryProfile.description"),
            },
            {
              value: "workspace",
              label: t("settings:lensSection.session.workspaceIsolated.label"),
              description:
                t("settings:lensSection.session.workspaceIsolated.description"),
            },
          ]}
          onChange={(value) =>
            updateSettings({ patch: { lensSessionScope: value } })
          }
        />
        <div className={sx(styles.clearButtonsGrid)}>
          <Button
            type="button"
            variant="soft"
            tone="danger"
            size="sm"
            disabled={
              !activeWorkspaceId || !repositoryPath || clearingScope !== null
            }
            onClick={() => {
              void clearLensSessionData("project");
            }}
            xstyle={styles.clearButton}
          >
            {clearingScope === "project" ? (
              <Loader2 className={sx(styles.spinIcon)} />
            ) : (
              <Trash2 className={sx(styles.iconSm)} />
            )}
            {t("settings:lensSection.session.clearRepositoryData")}</Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!activeWorkspaceId || clearingScope !== null}
            onClick={() => {
              void clearLensSessionData("workspace");
            }}
            xstyle={styles.clearButton}
          >
            {clearingScope === "workspace" ? (
              <Loader2 className={sx(styles.spinIcon)} />
            ) : (
              <Trash2 className={sx(styles.iconSm)} />
            )}
            {t("settings:lensSection.session.clearWorkspaceData")}</Button>
        </div>
      </SettingsCard>
      <SettingsCard
        title={t("settings:lensSection.agentActivity.title")}
        description={t("settings:lensSection.agentActivity.description")}
      >
        <ChoiceButtons<LensAgentPresentationMode>
          value={agentPresentationMode}
          columns={3}
          options={[
            {
              value: "split-right",
              label: t("settings:lensSection.agentActivity.splitRight.label"),
              description:
                t("settings:lensSection.agentActivity.splitRight.description"),
            },
            {
              value: "background-tab",
              label: t("settings:lensSection.agentActivity.backgroundTab.label"),
              description:
                t("settings:lensSection.agentActivity.backgroundTab.description"),
            },
            {
              value: "agent-decides",
              label: t("settings:lensSection.agentActivity.agentDecides.label"),
              description:
                t("settings:lensSection.agentActivity.agentDecides.description"),
            },
          ]}
          onChange={(value) =>
            updateSettings({
              patch: { lensAgentPresentationMode: value },
            })
          }
        />
      </SettingsCard>
      <LensCredentialsSettingsCard />
      <SettingsCard
        title={t("settings:lensSection.sourceMapping.title")}
        description={t("settings:lensSection.sourceMapping.description")}
      >
        <SwitchField
          title={t("settings:lensSection.sourceMapping.heuristic.title")}
          description={t("settings:lensSection.sourceMapping.heuristic.description")}
          checked={heuristic}
          onCheckedChange={(checked) =>
            updateSettings({
              patch: { lensSourceMappingHeuristic: checked },
            })
          }
        />
        <SwitchField
          title={t("settings:settingsDialogLensSection.reactDebugSource")}
          description={t("settings:lensSection.sourceMapping.reactDebugSource.description")}
          checked={reactDebugSource}
          onCheckedChange={(checked) =>
            updateSettings({
              patch: { lensSourceMappingReactDebugSource: checked },
            })
          }
        />
      </SettingsCard>
      <SettingsCard
        title={t("settings:lensSection.visualComments.title")}
        description={t("settings:lensSection.visualComments.description")}
      >
        <SwitchField
          title={t("settings:lensSection.visualComments.screenshots.title")}
          description={t("settings:lensSection.visualComments.screenshots.description")}
          checked={visualCommentScreenshotsAsImageContext}
          onCheckedChange={(checked) =>
            updateSettings({
              patch: {
                lensVisualCommentScreenshotsAsImageContext: checked,
              },
            })
          }
        />
      </SettingsCard>
      <SettingsCard
        title={t("settings:lensSection.developerMode.title")}
        description={t("settings:lensSection.developerMode.description")}
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
                </Badge>
              ))}
            </div>
          ) : (
            <p className={sx(styles.captionMuted)}>
              {t("settings:lensSection.developerMode.noHosts")}</p>
          )}
        </div>
      </SettingsCard>
      <SettingsCard
        title={t("settings:lensSection.siteAccess.title")}
        description={t("settings:lensSection.siteAccess.description")}
      >
        <LabeledField
          title={t("settings:lensSection.siteAccess.allowed.title")}
          description={t("settings:lensSection.siteAccess.allowed.description")}
        >
          <DraftTextarea
            value={allowedHostsText}
            placeholder={"example.com\napp.example.com"}
            rows={4}
            onCommit={(value) =>
              updateSettings({
                patch: { lensAllowedHosts: parseLensHostList(value) },
              })
            }
          />
        </LabeledField>
        <LabeledField
          title={t("settings:lensSection.siteAccess.blocked.title")}
          description={t("settings:lensSection.siteAccess.blocked.description")}
        >
          <DraftTextarea
            value={blockedHostsText}
            placeholder={"example.org\nstaging.example.com"}
            rows={4}
            onCommit={(value) =>
              updateSettings({
                patch: { lensBlockedHosts: parseLensHostList(value) },
              })
            }
          />
        </LabeledField>
      </SettingsCard>
    </SectionStack>
  );
}
