import { useState } from "react";
import { Checkbox } from "@/components/ads/components/Checkbox";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import type { LensAnnotation } from "@/lib/lens/lens.types";
import { feedbackStyles as styles } from "./lens-feedback.styles";

export function LensFeedbackSelection({ annotations, workspaceId, lensSessionId }: {
  annotations: LensAnnotation[]; workspaceId: string; lensSessionId: string;
}) {
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const removed = annotations.filter((entry) => excluded.has(entry.id));
  async function apply() {
    setBusy(true); setError(undefined);
    try {
      for (const annotation of removed) {
        const result = await window.api?.lens?.removeAnnotation?.({ workspaceId, lensSessionId, annotationId: annotation.id, documentId: annotation.review.page.documentId });
        if (!result?.ok) throw new Error(result?.message ?? "Could not remove the comment. The page may have changed.");
      }
      setExcluded(new Set());
    } catch (error) { setError(error instanceof Error ? error.message : "Could not update the selection."); }
    finally { setBusy(false); }
  }
  return <details className={sx(styles.editor)}>
    <summary>Choose comments to keep ({annotations.length})</summary>
    <div className={sx(styles.editor)}>
      {annotations.map((entry) => <Checkbox key={entry.id} disabled={busy} checked={!excluded.has(entry.id)} label={`${entry.pin}. ${entry.comment}`} onCheckedChange={(checked) => setExcluded((current) => {
        const next = new Set(current); if (checked) next.delete(entry.id); else next.add(entry.id); return next;
      })} />)}
      {removed.length ? <Button size="xs" disabled={busy} onClick={() => void apply()}>Remove {removed.length} unchecked comments</Button> : null}
      <p className={sx(styles.hint)}>Removal updates the draft and page pins. Send the remaining comments from the task composer.</p>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  </details>;
}
