import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Textarea,
  Switch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import { i18n, useTranslation, type I18nKey } from "@/i18n";
import { REPOSITORY_MEMORY_KINDS } from "@/lib/repository-memory";
import {
  DEFAULT_REPOSITORY_MEMORY_SETTINGS,
  type RepositoryMemorySettings,
} from "@/lib/repository-memory-settings";
import { sx } from "@/components/ads/utils/stylex";
import { ConfirmDialog } from "./ConfirmDialog";
import { repositoryMemoryControlsStyles as styles } from "./RepositoryMemoryControls.styles";
import { failureMessage } from "./workspace-information/failure-message";

export const REPOSITORY_MEMORY_CHANGED_EVENT = "stave:repository-memory-changed";
const KIND_DESCRIPTION_KEYS = {
  decision: "workspace:repositoryMemory.kindDescriptions.decision",
  convention: "workspace:repositoryMemory.kindDescriptions.convention",
  gotcha: "workspace:repositoryMemory.kindDescriptions.gotcha",
  fact: "workspace:repositoryMemory.kindDescriptions.fact",
} as const satisfies Record<(typeof REPOSITORY_MEMORY_KINDS)[number], I18nKey>;

export function RepositoryMemoryControls({
  repositoryPath,
}: {
  repositoryPath: string;
}) {
  const { t } = useTranslation(["workspace", "common"]);
  const [saved, setSaved] = useState<RepositoryMemorySettings | null>(null);
  const [draft, setDraft] = useState<RepositoryMemorySettings | null>(null);
  const [counts, setCounts] = useState({ all: 0, candidates: 0 });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [clearing, setClearing] = useState<"candidates" | "all" | null>(null);
  const version = useRef(0);
  const hasUnsavedChanges = useRef(false);
  hasUnsavedChanges.current = Boolean(
    draft && JSON.stringify(draft) !== JSON.stringify(saved),
  );
  const reload = useCallback(async () => {
    const request = ++version.current;
    const api = window.api?.repositoryMemory;
    if (!api?.getSettings || !api.list) {
      setError(i18n.t("workspace:repositoryMemory.errors.desktopOutdated"));
      return;
    }
    try {
      const [settings, list] = await Promise.all([
        api.getSettings({ repositoryPath }),
        api.list({ repositoryPath }),
      ]);
      if (request !== version.current) return;
      if (!settings.ok || !settings.settings || !list.ok)
        throw new Error(settings.message ?? list.message ?? "");
      // A memory card changing elsewhere must not erase a template being edited.
      // Keep its original revision so a later save still detects settings conflicts.
      if (!hasUnsavedChanges.current) {
        setSaved(settings.settings);
        setDraft(settings.settings);
      }
      setCounts({
        all: list.items.length,
        candidates: list.items.filter((m) => m.recallMode === "candidate")
          .length,
      });
      setError("");
    } catch (err) {
      if (request === version.current)
        setError(
          failureMessage(i18n.t("workspace:repositoryMemory.errors.loadFailed"), err),
        );
    }
  }, [repositoryPath]);
  useEffect(() => {
    setSaved(null);
    setDraft(null);
    void reload();
    const changed = () => {
      void reload();
    };
    window.addEventListener(REPOSITORY_MEMORY_CHANGED_EVENT, changed);
    return () => {
      version.current += 1;
      window.removeEventListener(REPOSITORY_MEMORY_CHANGED_EVENT, changed);
    };
  }, [reload]);

  const save = async () => {
    const api = window.api?.repositoryMemory;
    if (!api?.saveSettings || !draft || !saved) return;
    const request = version.current;
    setBusy(true);
    try {
      const {
        revision: _revision,
        resetBefore: _resetBefore,
        ...patch
      } = draft;
      const result = await api.saveSettings({
        repositoryPath,
        patch,
        expectedRevision: saved.revision,
      });
      if (request !== version.current) return;
      if (!result.ok || !result.settings)
        throw new Error(result.message ?? "");
      setSaved(result.settings);
      setDraft(result.settings);
      window.dispatchEvent(new Event(REPOSITORY_MEMORY_CHANGED_EVENT));
    } catch (err) {
      if (request === version.current)
        setError(failureMessage(t("repositoryMemory.errors.saveFailed"), err));
    } finally {
      setBusy(false);
    }
  };
  const clear = async () => {
    const api = window.api?.repositoryMemory;
    if (!api?.clear || !clearing) return;
    const request = version.current;
    setBusy(true);
    try {
      const result = await api.clear({ repositoryPath, scope: clearing });
      if (request !== version.current) return;
      if (!result.ok)
        throw new Error(result.message ?? "");
      setClearing(null);
      window.dispatchEvent(new Event(REPOSITORY_MEMORY_CHANGED_EVENT));
    } catch (err) {
      if (request === version.current)
        setError(failureMessage(t("repositoryMemory.errors.clearFailed"), err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={sx(styles.root)}>
      {error && (
        <div role="alert" className={sx(styles.errorBlock)}>
          <p>{error}</p>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => {
              hasUnsavedChanges.current = false;
              void reload();
            }}
          >
            {t("common:actions.reload")}
          </Button>
        </div>
      )}
      {!draft ? (
        <p className={sx(styles.loading)}>
          {error
            ? t("repositoryMemory.unavailable")
            : t("repositoryMemory.loading")}
        </p>
      ) : (
        <>
          <fieldset disabled={busy} className={sx(styles.fieldset)}>
            <label className={sx(styles.toggleRow)}>
              <span>
                {t("repositoryMemory.useMemory.title")}
                <span className={sx(styles.toggleHint)}>
                  {t("repositoryMemory.useMemory.hint")}
                </span>
              </span>
              <Switch
                checked={draft.useMemory}
                onCheckedChange={(value) =>
                  setDraft({ ...draft, useMemory: value })
                }
              />
            </label>
            <label className={sx(styles.toggleRow)}>
              <span>
                {t("repositoryMemory.collect.title")}
                <span className={sx(styles.toggleHint)}>
                  {t("repositoryMemory.collect.hint")}
                </span>
              </span>
              <Switch
                checked={draft.collectAutomatically}
                onCheckedChange={(value) =>
                  setDraft({ ...draft, collectAutomatically: value })
                }
              />
            </label>
            <fieldset className={sx(styles.kindsFieldset)}>
              <legend className={sx(styles.legend)}>{t("repositoryMemory.whatToCollect")}</legend>
              {REPOSITORY_MEMORY_KINDS.map((kind) => (
                <label key={kind} className={sx(styles.kindRow)}>
                  <input
                    type="checkbox"
                    checked={draft.kinds.includes(kind)}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        kinds: event.target.checked
                          ? [...draft.kinds, kind]
                          : draft.kinds.filter((entry) => entry !== kind),
                      })
                    }
                  />
                  {t(KIND_DESCRIPTION_KEYS[kind])}
                </label>
              ))}
            </fieldset>
            <label className={sx(styles.templateLabelStack)}>
              <span className={sx(styles.templateTitle)}>
                {t("repositoryMemory.template.title")}
              </span>
              <span className={sx(styles.templateHint)}>
                {t("repositoryMemory.template.hint")}
              </span>
              <Textarea
                xstyle={styles.templateTextarea}
                value={draft.collectionTemplate}
                maxLength={4000}
                onChange={(event) =>
                  setDraft({ ...draft, collectionTemplate: event.target.value })
                }
              />
            </label>
            <div className={sx(styles.actionRow)}>
              <Button
                size="sm"
                onClick={() => void save()}
                disabled={
                  !draft.collectionTemplate.trim() ||
                  JSON.stringify(draft) === JSON.stringify(saved)
                }
              >
                {t("repositoryMemory.saveSettings")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setDraft({
                    ...draft,
                    collectionTemplate:
                      DEFAULT_REPOSITORY_MEMORY_SETTINGS.collectionTemplate,
                    kinds: [...DEFAULT_REPOSITORY_MEMORY_SETTINGS.kinds],
                  })
                }
              >
                {t("repositoryMemory.restoreDefaults")}
              </Button>
            </div>
          </fieldset>
          <div className={sx(styles.footer)}>
            <p className={sx(styles.footerCount)}>
              {t("repositoryMemory.footerCount", {
                all: counts.all,
                candidates: counts.candidates,
              })}
            </p>
            <div className={sx(styles.footerActions)}>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || !counts.candidates}
                onClick={() => {
                  setError("");
                  setClearing("candidates");
                }}
              >
                {t("repositoryMemory.clearCandidates")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setError("");
                  setClearing("all");
                }}
              >
                {t("repositoryMemory.reset")}
              </Button>
            </div>
          </div>
        </>
      )}
      <ConfirmDialog
        open={clearing !== null}
        loading={busy}
        title={
          clearing === "candidates"
            ? t("repositoryMemory.clearDialog.candidatesTitle", { count: counts.candidates })
            : t("repositoryMemory.clearDialog.resetTitle", { count: counts.all })
        }
        description={t("repositoryMemory.clearDialog.description")}
        confirmLabel={
          clearing === "candidates"
            ? t("repositoryMemory.clearCandidates")
            : t("repositoryMemory.reset")
        }
        onConfirm={() => void clear()}
        onCancel={() => {
          if (!busy) setClearing(null);
        }}
      >
        {error && (
          <p role="alert" className={sx(styles.dialogError)}>
            {error}
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}

export function RepositoryMemorySettingsSection(props: {
  repositories: Array<{ repositoryPath: string; repositoryName: string }>;
  initialRepositoryPath?: string | null;
}) {
  const { t } = useTranslation("workspace");
  const [selected, setSelected] = useState(props.initialRepositoryPath ?? "");
  const repositoryPath = props.repositories.some((p) => p.repositoryPath === selected)
    ? selected
    : (props.repositories[0]?.repositoryPath ?? "");
  return (
    <section className={sx(styles.section)}>
      <div>
        <h2 className={sx(styles.sectionTitle)}>{t("repositoryMemory.settingsSection.title")}</h2>
        <p className={sx(styles.sectionLead)}>
          {t("repositoryMemory.settingsSection.lead")}
        </p>
      </div>
      {repositoryPath ? (
        <>
          <Select value={repositoryPath} onValueChange={setSelected}>
            <SelectTrigger aria-label={t("repositoryMemory.settingsSection.repositoryAriaLabel")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {props.repositories.map((repository) => (
                <SelectItem
                  key={repository.repositoryPath}
                  value={repository.repositoryPath}
                >
                  {repository.repositoryName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <RepositoryMemoryControls key={repositoryPath} repositoryPath={repositoryPath} />
        </>
      ) : (
        <p className={sx(styles.loading)}>
          {t("repositoryMemory.settingsSection.noRepository")}
        </p>
      )}
    </section>
  );
}
