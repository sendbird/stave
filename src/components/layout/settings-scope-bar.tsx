import { I18N_NAMESPACES, Trans, useTranslation } from "@/i18n";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui";
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
  const [open, setOpen] = useState(false);
  const allLabel = t("settings:scope.bar.allProjects");
  const label = repositoryPath ? (repositoryName ?? repositoryPath) : allLabel;
  const current = args.repositories.find(
    (repository) => repository.repositoryPath === args.currentRepositoryPath,
  );
  const others = args.repositories.filter(
    (repository) => repository.repositoryPath !== args.currentRepositoryPath,
  );
  const choose = (next: string | null) => {
    setRepositoryPath(next);
    setOpen(false);
  };
  const renderRepository = (repository: RecentRepositoryState) => (
    <CommandItem
      key={repository.repositoryPath}
      value={repository.repositoryPath}
      keywords={[repository.repositoryName]}
      data-checked={repositoryPath === repository.repositoryPath}
      className={sx(styles.item)}
      onSelect={() => choose(repository.repositoryPath)}
    >
      <span className={sx(styles.itemText)}>
        <span className={sx(styles.itemLabel)}>{repository.repositoryName}</span>
        <span className={sx(styles.itemDetail)} title={repository.repositoryPath}>
          {repository.repositoryPath}
        </span>
      </span>
    </CommandItem>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={SETTINGS_SCOPE_PICKER_ID}
            type="button"
            size="sm"
            variant="outline"
            xstyle={styles.trigger}
            aria-label={t("settings:scope.bar.triggerAriaLabel", { scope: label })}
          />
        }
      >
        <span className={sx(styles.triggerLabel)}>{label}</span>
        <ChevronDown aria-hidden="true" className={sx(styles.chevron)} />
      </PopoverTrigger>
      <PopoverContent align="start" density="flush" xstyle={styles.popup}>
        {open ? (
          <Command>
            <CommandInput
              autoFocus
              aria-label={t("settings:scope.picker.searchPlaceholder")}
              placeholder={t("settings:scope.picker.searchPlaceholder")}
            />
            <CommandList className={sx(styles.list)}>
              <CommandEmpty>{t("settings:scope.picker.empty")}</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value={ALL_PROJECTS_VALUE}
                  keywords={[allLabel, t("settings:scope.picker.allDescription")]}
                  data-checked={repositoryPath === null}
                  className={sx(styles.item)}
                  onSelect={() => choose(null)}
                >
                  <span className={sx(styles.itemText)}>
                    <span className={sx(styles.itemLabel)}>{allLabel}</span>
                    <span className={sx(styles.itemDetail)}>
                      {t("settings:scope.picker.allDescription")}
                    </span>
                  </span>
                </CommandItem>
              </CommandGroup>
              {current ? (
                <CommandGroup heading={t("settings:scope.picker.currentGroup")}>
                  {renderRepository(current)}
                </CommandGroup>
              ) : null}
              {others.length > 0 ? (
                <CommandGroup heading={t("settings:scope.picker.otherGroup")}>
                  {others.map(renderRepository)}
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        ) : null}
      </PopoverContent>
    </Popover>
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
