import { Button as AdsButton } from "@/components/ads/components/Button";
import {
  Check,
  ClipboardList,
  Copy,
  Crosshair,
  File,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  History,
  ListChecks,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Timer,
  Wrench,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  Badge,
  Button,
  Input,
  Loader,
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PR_STATUS_VISUAL,
  type PrStatusTone,
  type WorkspacePrStatus,
} from "@/lib/pr-status";
import { prToneIconStyles } from "./pr-status.styles";
import type { SourceControlStatusItem } from "@/lib/source-control-status";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { transition } from "@/components/ads/recipes/transition";
import { sx } from "@/components/ads/utils/stylex";
import {
  changesStyles,
  checkToneStyles,
  scmActionToneStyles,
  scmStatusToneStyles,
  scmSummaryToneStyles,
} from "./workspace-changes.styles";
import {
  type TurnVerificationResult,
  type TurnVerificationStatus,
  describeTurnVerification,
} from "@/lib/workspace-scripts";
import type { TurnIntentComplianceResult } from "@/lib/source-control-review";
import type {
  GitHubPrFile,
  GitHubPrReviewDetail,
} from "@/lib/github-pr-review";
import { VerificationStatusIcon } from "./VerificationStatusIcon";
import { SourceControlReviewsPanel } from "./SourceControlReviewsPanel";
import { WorkspaceFileIcon } from "./explorer-entry-icon";
import type {
  SourceControlItemViewModel,
  SourceControlSection,
  SourceControlSummary,
} from "./editor-panel.utils";

type SourceControlPanelView = "changes" | "history" | "checks";
type SourceControlPanelMode = "workspace" | "reviews";

/**
 * Pre-merge roll-up data that is not already carried by the panel's other
 * props (verification + intent live in their own props). Computed by the parent
 * from workspace information + cached PR status.
 */
export interface WorkspaceChecksViewModel {
  prStatus: WorkspacePrStatus;
  pr: { number: number; title: string; url: string } | null;
  openTodoCount: number;
  totalTodoCount: number;
  openTodos: string[];
}

type ChecksTone = "ok" | "warn" | "fail" | "neutral";

/** Collapse a verification/intent status into the local check tone. */
function statusToChecksTone(status: TurnVerificationStatus): ChecksTone {
  if (status === "pass") return "ok";
  if (status === "warn") return "warn";
  return "fail";
}

/** Collapse a GitHub PR tone into the local check tone. */
function prToneToChecksTone(tone: PrStatusTone): ChecksTone {
  if (tone === "open" || tone === "done") return "ok";
  if (tone === "attention") return "warn";
  if (tone === "danger" || tone === "closed") return "fail";
  return "neutral";
}

function ChecksSection(args: {
  icon: ReactNode;
  title: string;
  summary: string;
  tone: ChecksTone;
  children?: ReactNode;
}) {
  return (
    <section className={sx(changesStyles.checksSection)}>
      <div className={sx(changesStyles.checksHead)}>
        <span
          className={sx(changesStyles.checksIcon, checkToneStyles[args.tone])}
        >
          {args.icon}
        </span>
        <p className={sx(changesStyles.checksTitle)}>{args.title}</p>
        <span
          className={sx(changesStyles.checksSummary, checkToneStyles[args.tone])}
        >
          {args.summary}
        </span>
      </div>
      {args.children}
    </section>
  );
}

