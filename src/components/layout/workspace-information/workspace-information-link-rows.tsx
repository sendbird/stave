import { Button as AdsButton } from "@/components/ads/components/Button";
import {
  ExternalLink,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  MessageSquarePlus,
  Pin,
  RefreshCcw,
  X,
} from "lucide-react";
import { type ReactNode } from "react";
import {
  Badge,
  Input,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui";
import {
  isWorkspaceInfoUrl,
  type WorkspaceStorybookResourceAccess,
} from "@/lib/workspace-information";
import {
  derivePrStatus,
  type GitHubPrPayload,
  type WorkspacePrStatus,
  PR_STATUS_VISUAL,
} from "@/lib/pr-status";
import { prToneBadgeStyles } from "../pr-status.styles";
import { cx, sx, type StyleXValue } from "@/components/ads/utils/stylex";
import { informationRow } from "../information-row.styles";
import { hostSurface } from "@/components/ui/host-surface.styles";
import { workspaceInformationPanelStyles as styles } from "../workspace-information-panel.styles";

export function openExternalUrl(url: string) {
  if (!isWorkspaceInfoUrl(url)) {
    return;
  }
  void window.api?.shell?.openExternal?.({ url: url.trim() });
}

export interface LinkedPullRequestPreview {
  url: string;
  loading: boolean;
  info: {
    pr: GitHubPrPayload;
    derived: WorkspacePrStatus;
  } | null;
  error?: string;
}

export function formatFigmaKindLabel(
  kind?: "file" | "design" | "proto" | "board" | "slides" | "unknown",
) {
  if (kind === "proto") {
    return "Prototype";
  }
  if (kind === "unknown" || !kind) {
    return "Resource";
  }
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function formatStorybookAccessBadgeLabel(
  access?: WorkspaceStorybookResourceAccess | null,
) {
  if (!access) {
    return null;
  }
  if (access.kind === "requires_github_auth") {
    return "GitHub auth";
  }
  if (access.kind === "public") {
    return "Public";
  }
  if (access.provider === "github-pages") {
    return "GitHub Pages";
  }
  return null;
}

function storybookAccessBadgeVariant(
  access?: WorkspaceStorybookResourceAccess | null,
) {
  return access?.kind === "requires_github_auth"
    ? ("warning" as const)
    : ("outline" as const);
}

export function StorybookAccessBadges({
  access,
}: { access?: WorkspaceStorybookResourceAccess | null }) {
  const label = formatStorybookAccessBadgeLabel(access);
  return (
    <>
      {label ? (
        <Badge size="sm" variant={storybookAccessBadgeVariant(access)} xstyle={[styles.chip, styles.chipAccess]}>
          {label}
        </Badge>
      ) : null}
      {access?.externalRepo ? (
        <Badge size="sm" variant="outline" xstyle={[styles.chip, styles.chipRepo]} title={access.externalRepo}>
          <span className={sx(styles.chipRepoLabel)}>repo {access.externalRepo}</span>
        </Badge>
      ) : null}
    </>
  );
}

export async function fetchLinkedPullRequestPreview(args: {
  cwd: string;
  url: string;
}): Promise<LinkedPullRequestPreview> {
  const getPrStatusForUrl = window.api?.sourceControl?.getPrStatusForUrl;
  if (!getPrStatusForUrl) {
    return {
      url: args.url,
      loading: false,
      info: null,
      error: "GitHub lookup unavailable.",
    };
  }

  try {
    const result = await getPrStatusForUrl({
      cwd: args.cwd,
      url: args.url,
    });
    if (!result.ok || !result.pr) {
      return {
        url: args.url,
        loading: false,
        info: null,
        error: result.stderr || "GitHub PR metadata unavailable.",
      };
    }

    const pr = result.pr as GitHubPrPayload;
    return {
      url: args.url,
      loading: false,
      info: {
        pr,
        derived: derivePrStatus(pr),
      },
    };
  } catch {
    return {
      url: args.url,
      loading: false,
      info: null,
      error: "GitHub PR metadata unavailable.",
    };
  }
}

export function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      className={cx(sx(styles.brandGlyph), className)}
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function JiraIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cx(sx(styles.brandGlyph), className)}>
      <defs>
        <linearGradient
          id="jira-grad-1"
          x1="21.45"
          y1="2.65"
          x2="12.97"
          y2="11.45"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0.18" stopColor="#0052CC" />
          <stop offset="1" stopColor="#2684FF" />
        </linearGradient>
        <linearGradient
          id="jira-grad-2"
          x1="12.64"
          y1="12.3"
          x2="3.5"
          y2="21.2"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0.18" stopColor="#0052CC" />
          <stop offset="1" stopColor="#2684FF" />
        </linearGradient>
      </defs>
      <path
        d="M22.16 11.18L12.82 1.84 12 1.02l-7.34 7.34a.46.46 0 000 .65l4.5 4.5a.46.46 0 00.65 0L12 11.32l2.19 2.19-4.5 4.5a.46.46 0 000 .65l4.5 4.5a.46.46 0 00.65 0l7.32-7.34a.46.46 0 000-.64z"
        fill="url(#jira-grad-1)"
      />
      <path
        d="M12 11.32a4.63 4.63 0 01-.03-6.52L4.66 12.13l4.5 4.5L12 13.8a4.63 4.63 0 010-2.48z"
        fill="url(#jira-grad-2)"
      />
    </svg>
  );
}

