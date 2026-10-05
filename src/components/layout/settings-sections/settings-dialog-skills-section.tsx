import { I18N_NAMESPACES, i18n, useTranslation } from "@/i18n";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatTaskUpdatedAt } from "@/lib/tasks";
import { useShallow } from "zustand/react/shallow";
import { Badge } from "@/components/ui";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { settingsSectionsStyles as styles } from "../settings-dialog-sections.styles";
import { useAppStore } from "@/store/app.store";
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

  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);

  const skillCountByRootPath = useMemo(() => {
    const counts = new Map<string, number>();
    for (const skill of skillCatalog.skills) {
      counts.set(
        skill.sourceRootPath,
        (counts.get(skill.sourceRootPath) ?? 0) + 1,
      );
    }
    return counts;
  }, [skillCatalog.skills]);

  const skillsByRoot = useMemo(() => {
    const groups = new Map<
      string,
      {
        root: (typeof skillCatalog.roots)[number] | null;
        skills: typeof skillCatalog.skills;
      }
    >();
    for (const skill of skillCatalog.skills) {
      const key = skill.sourceRootPath;
      if (!groups.has(key)) {
        const matchingRoot =
          skillCatalog.roots.find((r) => r.path === key) ?? null;
        groups.set(key, { root: matchingRoot, skills: [] });
      }
      groups.get(key)!.skills.push(skill);
    }
    return groups;
  }, [skillCatalog.skills, skillCatalog.roots]);

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
            <p className={sx(styles.mutedBody)}>{skillCatalog.detail}</p>
            {skillCatalog.fetchedAt ? (
              <p className={sx(styles.captionMuted)}>{t("settings:messages.skillsUpdated", { updatedAt: formatTaskUpdatedAt({ value: skillCatalog.fetchedAt }) })}</p>
            ) : null}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void refreshSkillCatalog({ workspacePath })}
          >
            {t("common:actions.refresh")}</Button>
        </div>
        <div className={sx(styles.spaceY2)}>
          <p className={sx(styles.metaLabel)}>{t("settings:skillsSection.detected.roots")}</p>
          {skillCatalog.roots.length === 0 ? (
            <p className={sx(styles.mutedBody)}>
              {t("settings:skillsSection.detected.noRoots")}</p>
          ) : (
            skillCatalog.roots.map((root) => (
              <div key={root.id} className={sx(styles.listCard)}>
                <div className={sx(styles.rowWrapGap2)}>
                  <span className={sx(styles.smallMedium)}>{root.path}</span>
                  <Badge
                    variant="secondary"
                    className={sx(styles.smallBadge)}
                  >
                    {root.scope}
                  </Badge>
                  <Badge variant="outline" className={sx(styles.smallBadge)}>
                    {root.provider}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={sx(styles.smallBadgePlain)}
                  >
                    {skillCountByRootPath.get(root.path) ?? 0} {i18n.t("settings:settingsDialogSkillsSection.skills")}</Badge>
                </div>
                {root.detail ? (
                  <p className={sx(styles.microMutedTop1)}>{root.detail}</p>
                ) : null}
              </div>
            ))
          )}
        </div>
        <div className={sx(styles.spaceY2)}>
          <p className={sx(styles.metaLabel)}>{t("settings:skillsSection.detected.catalog")}</p>
          {skillCatalog.skills.length === 0 ? (
            skillCatalog.status === "loading" ? (
              <p className={sx(styles.mutedBody)}>{t("settings:skillsSection.detected.loading")}</p>
            ) : (
              <p className={sx(styles.mutedBody)}>
                {t("settings:skillsSection.detected.empty")}</p>
            )
          ) : (
            Array.from(skillsByRoot.entries()).map(([rootPath, group]) => {
              const isCollapsed = collapsedGroups.includes(rootPath);
              return (
                <div key={rootPath} className={sx(styles.groupCard)}>
                  <Button
                    layout="host"
                    type="button"
                    xstyle={styles.groupToggle}
                    onClick={() => {
                      setCollapsedGroups((current) =>
                        current.includes(rootPath)
                          ? current.filter((v) => v !== rootPath)
                          : [...current, rootPath],
                      );
                    }}
                  >
                    <div className={sx(styles.groupToggleLeft)}>
                      <span className={sx(styles.smallMediumTruncate)}>
                        {rootPath}
                      </span>
                      <Badge
                        variant="secondary"
                        className={sx(styles.smallBadgePlain)}
                      >
                        {group.skills.length}
                      </Badge>
                      {group.root ? (
                        <Badge
                          variant="outline"
                          className={sx(styles.smallBadge)}
                        >
                          {group.root.scope}
                        </Badge>
                      ) : null}
                    </div>
                    {isCollapsed ? (
                      <ChevronRight className={sx(styles.chevron)} />
                    ) : (
                      <ChevronDown className={sx(styles.chevron)} />
                    )}
                  </Button>
                  {!isCollapsed ? (
                    <div className={sx(styles.groupBody)}>
                      {group.skills.map((skill) => (
                        <div key={skill.id} className={sx(styles.listCard)}>
                          <div className={sx(styles.rowWrapGap2)}>
                            <span className={sx(styles.smallMedium)}>
                              {skill.name}
                            </span>
                            <Badge
                              variant="secondary"
                              className={sx(styles.smallBadge)}
                            >
                              {skill.scope}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={sx(styles.smallBadge)}
                            >
                              {skill.provider}
                            </Badge>
                          </div>
                          <p className={sx(styles.bodyMutedTop1)}>
                            {skill.description}
                          </p>
                          <p className={sx(styles.skillMeta)}>{skill.path}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </SettingsCard>
    </SectionStack>
  );
}
