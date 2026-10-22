import { i18n, useTranslation } from "@/i18n";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { AsyncBoundary } from "@/components/system/AsyncBoundary";
import { ReviewVersionCompare } from "@/components/system/ReviewVersionCompare";
import type { LensAnnotation } from "@/lib/lens/lens.types";
import { getLensCommentImageId } from "@/lib/lens/lens-annotation-attachment";
import { matchesSession } from "@/lib/lens/lens-log-format";
import type { LensReviewRecord, LensReviewVerdict } from "@/lib/lens/lens-review-record";
import { feedbackStyles as styles } from "./lens-feedback.styles";
import { LensReviewRecordView } from "./LensReviewRecordView";
import { useLensReviewRecord } from "./useLensReviewRecord";

/** The target's own proportions, so a narrow or wide element is not letterboxed into 16:9. */
function targetAspectRatio(annotation: LensAnnotation): number {
  const { width, height } = annotation.review.anchor.bounds;
  return width > 0 && height > 0 ? Math.min(4, Math.max(0.25, width / height)) : 16 / 9;
}

/**
 * Sent feedback compared with a fresh capture of its target, kept as a Lens
 * review record once the user decides: confirmed, or needs a re-check. The
 * record survives navigation and restarts; a confirmation only stands while
 * the page is the document it was captured from.
 */
