import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import type { LensAutomationState } from "@/lib/lens/lens-review.types";
import { feedbackStyles as styles } from "./lens-feedback.styles";

export function LensAutomationStatus({ workspaceId, lensSessionId, showPreview = false }: {
  workspaceId: string;
  lensSessionId?: string;
  showPreview?: boolean;
}) {
  const [state, setState] = useState<LensAutomationState>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);
  const activeWorkspaceId = useAppStore((store) => store.activeWorkspaceId);
  useEffect(() => {
    setState(undefined);
    if (workspaceId !== activeWorkspaceId || !window.api?.lens?.getAutomation) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      const token = revision.current;
      try {
        const result = await window.api!.lens!.getAutomation({ workspaceId, lensSessionId, includePreview: showPreview });
        if (!cancelled && token === revision.current && result.ok) setState(result.state);
      } catch { /* A closing renderer/session has no live preview. */ }
      if (!cancelled) timer = setTimeout(refresh, 1500);
    }
    void refresh();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [workspaceId, lensSessionId, activeWorkspaceId, showPreview]);
  if (!state || activeWorkspaceId !== workspaceId) return null;
  async function toggle() {
    if (!state || busy) return;
    setBusy(true);
    revision.current++;
    setError(undefined);
    try {
      const result = await window.api!.lens!.setAutomationPaused({ workspaceId, lensSessionId: state.lensSessionId, paused: !state.paused });
      if (!result.ok) throw new Error(result.message ?? "Could not change browser control.");
      setState(result.state);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not change browser control."); }
    finally { revision.current++; setBusy(false); }
  }
  return <section className={sx(styles.automation)} aria-label="Lens browser control">
    <div className={sx(styles.header)}>
      <p className={sx(styles.hint)} role="status">{state.paused ? (state.running ? "Stopping browser actions…" : "Direct interaction · agent actions paused") : state.running ? "Agent is using this browser" : "Browser ready"}</p>
      <div className={sx(styles.actions)}>
        <Button size="xs" variant="quiet" disabled={busy} onClick={() => void toggle()}>{state.paused ? "Resume agent access" : "Pause agent access"}</Button>
        {showPreview && state.lensSessionId ? <Button size="xs" variant="quiet" onClick={() => {
          const store = useAppStore.getState();
          if (store.activeWorkspaceId === workspaceId) store.openLensTab({ lensSessionId: state.lensSessionId!, activate: true });
        }}>View in Lens</Button> : null}
      </div>
    </div>
    {state.paused ? <p className={sx(styles.hint)}>You can use the page. Already dispatched requests may finish; new agent actions stay blocked until you resume.</p> : null}
    {showPreview && state.preview ? <figure>
      <img className={sx(styles.preview)} src={state.preview} alt="Latest browser action capture" />
      <figcaption className={sx(styles.hint)}>Latest session capture · {state.capturedAt ? new Date(state.capturedAt).toLocaleTimeString() : ""}. Not a replay of this tool call.</figcaption>
    </figure> : null}
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}

export function LensToolPreview({ toolName, input }: { toolName: string; input: string }) {
  if (!toolName.includes("stave_lens_")) return null;
  try {
    const target = JSON.parse(input) as { workspaceId?: unknown; lensSessionId?: unknown };
    if (typeof target.workspaceId !== "string") return null;
    return <LensAutomationStatus key={`${target.workspaceId}:${target.lensSessionId ?? ""}`} workspaceId={target.workspaceId} lensSessionId={typeof target.lensSessionId === "string" ? target.lensSessionId : undefined} showPreview />;
  } catch { return null; }
}
