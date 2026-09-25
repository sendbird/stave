import { Skeleton } from "@/components/ads/components/Skeleton";
import { sx } from "@/components/ads/utils/stylex";
import * as stylex from "@stylexjs/stylex";
import {
  ArrowRight,
  CheckCircle2,
  GitBranch,
  Info,
  TriangleAlert,
} from "lucide-react";
import { CreateWorkspaceBranchPicker } from "@/components/layout/CreateWorkspaceBranchPicker";
import { Loader } from "@/components/ui";
import type { PrePrReviewFinding } from "@/lib/source-control-review";
import { openPrStyles } from "../top-bar-open-pr.styles";

export interface ScmStatusItem {
  path: string;
  code: string;
}

type InlineNoticeTone = "info" | "success" | "warning" | "error";

export interface InlineNotice {
  tone: InlineNoticeTone;
  title: string;
  description?: string;
}

/** Keep field labels aligned across PR creation and merge dialogs. */
export const FIELD_LABEL_CLASS = sx(openPrStyles.fieldLabel);

export function InlineNoticeBanner(props: { notice: InlineNotice }) {
  const toneStyle =
    props.notice.tone === "success"
      ? openPrStyles.noticeSuccess
      : props.notice.tone === "warning"
        ? openPrStyles.noticeWarning
        : props.notice.tone === "error"
          ? openPrStyles.noticeError
          : openPrStyles.noticeInfo;

  const Icon =
    props.notice.tone === "success"
      ? CheckCircle2
      : props.notice.tone === "warning" || props.notice.tone === "error"
        ? TriangleAlert
        : Info;

  return (
    <div
      className={sx(openPrStyles.notice, toneStyle)}
      role="status"
      aria-live="polite"
    >
      <Icon {...stylex.props(openPrStyles.noticeIcon)} />
      <div className={sx(openPrStyles.noticeBody)}>
        <p className={sx(openPrStyles.noticeTitle)}>{props.notice.title}</p>
        {props.notice.description ? (
          <p className={sx(openPrStyles.noticeDescription)}>
            {props.notice.description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function CreatePrLoadingSplash(props: {
  currentBranch?: string;
  baseBranch: string;
}) {
  return (
    <div className={sx(openPrStyles.splash)} role="status" aria-live="polite">
      <div className={sx(openPrStyles.splashCard)}>
        <div className={sx(openPrStyles.splashRow)}>
          <div className={sx(openPrStyles.splashMark)}>
            <Loader
              aria-hidden
              className={sx(openPrStyles.splashLoader)}
              size="xs"
              variant="scan"
            />
          </div>
          <div className={sx(openPrStyles.splashCopy)}>
            <p className={sx(openPrStyles.splashTitle)}>Preparing a PR draft</p>
            <p className={sx(openPrStyles.splashText)}>
              Reviewing {props.currentBranch ?? "HEAD"} against{" "}
              {props.baseBranch}, recent commits, and workspace PR guidance.
            </p>
          </div>
        </div>
      </div>

      <div className={sx(openPrStyles.skeletonCard)}>
        <div className={sx(openPrStyles.skeletonGroup)}>
          <Skeleton height={14} radius="9999px" width={56} />
          <Skeleton height={36} radius="0.5rem" width="100%" />
        </div>

        <div className={sx(openPrStyles.skeletonGroup)}>
          <Skeleton height={14} radius="9999px" width={96} />
          <div className={sx(openPrStyles.skeletonBlock)}>
            <Skeleton height={12} radius="9999px" width="91.666667%" />
            <Skeleton height={12} radius="9999px" width="80%" />
            <Skeleton height={12} radius="9999px" width="60%" />
          </div>
        </div>
      </div>
    </div>
  );
}

function formatReviewFindingLocation(finding: PrePrReviewFinding) {
  return finding.line ? `${finding.file}:${finding.line}` : finding.file;
}

function formatReviewFindingKind(kind: PrePrReviewFinding["kind"]) {
  return kind.replace(/_/g, " ");
}

function getReviewSeverityStyle(severity: PrePrReviewFinding["severity"]) {
  if (severity === "critical" || severity === "high") {
    return openPrStyles.tagDanger;
  }
  if (severity === "medium") {
    return openPrStyles.tagWarning;
  }
  return openPrStyles.tagNeutral;
}

export function PrePrReviewFindingsPanel(props: {
  findings: PrePrReviewFinding[];
  truncated?: boolean;
}) {
  if (props.findings.length === 0) {
    return null;
  }

  return (
    <div className={sx(openPrStyles.panel, openPrStyles.panelWarning)}>
      <div className={sx(openPrStyles.panelHead)}>
        <TriangleAlert
          {...stylex.props(
            openPrStyles.panelIcon,
            openPrStyles.panelIconWarning,
          )}
        />
        <div className={sx(openPrStyles.panelCopy)}>
          <p className={sx(openPrStyles.panelTitle)}>
            AI review found {props.findings.length} issue
            {props.findings.length === 1 ? "" : "s"}
          </p>
          <p className={sx(openPrStyles.panelText)}>
            Stop to fix these before opening the PR, or proceed if they are not
            relevant.
            {props.truncated ? " The review used a truncated diff." : ""}
          </p>
        </div>
      </div>

      <div className={sx(openPrStyles.panelList)}>
        {props.findings.map((finding, index) => (
          <div
            key={`${finding.file}:${finding.line ?? "file"}:${index}`}
            className={sx(openPrStyles.panelItem)}
          >
            <div className={sx(openPrStyles.panelItemTags)}>
              <span
                className={sx(
                  openPrStyles.tag,
                  getReviewSeverityStyle(finding.severity),
                )}
              >
                {finding.severity}
              </span>
              <span className={sx(openPrStyles.tag, openPrStyles.tagNeutral)}>
                {formatReviewFindingKind(finding.kind)}
              </span>
              <span className={sx(openPrStyles.tagLocation)}>
                {formatReviewFindingLocation(finding)}
              </span>
            </div>
            <p className={sx(openPrStyles.panelItemMessage)}>
              {finding.message}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PrePrVerificationPanel(props: {
  failures: Array<{ scriptId: string; message: string; blocking: boolean }>;
  blocking: boolean;
}) {
  if (props.failures.length === 0) {
    return null;
  }

  const containerStyle = props.blocking
    ? openPrStyles.panelDanger
    : openPrStyles.panelWarning;
  const iconStyle = props.blocking
    ? openPrStyles.panelIconDanger
    : openPrStyles.panelIconWarning;

  return (
    <div className={sx(openPrStyles.panel, containerStyle)}>
      <div className={sx(openPrStyles.panelHead)}>
        <TriangleAlert {...stylex.props(openPrStyles.panelIcon, iconStyle)} />
        <div className={sx(openPrStyles.panelCopy)}>
          <p className={sx(openPrStyles.panelTitle)}>
            Verification {props.blocking ? "failed" : "reported warnings"} —{" "}
            {props.failures.length} check
            {props.failures.length === 1 ? "" : "s"}
          </p>
          <p className={sx(openPrStyles.panelText)}>
            {props.blocking
              ? "Blocking pr.beforeOpen checks failed. Fix them before opening the PR."
              : "These pr.beforeOpen checks are non-blocking — proceed anyway, or stop to fix them first."}
          </p>
        </div>
      </div>

      <div className={sx(openPrStyles.panelList)}>
        {props.failures.map((failure, index) => (
          <div
            key={`${failure.scriptId}:${index}`}
            className={sx(openPrStyles.panelItem)}
          >
            <div className={sx(openPrStyles.panelItemTags)}>
              <span className={sx(openPrStyles.tag, openPrStyles.tagNeutral)}>
                {failure.scriptId}
              </span>
              <span
                className={sx(
                  openPrStyles.tag,
                  failure.blocking
                    ? openPrStyles.tagOutlineDanger
                    : openPrStyles.tagOutlineWarning,
                )}
              >
                {failure.blocking ? "blocking" : "non-blocking"}
              </span>
            </div>
            <p className={sx(openPrStyles.panelItemMessage)}>
              {failure.message}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PullRequestBranchFields(props: {
  currentBranch?: string;
  defaultBranch: string;
  disabled?: boolean;
  loading?: boolean;
  onTargetBranchChange: (branch: string) => void;
  targetBranch: string;
  targetBranchOptions: string[];
}) {
  const headBranch = props.currentBranch?.trim() || "HEAD";

  return (
    <div className={sx(openPrStyles.branchCard)}>
      <div className={sx(openPrStyles.branchGrid)}>
        <div className={sx(openPrStyles.branchField)}>
          <p className={FIELD_LABEL_CLASS}>From</p>
          <div className={sx(openPrStyles.branchReadout)}>
            <GitBranch {...stylex.props(openPrStyles.branchReadoutIcon)} />
            <span className={sx(openPrStyles.truncate)}>{headBranch}</span>
          </div>
        </div>

        <ArrowRight
          {...stylex.props(openPrStyles.branchArrow)}
          aria-hidden="true"
        />

        <div className={sx(openPrStyles.branchField)}>
          <p className={FIELD_LABEL_CLASS}>Into</p>
          <CreateWorkspaceBranchPicker
            value={props.targetBranch}
            defaultBranch={props.defaultBranch}
            disabled={props.disabled}
            localBranches={[]}
            loading={props.loading}
            remoteBranches={props.targetBranchOptions}
            onChange={props.onTargetBranchChange}
          />
        </div>
      </div>
    </div>
  );
}
