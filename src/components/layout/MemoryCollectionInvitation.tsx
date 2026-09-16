import { useCallback, useEffect, useRef, useState } from "react";
import { Brain } from "lucide-react";
import { iconTileGlyphSizes } from "@/components/ads/components/IconTile";
import { EmptyState } from "@/components/ads/components/EmptyState";
import { Button } from "@/components/ui";
import type { ProjectMemorySettings } from "@/lib/project-memory-settings";
import { sx } from "@/components/ads/utils/stylex";
import { PROJECT_MEMORY_CHANGED_EVENT } from "./ProjectMemoryControls";
import { workspaceMemorySectionStyles as styles } from "./workspace-memory-section.styles";

/** Mounted with the project path as its key to isolate in-flight saves. */
export function MemoryCollectionInvitation({
  projectPath,
}: {
  projectPath: string;
}) {
  const [settings, setSettings] = useState<ProjectMemorySettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    try {
      const result = await window.api?.projectMemory?.getSettings?.({
        projectPath,
      });
      if (request !== generation.current) return;
      setSettings(result?.ok && result.settings ? result.settings : null);
    } catch {
      if (request === generation.current) setSettings(null);
    }
  }, [projectPath]);

  useEffect(() => {
    void reload();
    const changed = () => {
      void reload();
    };
    window.addEventListener(PROJECT_MEMORY_CHANGED_EVENT, changed);
    return () => {
      generation.current += 1;
      window.removeEventListener(PROJECT_MEMORY_CHANGED_EVENT, changed);
    };
  }, [reload]);

  const enable = async () => {
    const save = window.api?.projectMemory?.saveSettings;
    if (!settings || !save || busy) return;
    const request = generation.current;
    setBusy(true);
    setError("");
    try {
      const result = await save({
        projectPath,
        patch: { collectAutomatically: true },
        expectedRevision: settings.revision,
      });
      if (request !== generation.current) return;
      if (!result.ok || !result.settings)
        throw new Error(
          result.message ?? "Could not enable memory collection.",
        );
      setSettings(result.settings);
      window.dispatchEvent(new Event(PROJECT_MEMORY_CHANGED_EVENT));
    } catch (err) {
      if (request !== generation.current) return;
      setError(
        err instanceof Error
          ? err.message
          : "Could not enable memory collection.",
      );
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
        <EmptyState.Title>Try project memory</EmptyState.Title>
        <EmptyState.Description>
          Keep useful decisions and lessons across this project’s workspaces.
          Collection is off until you enable it. Summary suggestions stay out of
          conversations until reviewed.
        </EmptyState.Description>
      </EmptyState.Header>
      <EmptyState.Content>
        <Button
          size="sm"
          disabled={busy || !window.api?.projectMemory?.saveSettings}
          onClick={() => void enable()}
        >
          {busy ? "Enabling…" : "Enable memory collection"}
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