export function LensFeedbackComparison({ taskId, workspaceId, lensSessionId, annotation, original }: {
  taskId: string; workspaceId: string; lensSessionId: string; annotation: LensAnnotation; original?: string;
}) {
  useTranslation();
  const saved = useLensReviewRecord({ taskId, annotationId: annotation.id });
  const [capture, setCapture] = useState<{ dataUrl: string; documentId: string }>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState<"compare" | "save" | null>(null);
  const generation = useRef(0);
  const hasCapture = useRef(false);
  hasCapture.current = capture !== undefined;
  const refreshSaved = saved.refresh;
  useEffect(() => {
    const unsubscribe = window.api?.lens?.subscribeStateChangedEvents?.((event) => {
      if (!matchesSession(event, workspaceId, lensSessionId) || !event.loading) return;
      generation.current++;
      setBusy(null);
      // An undecided capture is of a document that is gone; a saved record stays and is read again.
      if (hasCapture.current) setMessage(i18n.t("lens:lensFeedbackComparison.thePageChangedCaptureItAgainTo"));
      setCapture(undefined);
      refreshSaved();
    });
    return () => { generation.current++; unsubscribe?.(); };
  }, [workspaceId, lensSessionId, refreshSaved]);

  async function compare() {
    const token = ++generation.current;
    setBusy("compare"); setMessage(undefined); setCapture(undefined);
    try {
      const result = await window.api?.lens?.compareAnnotation({ workspaceId, lensSessionId, annotation });
      if (token !== generation.current) return;
      if (!result?.ok || !result.dataUrl || !result.documentId) throw new Error(result?.message ?? i18n.t("lens:lensFeedbackComparison.couldNotCaptureTheCurrentTarget"));
      setCapture({ dataUrl: result.dataUrl, documentId: result.documentId });
    } catch (error) { if (token === generation.current) setMessage(error instanceof Error ? error.message : i18n.t("lens:lensFeedbackComparison.captureFailed")); }
    finally { if (token === generation.current) setBusy(null); }
  }

  async function decide(verdict: LensReviewVerdict) {
    const api = window.api?.lens;
    if (!capture || !api?.saveReviewRecord) return;
    const token = ++generation.current;
    setBusy("save"); setMessage(undefined);
    try {
      const result = await api.saveReviewRecord({
        taskId, workspaceId, lensSessionId, annotation, documentId: capture.documentId, afterDataUrl: capture.dataUrl, verdict,
        beforeImageId: getLensCommentImageId({ workspaceId, lensSessionId, annotationId: annotation.id }),
      });
      if (token !== generation.current) return;
      if (result.ok) { setCapture(undefined); refreshSaved(); return; }
      if (result.code === "page-changed") { setCapture(undefined); setMessage(i18n.t("lens:lensReviewRecord.pageChangedBeforeConfirm")); return; }
      setMessage(i18n.t("lens:lensReviewRecord.saveFailed"));
    } catch { if (token === generation.current) setMessage(i18n.t("lens:lensReviewRecord.saveFailed")); }
    finally { if (token === generation.current) setBusy(null); }
  }

  async function changeVerdict(record: LensReviewRecord, verdict: LensReviewVerdict) {
    const api = window.api?.lens;
    if (!api?.setReviewRecordVerdict) return;
    setBusy("save"); setMessage(undefined);
    try {
      const result = await api.setReviewRecordVerdict({ id: record.id, verdict });
      if (!result.ok) setMessage(result.code === "page-changed" ? i18n.t("lens:lensReviewRecord.pageChangedBeforeConfirm") : i18n.t("lens:lensReviewRecord.saveFailed"));
    } catch { setMessage(i18n.t("lens:lensReviewRecord.saveFailed")); }
    finally { setBusy(null); refreshSaved(); }
  }

  const aspectRatio = targetAspectRatio(annotation);
  const hasRecord = saved.state.status === "ready" && saved.state.data.record !== null;
  return <div className={sx(styles.editor)}>
    <div className={sx(styles.actions)}>
      <Button size="xs" disabled={busy !== null || !original} onClick={() => void compare()}>
        {busy === "compare" ? i18n.t("lens:lensFeedbackComparison.capturing") : hasRecord ? i18n.t("lens:lensReviewRecord.compareAgain") : i18n.t("lens:lensFeedbackComparison.compareCurrentTarget")}
      </Button>
    </div>
    {!original ? <p className={sx(styles.hint)}>{i18n.t("lens:lensFeedbackComparison.noOriginalImageWasCapturedSelectThe")}</p> : null}
    {capture && original ? (
      <section className={sx(styles.record)} aria-label={i18n.t("lens:lensReviewRecord.pendingRegion")}>
        <ReviewVersionCompare
          defaultMode="side-by-side"
          aspectRatio={aspectRatio}
          baselineLabel={i18n.t("lens:lensFeedbackComparison.before")}
          currentLabel={i18n.t("lens:lensFeedbackComparison.currentCapture")}
          baseline={<img className={sx(styles.compareImage)} src={original} alt={i18n.t("lens:lensFeedbackComparison.originalTarget")} />}
          current={<img className={sx(styles.compareImage)} src={capture.dataUrl} alt={i18n.t("lens:lensFeedbackComparison.currentTargetCandidate")} />}
        />
        <p className={sx(styles.hint)} role="status">{i18n.t("lens:lensFeedbackComparison.confirmThisIsTheSameTargetAnd")}</p>
        <div className={sx(styles.actions)}>
          <Button size="xs" variant="primary" disabled={busy !== null} onClick={() => void decide("confirmed")}>{i18n.t("lens:lensReviewRecord.confirm")}</Button>
          <Button size="xs" variant="outline" disabled={busy !== null} onClick={() => void decide("needs-recheck")}>{i18n.t("lens:lensReviewRecord.needsRecheck")}</Button>
        </div>
      </section>
    ) : (
      <AsyncBoundary state={saved.state} onRetry={saved.refresh} describeError={() => i18n.t("lens:lensReviewRecord.readFailed")}>
        {(data) => data.record ? (
          <LensReviewRecordView
            record={data.record}
            image={data.image}
            original={original}
            aspectRatio={aspectRatio}
            busy={busy !== null}
            onVerdict={(verdict) => void changeVerdict(data.record!, verdict)}
          />
        ) : null}
      </AsyncBoundary>
    )}
    {message ? <p role="status" className={sx(styles.hint)}>{message}</p> : null}
  </div>;
}