export function FigmaIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 38 57" fill="none" className={cx(sx(styles.brandGlyph), className)}>
      <path
        d="M19 28.5a9.5 9.5 0 119 9.5 9.5 9.5 0 01-9.5-9.5z"
        fill="#1ABCFE"
      />
      <path
        d="M0 47.5A9.5 9.5 0 019.5 38H19v9.5a9.5 9.5 0 11-19 0z"
        fill="#0ACF83"
      />
      <path d="M19 0v19h9.5a9.5 9.5 0 100-19H19z" fill="#FF7262" />
      <path
        d="M0 9.5A9.5 9.5 0 009.5 19H19V0H9.5A9.5 9.5 0 000 9.5z"
        fill="#F24E1E"
      />
      <path
        d="M0 28.5A9.5 9.5 0 009.5 38H19V19H9.5A9.5 9.5 0 000 28.5z"
        fill="#A259FF"
      />
    </svg>
  );
}

export function SlackIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cx(sx(styles.brandGlyph), className)}>
      <path
        d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z"
        fill="#E01E5A"
      />
      <path
        d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.527 2.527 0 0 1 2.521 2.521 2.527 2.527 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z"
        fill="#36C5F0"
      />
      <path
        d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.163 0a2.528 2.528 0 0 1 2.523 2.522v6.312z"
        fill="#2EB67D"
      />
      <path
        d="M15.163 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.163 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 0 1-2.52-2.523 2.527 2.527 0 0 1 2.52-2.52h6.315A2.528 2.528 0 0 1 24 15.163a2.528 2.528 0 0 1-2.522 2.523h-6.315z"
        fill="#ECB22E"
      />
    </svg>
  );
}

export function ConfluenceIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cx(sx(styles.brandGlyph), className)}>
      <defs>
        <linearGradient
          id="confluence-grad"
          x1="20.76"
          y1="3.53"
          x2="10.29"
          y2="21.52"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#0052CC" />
          <stop offset="1" stopColor="#2684FF" />
        </linearGradient>
      </defs>
      <path
        d="M1.26 18.35c-.29.48-.62 1.04-.86 1.44a.72.72 0 0 0 .25.98l4.2 2.58a.72.72 0 0 0 .99-.22c.2-.35.49-.84.82-1.4 2.3-3.89 4.58-3.42 8.77-1.39l4.06 1.95a.72.72 0 0 0 .97-.36l2.14-4.62a.72.72 0 0 0-.34-.93c-1.15-.56-3.45-1.67-5.76-2.78-5.73-2.75-11.37-3.06-15.24 4.75z"
        fill="url(#confluence-grad)"
      />
      <path
        d="M22.74 5.65c.29-.48.62-1.04.86-1.44a.72.72 0 0 0-.25-.98L19.15.65a.72.72 0 0 0-.99.22c-.2.35-.49.84-.82 1.4-2.3 3.89-4.58 3.42-8.77 1.39L4.51 1.71a.72.72 0 0 0-.97.36L1.4 6.69a.72.72 0 0 0 .34.93c1.15.56 3.45 1.67 5.76 2.78 5.73 2.75 11.37 3.06 15.24-4.75z"
        fill="url(#confluence-grad)"
      />
    </svg>
  );
}

