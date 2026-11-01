import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import { useId, useMemo } from "react";
import { sx } from "@/components/ads/utils/stylex";
import type { RecentRepositoryState } from "@/store/repository.utils";
import {
  SearchablePicker,
  type SearchablePickerOption,
} from "./settings-searchable-picker";
import { settingsProjectPickerStyles as styles } from "./settings-project-picker.styles";

/**
 * Chooses the project every tab of Settings > Projects edits (repository
 * settings, Workspace Tools, Memory). The project list grows with use, so the
 * picker searches names and paths; the open project is marked "current".
 */
export function SettingsProjectPicker(props: {
  repositories: readonly RecentRepositoryState[];
  currentRepositoryPath: string | null;
  selectedRepositoryPath: string | null;
  onSelect: (repositoryPath: string) => void;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const labelId = useId();
  const currentLabel = t("settings:dialog.currentRepository");
  const options = useMemo<SearchablePickerOption[]>(
    () =>
      props.repositories.map((repository) => ({
        value: repository.repositoryPath,
        label: repository.repositoryName,
        detail: repository.repositoryPath,
        keywords: [repository.repositoryPath],
        ...(repository.repositoryPath === props.currentRepositoryPath
          ? { badge: currentLabel }
          : {}),
      })),
    [currentLabel, props.currentRepositoryPath, props.repositories],
  );
  const empty = props.repositories.length === 0;
  return (
    <div className={sx(styles.field)}>
      <span id={labelId} className={sx(styles.label)}>
        {t("settings:projectsPage.picker.label")}
      </span>
      <SearchablePicker
        labelledBy={labelId}
        size="md"
        value={props.selectedRepositoryPath ?? undefined}
        placeholder={
          empty
            ? t("settings:dialog.noRepositories")
            : t("settings:projectsPage.picker.placeholder")
        }
        options={options}
        onSelect={props.onSelect}
        searchPlaceholder={t("settings:projectsPage.picker.searchPlaceholder")}
        emptyText={t("settings:projectsPage.picker.empty")}
        disabled={empty}
        triggerXstyle={styles.trigger}
      />
    </div>
  );
}