function ChecksTabContent(props: {
  checks: WorkspaceChecksViewModel;
  verification?: TurnVerificationResult | null;
  intentCompliance?: TurnIntentComplianceResult | null;
  sourceControlSummary: SourceControlSummary;
  sourceBranch: string;
  changedCount: number;
  onSelectDiff: (path: string) => Promise<void>;
  onFixVerificationWithAgent?: (args?: { scriptId?: string }) => void;
}) {
  const verification = props.verification ?? null;
  const intent = props.intentCompliance ?? null;
  const { stagedCount, workingTreeCount, conflictCount } =
    props.sourceControlSummary;
  const { openTodoCount, totalTodoCount, openTodos } = props.checks;
  const prVisual = PR_STATUS_VISUAL[props.checks.prStatus];

  const verificationSummary = !verification
    ? "Not run"
    : verification.status === "pass"
      ? "Passed"
      : `${verification.failures.length} ${verification.status === "fail" ? "failing" : "warnings"}`;
  const intentSummary = !intent
    ? "Not run"
    : intent.findings.length === 0
      ? "Consistent"
      : `${intent.findings.length} to review`;
  const treeTone: ChecksTone =
    conflictCount > 0 ? "fail" : props.changedCount > 0 ? "neutral" : "ok";
  const treeSummary =
    conflictCount > 0
      ? `${conflictCount} conflict${conflictCount === 1 ? "" : "s"}`
      : props.changedCount > 0
        ? `${props.changedCount} changed`
        : "Clean";

  return (
    <div className={sx(changesStyles.checks)}>
      <ChecksSection
        icon={<GitPullRequest className={sx(changesStyles.glyphMd)} />}
        title="Pull request"
        summary={prVisual.label}
        tone={prToneToChecksTone(prVisual.tone)}
      >
        {props.checks.pr ? (
          <p className={sx(changesStyles.checksLine)}>
            <span
              className={sx(
                changesStyles.checksStrong,
                prToneIconStyles[prVisual.tone],
              )}
            >
              #{props.checks.pr.number}
            </span>{" "}
            {props.checks.pr.title}
          </p>
        ) : (
          <p className={sx(changesStyles.checksLine)}>
            No pull request linked to this branch yet.
          </p>
        )}
      </ChecksSection>

      <ChecksSection
        icon={<ListChecks className={sx(changesStyles.glyphMd)} />}
        title="Verification"
        summary={verificationSummary}
        tone={
          verification ? statusToChecksTone(verification.status) : "neutral"
        }
      >
        {verification && verification.failures.length > 0 ? (
          <div className={sx(changesStyles.checksStack)}>
            {props.onFixVerificationWithAgent ? (
              <Button
                type="button"
                size="xs"
                variant="outline"
                xstyle={changesStyles.fixAllButton}
                onClick={() => props.onFixVerificationWithAgent?.()}
                title="Send these failures to the agent as the next turn"
              >
                <Wrench className={sx(changesStyles.glyphXs)} />
                {verification.failures.length > 1
                  ? "Fix all with agent"
                  : "Fix with agent"}
              </Button>
            ) : null}
            <ul className={sx(changesStyles.checksStack)}>
              {verification.failures.map((failure, index) => (
                <li
                  key={`${failure.scriptId}-${index}`}
                  className={sx(changesStyles.failureItem)}
                >
                  <div className={sx(changesStyles.failureHead)}>
                    <span
                      className={sx(
                        changesStyles.failureTag,
                        failure.blocking
                          ? changesStyles.failureTagBlocking
                          : changesStyles.failureTagWarn,
                      )}
                    >
                      {failure.blocking ? "blocking" : "warn"}
                    </span>
                    <span className={sx(changesStyles.truncate)}>
                      {failure.scriptId}
                    </span>
                    {props.onFixVerificationWithAgent &&
                    verification.failures.length > 1 ? (
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        xstyle={changesStyles.fixOneButton}
                        onClick={() =>
                          props.onFixVerificationWithAgent?.({
                            scriptId: failure.scriptId,
                          })
                        }
                        title={`Send only ${failure.scriptId} to the agent`}
                      >
                        <Wrench className={sx(changesStyles.glyphXs)} />
                        Fix
                      </Button>
                    ) : null}
                  </div>
                  <p className={sx(changesStyles.failureMessage)}>
                    {failure.message}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </ChecksSection>

      <ChecksSection
        icon={<Crosshair className={sx(changesStyles.glyphMd)} />}
        title="Intent guard"
        summary={intentSummary}
        tone={intent ? statusToChecksTone(intent.status) : "neutral"}
      >
        {intent && intent.findings.length > 0 ? (
          <ul className={sx(changesStyles.checksList)}>
            {intent.findings.map((finding, index) => (
              <li key={`${finding.file}-${index}`}>
                <AdsButton
                  layout="host"
                  type="button"
                  xstyle={[
                    changesStyles.findingButton,
                    changesStyles.findingButtonInline,
                  ]}
                  onClick={() => void props.onSelectDiff(finding.file)}
                  title={`Open ${finding.file}`}
                >
                  <span className={sx(changesStyles.findingHead)}>
                    <span className={sx(changesStyles.findingSeverity)}>
                      {finding.severity}
                    </span>
                    <span className={sx(changesStyles.truncate)}>
                      {finding.file}
                      {typeof finding.line === "number"
                        ? `:${finding.line}`
                        : ""}
                    </span>
                  </span>
                  <span className={sx(changesStyles.findingMessage)}>
                    {finding.message}
                  </span>
                </AdsButton>
              </li>
            ))}
          </ul>
        ) : null}
      </ChecksSection>

      <ChecksSection
        icon={<GitBranch className={sx(changesStyles.glyphMd)} />}
        title="Working tree"
        summary={treeSummary}
        tone={treeTone}
      >
        <p className={sx(changesStyles.checksLine)}>
          <span className={sx(changesStyles.checksStrong)}>
            {props.sourceBranch}
          </span>
          {" · "}
          {stagedCount} staged · {workingTreeCount} working tree
          {conflictCount > 0 ? ` · ${conflictCount} conflicts` : ""}
        </p>
      </ChecksSection>

      <ChecksSection
        icon={<ClipboardList className={sx(changesStyles.glyphMd)} />}
        title="Todos"
        summary={
          totalTodoCount === 0
            ? "None"
            : `${openTodoCount} open / ${totalTodoCount}`
        }
        tone={openTodoCount > 0 ? "warn" : "ok"}
      >
        {openTodos.length > 0 ? (
          <ul className={sx(changesStyles.checksTodoList)}>
            {openTodos.slice(0, 6).map((text, index) => (
              <li key={`${index}-${text}`} className={sx(changesStyles.checksTodoRow)}>
                <span className={sx(changesStyles.checksTodoDot)} />
                <span className={sx(changesStyles.truncate)}>{text}</span>
              </li>
            ))}
            {openTodos.length > 6 ? (
              <li className={sx(changesStyles.checksTodoMore)}>
                +{openTodos.length - 6} more
              </li>
            ) : null}
          </ul>
        ) : null}
      </ChecksSection>
    </div>
  );
}

interface SourceControlHistoryEntry {
  hash: string;
  relativeDate: string;
  subject: string;
}

const AUTO_REFRESH_OPTIONS: Array<{ seconds: number; label: string }> = [
  { seconds: 0, label: "Off" },
  { seconds: 5, label: "Every 5 seconds" },
  { seconds: 10, label: "Every 10 seconds" },
  { seconds: 30, label: "Every 30 seconds" },
  { seconds: 60, label: "Every minute" },
];

function formatAutoRefreshShortLabel(seconds: number) {
  if (seconds <= 0) return "Off";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m`;
}

function formatFileCount(count: number) {
  return `${count} file${count === 1 ? "" : "s"}`;
}

function formatRecentCommitCount(count: number) {
  return `${count} recent commit${count === 1 ? "" : "s"}`;
}

function SourceControlActionButton(args: {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  tone?: "default" | "destructive" | "success";
}) {
  return (
    <Button
      type="button"
      size="icon-xs"
      variant="ghost"
      aria-label={args.label}
      title={args.label}
      xstyle={[
        changesStyles.rowActionButton,
        transition.colors,
        scmActionToneStyles[args.tone ?? "default"],
      ]}
      disabled={args.disabled}
      onClick={args.onClick}
    >
      {args.icon}
    </Button>
  );
}

function SourceControlRow(args: {
  isScmBusy: boolean;
  item: SourceControlItemViewModel;
  onCopyPath: (path: string) => void;
  onDiscard: (item: SourceControlStatusItem) => void;
  onOpenDiff: (path: string) => void;
  onStage: (item: SourceControlStatusItem) => void;
  onUnstage: (item: SourceControlStatusItem) => void;
}) {
  const statusTone = args.item.isConflict
    ? "conflict"
    : args.item.hasMixedChanges || args.item.hasUnstagedChanges
      ? "unstaged"
      : args.item.hasStagedChanges
        ? "staged"
        : "none";

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div className={sx(changesStyles.fileRow, transition.colors)} />
        }
      >
        <AdsButton
          layout="host"
          type="button"
          xstyle={[changesStyles.fileOpen, focusRing.ring]}
          onClick={() => args.onOpenDiff(args.item.pathLabel)}
        >
          <WorkspaceFileIcon fileName={args.item.fileName} />
          <div className={sx(changesStyles.fileBody)}>
            <div className={sx(changesStyles.fileTitleRow)}>
              <span className={sx(changesStyles.fileName)}>
                {args.item.fileName}
              </span>
              {args.item.hasMixedChanges ? (
                <Badge
                  variant="outline"
                  className={sx(changesStyles.fileBadge)}
                >
                  partial
                </Badge>
              ) : null}
              {args.item.isUntracked ? (
                <Badge
                  variant="outline"
                  className={sx(changesStyles.fileBadge)}
                >
                  new
                </Badge>
              ) : null}
              {args.item.verificationStatus ? (
                <VerificationStatusIcon
                  status={args.item.verificationStatus}
                  className={sx(changesStyles.fileVerification)}
                />
              ) : null}
            </div>
            <p className={sx(changesStyles.filePath)}>{args.item.pathDetail}</p>
          </div>
        </AdsButton>

        <div className={sx(changesStyles.fileTail)}>
          <span
            className={sx(
              changesStyles.fileCode,
              scmStatusToneStyles[statusTone],
            )}
          >
            {args.item.displayCode}
          </span>
          <div className={sx(changesStyles.fileActions)}>
            {args.item.canStage ? (
              <SourceControlActionButton
                label="Stage"
                disabled={args.isScmBusy}
                icon={<Plus className={sx(changesStyles.glyphSm)} />}
                onClick={() => args.onStage(args.item.item)}
                tone="success"
              />
            ) : null}
            {args.item.canUnstage ? (
              <SourceControlActionButton
                label="Unstage"
                disabled={args.isScmBusy}
                icon={<Minus className={sx(changesStyles.glyphSm)} />}
                onClick={() => args.onUnstage(args.item.item)}
                tone="default"
              />
            ) : null}
            {args.item.canDiscard ? (
              <SourceControlActionButton
                label="Discard"
                disabled={args.isScmBusy}
                icon={<RotateCcw className={sx(changesStyles.glyphSm)} />}
                onClick={() => args.onDiscard(args.item.item)}
                tone="destructive"
              />
            ) : null}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className={sx(changesStyles.contextMenu)}>
        <ContextMenuItem onSelect={() => args.onOpenDiff(args.item.pathLabel)}>
          <File className={sx(changesStyles.glyphMd)} />
          Open Changes
        </ContextMenuItem>
        {args.item.canStage || args.item.canUnstage || args.item.canDiscard ? (
          <ContextMenuSeparator />
        ) : null}
        {args.item.canStage ? (
          <ContextMenuItem
            disabled={args.isScmBusy}
            onSelect={() => args.onStage(args.item.item)}
          >
            <Plus className={sx(changesStyles.glyphMd)} />
            Stage
          </ContextMenuItem>
        ) : null}
        {args.item.canUnstage ? (
          <ContextMenuItem
            disabled={args.isScmBusy}
            onSelect={() => args.onUnstage(args.item.item)}
          >
            <Minus className={sx(changesStyles.glyphMd)} />
            Unstage
          </ContextMenuItem>
        ) : null}
        {args.item.canDiscard ? (
          <ContextMenuItem
            variant="destructive"
            disabled={args.isScmBusy}
            onSelect={() => args.onDiscard(args.item.item)}
          >
            <RotateCcw className={sx(changesStyles.glyphMd)} />
            Discard
          </ContextMenuItem>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => args.onCopyPath(args.item.pathLabel)}>
          <Copy className={sx(changesStyles.glyphMd)} />
          Copy path
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function SourceControlHistoryRow(args: {
  isLast: boolean;
  item: SourceControlHistoryEntry;
}) {
  return (
    <div className={sx(changesStyles.historyRow, transition.colors)}>
      <div className={sx(changesStyles.historyRail)}>
        <span className={sx(changesStyles.historyNode)} />
        {!args.isLast ? (
          <span className={sx(changesStyles.historyThread)} />
        ) : null}
      </div>
      <div className={sx(changesStyles.historyContent)}>
        <div className={sx(changesStyles.historyLead)}>
          <div className={sx(changesStyles.fileBody)}>
            <p className={sx(changesStyles.historySubject)}>
              {args.item.subject}
            </p>
            <div className={sx(changesStyles.historyMeta)}>
              <span className={sx(changesStyles.historyHash)}>
                {args.item.hash}
              </span>
              <span className={sx(changesStyles.historyDot)} />
              <span>{args.item.relativeDate}</span>
            </div>
          </div>
          <GitCommitHorizontal
            className={sx(changesStyles.historyCommitIcon)}
          />
        </div>
      </div>
    </div>
  );
}

export function WorkspaceChangesPanel(props: {
  sourceBranch: string;
  filteredScmItems: SourceControlStatusItem[];
  sourceControlSummary: SourceControlSummary;
  sourceControlHint: string;
  isScmBusy: boolean;
  commitMessage: string;
  onCommitMessageChange: (value: string) => void;
  canCommitStagedChanges: boolean;
  canUnstageAnyChanges: boolean;
  onCommit: () => Promise<void>;
  onStageAll: () => Promise<void>;
  onUnstageAll: () => Promise<void>;
  hasConflicts: boolean;
  sourceError: string;
  sourceControlSections: SourceControlSection[];
  onCopySourceControlPath: (path: string) => Promise<void>;
  onSelectDiff: (path: string) => Promise<void>;
  onStageAction: (args: {
    action: "stage" | "unstage";
    item: SourceControlStatusItem;
  }) => Promise<void>;
  onDiscardChange: (item: SourceControlStatusItem) => Promise<void>;
  sourceHistory: SourceControlHistoryEntry[];
  onRefresh: () => Promise<void>;
  autoRefreshSeconds: number;
  onAutoRefreshSecondsChange: (seconds: number) => void;
  verification?: TurnVerificationResult | null;
  intentCompliance?: TurnIntentComplianceResult | null;
  /**
   * Forward failing verification checks back to the agent as the next turn.
   * Omit a `scriptId` to fix every failure; pass one to fix a single check.
   * When absent, the fix actions are hidden.
   */
  onFixVerificationWithAgent?: (args?: { scriptId?: string }) => void;
  /** Pre-merge roll-up data for the Checks tab. When absent, the tab is hidden. */
  checks?: WorkspaceChecksViewModel | null;
  reviewCwd?: string;
  onOpenPrDiff: (args: {
    detail: GitHubPrReviewDetail;
    file: GitHubPrFile;
  }) => Promise<void>;
}) {
  const [mode, setMode] = useState<SourceControlPanelMode>("workspace");
  const [view, setView] = useState<SourceControlPanelView>("changes");
  const verificationFailureCount = props.verification?.failures.length ?? 0;
  const showChecksTab = Boolean(props.checks);
  // Count the actionable, merge-blocking signals surfaced on the Checks tab.
  const checksAttentionCount =
    (props.verification && props.verification.status !== "pass"
      ? props.verification.failures.length
      : 0) +
    (props.intentCompliance?.findings.length ?? 0) +
    props.sourceControlSummary.conflictCount;
  const showStageAll = props.sourceControlSummary.workingTreeCount > 0;
  const showUnstageAll = props.canUnstageAnyChanges;
  const showComposer =
    props.filteredScmItems.length > 0 || props.commitMessage.trim().length > 0;
  const summaryLabels = [
    props.sourceControlSummary.stagedCount > 0
      ? {
          tone: "staged" as const,
          text: `Staged ${props.sourceControlSummary.stagedCount}`,
        }
      : null,
    props.sourceControlSummary.workingTreeCount > 0
      ? {
          tone: "workingTree" as const,
          text: `Working tree ${props.sourceControlSummary.workingTreeCount}`,
        }
      : null,
    props.sourceControlSummary.conflictCount > 0
      ? {
          tone: "conflicts" as const,
          text: `Conflicts ${props.sourceControlSummary.conflictCount}`,
        }
      : null,
  ].filter(Boolean) as Array<{
    tone: keyof typeof scmSummaryToneStyles;
    text: string;
  }>;

  return (
    <Tabs
      value={mode}
      onValueChange={(nextValue) =>
        setMode(nextValue as SourceControlPanelMode)
      }
      className={sx(changesStyles.shell)}
    >
      <div className={sx(changesStyles.modeBar)}>
        <TabsList className={sx(changesStyles.tabList)}>
          <TabsTrigger
            value="workspace"
            className={sx(changesStyles.tabWide)}
          >
            <GitBranch className={sx(changesStyles.glyphSm)} />
            Workspace
          </TabsTrigger>
          <TabsTrigger value="reviews" className={sx(changesStyles.tabWide)}>
            <GitPullRequest className={sx(changesStyles.glyphSm)} />
            Reviews
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="reviews" className={sx(changesStyles.pane)}>
        <SourceControlReviewsPanel
          cwd={props.reviewCwd}
          onOpenDiff={props.onOpenPrDiff}
        />
      </TabsContent>

      <TabsContent value="workspace" className={sx(changesStyles.pane)}>
        <Tabs
          value={view}
          onValueChange={(nextValue) =>
            setView(nextValue as SourceControlPanelView)
          }
          className={sx(changesStyles.shell)}
        >
          <div className={sx(changesStyles.viewBar)}>
            <TabsList className={sx(changesStyles.tabListInline)}>
              <TabsTrigger value="changes" className={sx(changesStyles.tab)}>
                <span>Changes</span>
                <span className={sx(changesStyles.tabCount)}>
                  {props.filteredScmItems.length}
                </span>
              </TabsTrigger>
              <TabsTrigger value="history" className={sx(changesStyles.tab)}>
                <History className={sx(changesStyles.glyphSm)} />
                <span>History</span>
                <span className={sx(changesStyles.tabCount)}>
                  {props.sourceHistory.length}
                </span>
              </TabsTrigger>
              {showChecksTab ? (
                <TabsTrigger value="checks" className={sx(changesStyles.tab)}>
                  <ListChecks className={sx(changesStyles.glyphSm)} />
                  <span>Checks</span>
                  {checksAttentionCount > 0 ? (
                    <span className={sx(changesStyles.tabAlert)}>
                      {checksAttentionCount}
                    </span>
                  ) : null}
                </TabsTrigger>
              ) : null}
            </TabsList>
            {props.verification ? (
              props.verification.failures.length > 0 ? (
                <Popover>
                  <PopoverTrigger
                    render={
                      <AdsButton
                        layout="host"
                        type="button"
                        xstyle={[
                          changesStyles.statusChip,
                          changesStyles.statusChipPressable,
                          transition.colors,
                          checkToneStyles[
                            statusToChecksTone(props.verification.status)
                          ],
                        ]}
                        aria-label={describeTurnVerification(
                          props.verification,
                        )}
                      />
                    }
                  >
                    <VerificationStatusIcon
                      status={props.verification.status}
                    />
                    <span>{props.verification.failures.length}</span>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    className={sx(changesStyles.popover)}
                  >
                    <PopoverHeader className={sx(changesStyles.popoverHeader)}>
                      <div className={sx(changesStyles.popoverHeaderRow)}>
                        <PopoverTitle
                          className={sx(changesStyles.popoverTitle)}
                        >
                          Verification
                        </PopoverTitle>
                        {props.onFixVerificationWithAgent ? (
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            xstyle={changesStyles.fixAllButton}
                            onClick={() => props.onFixVerificationWithAgent?.()}
                            title="Send these failures to the agent as the next turn"
                          >
                            <Wrench className={sx(changesStyles.glyphXs)} />
                            {verificationFailureCount > 1
                              ? "Fix all with agent"
                              : "Fix with agent"}
                          </Button>
                        ) : null}
                      </div>
                      <p className={sx(changesStyles.popoverHint)}>
                        {describeTurnVerification(props.verification)}
                      </p>
                    </PopoverHeader>
                    <ul className={sx(changesStyles.popoverList)}>
                      {props.verification.failures.map((failure, index) => (
                        <li
                          key={`${failure.scriptId}-${index}`}
                          className={sx(changesStyles.popoverItem)}
                        >
                          <div className={sx(changesStyles.failureHead)}>
                            <span
                              className={sx(
                                changesStyles.failureTag,
                                failure.blocking
                                  ? changesStyles.failureTagBlocking
                                  : changesStyles.failureTagWarn,
                              )}
                            >
                              {failure.blocking ? "blocking" : "warn"}
                            </span>
                            <span className={sx(changesStyles.truncate)}>
                              {failure.scriptId}
                            </span>
                            {props.onFixVerificationWithAgent &&
                            verificationFailureCount > 1 ? (
                              <Button
                                type="button"
                                size="xs"
                                variant="ghost"
                                xstyle={changesStyles.fixOneButton}
                                onClick={() =>
                                  props.onFixVerificationWithAgent?.({
                                    scriptId: failure.scriptId,
                                  })
                                }
                                title={`Send only ${failure.scriptId} to the agent`}
                              >
                                <Wrench className={sx(changesStyles.glyphXs)} />
                                Fix
                              </Button>
                            ) : null}
                          </div>
                          <p className={sx(changesStyles.failureMessage)}>
                            {failure.message}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </PopoverContent>
                </Popover>
              ) : (
                <div
                  className={sx(
                    changesStyles.statusChip,
                    checkToneStyles[
                      statusToChecksTone(props.verification.status)
                    ],
                  )}
                  title={describeTurnVerification(props.verification)}
                >
                  <VerificationStatusIcon status={props.verification.status} />
                </div>
              )
            ) : null}
            {props.intentCompliance ? (
              props.intentCompliance.findings.length > 0 ? (
                <Popover>
                  <PopoverTrigger
                    render={
                      <AdsButton
                        layout="host"
                        type="button"
                        xstyle={[
                          changesStyles.statusChip,
                          changesStyles.statusChipPressable,
                          transition.colors,
                          checkToneStyles[
                            statusToChecksTone(props.intentCompliance.status)
                          ],
                        ]}
                        aria-label={`Intent guard: ${props.intentCompliance.findings.length} possible issue${props.intentCompliance.findings.length === 1 ? "" : "s"} vs the pinned intent`}
                      />
                    }
                  >
                    <Crosshair className={sx(changesStyles.glyphSm)} />
                    <span>{props.intentCompliance.findings.length}</span>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    className={sx(changesStyles.popover)}
                  >
                    <PopoverHeader className={sx(changesStyles.popoverHeader)}>
                      <PopoverTitle className={sx(changesStyles.popoverTitle)}>
                        Intent guard
                      </PopoverTitle>
                      <p className={sx(changesStyles.popoverHint)}>
                        Possible deviations from the pinned intent. Click to
                        open the file.
                      </p>
                    </PopoverHeader>
                    <ul className={sx(changesStyles.popoverList)}>
                      {props.intentCompliance.findings.map((finding, index) => (
                        <li key={`${finding.file}-${index}`}>
                          <AdsButton
                            layout="host"
                            type="button"
                            xstyle={changesStyles.findingButton}
                            onClick={() =>
                              void props.onSelectDiff(finding.file)
                            }
                            title={`Open ${finding.file}`}
                          >
                            <span className={sx(changesStyles.findingHead)}>
                              <span
                                className={sx(changesStyles.findingSeverity)}
                              >
                                {finding.severity}
                              </span>
                              <span className={sx(changesStyles.truncate)}>
                                {finding.file}
                                {typeof finding.line === "number"
                                  ? `:${finding.line}`
                                  : ""}
                              </span>
                            </span>
                            <span className={sx(changesStyles.findingMessage)}>
                              {finding.message}
                            </span>
                          </AdsButton>
                        </li>
                      ))}
                    </ul>
                  </PopoverContent>
                </Popover>
              ) : (
                <div
                  className={sx(
                    changesStyles.statusChip,
                    checkToneStyles[
                      statusToChecksTone(props.intentCompliance.status)
                    ],
                  )}
                  title="Intent guard: consistent with the pinned intent"
                >
                  <Crosshair className={sx(changesStyles.glyphSm)} />
                </div>
              )
            ) : null}
            <div className={sx(changesStyles.toolbar)}>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label="Refresh source control"
                title="Refresh"
                xstyle={changesStyles.refreshButton}
                disabled={props.isScmBusy}
                onClick={() => void props.onRefresh()}
              >
                <RefreshCw
                  className={sx(
                    changesStyles.glyphSm,
                    props.isScmBusy && changesStyles.spinning,
                  )}
                />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      aria-label="Auto refresh options"
                      title={
                        props.autoRefreshSeconds > 0
                          ? `Auto refresh: ${formatAutoRefreshShortLabel(props.autoRefreshSeconds)}`
                          : "Auto refresh: Off"
                      }
                      xstyle={[
                        changesStyles.autoRefreshButton,
                        props.autoRefreshSeconds > 0 &&
                          changesStyles.autoRefreshButtonOn,
                      ]}
                    />
                  }
                >
                  <Timer className={sx(changesStyles.glyphSm)} />
                  <span className={sx(changesStyles.autoRefreshLabel)}>
                    {formatAutoRefreshShortLabel(props.autoRefreshSeconds)}
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className={sx(changesStyles.autoRefreshMenu)}
                >
                  <DropdownMenuLabel
                    className={sx(changesStyles.autoRefreshMenuLabel)}
                  >
                    Auto refresh
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {AUTO_REFRESH_OPTIONS.map((option) => {
                    const isActive =
                      option.seconds === props.autoRefreshSeconds;
                    return (
                      <DropdownMenuItem
                        key={option.seconds}
                        onSelect={() =>
                          props.onAutoRefreshSecondsChange(option.seconds)
                        }
                        className={sx(changesStyles.autoRefreshItem)}
                      >
                        <span>{option.label}</span>
                        {isActive ? (
                          <Check className={sx(changesStyles.autoRefreshCheck)} />
                        ) : null}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <TabsContent
            value="changes"
            className={sx(changesStyles.paneScroll)}
          >
            <div className={sx(changesStyles.changesBody)}>
              <section className={sx(changesStyles.summarySection)}>
                <div className={sx(changesStyles.summaryHead)}>
                  <div className={sx(changesStyles.summaryLead)}>
                    <Badge
                      variant="outline"
                      className={sx(changesStyles.branchBadge)}
                    >
                      <GitBranch className={sx(changesStyles.branchIcon)} />
                      <span className={sx(changesStyles.truncate)}>
                        {props.sourceBranch}
                      </span>
                    </Badge>
                    <p className={sx(changesStyles.summaryCount)}>
                      {formatFileCount(props.filteredScmItems.length)} changed
                    </p>
                  </div>
                  {props.isScmBusy ? (
                    <Loader
                      aria-hidden
                      className={sx(changesStyles.busyLoader)}
                      size="xs"
                      variant="scan"
                    />
                  ) : null}
                </div>

                {summaryLabels.length > 0 ? (
                  <div className={sx(changesStyles.summaryLabels)}>
                    {summaryLabels.map((item) => (
                      <span
                        key={item.text}
                        className={sx(scmSummaryToneStyles[item.tone])}
                      >
                        {item.text}
                      </span>
                    ))}
                  </div>
                ) : null}

                <p className={sx(changesStyles.summaryHint)}>
                  {props.sourceControlHint}
                </p>

                {showComposer ? (
                  <div className={sx(changesStyles.composer)}>
                    <div className={sx(changesStyles.composerRow)}>
                      <Input
                        xstyle={changesStyles.composerInput}
                        placeholder={`Commit staged changes on "${props.sourceBranch}"`}
                        value={props.commitMessage}
                        onChange={(event) =>
                          props.onCommitMessageChange(event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (
                            (event.metaKey || event.ctrlKey) &&
                            event.key === "Enter" &&
                            props.commitMessage.trim() &&
                            props.canCommitStagedChanges &&
                            !props.isScmBusy
                          ) {
                            event.preventDefault();
                            void props.onCommit();
                          }
                        }}
                        disabled={props.isScmBusy}
                      />
                      <Button
                        size="sm"
                        xstyle={changesStyles.commitButton}
                        disabled={
                          props.isScmBusy ||
                          !props.commitMessage.trim() ||
                          !props.canCommitStagedChanges
                        }
                        onClick={() => void props.onCommit()}
                      >
                        Commit
                      </Button>
                    </div>
                    {showStageAll || showUnstageAll ? (
                      <div className={sx(changesStyles.bulkRow)}>
                        {showStageAll ? (
                          <Button
                            size="sm"
                            variant="outline"
                            xstyle={changesStyles.bulkButton}
                            disabled={props.isScmBusy}
                            onClick={() => void props.onStageAll()}
                          >
                            Stage All
                          </Button>
                        ) : null}
                        {showUnstageAll ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            xstyle={changesStyles.bulkButton}
                            disabled={props.isScmBusy}
                            onClick={() => void props.onUnstageAll()}
                          >
                            Unstage All
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section>

              <div className={sx(changesStyles.sections)}>
                {props.hasConflicts ? (
                  <div className={sx(changesStyles.conflictNotice)}>
                    Conflict detected. Resolve, stage, or discard the affected
                    files before committing.
                  </div>
                ) : null}
                {props.sourceError ? (
                  <div className={sx(changesStyles.errorNotice)}>
                    {props.sourceError}
                  </div>
                ) : null}
                {!props.sourceError && props.filteredScmItems.length === 0 ? (
                  <div className={sx(changesStyles.emptyNotice)}>
                    <p className={sx(changesStyles.emptyNoticeText)}>
                      No local changes.
                    </p>
                  </div>
                ) : null}
                {props.sourceControlSections.map((section) => (
                  <section key={section.id} className={sx(changesStyles.section)}>
                    <div className={sx(changesStyles.sectionHead)}>
                      <p className={sx(changesStyles.sectionTitle)}>
                        {section.title}
                      </p>
                      <Badge
                        variant={section.badgeVariant}
                        className={sx(changesStyles.sectionBadge)}
                      >
                        {section.items.length}
                      </Badge>
                    </div>
                    <div className={sx(changesStyles.sectionItems)}>
                      {section.items.map((item) => (
                        <SourceControlRow
                          key={`${item.displayCode}:${item.pathLabel}`}
                          item={item}
                          isScmBusy={props.isScmBusy}
                          onCopyPath={(path) =>
                            void props.onCopySourceControlPath(path)
                          }
                          onOpenDiff={(path) => void props.onSelectDiff(path)}
                          onStage={(sourceItem) =>
                            void props.onStageAction({
                              action: "stage",
                              item: sourceItem,
                            })
                          }
                          onUnstage={(sourceItem) =>
                            void props.onStageAction({
                              action: "unstage",
                              item: sourceItem,
                            })
                          }
                          onDiscard={(sourceItem) =>
                            void props.onDiscardChange(sourceItem)
                          }
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent
            value="history"
            className={sx(changesStyles.paneScroll)}
          >
            <div className={sx(changesStyles.historyBody)}>
              <div className={sx(changesStyles.historyHead)}>
                <div className={sx(changesStyles.summaryLead)}>
                  <Badge
                    variant="outline"
                    className={sx(changesStyles.branchBadge)}
                  >
                    <GitBranch className={sx(changesStyles.branchIcon)} />
                    <span className={sx(changesStyles.truncate)}>
                      {props.sourceBranch}
                    </span>
                  </Badge>
                  <p className={sx(changesStyles.historyCount)}>
                    {formatRecentCommitCount(props.sourceHistory.length)}
                  </p>
                </div>
                {props.isScmBusy ? (
                  <Loader
                    aria-hidden
                    className={sx(changesStyles.busyLoader)}
                    size="xs"
                    variant="scan"
                  />
                ) : null}
              </div>

              {props.sourceHistory.length === 0 ? (
                <div className={sx(changesStyles.emptyNotice)}>
                  <p className={sx(changesStyles.emptyNoticeText)}>
                    Initial commit
                  </p>
                </div>
              ) : (
                <div className={sx(changesStyles.historyList)}>
                  {props.sourceHistory.slice(0, 10).map((item, index) => (
                    <SourceControlHistoryRow
                      key={`${item.hash}:${item.subject}`}
                      item={item}
                      isLast={
                        index === Math.min(props.sourceHistory.length, 10) - 1
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {props.checks ? (
            <TabsContent
              value="checks"
              className={sx(changesStyles.paneScroll)}
            >
              <ChecksTabContent
                checks={props.checks}
                verification={props.verification}
                intentCompliance={props.intentCompliance}
                sourceControlSummary={props.sourceControlSummary}
                sourceBranch={props.sourceBranch}
                changedCount={props.filteredScmItems.length}
                onSelectDiff={props.onSelectDiff}
                onFixVerificationWithAgent={props.onFixVerificationWithAgent}
              />
            </TabsContent>
          ) : null}
        </Tabs>
      </TabsContent>
    </Tabs>
  );
}
