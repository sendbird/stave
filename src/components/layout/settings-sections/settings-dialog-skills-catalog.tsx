import { I18N_NAMESPACES, i18n, useTranslation } from "@/i18n";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import type { SkillCatalogState } from "@/store/app-store.types";
import { settingsSectionsStyles as styles } from "../settings-dialog-sections.styles";

/** The roots and skills of a catalog that was read, grouped by root. */
export function SkillCatalogLists({ catalog }: { catalog: SkillCatalogState }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);

  const skillCountByRootPath = useMemo(() => {
    const counts = new Map<string, number>();
    for (const skill of catalog.skills) {
      counts.set(
        skill.sourceRootPath,
        (counts.get(skill.sourceRootPath) ?? 0) + 1,
      );
    }
    return counts;
  }, [catalog.skills]);

  const skillsByRoot = useMemo(() => {
    const groups = new Map<
      string,
      {
        root: (typeof catalog.roots)[number] | null;
        skills: typeof catalog.skills;
      }
    >();
    for (const skill of catalog.skills) {
      const key = skill.sourceRootPath;
      if (!groups.has(key)) {
        const matchingRoot =
          catalog.roots.find((r) => r.path === key) ?? null;
        groups.set(key, { root: matchingRoot, skills: [] });
      }
      groups.get(key)!.skills.push(skill);
    }
    return groups;
  }, [catalog.skills, catalog.roots]);

  return (
    <>
      <div className={sx(styles.spaceY2)}>
        <p className={sx(styles.metaLabel)}>{t("settings:skillsSection.detected.roots")}</p>
        {catalog.roots.length === 0 ? (
          <p className={sx(styles.mutedBody)}>
            {t("settings:skillsSection.detected.noRoots")}</p>
        ) : (
          catalog.roots.map((root) => (
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
        {catalog.skills.length === 0 ? (
          catalog.status === "loading" ? (
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
    </>
  );
}
