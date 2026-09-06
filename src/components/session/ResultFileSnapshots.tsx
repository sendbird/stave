import { sx } from "../ads/utils/stylex";
import { resultStyles as styles } from "./result-review.styles";
import { focusRing } from "../ads/recipes/focus-ring";
import { useState } from "react";
import type { ResultEvidence } from "@/lib/reviews/result-evidence";

type Snapshot = NonNullable<ResultEvidence["snapshots"]>[number];

function FileSnapshot({ snapshot }: { snapshot: Snapshot }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className={sx(styles.snapshot)}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className={sx(styles.snapshotSummary, focusRing.ring)}>
        {snapshot.filePath}
      </summary>
      {open ? (
        <div className={sx(styles.snapshotContent)}>
          <p className={sx(styles.muted)}>
            Last recorded change for this file ·{" "}
            {snapshot.status === "accepted"
              ? "Applied"
              : snapshot.status === "rejected"
                ? "Rejected"
                : "Proposed"}
          </p>
          {snapshot.truncated ? (
            <p className={sx(styles.muted)}>
              Only excerpts were saved. These do not show the complete change.
            </p>
          ) : null}
          {(["oldContent", "newContent"] as const).map((side) => (
            <div key={side} className={sx(styles.snapshotSide)}>
              <p className={sx(styles.evidenceHeading)}>
                {side === "oldContent" ? "Before" : "After"}
              </p>
              <pre
                tabIndex={0}
                aria-label={`${side === "oldContent" ? "Before" : "After"}: ${snapshot.filePath}`}
                className={sx(styles.code, focusRing.ring)}
              >
                {snapshot[side] || "(empty)"}
              </pre>
            </div>
          ))}
        </div>
      ) : null}
    </details>
  );
}

export function ResultFileSnapshots({
  evidence,
}: {
  evidence: ResultEvidence;
}) {
  if (!evidence.snapshots?.length) return null;
  return (
    <div className={sx(styles.snapshots)}>
      <h4 className={sx(styles.snapshotsHeading)}>Recorded file changes</h4>
      <p className={sx(styles.snapshotsDescription)}>
        Saved from this run’s reported changes. These are historical contents;
        they do not verify the current workspace or include unreported changes.
      </p>
      {evidence.snapshotsTruncated ? (
        <p className={sx(styles.snapshotsDescription)}>
          Some changes or content were omitted from this snapshot.
        </p>
      ) : null}
      {evidence.snapshots.map((snapshot) => (
        <FileSnapshot key={snapshot.filePath} snapshot={snapshot} />
      ))}
      {evidence.files
        .filter(
          (file) =>
            !evidence.snapshots!.some((snapshot) => snapshot.filePath === file),
        )
        .map((file) => (
          <p key={file} className={sx(styles.uncaptured)}>
            <span className={sx(styles.mono)}>{file}</span> · Contents not
            captured
          </p>
        ))}
    </div>
  );
}
