import {
  Bot,
  CalendarIcon,
  ClipboardCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  ExternalLink,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  Globe,
  Hash,
  Link,
  Plus,
  RefreshCcw,
  SlidersHorizontal,
  Sparkles,
  StickyNote,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import {
  changeWorkspaceInfoCustomFieldType,
  createWorkspaceConfluencePage,
  createWorkspaceFigmaResource,
  createWorkspaceInfoCustomField,
  createWorkspaceJiraIssue,
  createWorkspaceLinkedPullRequest,
  createWorkspaceSlackThread,
  createWorkspaceTodoItem,
  extractConfluencePageReference,
  extractFigmaResourceReference,
  extractGitHubPullRequestReference,
  extractJiraIssueReference,
  extractSlackThreadReference,
  formatWorkspaceInfoHostLabel,
  isGitHubPullRequestUrl,
  isWorkspaceInfoUrl,
  type WorkspaceInfoCustomField,
  type WorkspaceInfoFieldType,
  type WorkspaceInformationState,
  updateWorkspaceInfoSelectFieldOptions,
  WORKSPACE_INFO_FIELD_TYPES,
  WORKSPACE_INFO_FIELD_TYPE_LABELS,
} from "@/lib/workspace-information";
import {
  derivePrStatus,
  type GitHubPrPayload,
  type WorkspacePrStatus,
  PR_STATUS_VISUAL,
  PR_TONE_BADGE_CLASS,
} from "@/lib/pr-status";
import { toHumanModelName } from "@/lib/providers/model-catalog";
import { formatTaskUpdatedAt } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import { WorkspacePlansSection } from "./WorkspacePlansSection";

// ---------------------------------------------------------------------------
// Utility helpers (unchanged business logic)
// ---------------------------------------------------------------------------

function updateItemById<T extends { id: string }>(
  items: T[],
  id: string,
  updater: (item: T) => T,
) {
  let changed = false;
  const nextItems = items.map((item) => {
    if (item.id !== id) {
      return item;
    }
    changed = true;
    return updater(item);
  });

  return changed ? nextItems : items;
}

function removeItemById<T extends { id: string }>(items: T[], id: string) {
  const nextItems = items.filter((item) => item.id !== id);
  return nextItems.length === items.length ? items : nextItems;
}

function openExternalUrl(url: string) {
  if (!isWorkspaceInfoUrl(url)) {
    return;
  }
  void window.api?.shell?.openExternal?.({ url: url.trim() });
}

const WORKSPACE_INFORMATION_SECTION_IDS = [
  "overview",
  "todo",
  "note",
  "plans",
  "github",
  "jira",
  "confluence",
  "figma",
  "slack",
  "custom",
] as const;

type WorkspaceInformationSectionId =
  (typeof WORKSPACE_INFORMATION_SECTION_IDS)[number];

const WORKSPACE_INFORMATION_ACCORDION_STORAGE_KEY =
  "stave:workspace-information-open-sections:v1";

interface LinkedPullRequestPreview {
  url: string;
  loading: boolean;
  info: {
    pr: GitHubPrPayload;
    derived: WorkspacePrStatus;
  } | null;
  error?: string;
}

function readStoredWorkspaceInformationSections(): WorkspaceInformationSectionId[] {
  if (typeof window === "undefined") {
    return [...WORKSPACE_INFORMATION_SECTION_IDS];
  }

  try {
    const raw = window.localStorage.getItem(
      WORKSPACE_INFORMATION_ACCORDION_STORAGE_KEY,
    );
    if (!raw) {
      return [...WORKSPACE_INFORMATION_SECTION_IDS];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [...WORKSPACE_INFORMATION_SECTION_IDS];
    }

    return parsed.filter((value): value is WorkspaceInformationSectionId =>
      WORKSPACE_INFORMATION_SECTION_IDS.includes(
        value as WorkspaceInformationSectionId,
      ),
    );
  } catch {
    return [...WORKSPACE_INFORMATION_SECTION_IDS];
  }
}

function formatFigmaKindLabel(
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

async function fetchLinkedPullRequestPreview(args: {
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

// ---------------------------------------------------------------------------
// Brand SVG Icons
// ---------------------------------------------------------------------------

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      className={cn("size-4", className)}
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function JiraIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={cn("size-4", className)}
    >
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

function FigmaIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 38 57"
      fill="none"
      className={cn("size-4", className)}
    >
      <path
        d="M19 28.5a9.5 9.5 0 119 9.5 9.5 9.5 0 01-9.5-9.5z"
        fill="#1ABCFE"
      />
      <path
        d="M0 47.5A9.5 9.5 0 019.5 38H19v9.5a9.5 9.5 0 11-19 0z"
        fill="#0ACF83"
      />
      <path
        d="M19 0v19h9.5a9.5 9.5 0 100-19H19z"
        fill="#FF7262"
      />
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

function SlackIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={cn("size-4", className)}
    >
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

function ConfluenceIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={cn("size-4", className)}
    >
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

// ---------------------------------------------------------------------------
// Shared section wrapper — minimal, borderless accordion style
// ---------------------------------------------------------------------------

function SectionHeader(props: {
  value: WorkspaceInformationSectionId;
  title: string;
  icon: ReactNode;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
  first?: boolean;
}) {
  return (
    <AccordionItem
      value={props.value}
      className={cn(
        "border-b border-border/50",
        props.first && "border-t-0",
      )}
    >
      <div className="group/section-row flex items-center">
        <AccordionTrigger className="flex-1 gap-2 py-2.5 pr-1 pl-0 hover:no-underline [&>svg[data-slot=accordion-trigger-icon]]:hidden">
          <div className="flex items-center gap-2 text-left">
            <span className="relative flex size-[18px] shrink-0 items-center justify-center text-muted-foreground">
              {/* Section icon — visible by default, fades out on row hover */}
              <span className="flex items-center justify-center transition-all duration-150 group-hover/section-row:scale-75 group-hover/section-row:opacity-0">
                {props.icon}
              </span>
              {/* Chevron — hidden by default, fades in on row hover */}
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <ChevronRight className="size-[18px] scale-75 opacity-0 transition-all duration-150 group-aria-expanded/accordion-trigger:hidden group-hover/section-row:scale-100 group-hover/section-row:opacity-100" />
                <ChevronDown className="hidden size-[18px] scale-75 opacity-0 transition-all duration-150 group-aria-expanded/accordion-trigger:block group-hover/section-row:scale-100 group-hover/section-row:opacity-100" />
              </span>
            </span>
            <span className="text-sm font-medium text-foreground/80">
              {props.title}
            </span>
            {props.count !== undefined && props.count > 0 ? (
              <span className="text-xs tabular-nums text-muted-foreground/60">
                {props.count}
              </span>
            ) : null}
          </div>
        </AccordionTrigger>
        {props.action ? (
          <div className="ml-auto flex shrink-0 items-center">
            {props.action}
          </div>
        ) : null}
      </div>
      <AccordionContent className="-mx-1 pb-3 pt-0">
        {props.children}
      </AccordionContent>
    </AccordionItem>
  );
}

function SummaryEntry(props: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  tone?: "default" | "muted";
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted/70 text-muted-foreground">
          {props.icon}
        </span>
        <span>{props.label}</span>
      </div>
      <p
        className={cn(
          "pl-7 text-[15px] leading-6 text-foreground/95",
          props.tone === "muted" && "text-muted-foreground",
        )}
      >
        {props.children}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline link row — compact clickable item for Jira/Figma/GitHub
// ---------------------------------------------------------------------------

function InlineLinkRow(props: {
  icon: ReactNode;
  label: string;
  sublabel?: string;
  badge?: ReactNode;
  url: string;
  onRemove: () => void;
  actions?: ReactNode;
}) {
  return (
    <div className="group/link-row flex items-center gap-2.5 rounded-md px-1.5 py-2">
      <span className="flex size-6 shrink-0 items-center justify-center">
        {props.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="min-w-0 truncate text-sm font-medium text-foreground hover:text-primary hover:underline"
            onClick={() => openExternalUrl(props.url)}
            title={props.label}
          >
            {props.label}
          </button>
          {props.badge}
        </div>
        {props.sublabel ? (
          <p className="truncate text-xs text-muted-foreground/70">
            {props.sublabel}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/link-row:opacity-100">
        {props.actions}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="flex size-7 items-center justify-center rounded-sm text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive"
                onClick={props.onRemove}
                aria-label="Remove"
              >
                <X className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">Remove</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline URL input — shown when adding a new link
// ---------------------------------------------------------------------------

function InlineUrlInput(props: {
  value: string;
  onChange: (value: string) => void;
  onRemove: () => void;
  placeholder: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 px-1.5 py-1.5">
      <span className="flex size-6 shrink-0 items-center justify-center text-muted-foreground/50">
        {props.icon}
      </span>
      <Input
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        className="h-8 flex-1 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
        autoFocus
      />
      <button
        type="button"
        className="flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive"
        onClick={props.onRemove}
        aria-label="Remove"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GitHub PR row — styled like actual GitHub
// ---------------------------------------------------------------------------

function GitHubPrStatusIcon(props: {
  status: WorkspacePrStatus;
  className?: string;
}) {
  const { status } = props;
  const cls = cn("size-[18px] shrink-0", props.className);

  if (status === "merged") {
    return <GitMerge className={cn(cls, "text-[#8250df] dark:text-[#a371f7]")} />;
  }
  if (status === "closed_unmerged") {
    return (
      <GitPullRequestClosed
        className={cn(cls, "text-[#cf222e] dark:text-[#f85149]")}
      />
    );
  }
  if (status === "draft") {
    return (
      <GitPullRequestDraft
        className={cn(cls, "text-[#59636e] dark:text-[#8b949e]")}
      />
    );
  }
  // Open states
  return (
    <GitPullRequest
      className={cn(cls, "text-[#1a7f37] dark:text-[#3fb950]")}
    />
  );
}

function GitHubPrRow(props: {
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
}) {
  const visual = PR_STATUS_VISUAL[props.status];

  return (
    <div className="group/pr-row flex items-start gap-2.5 rounded-md px-1.5 py-2.5 transition-colors hover:bg-muted/50">
      <GitHubPrStatusIcon
        status={props.status}
        className="mt-0.5 size-4"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <button
            type="button"
            className="min-w-0 text-left text-sm font-medium leading-snug text-foreground hover:text-primary hover:underline"
            onClick={() => openExternalUrl(props.url)}
          >
            {props.title}
          </button>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="text-xs tabular-nums text-muted-foreground/70">
            #{props.number}
          </span>
          <Badge
            className={cn(
              "h-5 rounded-full border px-1.5 py-0 text-[11px] font-medium leading-none",
              PR_TONE_BADGE_CLASS[visual.tone],
            )}
          >
            {visual.label}
          </Badge>
          {props.isCurrent ? (
            <Badge
              variant="outline"
              className="h-5 rounded-full px-1.5 py-0 text-[11px] font-normal leading-none"
            >
              Current branch
            </Badge>
          ) : null}
          {props.repo ? (
            <span className="text-xs text-muted-foreground/60">
              {props.repo}
            </span>
          ) : null}
          {props.branch ? (
            <span className="font-mono text-[11px] text-muted-foreground/50">
              {props.branch}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 pt-0.5 opacity-0 transition-opacity group-hover/pr-row:opacity-100">
        {props.onRefresh ? (
          <button
            type="button"
            className={cn(
              "flex size-7 items-center justify-center rounded-sm text-muted-foreground/60 hover:bg-muted hover:text-foreground",
              props.loading && "animate-spin",
            )}
            onClick={props.onRefresh}
            aria-label="Refresh"
          >
            <RefreshCcw className="size-3.5" />
          </button>
        ) : null}
        <button
          type="button"
          className="flex size-7 items-center justify-center rounded-sm text-muted-foreground/60 hover:bg-muted hover:text-foreground"
          onClick={() => openExternalUrl(props.url)}
          aria-label="Open on GitHub"
        >
          <ExternalLink className="size-3.5" />
        </button>
        {props.onRemove ? (
          <button
            type="button"
            className="flex size-7 items-center justify-center rounded-sm text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive"
            onClick={props.onRemove}
            aria-label="Remove"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom field inline renderer
// ---------------------------------------------------------------------------

function CustomFieldDatePicker(props: {
  value: string;
  onChange: (value: string) => void;
}) {
  const selected = props.value ? new Date(props.value + "T00:00:00") : undefined;
  const isValid = selected && !Number.isNaN(selected.getTime());

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-9 w-full justify-start text-left text-sm font-normal",
            !props.value && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="mr-2 size-4" />
          {isValid
            ? selected.toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })
            : "Pick a date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={isValid ? selected : undefined}
          onSelect={(date) => {
            if (!date) {
              props.onChange("");
              return;
            }
            const yyyy = date.getFullYear();
            const mm = String(date.getMonth() + 1).padStart(2, "0");
            const dd = String(date.getDate()).padStart(2, "0");
            props.onChange(`${yyyy}-${mm}-${dd}`);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Single-select options input — tracks raw text so commas aren't swallowed
// ---------------------------------------------------------------------------

function SingleSelectOptionsInput(props: {
  field: WorkspaceInfoCustomField & { type: "single_select" };
  onFieldChange: (field: WorkspaceInfoCustomField) => void;
}) {
  const { field, onFieldChange } = props;
  const [rawValue, setRawValue] = useState(() => field.options.join(", "));
  const committedRef = useRef(field.options);

  // Sync if options changed externally
  useEffect(() => {
    const joined = field.options.join(", ");
    if (committedRef.current !== field.options) {
      committedRef.current = field.options;
      setRawValue(joined);
    }
  }, [field.options]);

  function commit(text: string) {
    const next = updateWorkspaceInfoSelectFieldOptions({
      field,
      rawValue: text,
    });
    committedRef.current = next.options;
    setRawValue(next.options.join(", "));
    onFieldChange(next);
  }

  // Filter out empty-string options — Radix Select crashes on value=""
  const validOptions = field.options.filter((opt) => opt.length > 0);
  const hasValidSelection =
    field.value.length > 0 && validOptions.includes(field.value);

  return (
    <div className="space-y-1.5">
      <Input
        className="h-9 text-sm"
        value={rawValue}
        onChange={(event) => setRawValue(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit((event.target as HTMLInputElement).value);
          }
        }}
        placeholder="Options (comma-separated)"
      />
      <Select
        value={hasValidSelection ? field.value : undefined}
        onValueChange={(value) => onFieldChange({ ...field, value })}
      >
        <SelectTrigger className="h-9 w-full text-sm">
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          {validOptions.length === 0 ? (
            <SelectItem value="__empty__" disabled>
              No options defined
            </SelectItem>
          ) : (
            validOptions.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

function renderCustomFieldInput(args: {
  field: WorkspaceInfoCustomField;
  onFieldChange: (field: WorkspaceInfoCustomField) => void;
}) {
  const { field, onFieldChange } = args;

  switch (field.type) {
    case "textarea":
      return (
        <Textarea
          className="min-h-20 text-sm"
          value={field.value}
          onChange={(event) =>
            onFieldChange({ ...field, value: event.target.value })
          }
          placeholder="Value"
        />
      );
    case "number":
      return (
        <Input
          type="number"
          className="h-9 text-sm"
          value={field.value ?? ""}
          onChange={(event) =>
            onFieldChange({
              ...field,
              value:
                event.target.value.trim() === ""
                  ? null
                  : Number(event.target.value),
            })
          }
          placeholder="Value"
        />
      );
    case "boolean":
      return (
        <div className="flex items-center gap-2">
          <Switch
            checked={field.value}
            onCheckedChange={(checked) =>
              onFieldChange({ ...field, value: Boolean(checked) })
            }
            size="sm"
          />
          <span className="text-[13px] text-muted-foreground">
            {field.value ? "Enabled" : "Disabled"}
          </span>
        </div>
      );
    case "date":
      return (
        <CustomFieldDatePicker
          value={field.value}
          onChange={(value) => onFieldChange({ ...field, value })}
        />
      );
    case "url":
      return (
        <div className="flex items-center gap-1.5">
          <Input
            className="h-9 flex-1 text-sm"
            value={field.value}
            onChange={(event) =>
              onFieldChange({ ...field, value: event.target.value })
            }
            placeholder="https://..."
          />
          {isWorkspaceInfoUrl(field.value) ? (
            <button
              type="button"
              className="flex size-8 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
              onClick={() => openExternalUrl(field.value)}
              aria-label="Open link"
            >
              <ExternalLink className="size-4" />
            </button>
          ) : null}
        </div>
      );
    case "single_select":
      return (
        <SingleSelectOptionsInput field={field} onFieldChange={onFieldChange} />
      );
    case "text":
    default:
      return (
        <Input
          className="h-9 text-sm"
          value={field.value}
          onChange={(event) =>
            onFieldChange({ ...field, value: event.target.value })
          }
          placeholder="Value"
        />
      );
  }
}

// ---------------------------------------------------------------------------
// Add button — compact ghost + icon
// ---------------------------------------------------------------------------

function AddButton(props: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      className="flex size-7 items-center justify-center rounded-sm text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
      onClick={props.onClick}
      aria-label={props.label ?? "Add"}
    >
      <Plus className="size-4" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyHint(props: { children: ReactNode }) {
  return (
    <p className="px-2 py-1.5 text-[13px] text-muted-foreground/50">
      {props.children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WorkspaceInformationPanel() {
  const [
    activeWorkspaceId,
    workspacePath,
    workspaceInformation,
    updateWorkspaceInformation,
    isDefaultWorkspace,
    prInfo,
    fetchWorkspacePrStatus,
    infoPanelScale,
    workspacePlansRefreshNonce,
    openFileFromTree,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.activeWorkspaceId,
          state.workspacePathById[state.activeWorkspaceId] ??
            state.projectPath ??
            "",
          state.workspaceInformation,
          state.updateWorkspaceInformation,
          Boolean(state.workspaceDefaultById[state.activeWorkspaceId]),
          state.workspacePrInfoById[state.activeWorkspaceId] ?? null,
          state.fetchWorkspacePrStatus,
          state.settings.infoPanelScale,
          state.workspacePlansRefreshNonce,
          state.openFileFromTree,
        ] as const,
    ),
  );

  const [openSections, setOpenSections] = useState<
    WorkspaceInformationSectionId[]
  >(() => readStoredWorkspaceInformationSections());
  const [linkedPullRequestPreviewById, setLinkedPullRequestPreviewById] =
    useState<Record<string, LinkedPullRequestPreview>>({});

  useEffect(() => {
    if (!activeWorkspaceId || isDefaultWorkspace) {
      return;
    }
    void fetchWorkspacePrStatus({ workspaceId: activeWorkspaceId });
  }, [activeWorkspaceId, fetchWorkspacePrStatus, isDefaultWorkspace]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(
        WORKSPACE_INFORMATION_ACCORDION_STORAGE_KEY,
        JSON.stringify(openSections),
      );
    } catch {
      // Ignore localStorage write failures for this UI preference.
    }
  }, [openSections]);

  useEffect(() => {
    const items = workspaceInformation.linkedPullRequests
      .map((item) => ({
        id: item.id,
        url: item.url.trim(),
      }))
      .filter(
        (item) => item.url.length > 0 && isGitHubPullRequestUrl(item.url),
      );

    if (!workspacePath || items.length === 0) {
      setLinkedPullRequestPreviewById({});
      return;
    }

    let cancelled = false;
    setLinkedPullRequestPreviewById(
      Object.fromEntries(
        items.map((item) => [
          item.id,
          {
            url: item.url,
            loading: true,
            info: null,
          },
        ]),
      ),
    );

    void Promise.all(
      items.map(
        async (item) =>
          [
            item.id,
            await fetchLinkedPullRequestPreview({
              cwd: workspacePath,
              url: item.url,
            }),
          ] as const,
      ),
    ).then((entries) => {
      if (cancelled) {
        return;
      }
      setLinkedPullRequestPreviewById(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
    };
  }, [workspaceInformation.linkedPullRequests, workspacePath]);

  function patchWorkspaceInformation(
    updater: (current: WorkspaceInformationState) => WorkspaceInformationState,
  ) {
    updateWorkspaceInformation({ updater });
  }

  function patchCustomField(
    fieldId: string,
    updater: (field: WorkspaceInfoCustomField) => WorkspaceInfoCustomField,
  ) {
    patchWorkspaceInformation((current) => ({
      ...current,
      customFields: updateItemById(current.customFields, fieldId, updater),
    }));
  }

  async function refreshLinkedPullRequestPreview(args: {
    itemId: string;
    url: string;
  }) {
    if (!workspacePath || !isGitHubPullRequestUrl(args.url)) {
      return;
    }

    setLinkedPullRequestPreviewById((current) => ({
      ...current,
      [args.itemId]: {
        url: args.url,
        loading: true,
        info: current[args.itemId]?.info ?? null,
      },
    }));

    const preview = await fetchLinkedPullRequestPreview({
      cwd: workspacePath,
      url: args.url,
    });

    setLinkedPullRequestPreviewById((current) => ({
      ...current,
      [args.itemId]: preview,
    }));
  }

  const currentBranchPr = prInfo?.pr ?? null;
  const currentBranchPrStatus = prInfo?.derived ?? null;
  const openTodoCount = workspaceInformation.todos.filter(
    (todo) => !todo.completed,
  ).length;
  const latestTurnSummary = workspaceInformation.turnSummary ?? null;

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-auto origin-top-left"
      style={infoPanelScale !== 1 ? { zoom: infoPanelScale } : undefined}
    >
      <div className="px-3 py-2">
        <Accordion
          type="multiple"
          value={openSections}
          onValueChange={(value) =>
            setOpenSections(value as WorkspaceInformationSectionId[])
          }
        >
          <SectionHeader
            value="overview"
            title="Summary"
            icon={<Sparkles className="size-4" />}
            first
            action={
              latestTurnSummary ? (
                <span className="pr-1 text-[11px] text-muted-foreground/70">
                  {formatTaskUpdatedAt({ value: latestTurnSummary.generatedAt })}
                </span>
              ) : null
            }
          >
            {latestTurnSummary ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {latestTurnSummary.taskTitle ? (
                    <span className="min-w-0 truncate font-medium text-foreground/80">
                      {latestTurnSummary.taskTitle}
                    </span>
                  ) : null}
                  <Badge
                    variant="outline"
                    className="h-5 rounded-full px-2 py-0 text-[11px] font-normal leading-none"
                  >
                    {toHumanModelName({ model: latestTurnSummary.model })}
                  </Badge>
                </div>

                <div className="space-y-3">
                  <SummaryEntry
                    icon={<UserRound className="size-3.5" />}
                    label="user"
                  >
                    {latestTurnSummary.requestSummary}
                  </SummaryEntry>
                  <div className="border-t border-border/40" />
                  <SummaryEntry
                    icon={<Bot className="size-3.5" />}
                    label="ai"
                    tone="muted"
                  >
                    {latestTurnSummary.workSummary}
                  </SummaryEntry>
                </div>
              </div>
            ) : (
              <p className="text-[15px] leading-6 text-muted-foreground">
                No summary yet. Finish a turn.
              </p>
            )}
          </SectionHeader>

          {/* ── Todo ──────────────────────────────────────────── */}
          <SectionHeader
            value="todo"
            title="Todos"
            icon={<CheckCircle2 className="size-4" />}
            count={openTodoCount}
            action={
              <AddButton
                onClick={() =>
                  patchWorkspaceInformation((current) => ({
                    ...current,
                    todos: [...current.todos, createWorkspaceTodoItem()],
                  }))
                }
                label="Add todo"
              />
            }
          >
            <div className="-mx-2 space-y-0.5">
              {workspaceInformation.todos.length === 0 ? (
                <EmptyHint>No todos yet</EmptyHint>
              ) : null}
              {workspaceInformation.todos.map((todo) => (
                <div
                  key={todo.id}
                  className="group/todo flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-muted/50"
                >
                  <button
                    type="button"
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-sm transition-colors",
                      todo.completed
                        ? "text-primary"
                        : "text-muted-foreground/40 hover:text-muted-foreground",
                    )}
                    onClick={() =>
                      patchWorkspaceInformation((current) => ({
                        ...current,
                        todos: updateItemById(current.todos, todo.id, (item) => ({
                          ...item,
                          completed: !item.completed,
                        })),
                      }))
                    }
                    aria-label={
                      todo.completed
                        ? "Mark incomplete"
                        : "Mark complete"
                    }
                  >
                    {todo.completed ? (
                      <CheckCircle2 className="size-4" />
                    ) : (
                      <Circle className="size-4" />
                    )}
                  </button>
                  <Input
                    value={todo.text}
                    onChange={(event) =>
                      patchWorkspaceInformation((current) => ({
                        ...current,
                        todos: updateItemById(current.todos, todo.id, (item) => ({
                          ...item,
                          text: event.target.value,
                        })),
                      }))
                    }
                    placeholder="Todo item"
                    className={cn(
                      "h-8 flex-1 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0",
                      todo.completed &&
                        "text-muted-foreground/50 line-through",
                    )}
                  />
                  <button
                    type="button"
                    className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground/40 opacity-0 transition-opacity hover:text-destructive group-hover/todo:opacity-100"
                    onClick={() =>
                      patchWorkspaceInformation((current) => ({
                        ...current,
                        todos: removeItemById(current.todos, todo.id),
                      }))
                    }
                    aria-label="Remove todo"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </SectionHeader>

          {/* ── Note ──────────────────────────────────────────── */}
          <SectionHeader
            value="note"
            title="Notes"
            icon={<StickyNote className="size-4" />}
          >
            <Textarea
              className="min-h-24 resize-none text-sm"
              value={workspaceInformation.notes}
              onChange={(event) =>
                patchWorkspaceInformation((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              placeholder="Notes, blockers, handoff details..."
            />
          </SectionHeader>

          <SectionHeader
            value="plans"
            title="Plans"
            icon={<ClipboardCheck className="size-4" />}
          >
            <WorkspacePlansSection
              embedded
              workspacePath={workspacePath}
              refreshNonce={workspacePlansRefreshNonce}
              onOpenFile={({ filePath }) => openFileFromTree({ filePath })}
            />
          </SectionHeader>

          {/* ── GitHub ────────────────────────────────────────── */}
          <SectionHeader
            value="github"
            title="Pull Requests"
            icon={<GitHubIcon className="size-4" />}
            count={
              workspaceInformation.linkedPullRequests.length +
              (currentBranchPr ? 1 : 0)
            }
            action={
              <div className="flex items-center gap-0.5">
                {!isDefaultWorkspace ? (
                  <button
                    type="button"
                    className="flex size-7 items-center justify-center rounded-sm text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
                    onClick={() =>
                      void fetchWorkspacePrStatus({
                        workspaceId: activeWorkspaceId,
                      })
                    }
                    aria-label="Refresh"
                  >
                    <RefreshCcw className="size-4" />
                  </button>
                ) : null}
                <AddButton
                  onClick={() =>
                    patchWorkspaceInformation((current) => ({
                      ...current,
                      linkedPullRequests: [
                        ...current.linkedPullRequests,
                        createWorkspaceLinkedPullRequest(),
                      ],
                    }))
                  }
                  label="Add pull request"
                />
              </div>
            }
          >
            <div className="-mx-2 space-y-0.5">
              {/* Current branch PR */}
              {!isDefaultWorkspace && currentBranchPr && currentBranchPrStatus ? (
                <GitHubPrRow
                  number={currentBranchPr.number}
                  title={currentBranchPr.title}
                  status={currentBranchPrStatus}
                  branch={`${currentBranchPr.headRefName} → ${currentBranchPr.baseRefName}`}
                  url={currentBranchPr.url}
                  isCurrent
                />
              ) : !isDefaultWorkspace ? (
                <EmptyHint>No PR for current branch</EmptyHint>
              ) : null}

              {/* Linked PRs */}
              {workspaceInformation.linkedPullRequests.map((item) => {
                const githubRef = extractGitHubPullRequestReference(item.url);
                const preview = linkedPullRequestPreviewById[item.id];
                const previewInfo = preview?.info;
                const previewStatus = previewInfo?.derived;

                if (!isWorkspaceInfoUrl(item.url)) {
                  return (
                    <InlineUrlInput
                      key={item.id}
                      value={item.url}
                      icon={<Link className="size-4" />}
                      placeholder="https://github.com/owner/repo/pull/123"
                      onChange={(url) =>
                        patchWorkspaceInformation((current) => ({
                          ...current,
                          linkedPullRequests: updateItemById(
                            current.linkedPullRequests,
                            item.id,
                            (pullRequest) => ({
                              ...pullRequest,
                              url,
                            }),
                          ),
                        }))
                      }
                      onRemove={() =>
                        patchWorkspaceInformation((current) => ({
                          ...current,
                          linkedPullRequests: removeItemById(
                            current.linkedPullRequests,
                            item.id,
                          ),
                        }))
                      }
                    />
                  );
                }

                const title =
                  previewInfo?.pr.title ||
                  item.title.trim() ||
                  (githubRef
                    ? `${githubRef.owner}/${githubRef.repo} #${githubRef.number}`
                    : "Linked PR");
                const number = previewInfo?.pr.number ?? githubRef?.number ?? 0;
                const repo = githubRef
                  ? `${githubRef.owner}/${githubRef.repo}`
                  : undefined;
                const branch =
                  previewInfo?.pr.headRefName && previewInfo.pr.baseRefName
                    ? `${previewInfo.pr.headRefName} → ${previewInfo.pr.baseRefName}`
                    : undefined;

                return (
                  <GitHubPrRow
                    key={item.id}
                    number={number}
                    title={title}
                    status={
                      previewStatus ??
                      (preview?.loading ? "review_required" : "review_required")
                    }
                    repo={repo}
                    branch={branch}
                    url={item.url}
                    loading={preview?.loading}
                    onRefresh={() =>
                      void refreshLinkedPullRequestPreview({
                        itemId: item.id,
                        url: item.url.trim(),
                      })
                    }
                    onRemove={() =>
                      patchWorkspaceInformation((current) => ({
                        ...current,
                        linkedPullRequests: removeItemById(
                          current.linkedPullRequests,
                          item.id,
                        ),
                      }))
                    }
                  />
                );
              })}

              {workspaceInformation.linkedPullRequests.length === 0 &&
              !currentBranchPr &&
              !isDefaultWorkspace ? null : workspaceInformation
                  .linkedPullRequests.length === 0 && isDefaultWorkspace ? (
                <EmptyHint>No linked pull requests</EmptyHint>
              ) : null}
            </div>
          </SectionHeader>

          {/* ── Jira ──────────────────────────────────────────── */}
          <SectionHeader
            value="jira"
            title="Jira Issues"
            icon={<JiraIcon className="size-4" />}
            count={workspaceInformation.jiraIssues.length}
            action={
              <AddButton
                onClick={() =>
                  patchWorkspaceInformation((current) => ({
                    ...current,
                    jiraIssues: [
                      ...current.jiraIssues,
                      createWorkspaceJiraIssue(),
                    ],
                  }))
                }
                label="Add Jira issue"
              />
            }
          >
            <div className="-mx-2 space-y-0.5">
              {workspaceInformation.jiraIssues.length === 0 ? (
                <EmptyHint>No linked Jira issues</EmptyHint>
              ) : null}
              {workspaceInformation.jiraIssues.map((issue) => {
                const issueRef = extractJiraIssueReference(issue.url);
                const issueKey =
                  issue.issueKey.trim() || issueRef?.issueKey || "";
                const host =
                  issueRef?.host || formatWorkspaceInfoHostLabel(issue.url);
                const title =
                  issue.title.trim() || issueKey || "Linked Jira issue";

                if (!isWorkspaceInfoUrl(issue.url)) {
                  return (
                    <InlineUrlInput
                      key={issue.id}
                      value={issue.url}
                      icon={<Link className="size-4" />}
                      placeholder="https://company.atlassian.net/browse/ABC-123"
                      onChange={(url) =>
                        patchWorkspaceInformation((current) => ({
                          ...current,
                          jiraIssues: updateItemById(
                            current.jiraIssues,
                            issue.id,
                            (item) => {
                              const parsed = extractJiraIssueReference(url);
                              return {
                                ...item,
                                url,
                                issueKey: parsed?.issueKey ?? item.issueKey,
                              };
                            },
                          ),
                        }))
                      }
                      onRemove={() =>
                        patchWorkspaceInformation((current) => ({
                          ...current,
                          jiraIssues: removeItemById(
                            current.jiraIssues,
                            issue.id,
                          ),
                        }))
                      }
                    />
                  );
                }

                return (
                  <InlineLinkRow
                    key={issue.id}
                    icon={<Globe className="size-4 text-muted-foreground/70" />}
                    label={title}
                    sublabel={host ? `${host}${issueKey ? ` · ${issueKey}` : ""}` : issueKey}
                    badge={
                      issue.status.trim() ? (
                        <Badge
                          variant="outline"
                          className="h-5 rounded-full px-2 py-0 text-[11px] font-normal leading-none"
                        >
                          {issue.status.trim()}
                        </Badge>
                      ) : null
                    }
                    url={issue.url}
                    onRemove={() =>
                      patchWorkspaceInformation((current) => ({
                        ...current,
                        jiraIssues: removeItemById(
                          current.jiraIssues,
                          issue.id,
                        ),
                      }))
                    }
                  />
                );
              })}
            </div>
          </SectionHeader>

          {/* ── Confluence ──────────────────────────────────────── */}
          <SectionHeader
            value="confluence"
            title="Confluence"
            icon={<ConfluenceIcon className="size-4" />}
            count={(workspaceInformation.confluencePages ?? []).length}
            action={
              <AddButton
                onClick={() =>
                  patchWorkspaceInformation((current) => ({
                    ...current,
                    confluencePages: [
                      ...(current.confluencePages ?? []),
                      createWorkspaceConfluencePage(),
                    ],
                  }))
                }
                label="Add Confluence page"
              />
            }
          >
            <div className="-mx-2 space-y-0.5">
              {(workspaceInformation.confluencePages ?? []).length === 0 ? (
                <EmptyHint>No linked Confluence pages</EmptyHint>
              ) : null}
              {(workspaceInformation.confluencePages ?? []).map((page) => {
                const confluenceRef = extractConfluencePageReference(page.url);
                const title =
                  page.title.trim() ||
                  confluenceRef?.title ||
                  "Linked Confluence page";
                const host =
                  confluenceRef?.host ||
                  formatWorkspaceInfoHostLabel(page.url);
                const spaceKey =
                  page.spaceKey.trim() || confluenceRef?.spaceKey || "";

                if (!isWorkspaceInfoUrl(page.url)) {
                  return (
                    <InlineUrlInput
                      key={page.id}
                      value={page.url}
                      icon={<Link className="size-4" />}
                      placeholder="https://company.atlassian.net/wiki/spaces/..."
                      onChange={(url) =>
                        patchWorkspaceInformation((current) => ({
                          ...current,
                          confluencePages: updateItemById(
                            current.confluencePages ?? [],
                            page.id,
                            (item) => {
                              const parsed =
                                extractConfluencePageReference(url);
                              return {
                                ...item,
                                url,
                                title: parsed?.title || item.title,
                                spaceKey: parsed?.spaceKey || item.spaceKey,
                              };
                            },
                          ),
                        }))
                      }
                      onRemove={() =>
                        patchWorkspaceInformation((current) => ({
                          ...current,
                          confluencePages: removeItemById(
                            current.confluencePages ?? [],
                            page.id,
                          ),
                        }))
                      }
                    />
                  );
                }

                return (
                  <InlineLinkRow
                    key={page.id}
                    icon={
                      <Globe className="size-4 text-muted-foreground/70" />
                    }
                    label={title}
                    sublabel={
                      host
                        ? `${host}${spaceKey ? ` · ${spaceKey}` : ""}`
                        : spaceKey || undefined
                    }
                    url={page.url}
                    onRemove={() =>
                      patchWorkspaceInformation((current) => ({
                        ...current,
                        confluencePages: removeItemById(
                          current.confluencePages ?? [],
                          page.id,
                        ),
                      }))
                    }
                  />
                );
              })}
            </div>
          </SectionHeader>

          {/* ── Figma ─────────────────────────────────────────── */}
          <SectionHeader
            value="figma"
            title="Figma"
            icon={<FigmaIcon className="size-4" />}
            count={workspaceInformation.figmaResources.length}
            action={
              <AddButton
                onClick={() =>
                  patchWorkspaceInformation((current) => ({
                    ...current,
                    figmaResources: [
                      ...current.figmaResources,
                      createWorkspaceFigmaResource(),
                    ],
                  }))
                }
                label="Add Figma resource"
              />
            }
          >
            <div className="-mx-2 space-y-0.5">
              {workspaceInformation.figmaResources.length === 0 ? (
                <EmptyHint>No linked Figma resources</EmptyHint>
              ) : null}
              {workspaceInformation.figmaResources.map((resource) => {
                const figmaRef = extractFigmaResourceReference(resource.url);
                const title =
                  resource.title.trim() ||
                  figmaRef?.title ||
                  "Linked Figma resource";
                const host =
                  figmaRef?.host || formatWorkspaceInfoHostLabel(resource.url);

                if (!isWorkspaceInfoUrl(resource.url)) {
                  return (
                    <InlineUrlInput
                      key={resource.id}
                      value={resource.url}
                      icon={<Link className="size-4" />}
                      placeholder="https://www.figma.com/file/..."
                      onChange={(url) =>
                        patchWorkspaceInformation((current) => ({
                          ...current,
                          figmaResources: updateItemById(
                            current.figmaResources,
                            resource.id,
                            (item) => {
                              const parsed = extractFigmaResourceReference(url);
                              return {
                                ...item,
                                url,
                                title: parsed?.title || item.title,
                                nodeId: parsed?.nodeId ?? item.nodeId,
                              };
                            },
                          ),
                        }))
                      }
                      onRemove={() =>
                        patchWorkspaceInformation((current) => ({
                          ...current,
                          figmaResources: removeItemById(
                            current.figmaResources,
                            resource.id,
                          ),
                        }))
                      }
                    />
                  );
                }

                return (
                  <InlineLinkRow
                    key={resource.id}
                    icon={<Globe className="size-4 text-muted-foreground/70" />}
                    label={title}
                    sublabel={
                      host
                        ? `${host}${figmaRef?.kind && figmaRef.kind !== "unknown" ? ` · ${formatFigmaKindLabel(figmaRef.kind)}` : ""}`
                        : figmaRef?.kind
                          ? formatFigmaKindLabel(figmaRef.kind)
                          : undefined
                    }
                    url={resource.url}
                    onRemove={() =>
                      patchWorkspaceInformation((current) => ({
                        ...current,
                        figmaResources: removeItemById(
                          current.figmaResources,
                          resource.id,
                        ),
                      }))
                    }
                  />
                );
              })}
            </div>
          </SectionHeader>

          {/* ── Slack ─────────────────────────────────────────── */}
          <SectionHeader
            value="slack"
            title="Slack"
            icon={<SlackIcon className="size-4" />}
            count={workspaceInformation.slackThreads?.length ?? 0}
            action={
              <AddButton
                onClick={() =>
                  patchWorkspaceInformation((current) => ({
                    ...current,
                    slackThreads: [
                      ...(current.slackThreads ?? []),
                      createWorkspaceSlackThread(),
                    ],
                  }))
                }
                label="Add Slack thread"
              />
            }
          >
            <div className="-mx-2 space-y-0.5">
              {(workspaceInformation.slackThreads?.length ?? 0) === 0 ? (
                <EmptyHint>No linked Slack threads</EmptyHint>
              ) : null}
              {(workspaceInformation.slackThreads ?? []).map((thread) => {
                const slackRef = extractSlackThreadReference(thread.url);
                const host =
                  slackRef?.host || formatWorkspaceInfoHostLabel(thread.url);
                const label =
                  thread.channelName.trim() ||
                  (slackRef ? `#${slackRef.channelId}` : "Slack thread");

                if (!isWorkspaceInfoUrl(thread.url)) {
                  return (
                    <InlineUrlInput
                      key={thread.id}
                      value={thread.url}
                      icon={<Link className="size-4" />}
                      placeholder="https://team.slack.com/archives/C.../p..."
                      onChange={(url) =>
                        patchWorkspaceInformation((current) => ({
                          ...current,
                          slackThreads: updateItemById(
                            current.slackThreads ?? [],
                            thread.id,
                            (item) => ({ ...item, url }),
                          ),
                        }))
                      }
                      onRemove={() =>
                        patchWorkspaceInformation((current) => ({
                          ...current,
                          slackThreads: removeItemById(
                            current.slackThreads ?? [],
                            thread.id,
                          ),
                        }))
                      }
                    />
                  );
                }

                return (
                  <InlineLinkRow
                    key={thread.id}
                    icon={<Hash className="size-4 text-muted-foreground/70" />}
                    label={label}
                    sublabel={host || undefined}
                    url={thread.url}
                    onRemove={() =>
                      patchWorkspaceInformation((current) => ({
                        ...current,
                        slackThreads: removeItemById(
                          current.slackThreads ?? [],
                          thread.id,
                        ),
                      }))
                    }
                  />
                );
              })}
            </div>
          </SectionHeader>

          {/* ── Custom fields ─────────────────────────────────── */}
          <SectionHeader
            value="custom"
            title="Custom Fields"
            icon={<SlidersHorizontal className="size-4" />}
            count={workspaceInformation.customFields.length}
            action={
              <AddButton
                onClick={() =>
                  patchWorkspaceInformation((current) => ({
                    ...current,
                    customFields: [
                      ...current.customFields,
                      createWorkspaceInfoCustomField(),
                    ],
                  }))
                }
                label="Add custom field"
              />
            }
          >
            <div className="-mx-2 space-y-3">
              {workspaceInformation.customFields.length === 0 ? (
                <EmptyHint>No custom fields</EmptyHint>
              ) : null}
              {workspaceInformation.customFields.map((field) => (
                <div
                  key={field.id}
                  className="group/field space-y-1.5 px-1.5"
                >
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={field.label}
                      onChange={(event) =>
                        patchCustomField(field.id, (currentField) => ({
                          ...currentField,
                          label: event.target.value,
                        }))
                      }
                      placeholder="Label"
                      className="h-8 flex-1 border-0 bg-transparent px-1 text-sm font-medium shadow-none focus-visible:ring-0"
                    />
                    <Select
                      value={field.type}
                      onValueChange={(value) =>
                        patchCustomField(field.id, (currentField) =>
                          changeWorkspaceInfoCustomFieldType({
                            field: currentField,
                            type: value as WorkspaceInfoFieldType,
                          }),
                        )
                      }
                    >
                      <SelectTrigger className="h-8 w-auto min-w-[5.5rem] border-0 bg-transparent text-xs text-muted-foreground shadow-none">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WORKSPACE_INFO_FIELD_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {WORKSPACE_INFO_FIELD_TYPE_LABELS[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <button
                      type="button"
                      className="flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground/40 opacity-0 transition-opacity hover:text-destructive group-hover/field:opacity-100"
                      onClick={() =>
                        patchWorkspaceInformation((current) => ({
                          ...current,
                          customFields: removeItemById(
                            current.customFields,
                            field.id,
                          ),
                        }))
                      }
                      aria-label="Remove field"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                  {renderCustomFieldInput({
                    field,
                    onFieldChange: (nextField) =>
                      patchCustomField(field.id, () => nextField),
                  })}
                </div>
              ))}
            </div>
          </SectionHeader>
        </Accordion>
      </div>
    </div>
  );
}
