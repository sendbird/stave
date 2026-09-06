import { useState, useSyncExternalStore } from "react";
import { sx } from "@/components/ads/utils/stylex";
import { ActionButton } from "@/components/system/ActionButton";
import { useAppStore } from "@/store/app.store";
import { flushPendingSnapshotPersists } from "@/store/workspace-session-state";
import { workspaceSaveStatus } from "@/store/workspace-save-status";
import { workspaceSaveNoticeStyles as styles } from "./workspace-save-notice.styles";

export function WorkspaceSaveNotice() {
  const failures = useSyncExternalStore(
    workspaceSaveStatus.subscribe,
    workspaceSaveStatus.getSnapshot,
    workspaceSaveStatus.getSnapshot,
  );
  const [retrying, setRetrying] = useState(false);
  if (!failures) return null;
  return (
    <aside
      role="alert"
      aria-label="Unsaved workspace changes"
      className={sx(styles.root)}
    >
      <p className={sx(styles.message)}>
        Some workspace changes could not be saved. Keep Stave open and retry.
      </p>
      <ActionButton
        disabled={retrying}
        onClick={() => {
          setRetrying(true);
          void (async () => {
            try {
              await useAppStore.getState().flushActiveWorkspaceSnapshot();
              await flushPendingSnapshotPersists();
            } catch {
              // The queue retains failed writes and this notice until saved.
            } finally {
              setRetrying(false);
            }
          })();
        }}
      >
        {retrying ? "Saving…" : "Retry save"}
      </ActionButton>
    </aside>
  );
}
