import { useCallback, useEffect, useRef, useState } from "react";
import { Brain } from "lucide-react";
import { iconTileGlyphSizes } from "@/components/ads/components/IconTile";
import { EmptyState } from "@/components/ads/components/EmptyState";
import { Button } from "@/components/ui";
import { useTranslation } from "@/i18n";
import type { RepositoryMemorySettings } from "@/lib/repository-memory-settings";
import { sx } from "@/components/ads/utils/stylex";
import { REPOSITORY_MEMORY_CHANGED_EVENT } from "./RepositoryMemoryControls";
import { failureMessage } from "./workspace-information/failure-message";
import { workspaceMemorySectionStyles as styles } from "./workspace-memory-section.styles";

/** Mounted with the project path as its key to isolate in-flight saves. */
export function MemoryCollectionInvitation({
  repositoryPath,
}: {
  repositoryPath: string;
}) {
  const { t } = useTranslation("workspace");
  const [settings, setSettings] = useState<RepositoryMemorySettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    try {
      const result = await window.api?.repositoryMemory?.getSettings?.({
        repositoryPath,
      });
      if (request !== generation.current) return;
      setSettings(result?.ok && result.settings ? result.settings : null);
    } catch {
      if (request === generation.current) setSettings(null);
    }
  }, [repositoryPath]);

  useEffect(() => {
    void reload();
    const changed = () => {
      void reload();
    };
    window.addEventListener(REPOSITORY_MEMORY_CHANGED_EVENT, changed);
    return () => {
      generation.current += 1;
      window.removeEventListener(REPOSITORY_MEMORY_CHANGED_EVENT, changed);
    };
  }, [reload]);

  const enable = async () => {
    const save = window.api?.repositoryMemory?.saveSettings;
    if (!settings || !save || busy) return;
    const request = generation.current;
    setBusy(true);
    setError("");
    try {
      const result = await save({
        repositoryPath,
        patch: { collectAutomatically: true },
        expectedRevision: settings.revision,
      });
      if (request !== generation.current) return;
      if (!result.ok || !result.settings)
        throw new Error(result.message ?? "");
      setSettings(result.settings);
      window.dispatchEvent(new Event(REPOSITORY_MEMORY_CHANGED_EVENT));
    } catch (err) {
      if (request !== generation.current) return;
      setError(failureMessage(t("memory.invitation.enableFailed"), err));
      void reload();
    } finally {
      setBusy(false);
    }
  };

  if (!settings || settings.collectAutomatically) return null;
  return (
    <EmptyState.Root variant="plain">
      <EmptyState.Media tone="accent">
        <Brain size={iconTileGlyphSizes.xl} />
      </EmptyState.Media>
      <EmptyState.Header>
        <EmptyState.Title>{t("memory.invitation.title")}</EmptyState.Title>
        <EmptyState.Description>
          {t("memory.invitation.description")}
        </EmptyState.Description>
      </EmptyState.Header>
      <EmptyState.Content>
        <Button
          size="sm"
          disabled={busy || !window.api?.repositoryMemory?.saveSettings}
          onClick={() => void enable()}
        >
          {busy ? t("memory.invitation.enabling") : t("memory.invitation.enable")}
        </Button>
        {error ? (
          <p role="alert" className={sx(styles.error)}>
            {error}
          </p>
        ) : null}
      </EmptyState.Content>
    </EmptyState.Root>
  );
}