export function InlineLinkRow(props: {
  icon: ReactNode;
  label: string;
  sublabel?: string;
  badge?: ReactNode;
  url: string;
  onRemove: () => void;
  actions?: ReactNode;
  pinned?: boolean;
  onTogglePin?: () => void;
}) {
  return (
    <div className={sx(styles.linkRow)}>
      <span className={sx(styles.linkRowMark)}>{props.icon}</span>
      <div className={sx(styles.linkRowBody)}>
        <div className={sx(styles.linkRowTitleLine)}>
          <AdsButton
            layout="host"
            type="button"
            // `linkRow` owns the wash; `inertChrome` keeps ADS's host-layout
            // trigger recipe from painting a second square one behind the title.
            xstyle={[styles.linkRowTitle, hostSurface.inertChrome]}
            onClick={() => openExternalUrl(props.url)}
            title={props.label}
          >
            {props.label}
          </AdsButton>
          {props.badge}
        </div>
        {props.sublabel ? (
          <p className={sx(styles.linkRowSublabel)}>{props.sublabel}</p>
        ) : null}
      </div>
      <div className={sx(styles.linkRowTrail)}>
        {props.onTogglePin ? (
          <TooltipProvider delay={300}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <AdsButton
                    layout="host"
                    type="button"
                    xstyle={[
                      styles.iconButtonPinBase,
                      props.pinned
                        ? styles.iconButtonPinned
                        : styles.iconButtonPinReveal,
                    ]}
                    onClick={props.onTogglePin}
                    aria-pressed={props.pinned}
                    aria-label={
                      props.pinned
                        ? "Unpin intent anchor"
                        : "Pin as intent anchor"
                    }
                  />
                }
              >
                <Pin
                  className={sx(
                    styles.glyphSm,
                    props.pinned && styles.glyphFilled,
                  )}
                />
              </TooltipTrigger>
              <TooltipContent
                side="left"
                className={sx(styles.pinTooltip)}
              >
                <span className={sx(styles.pinTooltipTitle)}>
                  {props.pinned
                    ? "Pinned as intent anchor"
                    : "Pin as intent anchor"}
                </span>
                <span className={sx(styles.pinTooltipBody)}>
                  {props.pinned
                    ? "The intent guard checks your changes against this and flags scope or intent drift. Click to unpin."
                    : "Pin this PRD, spec, or design so the AI checks each change against it after a turn."}
                </span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
        <div className={sx(styles.linkRowTrailReveal)}>
          {props.actions}
          <TooltipProvider delay={300}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <AdsButton
                    layout="host"
                    type="button"
                    xstyle={[styles.iconButton, styles.iconButtonDanger]}
                    onClick={props.onRemove}
                    aria-label="Remove"
                  />
                }
              >
                <X className={sx(styles.glyphSm)} />
              </TooltipTrigger>
              <TooltipContent side="left">Remove</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}

export function CreateTaskActionButton(props: {
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <TooltipProvider delay={300}>
      <Tooltip>
        <TooltipTrigger
          render={
            <AdsButton
              layout="host"
              type="button"
              xstyle={[
                styles.iconButton,
                styles.iconButtonHoverSurface,
                styles.iconButtonDisabledQuiet,
              ]}
              disabled={props.disabled}
              onClick={props.onClick}
              aria-label="Create task"
            />
          }
        >
          <MessageSquarePlus className={sx(styles.glyphSm)} />
        </TooltipTrigger>
        <TooltipContent side="left">Create task</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function InlineUrlInput(props: {
  value: string;
  onChange: (value: string) => void;
  onRemove: () => void;
  placeholder: string;
  icon: ReactNode;
}) {
  return (
    <div className={sx(styles.urlInputRow)}>
      <span className={sx(styles.urlInputMark)}>{props.icon}</span>
      <Input
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        xstyle={styles.bareInput}
        autoFocus
      />
      <AdsButton
        layout="host"
        type="button"
        xstyle={[
          styles.iconButton,
          styles.iconButtonShrink0,
          styles.iconButtonDanger,
        ]}
        onClick={props.onRemove}
        aria-label="Remove"
      >
        <X className={sx(styles.glyphSm)} />
      </AdsButton>
    </div>
  );
}

function GitHubPrStatusIcon(props: {
  status: WorkspacePrStatus;
  xstyle?: StyleXValue;
}) {
  const { status } = props;
  const glyph = [styles.prStatusGlyph, props.xstyle];

  if (status === "merged") {
    return <GitMerge className={sx(glyph, styles.prStatusMerged)} />;
  }
  if (status === "closed_unmerged") {
    return (
      <GitPullRequestClosed className={sx(glyph, styles.prStatusClosed)} />
    );
  }
  if (status === "draft") {
    return <GitPullRequestDraft className={sx(glyph, styles.prStatusDraft)} />;
  }
  // Open states
  return <GitPullRequest className={sx(glyph, styles.prStatusOpen)} />;
}

export function GitHubPrRow(props: {
  number: number;
  title: string;
  status: WorkspacePrStatus;
  repo?: string;
  branch?: string;
  url: string;
  onRemove?: () => void;
  onRefresh?: () => void;
  loading?: boolean;
  isCurrent?: boolean;
  actions?: ReactNode;
}) {
  const visual = PR_STATUS_VISUAL[props.status];

  return (
    <div className={sx(informationRow.root)}>
      <GitHubPrStatusIcon status={props.status} xstyle={informationRow.mark} />
      <div className={sx(informationRow.body)}>
        <div className={sx(informationRow.titleLine)}>
          <AdsButton
            layout="host"
            type="button"
            xstyle={[informationRow.title, hostSurface.inertChrome]}
            onClick={() => openExternalUrl(props.url)}
          >
            {props.title}
          </AdsButton>
        </div>
        <div className={sx(informationRow.meta)}>
          <span className={sx(informationRow.metaNumeric)}>#{props.number}</span>
          <Badge size="sm"
            tone="neutral"
            xstyle={[styles.chipStatus, prToneBadgeStyles[visual.tone]]}
          >
            {visual.label}
          </Badge>
          {props.isCurrent ? (
            <Badge size="sm" variant="outline" xstyle={styles.chipTight}>
              Current branch
            </Badge>
          ) : null}
          {props.repo ? (
            <span className={sx(informationRow.metaText)}>{props.repo}</span>
          ) : null}
          {props.branch ? (
            <span className={sx(informationRow.metaMono)}>{props.branch}</span>
          ) : null}
        </div>
      </div>
      <div className={sx(informationRow.trail)}>
        {props.actions}
        {props.onRefresh ? (
          <AdsButton
            layout="host"
            type="button"
            xstyle={[
              styles.iconButton,
              styles.iconButtonHoverSurface,
              props.loading && styles.glyphSpinning,
            ]}
            onClick={props.onRefresh}
            aria-label="Refresh"
          >
            <RefreshCcw className={sx(styles.glyphSm)} />
          </AdsButton>
        ) : null}
        <AdsButton
          layout="host"
          type="button"
          xstyle={[styles.iconButton, styles.iconButtonHoverSurface]}
          onClick={() => openExternalUrl(props.url)}
          aria-label="Open on GitHub"
        >
          <ExternalLink className={sx(styles.glyphSm)} />
        </AdsButton>
        {props.onRemove ? (
          <AdsButton
            layout="host"
            type="button"
            xstyle={[styles.iconButton, styles.iconButtonDanger]}
            onClick={props.onRemove}
            aria-label="Remove"
          >
            <X className={sx(styles.glyphSm)} />
          </AdsButton>
        ) : null}
      </div>
    </div>
  );
}
