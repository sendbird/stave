import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import { formatRelativeTimeShort } from "@/i18n/format";
import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { settingsSectionsStyles as styles } from "../settings-dialog-sections.styles";
import { useAppStore } from "@/store/app.store";
import { AsyncBoundary } from "@/components/system/AsyncBoundary";
import { skillCatalogLoadState } from "../skill-catalog-load-state";
import { SkillCatalogLists } from "./settings-dialog-skills-catalog";
import {
  DraftInput,
  LabeledField,
  SectionStack,
  SettingsCard,
  SwitchField,
} from "../settings-dialog.shared";

export function SkillsSection() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const [
    skillsEnabled,
    skillsAutoSuggest,
    sharedSkillsHome,
    skillCatalog,
    activeWorkspaceId,
    repositoryPath,
    workspacePathById,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.skillsEnabled,
          state.settings.skillsAutoSuggest,
          state.settings.sharedSkillsHome,
          state.skillCatalog,
          state.activeWorkspaceId,
          state.repositoryPath,
          state.workspacePathById,
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const refreshSkillCatalog = useAppStore((state) => state.refreshSkillCatalog);
  const workspacePath =
    workspacePathById[activeWorkspaceId] ?? repositoryPath ?? null;

  useEffect(() => {
    if (!skillsEnabled) {
      return;
    }
    const normalizedSharedSkillsHome = sharedSkillsHome.trim() || null;
    const catalogMatchesRequest =
      skillCatalog.workspacePath === workspacePath &&
      skillCatalog.sharedSkillsHome === normalizedSharedSkillsHome;

    if (catalogMatchesRequest) {
      if (
        skillCatalog.status === "loading" ||
        skillCatalog.status === "error"
      ) {
        return;
      }

      if (skillCatalog.status !== "ready") {
        void refreshSkillCatalog({ workspacePath });
        return;
      }

      const CATALOG_TTL_MS = 5 * 60 * 1000;
      const fetchedAtMs = skillCatalog.fetchedAt
        ? Date.parse(skillCatalog.fetchedAt)
        : 0;
      if (Date.now() - fetchedAtMs < CATALOG_TTL_MS) {
        return;
      }
    }

    void refreshSkillCatalog({ workspacePath });
  }, [
    refreshSkillCatalog,
    sharedSkillsHome,
    skillCatalog.status,
    skillCatalog.workspacePath,
    skillCatalog.sharedSkillsHome,
    skillCatalog.fetchedAt,
    skillsEnabled,
    workspacePath,
  ]);

  return (
    <SectionStack>
      <SettingsCard
        title={t("settingsProviders:codexExtensionsTab.skills")}
        description={t("settings:skillsSection.skills.description")}
      >
        <SwitchField
          title={t("common:status.enabled")}
          checked={skillsEnabled}
          onCheckedChange={(checked) =>
            updateSettings({ patch: { skillsEnabled: checked } })
          }
        />
        <SwitchField
          title={t("settings:skillsSection.skills.autoSuggest")}
          checked={skillsAutoSuggest}
          onCheckedChange={(checked) =>
            updateSettings({ patch: { skillsAutoSuggest: checked } })
          }
        />
        <LabeledField
          title={t("settings:skillsSection.skills.sharedRoot.title")}
          description={t("settings:skillsSection.skills.sharedRoot.description")}
        >
          <DraftInput
            xstyle={styles.input40}
            placeholder="~/shared-skills"
            value={sharedSkillsHome}
            onCommit={(nextValue) =>
              updateSettings({ patch: { sharedSkillsHome: nextValue } })
            }
          />
        </LabeledField>
      </SettingsCard>
      <SettingsCard
        title={t("settings:skillsSection.detected.title")}
        description={t("settings:skillsSection.detected.description")}
      >
        <div className={sx(styles.rowBetween)}>
          <div className={sx(styles.spaceY1)}>
            <p className={sx(styles.smallMedium)}>
              {skillCatalog.status === "loading"
                ? t("settings:skillsSection.detected.refreshing")
                : skillCatalog.status === "error"
                  ? t("settings:skillsSection.detected.discoveryFailed")
                  : t("settings:settingsDialogSkillsSection.skillsAcrossRoots", { value1: skillCatalog.skills.length, value2: skillCatalog.roots.length })}
            </p>
            {skillCatalog.status !== "error" ? <p className={sx(styles.mutedBody)}>{skillCatalog.detail}</p> : null}
            {skillCatalog.loadedAt ? (
              <p className={sx(styles.captionMuted)}>{t("settings:messages.skillsUpdated", { updatedAt: formatRelativeTimeShort(skillCatalog.loadedAt) })}</p>
            ) : null}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void refreshSkillCatalog({ workspacePath })}
          >
            {t("common:actions.refresh")}</Button>
        </div>
        <AsyncBoundary
          state={skillCatalogLoadState(skillCatalog, skillsEnabled)}
          onRetry={() => void refreshSkillCatalog({ workspacePath })}
          pending={<p className={sx(styles.mutedBody)}>{t("settings:skillsSection.detected.loading")}</p>}
        >
          {(catalog) => <SkillCatalogLists catalog={catalog} />}
        </AsyncBoundary>
      </SettingsCard>
    </SectionStack>
  );
}
