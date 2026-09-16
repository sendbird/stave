import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import type { WorkspaceExecutionState } from "@/lib/performance/workspace-execution";
import { managerStyles as styles } from "./resource-manager.styles";

export function WorkspaceExecutionControls() {
  const workspaces = useAppStore((s) => s.workspaces);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const paths = useAppStore((s) => s.workspacePathById);
  const [states, setStates] = useState<WorkspaceExecutionState[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
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
      } catch { if (mounted.current) { setLoaded(false); setMessage("Execution status unavailable."); } }
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
    operating.current = true; setBusy(true); setMessage("");
    try {
      const result = await window.api?.workspaceExecution?.update({ workspaceId, workspacePath, action });
      if (!mounted.current) return;
      if (result) setStates(result.states);
      if (!result?.ok) throw new Error(result?.message ?? "Execution control unavailable.");
      setMessage(action === "stop" ? "Execution stopped. Code, conversations and tabs are kept. Lens pages use their separate sleep and release controls." : "Execution allowed. Open a terminal or run a task to start again; previous commands are not rerun.");
    } catch (error) { if (mounted.current) setMessage(String(error)); }
    finally { operating.current = false; if (mounted.current) { setBusy(false); setConfirming(null); } }
  };

  if (!window.api?.workspaceExecution) return null;
  return <section className={sx(styles.group)}>
    <h3 className={sx(styles.heading)}>Workspace execution</h3>
    <div className={sx(styles.detail)}>
      <p className={sx(styles.muted)}>Stop terminals and managed services without removing the workspace. Running tasks and scripts must finish first. The stop lasts until you resume or the runtime restarts.</p>
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
            <span className={sx(styles.truncate)} title={workspace.name}>{workspace.name} · {!loaded ? "Checking status" : state?.stopping ? "Stopping" : state?.failed ? "Stop incomplete; new execution blocked" : state ? "Stopped" : "Execution allowed"}</span>
            <Button size="sm" variant="secondary" disabled={!loaded || busy || state?.stopping || !paths[workspace.id]} onClick={() => state ? void update(workspace.id, "resume") : setConfirming(workspace.id)}>{state ? "Resume execution" : "Stop execution"}</Button>
          </div>
          {confirming === workspace.id && <div className={sx(styles.section)}>
            <p className={sx(styles.muted)}>Terminal commands and managed services in {workspace.name} will end. Unsaved state inside those processes may be lost. Code files, conversations and tabs stay available.</p>
            <div className={sx(styles.actions)}>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirming(null)}>Cancel</Button>
              <Button size="sm" disabled={busy} onClick={() => void update(workspace.id, "stop")}>Confirm stop</Button>
            </div>
          </div>}
        </div>;
      })}
      {message && <p role="status" className={sx(styles.message)}>{message}</p>}
    </div>
  </section>;
}
