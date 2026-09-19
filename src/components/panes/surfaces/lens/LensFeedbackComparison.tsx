import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import type { LensAnnotation } from "@/lib/lens/lens.types";
import { matchesSession } from "@/lib/lens/lens-log-format";
import { feedbackStyles as styles } from "./lens-feedback.styles";

export function LensFeedbackComparison({ workspaceId, lensSessionId, annotation, original }: {
  workspaceId: string; lensSessionId: string; annotation: LensAnnotation; original?: string;
}) {
  const [after, setAfter] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [resolved, setResolved] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    const unsubscribe = window.api?.lens?.subscribeStateChangedEvents?.((event) => {
      if (!matchesSession(event, workspaceId, lensSessionId) || !event.loading) return;
      generation.current++;
      setAfter(undefined); setResolved(false); setBusy(false);
      setMessage("The page changed. Capture it again to review.");
    });
    return () => { generation.current++; unsubscribe?.(); };
  }, [workspaceId, lensSessionId]);
  async function compare() {
    const token = ++generation.current;
    setBusy(true); setMessage(undefined); setAfter(undefined); setResolved(false);
    try {
      const result = await window.api?.lens?.compareAnnotation({ workspaceId, lensSessionId, annotation });
      if (token !== generation.current) return;
      if (!result?.ok || !result.dataUrl) throw new Error(result?.message ?? "Could not capture the current target.");
      setAfter(result.dataUrl);
    } catch (error) { if (token === generation.current) setMessage(error instanceof Error ? error.message : "Capture failed."); }
    finally { if (token === generation.current) setBusy(false); }
  }
  return <div className={sx(styles.editor)}>
    <div className={sx(styles.actions)}>
      <Button size="xs" disabled={busy || !original} onClick={() => void compare()}>{busy ? "Capturing…" : "Compare current target"}</Button>
      {after ? <Button size="xs" variant="quiet" aria-pressed={resolved} onClick={() => setResolved(!resolved)}>{resolved ? "Reopen review" : "Mark resolved"}</Button> : null}
    </div>
    {!original ? <p className={sx(styles.hint)}>No original image was captured. Select the target again to start a visual comparison.</p> : null}
    {after ? <div className={sx(styles.comparison)}>
      <figure><img className={sx(styles.preview)} src={original} alt="Original target" /><figcaption>Before</figcaption></figure>
      <figure><img className={sx(styles.preview)} src={after} alt="Current target candidate" /><figcaption>Current capture</figcaption></figure>
    </div> : null}
    {after ? <p className={sx(styles.hint)} role="status">{resolved ? "Marked resolved by you in this view. Reloading or leaving this target resets the review." : "Confirm this is the same target and inspect the change. Matching a selector does not prove the issue is fixed."}</p> : null}
    {message ? <p role="status" className={sx(styles.hint)}>{message}</p> : null}
  </div>;
}
