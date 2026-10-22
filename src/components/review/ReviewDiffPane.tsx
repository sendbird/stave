import { i18n, useTranslation } from "@/i18n";
import { useEffect, useRef } from "react";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { DiffViewer } from "@/components/ads/components/DiffViewer";
import { sx } from "@/components/ads/utils/stylex";
import { AsyncBoundary } from "@/components/system/AsyncBoundary";
import type { ReviewFile, ReviewScope } from "@/lib/review/review-scope";
import { useAppStore } from "@/store/app.store";
import { describeReviewReadError } from "./review-errors";
import { reviewStyles as styles } from "./review.styles";
import { useReviewFileContent, type ReviewData } from "./useReviewData";

/**
 * The selected file's diff in the scope. Comments are written in the editor's
 * diff, where they anchor to lines; Review lists them in its inspector too,
 * because the editor's comment zones are not reachable by screen readers.
 */
/** Whether a file's diff has been shown: its content read, or its binary marker. A refused or failed read has not. */
export function isReviewDiffShown(state: { status: string }): boolean {
  return state.status === "ready";
}

export function ReviewDiffPane(props: { scope: ReviewScope; cwd: string | null; data: ReviewData; file: ReviewFile; onShown?: () => void }) {
  useTranslation();
  const { file } = props;
  const content = useReviewFileContent({ cwd: props.cwd, data: props.data, file });
  const onShown = useRef(props.onShown);
  onShown.current = props.onShown;
  const shown = isReviewDiffShown(content.state);
  useEffect(() => {
    if (shown) onShown.current?.();
  }, [shown, file.path]);
  const comment = async () => {
    if (content.state.status !== "ready") return;
    const { oldContent, newContent } = content.state.data;
    // A turn's edit is a snapshot of that turn; the other scopes end at the working tree.
    const editorTabId = props.scope.kind === "turn" ? `chat-diff:review:${props.scope.turnId}:${file.path}` : `scm-diff:${file.path}`;
    await useAppStore.getState().openDiffInEditor({ editorTabId, filePath: file.path, oldContent, newContent });
  };
  return (
    <div className={sx(styles.section)}>
      <div className={sx(styles.diffHeader)}>
        <span className={sx(styles.diffPath)}>{file.oldPath ? i18n.t("review:diff.renamed", { from: file.oldPath, to: file.path }) : file.path}</span>
        <Button size="xs" variant="outline" disabled={content.state.status !== "ready"} onClick={() => void comment()}>
          <MessageSquarePlus aria-hidden />
          {i18n.t("review:diff.comment")}
        </Button>
      </div>
      <AsyncBoundary state={content.state} onRetry={content.refresh} describeError={describeReviewReadError}>
        {(diff) => diff.binary
          ? <p className={sx(styles.note)}>{i18n.t("review:diff.binary")}</p>
          : diff.oldContent === diff.newContent
          ? <p className={sx(styles.note)}>{i18n.t("review:diff.noTextChange")}</p>
          // Plain text: token colours depend on the editor's theme being loaded, and Review must read without it.
          : <DiffViewer before={diff.oldContent} after={diff.newContent} mode="unified" granularity="word" xstyle={styles.diffBody} />}
      </AsyncBoundary>
    </div>
  );
}
