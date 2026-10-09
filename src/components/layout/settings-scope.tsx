import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { Badge } from "@/components/ads/components/Badge";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import type { AppSettings } from "@/store/app-settings";
import {
  effectiveSetting,
  pickProjectOverridablePatch,
  resolveProjectSettingsOverrides,
  type ProjectOverridableSettingKey,
} from "@/store/project-settings-overrides";
import type { SectionId } from "./settings-dialog.schema";
import { settingsScopeStyles as styles } from "./settings-scope.styles";

/**
 * Settings scope inside the Settings dialog: `null` edits the global values
 * every project uses; a repository path edits that project's overrides for
 * the allow-listed keys only.
 */
export interface SettingsScopeValue {
  repositoryPath: string | null;
  repositoryName: string | null;
  setRepositoryPath: (repositoryPath: string | null) => void;
}

const SettingsScopeContext = createContext<SettingsScopeValue>({
  repositoryPath: null,
  repositoryName: null,
  setRepositoryPath: () => {},
});

export function SettingsScopeProvider(args: {
  value: SettingsScopeValue;
  children: ReactNode;
}) {
  return (
    <SettingsScopeContext.Provider value={args.value}>
      {args.children}
    </SettingsScopeContext.Provider>
  );
}

export function useSettingsScope() {
  return useContext(SettingsScopeContext);
}

/**
 * The value a scoped control shows: the project's effective value in project
 * scope, the global value otherwise. Both selectors return primitives.
 */
export function useScopedSetting<K extends ProjectOverridableSettingKey>(
  key: K,
): { value: AppSettings[K]; overridden: boolean } {
  const { repositoryPath } = useSettingsScope();
  const value = useAppStore((state) =>
    repositoryPath
      ? effectiveSetting(key, repositoryPath, state)
      : state.settings[key],
  );
  const overridden = useAppStore((state) =>
    repositoryPath
      ? resolveProjectSettingsOverrides({
          repositoryPath,
          recentRepositories: state.recentRepositories,
        })?.[key] !== undefined
      : false,
  );
  return { value, overridden };
}

/**
 * Writes for scoped controls. In project scope a patch keeps only its
 * allow-listed keys (a mode preset also carries global-only keys such as
 * Codex web search) and lands on the project; otherwise it is a global write.
 */
export function useScopedSettingsWriter() {
  const { repositoryPath } = useSettingsScope();
  const updateSettings = useAppStore((state) => state.updateSettings);
  const updateProjectSettingsOverrides = useAppStore(
    (state) => state.updateProjectSettingsOverrides,
  );
  return useMemo(
    () => ({
      write: (patch: Partial<AppSettings>) => {
        if (!repositoryPath) {
          updateSettings({ patch });
          return;
        }
        updateProjectSettingsOverrides({
          repositoryPath,
          patch: pickProjectOverridablePatch(patch),
        });
      },
      clear: (keys: readonly ProjectOverridableSettingKey[]) => {
        if (repositoryPath) {
          updateProjectSettingsOverrides({ repositoryPath, clearKeys: keys });
        }
      },
    }),
    [repositoryPath, updateProjectSettingsOverrides, updateSettings],
  );
}

/**
 * Shown next to a scoped control in project scope: whether it uses the
 * global value or this project's value, and a way back to the global one.
 */
export function ScopedFieldStatus(args: {
  keys: readonly ProjectOverridableSettingKey[];
  /** The control's visible title, for the reset button's accessible name. */
  label: string;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const { repositoryPath } = useSettingsScope();
  const { clear } = useScopedSettingsWriter();
  const { keys } = args;
  const overridden = useAppStore((state) => {
    if (!repositoryPath) {
      return false;
    }
    const overrides = resolveProjectSettingsOverrides({
      repositoryPath,
      recentRepositories: state.recentRepositories,
    });
    return keys.some((key) => overrides?.[key] !== undefined);
  });
  if (!repositoryPath) {
    return null;
  }
  return (
    <span className={sx(styles.fieldStatus)} data-settings-scope-status="">
      <Badge
        size="sm"
        tone={overridden ? "accent" : "neutral"}
        variant={overridden ? "soft" : "outline"}
      >
        {overridden
          ? t("settings:scope.field.project")
          : t("settings:scope.field.global")}
      </Badge>
      {overridden ? (
        <Button
          type="button"
          size="xs"
          variant="quiet"
          aria-label={t("settings:scope.field.useGlobalFor", { field: args.label })}
          onClick={() => clear(keys)}
        >
          {t("settings:scope.field.useGlobal")}
        </Button>
      ) : null}
    </span>
  );
}

/**
 * Global-only content inside a scoped section: unchanged in global scope,
 * read-only (inert, dimmed) while a project is selected.
 */
export function ScopeLocked(args: { children: ReactNode }) {
  const { repositoryPath } = useSettingsScope();
  if (!repositoryPath) {
    return <>{args.children}</>;
  }
  return (
    <div inert className={sx(styles.locked)} data-settings-scope-locked="">
      {args.children}
    </div>
  );
}

/** Sections whose allow-listed controls are editable per project. */
const PROJECT_SCOPED_SECTION_IDS: ReadonlySet<SectionId> = new Set([
  "models",
  "providers",
]);
/** Sections that already pick a repository themselves. */
const PER_REPOSITORY_SECTION_IDS: ReadonlySet<SectionId> = new Set([
  "projects",
  "scripts",
  "memory",
]);

function ScopeNotice(args: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className={sx(styles.notice)} role="note" data-settings-scope-notice="">
      <div className={sx(styles.noticeText)}>
        <p className={sx(styles.noticeTitle)}>{args.title}</p>
        <p className={sx(styles.noticeDescription)}>{args.description}</p>
      </div>
      {args.action}
    </div>
  );
}

/**
 * Wraps the active section. In project scope, Models and Providers explain
 * what applies to the project; every other settings section says it applies
 * to all projects and stays read-only until the scope is All projects.
 */
export function SettingsScopeSectionFrame(args: {
  sectionId: SectionId;
  children: ReactNode;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const { repositoryPath, repositoryName, setRepositoryPath } =
    useSettingsScope();
  if (!repositoryPath || PER_REPOSITORY_SECTION_IDS.has(args.sectionId)) {
    return <>{args.children}</>;
  }
  const project = repositoryName ?? repositoryPath;
  if (PROJECT_SCOPED_SECTION_IDS.has(args.sectionId)) {
    return (
      <>
        <ScopeNotice
          title={t("settings:scope.notice.scoped.title", { project })}
          description={t("settings:scope.notice.scoped.description")}
        />
        {args.children}
      </>
    );
  }
  return (
    <>
      <ScopeNotice
        title={t("settings:scope.notice.globalOnly.title")}
        description={t("settings:scope.notice.globalOnly.description", { project })}
        action={
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setRepositoryPath(null)}
          >
            {t("settings:scope.notice.globalOnly.action")}
          </Button>
        }
      />
      <ScopeLocked>{args.children}</ScopeLocked>
    </>
  );
}
