import { useMemo } from "react";
import { sx } from "../ads/utils/stylex";
import { resultStyles as styles } from "./result-review.styles";
import type { ResultEvidence } from "@/lib/reviews/result-evidence";
import type { CodeDiffPart } from "@/types/chat";
import {
  ChangedFilesBlock,
  FileChangeSummaryBlock,
} from "./chat-panel-file-blocks";

/**
 * The files a run reported, as the conversation lists changed files: a saved
 * change opens to its diff and into the editor, a file whose contents were
 * not saved keeps its path and opens as it is now. Read-only — Accept and
 * Reject belong to the message, not to its results.
 */
export function ResultFileSnapshots({
  evidence,
  taskId,
}: {
  evidence: ResultEvidence;
  taskId: string;
}) {
  const snapshots = evidence.snapshots;
  const parts = useMemo<CodeDiffPart[]>(
    () =>
      (snapshots ?? []).map((snapshot) => ({
        type: "code_diff",
        filePath: snapshot.filePath,
        oldContent: snapshot.oldContent,
        newContent: snapshot.newContent,
        status: snapshot.status,
      })),
    [snapshots],
  );
  const pathOnly = useMemo(() => {
    const saved = new Set(snapshots?.map((snapshot) => snapshot.filePath));
    return evidence.files
      .filter((file) => !saved.has(file))
      .map((filePath) => ({ filePath }));
  }, [evidence.files, snapshots]);
  if (evidence.files.length === 0 && parts.length === 0) return null;
  const excerpted = Boolean(snapshots?.some((snapshot) => snapshot.truncated));
  return (
    <div className={sx(styles.files)}>
      <h4 className={sx(styles.evidenceHeading)}>Files this run changed</h4>
      {parts.length > 0 ? (
        <ChangedFilesBlock
          parts={parts}
          taskId={taskId}
          messageId={evidence.messageId}
          readOnly
        />
      ) : null}
      {pathOnly.length > 0 ? (
        <FileChangeSummaryBlock
          rows={pathOnly}
          title={
            parts.length > 0
              ? `${pathOnly.length} more · contents not saved`
              : `${pathOnly.length} ${pathOnly.length === 1 ? "file" : "files"} · contents not saved`
          }
        />
      ) : null}
      <p className={sx(styles.muted)}>
        {excerpted
          ? "Some changes were saved as excerpts, so their diffs are partial. "
          : ""}
        Saved when the run ended; the files may have changed since
        {evidence.filesTruncated ? ", and the recorded list is incomplete" : ""}
        .
      </p>
    </div>
  );
}
