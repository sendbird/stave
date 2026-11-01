import { I18N_NAMESPACES, useTranslation, i18n } from "@/i18n";
import { useCallback, useMemo, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { toast } from "@/components/ui";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { settingsSectionsStyles as styles } from "../settings-dialog-sections.styles";
import {
  LensAgentPresentationMode,
  LensSessionScope,
} from "@/lib/lens/lens.types";
import { useAppStore } from "@/store/app.store";
import { LensCredentialsSettingsCard } from "../settings-dialog-lens-credentials";
import { SettingsAdvancedDisclosure } from "../settings-dialog-advanced-disclosure";
import { LensDeveloperModeCard } from "./settings-dialog-lens-developer-card";
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
    visualCommentScreenshotsAsImageContext,
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
          state.settings.lensVisualCommentScreenshotsAsImageContext,
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
        <SettingsAdvancedDisclosure
          compact
          title={t("settings:lensSection.sourceMapping.advanced.title")}
          description={t("settings:lensSection.sourceMapping.advanced.description")}
        >
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
        </SettingsAdvancedDisclosure>
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
      <LensDeveloperModeCard />
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
