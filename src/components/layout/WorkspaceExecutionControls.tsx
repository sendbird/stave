import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import type { WorkspaceExecutionState } from "@/lib/performance/workspace-execution";
import { managerStyles as styles } from "./resource-manager.styles";
import { useTranslation } from "@/i18n";

/** Translated notices are kept as keys so a language change re-renders them; IPC errors stay raw. */
type ExecutionMessage =
  | { key: "stopped" | "allowed" | "statusUnavailable" | "controlUnavailable" }
  | { detail: string }
  | null;

export function WorkspaceExecutionControls() {
  const { t } = useTranslation(["workspace", "common"]);
  const workspaces = useAppStore((s) => s.workspaces);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const paths = useAppStore((s) => s.workspacePathById);
  const [states, setStates] = useState<WorkspaceExecutionState[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<ExecutionMessage>(null);
  const operating = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    let pending = false;
    const read = async () => {
      if (pending || operating.current) return;
      pending = true;
      try {
        const next = await window.api?.workspaceExecution?.status();
        if (mounted.current && next) { setStates(next); setLoaded(true); }
      } catch { if (mounted.current) { setLoaded(false); setMessage({ key: "statusUnavailable" }); } }
      finally { pending = false; }
    };
    void read();
    const timer = setInterval(() => void read(), 5000);
    return () => { mounted.current = false; clearInterval(timer); };
  }, []);

  const update = async (workspaceId: string, action: "stop" | "resume") => {
    if (operating.current) return;
    const current = useAppStore.getState();
    const workspacePath = current.workspacePathById[workspaceId];
    if (!current.workspaces.some((workspace) => workspace.id === workspaceId) || !workspacePath) return;
    operating.current = true; setBusy(true); setMessage(null);
    try {
      const result = await window.api?.workspaceExecution?.update({ workspaceId, workspacePath, action });
      if (!mounted.current) return;
      if (result) setStates(result.states);
      if (!result?.ok) {
        if (result?.message) throw new Error(result.message);
        setMessage({ key: "controlUnavailable" });
        return;
      }
      setMessage({ key: action === "stop" ? "stopped" : "allowed" });
    } catch (error) { if (mounted.current) setMessage({ detail: String(error) }); }
    finally { operating.current = false; if (mounted.current) { setBusy(false); setConfirming(null); } }
  };

  if (!window.api?.workspaceExecution) return null;
  return <section className={sx(styles.group)}>
    <h3 className={sx(styles.heading)}>{t("executionControls.heading")}</h3>
    <div className={sx(styles.detail)}>
      <p className={sx(styles.muted)}>{t("executionControls.description")}</p>
      {workspaces
        .filter(
          (workspace) =>
            workspace.id === activeWorkspaceId ||
            states.some((entry) => entry.workspaceId === workspace.id),
        )
        .map((workspace) => {
        const state = states.find((entry) => entry.workspaceId === workspace.id);
        return <div key={workspace.id} className={sx(styles.section)}>
          <div className={sx(styles.process)}>
            <span className={sx(styles.truncate)} title={workspace.name}>{workspace.name} · {t(!loaded ? "executionControls.status.checking" : state?.stopping ? "executionControls.status.stopping" : state?.failed ? "executionControls.status.failed" : state ? "executionControls.status.stopped" : "executionControls.status.allowed")}</span>
            <Button size="sm" variant="secondary" disabled={!loaded || busy || state?.stopping || !paths[workspace.id]} onClick={() => state ? void update(workspace.id, "resume") : setConfirming(workspace.id)}>{state ? t("executionControls.resume") : t("executionControls.stop")}</Button>
          </div>
          {confirming === workspace.id && <div className={sx(styles.section)}>
            <p className={sx(styles.muted)}>{t("executionControls.confirmBody", { name: workspace.name })}</p>
            <div className={sx(styles.actions)}>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirming(null)}>{t("common:actions.cancel")}</Button>
              <Button size="sm" disabled={busy} onClick={() => void update(workspace.id, "stop")}>{t("executionControls.confirmStop")}</Button>
            </div>
          </div>}
        </div>;
      })}
      {message && <p role="status" className={sx(styles.message)}>{"key" in message ? t(`executionControls.messages.${message.key}`) : message.detail}</p>}
    </div>
  </section>;
}
