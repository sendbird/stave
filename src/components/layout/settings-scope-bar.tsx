import { I18N_NAMESPACES, Trans, useTranslation } from "@/i18n";
import { useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/aui/components/Button";
import { sx } from "@/components/aui/utils/stylex";
import { SearchablePicker, type SearchablePickerOption } from "./settings-searchable-picker";
import type { RecentRepositoryState } from "@/store/repository.utils";
import {
  buildSettingsSearchText,
  type SettingsI18nKey,
} from "./settings-dialog.schema";
import { useSettingsScope } from "./settings-scope";
import { settingsScopeStyles as styles } from "./settings-scope.styles";

/** DOM id of the scope trigger; settings search focuses it. */
export const SETTINGS_SCOPE_PICKER_ID = "settings-scope-picker";

/** The scope selector as a settings search result. */
export const SETTINGS_SCOPE_SEARCH_ENTRY = {
  titleKey: "settings:scope.search.title",
  descriptionKey: "settings:scope.search.description",
  keywords: [
    "scope",
    "project",
    "projects",
    "per project",
    "per-project",
    "repository",
    "override",
    "overrides",
    "global",
    "all projects",
    "프로젝트",
    "프로젝트별",
    "범위",
    "전역",
  ],
} as const satisfies {
  titleKey: SettingsI18nKey;
  descriptionKey: SettingsI18nKey;
  keywords: readonly string[];
};

export function matchesSettingsScopeSearch(query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return false;
  }
  const haystack = buildSettingsSearchText(
    [SETTINGS_SCOPE_SEARCH_ENTRY.titleKey, SETTINGS_SCOPE_SEARCH_ENTRY.descriptionKey],
    SETTINGS_SCOPE_SEARCH_ENTRY.keywords,
  );
  return terms.every((term) => haystack.includes(term));
}

const ALL_PROJECTS_VALUE = "__stave_all_projects__";

function ScopePicker(args: {
  repositories: readonly RecentRepositoryState[];
  currentRepositoryPath: string | null;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const { repositoryPath, repositoryName, setRepositoryPath } =
    useSettingsScope();
  const allLabel = t("settings:scope.bar.allProjects");
  const label = repositoryPath ? (repositoryName ?? repositoryPath) : allLabel;
  const currentGroup = t("settings:scope.picker.currentGroup");
  const otherGroup = t("settings:scope.picker.otherGroup");
  const allDescription = t("settings:scope.picker.allDescription");
  const options = useMemo<SearchablePickerOption[]>(() => {
    const current = args.repositories.find(
      (repository) => repository.repositoryPath === args.currentRepositoryPath,
    );
    const others = args.repositories.filter(
      (repository) => repository.repositoryPath !== args.currentRepositoryPath,
    );
    const toOption = (repository: RecentRepositoryState, group: string): SearchablePickerOption => ({
      value: repository.repositoryPath,
      label: repository.repositoryName,
      detail: repository.repositoryPath,
      group,
    });
    return [
      { value: ALL_PROJECTS_VALUE, label: allLabel, detail: allDescription },
      ...(current ? [toOption(current, currentGroup)] : []),
      ...others.map((repository) => toOption(repository, otherGroup)),
    ];
  }, [allDescription, allLabel, args.currentRepositoryPath, args.repositories, currentGroup, otherGroup]);

  return (
    <SearchablePicker
      trigger={
        <Button
          id={SETTINGS_SCOPE_PICKER_ID}
          type="button"
          size="sm"
          variant="outlined"
          xstyle={styles.trigger}
        />
      }
      triggerContent={
        <>
          <span className={sx(styles.triggerLabel)}>{label}</span>
          <ChevronDown aria-hidden="true" className={sx(styles.chevron)} />
        </>
      }
      aria-label={t("settings:scope.bar.triggerAriaLabel", { scope: label })}
      popupXstyle={styles.popup}
      value={repositoryPath ?? ALL_PROJECTS_VALUE}
      placeholder={allLabel}
      options={options}
      onSelect={(value) => setRepositoryPath(value === ALL_PROJECTS_VALUE ? null : value)}
      searchPlaceholder={t("settings:scope.picker.searchPlaceholder")}
      emptyText={t("settings:scope.picker.empty")}
    />
  );
}

/** "Applying settings to [All projects ▾]" at the top of the Settings body. */
export function SettingsScopeBar(args: {
  repositories: readonly RecentRepositoryState[];
  currentRepositoryPath: string | null;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const { repositoryPath } = useSettingsScope();
  return (
    <div className={sx(styles.bar)} data-settings-scope-bar="">
      <span className={sx(styles.sentence)}>
        <Trans
          t={t}
          i18nKey="settings:scope.bar.sentence"
          components={{
            picker: (
              <ScopePicker
                repositories={args.repositories}
                currentRepositoryPath={args.currentRepositoryPath}
              />
            ),
          }}
        />
      </span>
      <span className={sx(styles.hint)}>
        {repositoryPath
          ? t("settings:scope.bar.projectHint")
          : t("settings:scope.bar.globalHint")}
      </span>
    </div>
  );
}
