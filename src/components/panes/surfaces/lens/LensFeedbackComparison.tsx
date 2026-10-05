import { i18n, useTranslation } from "@/i18n";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import type { LensAnnotation } from "@/lib/lens/lens.types";
import { matchesSession } from "@/lib/lens/lens-log-format";
import { feedbackStyles as styles } from "./lens-feedback.styles";

export function LensFeedbackComparison({ workspaceId, lensSessionId, annotation, original }: {
  workspaceId: string; lensSessionId: string; annotation: LensAnnotation; original?: string;
}) {
  useTranslation();
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
      setMessage(i18n.t("lens:lensFeedbackComparison.thePageChangedCaptureItAgainTo"));
    });
    return () => { generation.current++; unsubscribe?.(); };
  }, [workspaceId, lensSessionId]);
  async function compare() {
    const token = ++generation.current;
    setBusy(true); setMessage(undefined); setAfter(undefined); setResolved(false);
    try {
      const result = await window.api?.lens?.compareAnnotation({ workspaceId, lensSessionId, annotation });
      if (token !== generation.current) return;
      if (!result?.ok || !result.dataUrl) throw new Error(result?.message ?? i18n.t("lens:lensFeedbackComparison.couldNotCaptureTheCurrentTarget"));
      setAfter(result.dataUrl);
    } catch (error) { if (token === generation.current) setMessage(error instanceof Error ? error.message : i18n.t("lens:lensFeedbackComparison.captureFailed")); }
    finally { if (token === generation.current) setBusy(false); }
  }
  return <div className={sx(styles.editor)}>
    <div className={sx(styles.actions)}>
      <Button size="xs" disabled={busy || !original} onClick={() => void compare()}>{busy ? i18n.t("lens:lensFeedbackComparison.capturing") : i18n.t("lens:lensFeedbackComparison.compareCurrentTarget")}</Button>
      {after ? <Button size="xs" variant="quiet" aria-pressed={resolved} onClick={() => setResolved(!resolved)}>{resolved ? i18n.t("lens:lensFeedbackComparison.reopenReview") : i18n.t("lens:lensFeedbackComparison.markResolved")}</Button> : null}
    </div>
    {!original ? <p className={sx(styles.hint)}>{i18n.t("lens:lensFeedbackComparison.noOriginalImageWasCapturedSelectThe")}</p> : null}
    {after ? <div className={sx(styles.comparison)}>
      <figure><img className={sx(styles.preview)} src={original} alt={i18n.t("lens:lensFeedbackComparison.originalTarget")} /><figcaption>{i18n.t("lens:lensFeedbackComparison.before")}</figcaption></figure>
      <figure><img className={sx(styles.preview)} src={after} alt={i18n.t("lens:lensFeedbackComparison.currentTargetCandidate")} /><figcaption>{i18n.t("lens:lensFeedbackComparison.currentCapture")}</figcaption></figure>
    </div> : null}
    {after ? <p className={sx(styles.hint)} role="status">{resolved ? i18n.t("lens:lensFeedbackComparison.markedResolvedByYouInThisView") : i18n.t("lens:lensFeedbackComparison.confirmThisIsTheSameTargetAnd")}</p> : null}
    {message ? <p role="status" className={sx(styles.hint)}>{message}</p> : null}
  </div>;
}
