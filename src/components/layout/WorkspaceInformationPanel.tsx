import { Button as AdsButton } from "@/components/ads/components/Button";
import {
  BookOpen,
  Brain,
  Cable,
  CalendarIcon,
  ClipboardCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDot,
  ExternalLink,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  Globe,
  Hash,
  Link,
  MessageSquarePlus,
  Pin,
  Plus,
  RefreshCcw,
  SlidersHorizontal,
  Sparkles,
  StickyNote,
  X,
} from "lucide-react";
import { AmplifyIcon } from "@/components/brand-icons";
import { getReorderDestinationIndex } from "@atlaskit/pragmatic-drag-and-drop-hitbox/util/get-reorder-destination-index";
import { reorder } from "@atlaskit/pragmatic-drag-and-drop/reorder";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
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
  toast,
} from "@/components/ui";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import {
  changeWorkspaceInfoCustomFieldType,
  createWorkspaceAmplifyLink,
  createWorkspaceConfluencePage,
  createWorkspaceFigmaResource,
  createWorkspaceInfoCustomField,
  createWorkspaceCraneIssue,
  createWorkspaceJiraIssue,
  createWorkspaceLinkedPullRequest,
  createWorkspaceSlackThread,
  createWorkspaceStorybookResource,
  applyWorkspaceTodoStatus,
  createWorkspaceTodoItem,
  cycleWorkspaceTodoStatus,
  resolveWorkspaceTodoStatus,
  extractAmplifyLinkReference,
  extractConfluencePageReference,
  extractFigmaResourceReference,
  extractGitHubPullRequestReference,
  extractCraneIssueReference,
  extractJiraIssueReference,
  extractSlackThreadReference,
  extractStorybookResourceReference,
  formatWorkspaceInfoHostLabel,
  inferStorybookResourceAccess,
  isGitHubPullRequestUrl,
  isWorkspaceInfoUrl,
  isWorkspaceIntentAnchor,
  resolveVisibleWorkspaceLinkedPullRequests,
  toggleWorkspaceIntentAnchor,
  resolveStorybookResourceAccess,
  updateWorkspaceLinkedPullRequestUrl,
  type WorkspaceStorybookResourceAccess,
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
} from "@/lib/pr-status";
import { PR_TONE_BADGE_VARIANT } from "./pr-status.styles";
import { formatTaskUpdatedAt } from "@/lib/tasks";
import {
  formatWorkspaceInfoTaskSeedPrompt,
  resolveWorkspaceInfoTaskSeedTitle,
} from "@/lib/workspace-information-task-seed";
import {
  parseWorkspaceInformationOpenSections,
  WORKSPACE_INFORMATION_SECTION_IDS,
  resolveVisibleWorkspaceInformationSections,
  type WorkspaceInformationSectionId,
} from "@/lib/workspace-information-sections";
import { cx, sx, type StyleXValue } from "@/components/ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import { extractPlanTodoItems } from "@/lib/plans";
import {
  SortableDropIndicator,
  useSortableListMonitor,
  useSortableRow,
} from "@/hooks/use-sortable-list";
import { EditorMarkdownPreview } from "./editor-markdown-preview";
import { WorkspacePlansSection } from "./WorkspacePlansSection";
import { WorkspaceMemorySection } from "./WorkspaceMemorySection";
import {
  useMartinInformationCardAvailable,
  WorkspaceInformationMartinCard,
} from "./WorkspaceInformationMartinCard";
import { WorkspaceInformationConnectedBrowserCard } from "./WorkspaceInformationConnectedBrowserCard";
import { WorkspaceTurnSummary } from "./WorkspaceTurnSummary";
import { workspaceInformationPanelStyles as styles } from "./workspace-information-panel.styles";

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

const WORKSPACE_INFORMATION_ACCORDION_STORAGE_KEY =
  "stave:workspace-information-open-sections:v2";

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
    return ["overview"];
  }

  return parseWorkspaceInformationOpenSections(
    window.localStorage.getItem(WORKSPACE_INFORMATION_ACCORDION_STORAGE_KEY),
  );
}

const WORKSPACE_INFORMATION_SECTION_ORDER_STORAGE_KEY =
  "stave:workspace-information-section-order:v1";

/** "overview" (Summary) always leads; the rest follow the stored/default order. */
function normalizeWorkspaceInformationSectionOrder(
  stored: unknown,
): WorkspaceInformationSectionId[] {
  const valid = Array.isArray(stored)
    ? stored.filter((value): value is WorkspaceInformationSectionId =>
        WORKSPACE_INFORMATION_SECTION_IDS.includes(
          value as WorkspaceInformationSectionId,
        ),
      )
    : [];
  const seen = new Set(valid);
  const merged = [
    ...valid,
    ...WORKSPACE_INFORMATION_SECTION_IDS.filter((id) => !seen.has(id)),
  ];
  return [
    "overview",
    ...merged.filter(
      (id): id is WorkspaceInformationSectionId => id !== "overview",
    ),
  ];
}

function readStoredWorkspaceInformationSectionOrder(): WorkspaceInformationSectionId[] {
  if (typeof window === "undefined") {
    return normalizeWorkspaceInformationSectionOrder(null);
  }

  try {
    const raw = window.localStorage.getItem(
      WORKSPACE_INFORMATION_SECTION_ORDER_STORAGE_KEY,
    );
    return normalizeWorkspaceInformationSectionOrder(
      raw ? JSON.parse(raw) : null,
    );
  } catch {
    return normalizeWorkspaceInformationSectionOrder(null);
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
      className={cx(sx(styles.brandGlyph), className)}
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function JiraIcon({ className }: { className?: string }) {
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

function FigmaIcon({ className }: { className?: string }) {
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

function SlackIcon({ className }: { className?: string }) {
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

function ConfluenceIcon({ className }: { className?: string }) {
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

// ---------------------------------------------------------------------------
// Shared section wrapper — minimal, borderless accordion style
// ---------------------------------------------------------------------------

// Shared with the panel's drag-monitor owner so a completed section-reorder
// drag can suppress the trailing click that would otherwise toggle the
// AccordionTrigger the drag was performed on.
const SectionDragSuppressionContext = createContext<{ current: boolean }>({
  current: false,
});
const SectionVisibilityContext = createContext<
  ReadonlySet<WorkspaceInformationSectionId> | undefined
>(undefined);
/**
 * Which sections are open. The chevron used to read the trigger's
 * `aria-expanded` through a Tailwind `group-aria-expanded` variant; StyleX has
 * no ancestor selector, so the same state is read from React instead.
 */
const SectionOpenContext = createContext<
  ReadonlySet<WorkspaceInformationSectionId>
>(new Set());
/** Keyboard fallback for section reordering (Alt+ArrowUp / Alt+ArrowDown). */
const SectionReorderContext = createContext<
  (args: {
    sectionId: WorkspaceInformationSectionId;
    direction: "up" | "down";
  }) => void
>(() => {});

const SECTION_SORTABLE_LIST_ID = "workspace-information-sections";

function SectionHeader(props: {
  value: WorkspaceInformationSectionId;
  title: string;
  icon: ReactNode;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
  first?: boolean;
  order?: number;
}) {
  const isDraggable = props.value !== "overview";
  const suppressClickRef = useContext(SectionDragSuppressionContext);
  const visibleSections = useContext(SectionVisibilityContext);
  const isOpen = useContext(SectionOpenContext).has(props.value);
  const moveSection = useContext(SectionReorderContext);
  const { setRowElement, setHandleElement, isDragging, closestEdge } =
    useSortableRow({
      listId: SECTION_SORTABLE_LIST_ID,
      itemId: props.value,
      disabled: !isDraggable,
      preview: { title: props.title, icon: props.icon },
    });
  const style: CSSProperties = {
    order: props.order,
  };

  if (visibleSections && !visibleSections.has(props.value)) {
    return null;
  }

  return (
    <AccordionItem
      ref={setRowElement}
      style={style}
      value={props.value}
      className={sx(
        styles.sectionItem,
        props.first && styles.sectionItemFirst,
        isDragging && styles.sectionItemDragging,
      )}
    >
      <div className={sx(styles.sectionRow)}>
        <AccordionTrigger
          ref={isDraggable ? setHandleElement : undefined}
          onClick={(event) => {
            if (suppressClickRef.current) {
              // A drag just reordered this section — swallow the trailing
              // click so it doesn't also toggle the accordion open/closed.
              event.preventDefault();
            }
          }}
          onKeyDown={(event) => {
            if (
              !isDraggable ||
              !event.altKey ||
              (event.key !== "ArrowUp" && event.key !== "ArrowDown")
            ) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            moveSection({
              sectionId: props.value,
              direction: event.key === "ArrowUp" ? "up" : "down",
            });
          }}
          className={sx(
            styles.sectionTrigger,
            isDraggable && styles.sectionTriggerDraggable,
          )}
        >
          <div className={sx(styles.sectionTitleRow)}>
            <span className={sx(styles.sectionMark)}>
              {/* Section icon — visible by default, fades out on row hover */}
              <span className={sx(styles.sectionMarkIcon)}>{props.icon}</span>
              {/* Chevron — hidden by default, fades in on row hover */}
              <span className={sx(styles.sectionMarkChevronSlot)}>
                {isOpen ? (
                  <ChevronDown className={sx(styles.sectionMarkChevron)} />
                ) : (
                  <ChevronRight className={sx(styles.sectionMarkChevron)} />
                )}
              </span>
            </span>
            <span className={sx(styles.sectionTitle)}>{props.title}</span>
            {props.count !== undefined && props.count > 0 ? (
              <span className={sx(styles.sectionCount)}>{props.count}</span>
            ) : null}
          </div>
        </AccordionTrigger>
        {props.action ? (
          <div className={sx(styles.sectionAction)}>{props.action}</div>
        ) : null}
      </div>
      <AccordionContent className={sx(styles.sectionPanel)}>
        {props.children}
      </AccordionContent>
      {closestEdge ? <SortableDropIndicator edge={closestEdge} /> : null}
    </AccordionItem>
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
            xstyle={styles.linkRowTitle}
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

function CreateTaskActionButton(props: {
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

// ---------------------------------------------------------------------------
// GitHub PR row — styled like actual GitHub
// ---------------------------------------------------------------------------

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
  actions?: ReactNode;
}) {
  const visual = PR_STATUS_VISUAL[props.status];

  return (
    <div className={sx(styles.prRow)}>
      <GitHubPrStatusIcon status={props.status} xstyle={styles.prRowMark} />
      <div className={sx(styles.prRowBody)}>
        <div className={sx(styles.prRowTitleLine)}>
          <AdsButton
            layout="host"
            type="button"
            xstyle={styles.prRowTitle}
            onClick={() => openExternalUrl(props.url)}
          >
            {props.title}
          </AdsButton>
        </div>
        <div className={sx(styles.prRowMeta)}>
          <span className={sx(styles.prRowNumber)}>#{props.number}</span>
          <Badge
            variant={PR_TONE_BADGE_VARIANT[visual.tone]}
            className={sx(styles.chipStatus)}
          >
            {visual.label}
          </Badge>
          {props.isCurrent ? (
            <Badge variant="outline" className={sx(styles.chipTight)}>
              Current branch
            </Badge>
          ) : null}
          {props.repo ? (
            <span className={sx(styles.prRowRepo)}>{props.repo}</span>
          ) : null}
          {props.branch ? (
            <span className={sx(styles.prRowBranch)}>{props.branch}</span>
          ) : null}
        </div>
      </div>
      <div className={sx(styles.prRowTrail)}>
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

// ---------------------------------------------------------------------------
// Custom field inline renderer
// ---------------------------------------------------------------------------

function CustomFieldDatePicker(props: {
  value: string;
  onChange: (value: string) => void;
}) {
  const selected = props.value
    ? new Date(props.value + "T00:00:00")
    : undefined;
  const isValid = selected && !Number.isNaN(selected.getTime());

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            xstyle={[
              styles.datePickerTrigger,
              !props.value && styles.datePickerTriggerEmpty,
            ]}
          />
        }
      >
        <CalendarIcon className={sx(styles.datePickerIcon)} />
        {isValid
          ? selected.toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })
          : "Pick a date"}
      </PopoverTrigger>
      <PopoverContent xstyle={styles.datePickerPopover} align="start">
        <Calendar
          value={isValid ? props.value : undefined}
          onDateSelect={(date) => props.onChange(date === props.value ? "" : date)}
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
    <div className={sx(styles.fieldStack)}>
      <Input
        xstyle={styles.control}
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
        <SelectTrigger className={sx(styles.controlBlock)}>
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
          xstyle={styles.controlTextarea}
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
          xstyle={styles.control}
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
        <div className={sx(styles.switchRow)}>
          <Switch
            checked={field.value}
            onCheckedChange={(checked) =>
              onFieldChange({ ...field, value: Boolean(checked) })
            }
            size="sm"
          />
          <span className={sx(styles.switchLabel)}>
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
        <div className={sx(styles.urlFieldRow)}>
          <Input
            xstyle={styles.controlFlex}
            value={field.value}
            onChange={(event) =>
              onFieldChange({ ...field, value: event.target.value })
            }
            placeholder="https://..."
          />
          {isWorkspaceInfoUrl(field.value) ? (
            <AdsButton
              layout="host"
              type="button"
              xstyle={styles.urlFieldOpen}
              onClick={() => openExternalUrl(field.value)}
              aria-label="Open link"
            >
              <ExternalLink className={sx(styles.glyphMd)} />
            </AdsButton>
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
          xstyle={styles.control}
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
    <AdsButton
      layout="host"
      type="button"
      xstyle={[styles.iconButtonQuiet, styles.iconButtonHoverSurface]}
      onClick={props.onClick}
      aria-label={props.label ?? "Add"}
    >
      <Plus className={sx(styles.glyphMd)} />
    </AdsButton>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyHint(props: { children: ReactNode }) {
  return (
    <p className={sx(styles.emptyHint)}>
      {props.children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Notes — markdown preview by default, click to edit
// ---------------------------------------------------------------------------

function NotesSectionBody(props: {
  notes: string;
  onChange: (value: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(props.notes);

  const startEditing = () => {
    setDraft(props.notes);
    setIsEditing(true);
  };

  const commit = () => {
    setIsEditing(false);
    if (draft !== props.notes) {
      props.onChange(draft);
    }
  };

  const cancel = () => {
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className={sx(styles.notesEditor)}>
        <Textarea
          autoFocus
          xstyle={styles.notesTextarea}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={(event) => {
            const length = event.currentTarget.value.length;
            event.currentTarget.setSelectionRange(length, length);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            } else if (
              event.key === "Enter" &&
              (event.metaKey || event.ctrlKey)
            ) {
              event.preventDefault();
              commit();
            }
          }}
          placeholder="Notes, blockers, handoff details..."
        />
        <div className={sx(styles.notesFooter)}>
          <span className={sx(styles.notesHint)}>
            Markdown · ⌘/Ctrl+Enter to save
          </span>
          <div className={sx(styles.notesActions)}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              xstyle={styles.notesButton}
              onClick={cancel}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              xstyle={styles.notesButton}
              onClick={commit}
              disabled={draft === props.notes}
            >
              Done
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!props.notes.trim()) {
    return (
      <AdsButton
        layout="host"
        type="button"
        onClick={startEditing}
        xstyle={styles.notesPlaceholder}
      >
        Add notes… (markdown supported)
      </AdsButton>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(event) => {
        if (event.target instanceof HTMLElement && event.target.closest("a")) {
          return;
        }
        startEditing();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          startEditing();
        }
      }}
      className={sx(styles.notesPreview)}
    >
      <EditorMarkdownPreview
        content={props.notes}
        fontSize={13}
        variant="embedded"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WorkspaceInformationPanel() {
  const [
    activeWorkspaceId,
    activeTaskId,
    workspacePath,
    workspaceInformation,
    updateWorkspaceInformation,
    isDefaultWorkspace,
    prInfo,
    fetchWorkspacePrStatus,
    infoPanelScale,
    infoPanelSectionVisibility,
    craneConnectorEnabled,
    workspacePlansRefreshNonce,
    notifyWorkspacePlansChanged,
    openFileFromTree,
    createTask,
    sendUserMessage,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.activeWorkspaceId,
          state.activeTaskId,
          state.workspacePathById[state.activeWorkspaceId] ??
            state.projectPath ??
            "",
          state.workspaceInformation,
          state.updateWorkspaceInformation,
          Boolean(state.workspaceDefaultById[state.activeWorkspaceId]),
          state.workspacePrInfoById[state.activeWorkspaceId] ?? null,
          state.fetchWorkspacePrStatus,
          state.settings.infoPanelScale,
          state.settings.infoPanelSectionVisibility,
          state.settings.craneConnector.enabled,
          state.workspacePlansRefreshNonce,
          state.notifyWorkspacePlansChanged,
          state.openFileFromTree,
          state.createTask,
          state.sendUserMessage,
        ] as const,
    ),
  );

  const [openSections, setOpenSections] = useState<
    WorkspaceInformationSectionId[]
  >(() => readStoredWorkspaceInformationSections());
  const [sectionOrder, setSectionOrder] = useState<
    WorkspaceInformationSectionId[]
  >(() => readStoredWorkspaceInformationSectionOrder());
  const projectPath = useAppStore((state) => state.projectPath);
  const [memoryHeader, setMemoryHeader] = useState({
    count: 0,
    loading: false,
  });
  const [memoryRefreshNonce, setMemoryRefreshNonce] = useState(0);
  const handleMemoryEntriesChange = useCallback(
    (next: { count: number; loading: boolean }) => {
      setMemoryHeader((current) =>
        current.count === next.count && current.loading === next.loading
          ? current
          : next,
      );
    },
    [],
  );
  const visibleSectionIds = useMemo(
    () =>
      resolveVisibleWorkspaceInformationSections({
        visibility: infoPanelSectionVisibility,
        information: workspaceInformation,
        craneConnectorEnabled,
        // TODO(tasks-surface): read `settings.jiraConnector.enabled` once the Jira connector slice exists.
        jiraConnectorEnabled: false,
        memoryCount: memoryHeader.count,
      }),
    [
      craneConnectorEnabled,
      infoPanelSectionVisibility,
      memoryHeader.count,
      workspaceInformation,
    ],
  );
  const visibleSections = useMemo(
    () => new Set(visibleSectionIds),
    [visibleSectionIds],
  );
  const openSectionSet = useMemo(() => new Set(openSections), [openSections]);
  const showMartinCard = useMartinInformationCardAvailable();
  const sectionOrderIndexById = Object.fromEntries(
    sectionOrder.map((id, index) => [id, index]),
  ) as Record<WorkspaceInformationSectionId, number>;
  const suppressSectionClickRef = useRef(false);

  useSortableListMonitor({
    isListMatch: (listId) => listId === SECTION_SORTABLE_LIST_ID,
    onReorder: ({ sourceId, targetId, closestEdge }) => {
      setSectionOrder((current) => {
        const fromIndex = current.indexOf(
          sourceId as WorkspaceInformationSectionId,
        );
        const targetIndex = current.indexOf(
          targetId as WorkspaceInformationSectionId,
        );
        if (fromIndex < 0 || targetIndex < 0) {
          return current;
        }
        const destinationIndex = getReorderDestinationIndex({
          startIndex: fromIndex,
          indexOfTarget: targetIndex,
          closestEdgeOfTarget: closestEdge,
          axis: "vertical",
        });
        // "overview" (Summary) is pinned to the top of the section order.
        if (destinationIndex <= 0 || destinationIndex === fromIndex) {
          return current;
        }
        suppressSectionClickRef.current = true;
        window.setTimeout(() => {
          suppressSectionClickRef.current = false;
        }, 0);
        return normalizeWorkspaceInformationSectionOrder(
          reorder({
            list: current,
            startIndex: fromIndex,
            finishIndex: destinationIndex,
          }),
        );
      });
    },
  });

  /**
   * Keyboard fallback for section reordering: move the section past its
   * nearest *visible* neighbor so a step is never swallowed by a hidden
   * section sitting between two visible ones in the stored order.
   */
  const moveSectionForKeyboard = useCallback(
    (args: {
      sectionId: WorkspaceInformationSectionId;
      direction: "up" | "down";
    }) => {
      setSectionOrder((current) => {
        const visibleOrdered = current.filter((id) => visibleSections.has(id));
        const visibleIndex = visibleOrdered.indexOf(args.sectionId);
        if (visibleIndex < 0) {
          return current;
        }
        const neighbor =
          visibleOrdered[visibleIndex + (args.direction === "down" ? 1 : -1)];
        if (!neighbor || neighbor === "overview") {
          return current;
        }
        const fromIndex = current.indexOf(args.sectionId);
        const targetIndex = current.indexOf(neighbor);
        if (fromIndex < 0 || targetIndex <= 0) {
          return current;
        }
        return normalizeWorkspaceInformationSectionOrder(
          reorder({
            list: current,
            startIndex: fromIndex,
            finishIndex: targetIndex,
          }),
        );
      });
    },
    [visibleSections],
  );
  const [linkedPullRequestPreviewById, setLinkedPullRequestPreviewById] =
    useState<Record<string, LinkedPullRequestPreview>>({});
  const currentBranchPr = prInfo?.pr ?? null;
  const currentBranchPrStatus = prInfo?.derived ?? null;
  const visibleLinkedPullRequests = useMemo(
    () =>
      resolveVisibleWorkspaceLinkedPullRequests({
        items: workspaceInformation.linkedPullRequests,
        currentBranchUrl: currentBranchPr?.url,
      }),
    [currentBranchPr?.url, workspaceInformation.linkedPullRequests],
  );
  const [taskSeedInFlightId, setTaskSeedInFlightId] = useState<string | null>(
    null,
  );
  const [plansHeader, setPlansHeader] = useState({ count: 0, loading: false });
  const handlePlansEntriesChange = useCallback(
    (next: { count: number; loading: boolean }) => {
      setPlansHeader((current) =>
        current.count === next.count && current.loading === next.loading
          ? current
          : next,
      );
    },
    [],
  );

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
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(
        WORKSPACE_INFORMATION_SECTION_ORDER_STORAGE_KEY,
        JSON.stringify(sectionOrder),
      );
    } catch {
      // Ignore localStorage write failures for this UI preference.
    }
  }, [sectionOrder]);

  useEffect(() => {
    const items = visibleLinkedPullRequests
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
  }, [visibleLinkedPullRequests, workspacePath]);

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

  function patchLinkedPullRequestUrl(itemId: string, url: string) {
    let duplicate: "current_branch" | "linked" | null = null;
    patchWorkspaceInformation((current) => {
      const result = updateWorkspaceLinkedPullRequestUrl({
        items: current.linkedPullRequests,
        itemId,
        url,
        currentBranchUrl: currentBranchPr?.url,
      });
      duplicate = result.duplicate;
      return result.items === current.linkedPullRequests
        ? current
        : { ...current, linkedPullRequests: result.items };
    });

    if (duplicate) {
      toast.info(
        duplicate === "current_branch"
          ? "This is already the current branch PR"
          : "This pull request is already linked",
      );
    }
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

  async function handleCreateTaskFromWorkspaceInfo(args: {
    itemId: string;
    sourceLabel: string;
    title: string;
    url: string;
    referenceLabel?: string;
    note?: string;
  }) {
    if (taskSeedInFlightId) {
      return;
    }

    const title = resolveWorkspaceInfoTaskSeedTitle({
      title: args.title,
      referenceLabel: args.referenceLabel,
    });
    const content = formatWorkspaceInfoTaskSeedPrompt({
      title,
      sourceLabel: args.sourceLabel,
      url: args.url,
      referenceLabel: args.referenceLabel,
      note: args.note,
    });

    setTaskSeedInFlightId(args.itemId);
    try {
      createTask({ title });
      const newTaskId = useAppStore.getState().activeTaskId;
      if (!newTaskId || newTaskId === activeTaskId) {
        toast.error("Unable to create task");
        return;
      }

      const result = await sendUserMessage({
        taskId: newTaskId,
        content,
        turnOrigin: "conversation",
      });
      if (result.status === "blocked") {
        toast.error("Task created but prompt was blocked", {
          description: title,
        });
        return;
      }

      toast.success("Task created", { description: title });
    } finally {
      setTaskSeedInFlightId(null);
    }
  }

  const totalTodoCount = workspaceInformation.todos.length;
  const completedTodoCount = workspaceInformation.todos.filter(
    (todo) => resolveWorkspaceTodoStatus(todo) === "completed",
  ).length;
  const openTodoCount = totalTodoCount - completedTodoCount;
  const latestTurnSummary = workspaceInformation.turnSummary ?? null;
  const connectedBrowserTab = workspaceInformation.connectedBrowserTab ?? null;
  const showInformationTopCards =
    showMartinCard || Boolean(connectedBrowserTab);

  return (
    <div
      className={sx(styles.root)}
      style={infoPanelScale !== 1 ? { zoom: infoPanelScale } : undefined}
    >
      <div className={sx(styles.body)}>
        {showInformationTopCards ? (
          <div className={sx(styles.topCards)}>
            {showMartinCard ? <WorkspaceInformationMartinCard /> : null}
            <WorkspaceInformationConnectedBrowserCard
              tab={connectedBrowserTab}
            />
          </div>
        ) : null}
        <SectionDragSuppressionContext.Provider value={suppressSectionClickRef}>
          <SectionReorderContext.Provider value={moveSectionForKeyboard}>
            <SectionVisibilityContext.Provider value={visibleSections}>
              <SectionOpenContext.Provider value={openSectionSet}>
              <Accordion
                multiple
                value={openSections}
                onValueChange={(value) =>
                  setOpenSections(value as WorkspaceInformationSectionId[])
                }
              >
                <SectionHeader
                  value="overview"
                  order={sectionOrderIndexById.overview}
                  title="Summary"
                  icon={<Sparkles className={sx(styles.glyphMd)} />}
                  first
                  action={
                    latestTurnSummary ? (
                      <span className={sx(styles.sectionStamp)}>
                        {formatTaskUpdatedAt({
                          value: latestTurnSummary.generatedAt,
                        })}
                      </span>
                    ) : null
                  }
                >
                  {latestTurnSummary ? (
                    <WorkspaceTurnSummary summary={latestTurnSummary} />
                  ) : (
                    <div className={sx(styles.summaryEmpty)}>
                      <p className={sx(styles.summaryEmptyTitle)}>
                        No completed turn yet
                      </p>
                      <p className={sx(styles.summaryEmptyBody)}>
                        The latest request, outcome, and model will appear here
                        after the first completed response.
                      </p>
                    </div>
                  )}
                </SectionHeader>

                {/* ── Todo ──────────────────────────────────────────── */}
                <SectionHeader
                  value="todo"
                  order={sectionOrderIndexById.todo}
                  title="Todos"
                  icon={<CheckCircle2 className={sx(styles.glyphMd)} />}
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
                  {totalTodoCount > 0 ? (
                    <div className={sx(styles.todoProgressRow)}>
                      <div className={sx(styles.todoProgressTrack)}>
                        <div
                          className={sx(styles.todoProgressFill)}
                          style={{
                            width: `${Math.round(
                              (completedTodoCount / totalTodoCount) * 100,
                            )}%`,
                          }}
                        />
                      </div>
                      <span className={sx(styles.todoProgressCount)}>
                        {completedTodoCount}/{totalTodoCount}
                      </span>
                    </div>
                  ) : null}
                  <div className={sx(styles.itemList)}>
                    {workspaceInformation.todos.length === 0 ? (
                      <EmptyHint>No todos yet</EmptyHint>
                    ) : null}
                    {workspaceInformation.todos.map((todo) => (
                      <div
                        key={todo.id}
                        className={sx(styles.todoRow)}
                      >
                        <AdsButton
                          layout="host"
                          type="button"
                          xstyle={[
                            styles.todoStatus,
                            resolveWorkspaceTodoStatus(todo) === "pending"
                              ? styles.todoStatusPending
                              : styles.todoStatusActive,
                          ]}
                          onClick={() =>
                            patchWorkspaceInformation((current) => ({
                              ...current,
                              todos: updateItemById(
                                current.todos,
                                todo.id,
                                (item) =>
                                  applyWorkspaceTodoStatus(
                                    item,
                                    cycleWorkspaceTodoStatus(
                                      resolveWorkspaceTodoStatus(item),
                                    ),
                                  ),
                              ),
                            }))
                          }
                          aria-label={`Todo status: ${resolveWorkspaceTodoStatus(
                            todo,
                          )}. Click to advance.`}
                        >
                          {resolveWorkspaceTodoStatus(todo) === "completed" ? (
                            <CheckCircle2 className={sx(styles.glyphMd)} />
                          ) : resolveWorkspaceTodoStatus(todo) ===
                            "in_progress" ? (
                            <CircleDot className={sx(styles.glyphMd)} />
                          ) : (
                            <Circle className={sx(styles.glyphMd)} />
                          )}
                        </AdsButton>
                        <Input
                          value={todo.text}
                          onChange={(event) =>
                            patchWorkspaceInformation((current) => ({
                              ...current,
                              todos: updateItemById(
                                current.todos,
                                todo.id,
                                (item) => ({
                                  ...item,
                                  text: event.target.value,
                                }),
                              ),
                            }))
                          }
                          placeholder="Todo item"
                          xstyle={[
                            styles.bareInputPadded,
                            resolveWorkspaceTodoStatus(todo) === "completed" &&
                              styles.bareInputDone,
                          ]}
                        />
                        <AdsButton
                          layout="host"
                          type="button"
                          xstyle={[styles.rowRemove, styles.rowRemoveSm]}
                          onClick={() =>
                            patchWorkspaceInformation((current) => ({
                              ...current,
                              todos: removeItemById(current.todos, todo.id),
                            }))
                          }
                          aria-label="Remove todo"
                        >
                          <X className={sx(styles.glyphSm)} />
                        </AdsButton>
                      </div>
                    ))}
                  </div>
                </SectionHeader>

                {/* ── Note ──────────────────────────────────────────── */}
                <SectionHeader
                  value="note"
                  order={sectionOrderIndexById.note}
                  title="Notes"
                  icon={<StickyNote className={sx(styles.glyphMd)} />}
                >
                  <NotesSectionBody
                    notes={workspaceInformation.notes}
                    onChange={(notes) =>
                      patchWorkspaceInformation((current) => ({
                        ...current,
                        notes,
                      }))
                    }
                  />
                </SectionHeader>

                {/* ── Memory (project-scoped) ───────────────────── */}
                <SectionHeader
                  value="memory"
                  order={sectionOrderIndexById.memory}
                  title="Memory"
                  icon={<Brain className={sx(styles.glyphMd)} />}
                  count={memoryHeader.count}
                  action={
                    <AdsButton
                      layout="host"
                      type="button"
                      xstyle={[
                        styles.iconButtonQuiet,
                        styles.iconButtonHoverSurface,
                      ]}
                      onClick={() =>
                        setMemoryRefreshNonce((nonce) => nonce + 1)
                      }
                      aria-label="Refresh memory"
                    >
                      <RefreshCcw
                        className={sx(
                          styles.glyphMd,
                          memoryHeader.loading && styles.glyphSpinning,
                        )}
                      />
                    </AdsButton>
                  }
                >
                  <WorkspaceMemorySection
                    projectPath={projectPath}
                    refreshKey={`${workspaceInformation.turnSummary?.turnId ?? ""}:${memoryRefreshNonce}`}
                    onEntriesChange={handleMemoryEntriesChange}
                  />
                </SectionHeader>

                <SectionHeader
                  value="plans"
                  order={sectionOrderIndexById.plans}
                  title="Plans"
                  icon={<ClipboardCheck className={sx(styles.glyphMd)} />}
                  count={plansHeader.count}
                  action={
                    <AdsButton
                      layout="host"
                      type="button"
                      xstyle={[
                        styles.iconButtonQuiet,
                        styles.iconButtonHoverSurface,
                      ]}
                      onClick={() => notifyWorkspacePlansChanged()}
                      aria-label="Refresh plans"
                    >
                      <RefreshCcw
                        className={sx(
                          styles.glyphMd,
                          plansHeader.loading && styles.glyphSpinning,
                        )}
                      />
                    </AdsButton>
                  }
                >
                  <WorkspacePlansSection
                    embedded
                    workspacePath={workspacePath}
                    taskId={activeTaskId}
                    refreshNonce={workspacePlansRefreshNonce}
                    onEntriesChange={handlePlansEntriesChange}
                    onOpenFile={({ filePath }) =>
                      openFileFromTree({ filePath })
                    }
                    onPlanDeleted={async ({ filePath }) => {
                      const appState = useAppStore.getState();
                      appState.editorTabs
                        .filter((tab) => tab.filePath === filePath)
                        .forEach((tab) =>
                          appState.closeEditorTab({ tabId: tab.id }),
                        );
                      await appState.refreshProjectFiles();
                    }}
                    onImportTodos={async ({ filePath }) => {
                      if (!workspacePath) {
                        return;
                      }
                      const result = await window.api?.fs?.readFile?.({
                        rootPath: workspacePath,
                        filePath,
                      });
                      if (!result?.ok || typeof result.content !== "string") {
                        toast.error("Could not read plan file");
                        return;
                      }
                      const items = extractPlanTodoItems(result.content);
                      if (items.length === 0) {
                        toast("No checklist items found in this plan");
                        return;
                      }
                      patchWorkspaceInformation((current) => ({
                        ...current,
                        todos: [
                          ...current.todos,
                          ...items.map((item) => {
                            const base = {
                              ...createWorkspaceTodoItem(),
                              text: item.text,
                            };
                            return item.completed
                              ? applyWorkspaceTodoStatus(base, "completed")
                              : base;
                          }),
                        ],
                      }));
                      setOpenSections((sections) =>
                        sections.includes("todo")
                          ? sections
                          : [...sections, "todo"],
                      );
                      toast.success(
                        `Imported ${items.length} ${
                          items.length === 1 ? "todo" : "todos"
                        } from plan`,
                      );
                    }}
                  />
                </SectionHeader>

                {/* ── GitHub ────────────────────────────────────────── */}
                <SectionHeader
                  value="github"
                  order={sectionOrderIndexById.github}
                  title="Pull Requests"
                  icon={<GitHubIcon />}
                  count={
                    visibleLinkedPullRequests.length + (currentBranchPr ? 1 : 0)
                  }
                  action={
                    <div className={sx(styles.sectionActionGroup)}>
                      {!isDefaultWorkspace ? (
                        <AdsButton
                          layout="host"
                          type="button"
                          xstyle={[
                            styles.iconButtonQuiet,
                            styles.iconButtonHoverSurface,
                          ]}
                          onClick={() =>
                            void fetchWorkspacePrStatus({
                              workspaceId: activeWorkspaceId,
                            })
                          }
                          aria-label="Refresh"
                        >
                          <RefreshCcw className={sx(styles.glyphMd)} />
                        </AdsButton>
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
                  <div className={sx(styles.itemList)}>
                    {/* Current branch PR */}
                    {!isDefaultWorkspace &&
                    currentBranchPr &&
                    currentBranchPrStatus ? (
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
                    {visibleLinkedPullRequests.map((item) => {
                      const githubRef = extractGitHubPullRequestReference(
                        item.url,
                      );
                      const preview = linkedPullRequestPreviewById[item.id];
                      const previewInfo = preview?.info;
                      const previewStatus = previewInfo?.derived;

                      if (!isWorkspaceInfoUrl(item.url)) {
                        return (
                          <InlineUrlInput
                            key={item.id}
                            value={item.url}
                            icon={<Link className={sx(styles.glyphMd)} />}
                            placeholder="https://github.com/owner/repo/pull/123"
                            onChange={(url) =>
                              patchLinkedPullRequestUrl(item.id, url)
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
                      const number =
                        previewInfo?.pr.number ?? githubRef?.number ?? 0;
                      const repo = githubRef
                        ? `${githubRef.owner}/${githubRef.repo}`
                        : undefined;
                      const referenceLabel =
                        repo && number > 0
                          ? `${repo} #${number}`
                          : number > 0
                            ? `#${number}`
                            : repo;
                      const branch =
                        previewInfo?.pr.headRefName &&
                        previewInfo.pr.baseRefName
                          ? `${previewInfo.pr.headRefName} → ${previewInfo.pr.baseRefName}`
                          : undefined;

                      return (
                        <GitHubPrRow
                          key={item.id}
                          number={number}
                          title={title}
                          status={
                            previewStatus ??
                            (preview?.loading
                              ? "review_required"
                              : "review_required")
                          }
                          repo={repo}
                          branch={branch}
                          url={item.url}
                          loading={preview?.loading}
                          actions={
                            <CreateTaskActionButton
                              disabled={taskSeedInFlightId !== null}
                              onClick={() =>
                                void handleCreateTaskFromWorkspaceInfo({
                                  itemId: item.id,
                                  sourceLabel: "GitHub pull request",
                                  title,
                                  url: item.url,
                                  referenceLabel,
                                  note: item.note,
                                })
                              }
                            />
                          }
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

                    {visibleLinkedPullRequests.length === 0 &&
                    isDefaultWorkspace ? (
                      <EmptyHint>No linked pull requests</EmptyHint>
                    ) : null}
                  </div>
                </SectionHeader>

                {/* ── Jira ──────────────────────────────────────────── */}
                <SectionHeader
                  value="jira"
                  order={sectionOrderIndexById.jira}
                  title="Jira Issues"
                  icon={<JiraIcon />}
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
                  <div className={sx(styles.itemList)}>
                    {workspaceInformation.jiraIssues.length === 0 ? (
                      <EmptyHint>No linked Jira issues</EmptyHint>
                    ) : null}
                    {workspaceInformation.jiraIssues.map((issue) => {
                      const issueRef = extractJiraIssueReference(issue.url);
                      const issueKey =
                        issue.issueKey.trim() || issueRef?.issueKey || "";
                      const host =
                        issueRef?.host ||
                        formatWorkspaceInfoHostLabel(issue.url);
                      const title =
                        issue.title.trim() || issueKey || "Linked Jira issue";
                      const referenceLabel = issueKey || host || undefined;

                      if (!isWorkspaceInfoUrl(issue.url)) {
                        return (
                          <InlineUrlInput
                            key={issue.id}
                            value={issue.url}
                            icon={<Link className={sx(styles.glyphMd)} />}
                            placeholder="https://company.atlassian.net/browse/ABC-123"
                            onChange={(url) =>
                              patchWorkspaceInformation((current) => ({
                                ...current,
                                jiraIssues: updateItemById(
                                  current.jiraIssues,
                                  issue.id,
                                  (item) => {
                                    const parsed =
                                      extractJiraIssueReference(url);
                                    return {
                                      ...item,
                                      url,
                                      issueKey:
                                        parsed?.issueKey ?? item.issueKey,
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
                          pinned={isWorkspaceIntentAnchor(
                            workspaceInformation,
                            issue.id,
                          )}
                          onTogglePin={() =>
                            patchWorkspaceInformation((current) =>
                              toggleWorkspaceIntentAnchor(current, issue.id),
                            )
                          }
                          icon={
                            <Globe className={sx(styles.mutedGlyph)} />
                          }
                          label={title}
                          sublabel={
                            host
                              ? `${host}${issueKey ? ` · ${issueKey}` : ""}`
                              : issueKey
                          }
                          badge={
                            issue.status.trim() ? (
                              <Badge
                                variant="outline"
                                className={sx(styles.chip)}
                              >
                                {issue.status.trim()}
                              </Badge>
                            ) : null
                          }
                          url={issue.url}
                          actions={
                            <CreateTaskActionButton
                              disabled={taskSeedInFlightId !== null}
                              onClick={() =>
                                void handleCreateTaskFromWorkspaceInfo({
                                  itemId: issue.id,
                                  sourceLabel: "Jira issue",
                                  title,
                                  url: issue.url,
                                  referenceLabel,
                                  note: issue.note,
                                })
                              }
                            />
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
                    })}
                  </div>
                </SectionHeader>

                {/* ── Crane ─────────────────────────────────────────── */}
                <SectionHeader
                  value="crane"
                  order={sectionOrderIndexById.crane}
                  title="Crane Issues"
                  icon={<Cable className={sx(styles.glyphMd)} />}
                  count={(workspaceInformation.craneIssues ?? []).length}
                  action={
                    <AddButton
                      onClick={() =>
                        patchWorkspaceInformation((current) => ({
                          ...current,
                          craneIssues: [
                            ...(current.craneIssues ?? []),
                            createWorkspaceCraneIssue(),
                          ],
                        }))
                      }
                      label="Add Crane issue"
                    />
                  }
                >
                  <div className={sx(styles.itemList)}>
                    {(workspaceInformation.craneIssues ?? []).length === 0 ? (
                      <EmptyHint>No linked Crane issues</EmptyHint>
                    ) : null}
                    {(workspaceInformation.craneIssues ?? []).map((issue) => {
                      const issueRef = extractCraneIssueReference(issue.url);
                      const issueKey =
                        issue.issueKey.trim() || issueRef?.issueKey || "";
                      const host =
                        issueRef?.host ||
                        formatWorkspaceInfoHostLabel(issue.url);
                      const title =
                        issue.title.trim() || issueKey || "Linked Crane issue";
                      const referenceLabel = issueKey || host || undefined;

                      if (!isWorkspaceInfoUrl(issue.url)) {
                        return (
                          <InlineUrlInput
                            key={issue.id}
                            value={issue.url}
                            icon={<Link className={sx(styles.glyphMd)} />}
                            placeholder="https://atelier.delight-tools.ai/apps/crane/w/TEAM/task/CRN-42"
                            onChange={(url) =>
                              patchWorkspaceInformation((current) => ({
                                ...current,
                                craneIssues: updateItemById(
                                  current.craneIssues ?? [],
                                  issue.id,
                                  (item) => {
                                    const parsed =
                                      extractCraneIssueReference(url);
                                    return {
                                      ...item,
                                      url,
                                      issueKey:
                                        parsed?.issueKey || item.issueKey,
                                    };
                                  },
                                ),
                              }))
                            }
                            onRemove={() =>
                              patchWorkspaceInformation((current) => ({
                                ...current,
                                craneIssues: removeItemById(
                                  current.craneIssues ?? [],
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
                          pinned={isWorkspaceIntentAnchor(
                            workspaceInformation,
                            issue.id,
                          )}
                          onTogglePin={() =>
                            patchWorkspaceInformation((current) =>
                              toggleWorkspaceIntentAnchor(current, issue.id),
                            )
                          }
                          icon={
                            <Cable className={sx(styles.mutedGlyph)} />
                          }
                          label={title}
                          sublabel={
                            host
                              ? `${host}${issueKey ? ` · ${issueKey}` : ""}`
                              : issueKey
                          }
                          badge={
                            issue.status.trim() ? (
                              <Badge
                                variant="outline"
                                className={sx(styles.chip)}
                              >
                                {issue.status.trim()}
                              </Badge>
                            ) : null
                          }
                          url={issue.url}
                          actions={
                            <CreateTaskActionButton
                              disabled={taskSeedInFlightId !== null}
                              onClick={() =>
                                void handleCreateTaskFromWorkspaceInfo({
                                  itemId: issue.id,
                                  sourceLabel: "Crane issue",
                                  title,
                                  url: issue.url,
                                  referenceLabel,
                                  note: issue.note,
                                })
                              }
                            />
                          }
                          onRemove={() =>
                            patchWorkspaceInformation((current) => ({
                              ...current,
                              craneIssues: removeItemById(
                                current.craneIssues ?? [],
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
                  order={sectionOrderIndexById.confluence}
                  title="Confluence"
                  icon={<ConfluenceIcon />}
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
                  <div className={sx(styles.itemList)}>
                    {(workspaceInformation.confluencePages ?? []).length ===
                    0 ? (
                      <EmptyHint>No linked Confluence pages</EmptyHint>
                    ) : null}
                    {(workspaceInformation.confluencePages ?? []).map(
                      (page) => {
                        const confluenceRef = extractConfluencePageReference(
                          page.url,
                        );
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
                              icon={<Link className={sx(styles.glyphMd)} />}
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
                                        spaceKey:
                                          parsed?.spaceKey || item.spaceKey,
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
                            pinned={isWorkspaceIntentAnchor(
                              workspaceInformation,
                              page.id,
                            )}
                            onTogglePin={() =>
                              patchWorkspaceInformation((current) =>
                                toggleWorkspaceIntentAnchor(current, page.id),
                              )
                            }
                            icon={
                              <Globe className={sx(styles.mutedGlyph)} />
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
                      },
                    )}
                  </div>
                </SectionHeader>

                {/* ── Storybook ─────────────────────────────────────── */}
                <SectionHeader
                  value="storybook"
                  order={sectionOrderIndexById.storybook}
                  title="Storybook"
                  icon={<BookOpen className={sx(styles.glyphMd)} />}
                  count={workspaceInformation.storybookResources?.length ?? 0}
                  action={
                    <AddButton
                      onClick={() =>
                        patchWorkspaceInformation((current) => ({
                          ...current,
                          storybookResources: [
                            ...(current.storybookResources ?? []),
                            createWorkspaceStorybookResource(),
                          ],
                        }))
                      }
                      label="Add Storybook resource"
                    />
                  }
                >
                  <div className={sx(styles.itemList)}>
                    {(workspaceInformation.storybookResources?.length ?? 0) ===
                    0 ? (
                      <EmptyHint>No linked Storybook resources</EmptyHint>
                    ) : null}
                    {(workspaceInformation.storybookResources ?? []).map(
                      (resource) => {
                        const storybookRef = extractStorybookResourceReference(
                          resource.url,
                        );
                        const title =
                          resource.title.trim() ||
                          storybookRef?.title ||
                          "Storybook resource";
                        const host =
                          storybookRef?.host ||
                          formatWorkspaceInfoHostLabel(resource.url);
                        const access =
                          resource.access ??
                          inferStorybookResourceAccess(resource.url) ??
                          null;
                        const accessBadgeLabel =
                          formatStorybookAccessBadgeLabel(access);
                        const sublabel = host
                          ? `${host}${storybookRef?.storyPath ? ` · ${storybookRef.storyPath}` : ""}`
                          : storybookRef?.storyPath || undefined;

                        if (!isWorkspaceInfoUrl(resource.url)) {
                          return (
                            <InlineUrlInput
                              key={resource.id}
                              value={resource.url}
                              icon={<Link className={sx(styles.glyphMd)} />}
                              placeholder="https://storybook.example.com/?path=/docs/..."
                              onChange={(url) =>
                                patchWorkspaceInformation((current) => ({
                                  ...current,
                                  storybookResources: updateItemById(
                                    current.storybookResources ?? [],
                                    resource.id,
                                    (item) => {
                                      const parsed =
                                        extractStorybookResourceReference(url);
                                      return {
                                        ...item,
                                        url,
                                        title: parsed?.title || item.title,
                                        access: resolveStorybookResourceAccess({
                                          url,
                                        }),
                                      };
                                    },
                                  ),
                                }))
                              }
                              onRemove={() =>
                                patchWorkspaceInformation((current) => ({
                                  ...current,
                                  storybookResources: removeItemById(
                                    current.storybookResources ?? [],
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
                            icon={
                              <Globe className={sx(styles.mutedGlyph)} />
                            }
                            label={title}
                            sublabel={sublabel}
                            badge={
                              accessBadgeLabel || access?.externalRepo ? (
                                <>
                                  {accessBadgeLabel ? (
                                    <Badge
                                      variant={storybookAccessBadgeVariant(
                                        access,
                                      )}
                                      className={sx(styles.chip)}
                                    >
                                      {accessBadgeLabel}
                                    </Badge>
                                  ) : null}
                                  {access?.externalRepo ? (
                                    <Badge
                                      variant="outline"
                                      className={sx(
                                        styles.chip,
                                        styles.chipRepo,
                                      )}
                                      title={access.externalRepo}
                                    >
                                      <span className={sx(styles.chipRepoLabel)}>
                                        repo {access.externalRepo}
                                      </span>
                                    </Badge>
                                  ) : null}
                                </>
                              ) : null
                            }
                            url={resource.url}
                            onRemove={() =>
                              patchWorkspaceInformation((current) => ({
                                ...current,
                                storybookResources: removeItemById(
                                  current.storybookResources ?? [],
                                  resource.id,
                                ),
                              }))
                            }
                          />
                        );
                      },
                    )}
                  </div>
                </SectionHeader>

                {/* ── Amplify ───────────────────────────────────────── */}
                <SectionHeader
                  value="amplify"
                  order={sectionOrderIndexById.amplify}
                  title="Amplify"
                  icon={<AmplifyIcon className={sx(styles.amplifyGlyph)} />}
                  count={workspaceInformation.amplifyLinks?.length ?? 0}
                  action={
                    <AddButton
                      onClick={() =>
                        patchWorkspaceInformation((current) => ({
                          ...current,
                          amplifyLinks: [
                            ...(current.amplifyLinks ?? []),
                            createWorkspaceAmplifyLink(),
                          ],
                        }))
                      }
                      label="Add Amplify link"
                    />
                  }
                >
                  <div className={sx(styles.itemList)}>
                    {(workspaceInformation.amplifyLinks?.length ?? 0) === 0 ? (
                      <EmptyHint>No linked Amplify deploys</EmptyHint>
                    ) : null}
                    {(workspaceInformation.amplifyLinks ?? []).map((link) => {
                      const amplifyRef = extractAmplifyLinkReference(link.url);
                      const host =
                        amplifyRef?.host ||
                        formatWorkspaceInfoHostLabel(link.url);
                      const label =
                        link.label.trim() ||
                        (amplifyRef ? amplifyRef.branch : "Amplify link");

                      if (!isWorkspaceInfoUrl(link.url)) {
                        return (
                          <InlineUrlInput
                            key={link.id}
                            value={link.url}
                            icon={<Link className={sx(styles.glyphMd)} />}
                            placeholder="https://<branch>.<appid>.amplifyapp.com"
                            onChange={(url) =>
                              patchWorkspaceInformation((current) => ({
                                ...current,
                                amplifyLinks: updateItemById(
                                  current.amplifyLinks ?? [],
                                  link.id,
                                  (item) => ({ ...item, url }),
                                ),
                              }))
                            }
                            onRemove={() =>
                              patchWorkspaceInformation((current) => ({
                                ...current,
                                amplifyLinks: removeItemById(
                                  current.amplifyLinks ?? [],
                                  link.id,
                                ),
                              }))
                            }
                          />
                        );
                      }

                      return (
                        <InlineLinkRow
                          key={link.id}
                          icon={<AmplifyIcon className={sx(styles.amplifyGlyph)} />}
                          label={label}
                          sublabel={host || undefined}
                          url={link.url}
                          onRemove={() =>
                            patchWorkspaceInformation((current) => ({
                              ...current,
                              amplifyLinks: removeItemById(
                                current.amplifyLinks ?? [],
                                link.id,
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
                  order={sectionOrderIndexById.slack}
                  title="Slack"
                  icon={<SlackIcon />}
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
                  <div className={sx(styles.itemList)}>
                    {(workspaceInformation.slackThreads?.length ?? 0) === 0 ? (
                      <EmptyHint>No linked Slack threads</EmptyHint>
                    ) : null}
                    {(workspaceInformation.slackThreads ?? []).map((thread) => {
                      const slackRef = extractSlackThreadReference(thread.url);
                      const host =
                        slackRef?.host ||
                        formatWorkspaceInfoHostLabel(thread.url);
                      const label =
                        thread.channelName.trim() ||
                        (slackRef ? `#${slackRef.channelId}` : "Slack thread");

                      if (!isWorkspaceInfoUrl(thread.url)) {
                        return (
                          <InlineUrlInput
                            key={thread.id}
                            value={thread.url}
                            icon={<Link className={sx(styles.glyphMd)} />}
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
                          icon={
                            <Hash className={sx(styles.mutedGlyph)} />
                          }
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

                {/* ── Figma ─────────────────────────────────────────── */}
                <SectionHeader
                  value="figma"
                  order={sectionOrderIndexById.figma}
                  title="Figma"
                  icon={<FigmaIcon />}
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
                  <div className={sx(styles.itemList)}>
                    {workspaceInformation.figmaResources.length === 0 ? (
                      <EmptyHint>No linked Figma resources</EmptyHint>
                    ) : null}
                    {workspaceInformation.figmaResources.map((resource) => {
                      const figmaRef = extractFigmaResourceReference(
                        resource.url,
                      );
                      const title =
                        resource.title.trim() ||
                        figmaRef?.title ||
                        "Linked Figma resource";
                      const host =
                        figmaRef?.host ||
                        formatWorkspaceInfoHostLabel(resource.url);

                      if (!isWorkspaceInfoUrl(resource.url)) {
                        return (
                          <InlineUrlInput
                            key={resource.id}
                            value={resource.url}
                            icon={<Link className={sx(styles.glyphMd)} />}
                            placeholder="https://www.figma.com/file/..."
                            onChange={(url) =>
                              patchWorkspaceInformation((current) => ({
                                ...current,
                                figmaResources: updateItemById(
                                  current.figmaResources,
                                  resource.id,
                                  (item) => {
                                    const parsed =
                                      extractFigmaResourceReference(url);
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
                          pinned={isWorkspaceIntentAnchor(
                            workspaceInformation,
                            resource.id,
                          )}
                          onTogglePin={() =>
                            patchWorkspaceInformation((current) =>
                              toggleWorkspaceIntentAnchor(current, resource.id),
                            )
                          }
                          icon={
                            <Globe className={sx(styles.mutedGlyph)} />
                          }
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

                {/* ── Custom fields ─────────────────────────────────── */}
                <SectionHeader
                  value="custom"
                  order={sectionOrderIndexById.custom}
                  title="Custom Fields"
                  icon={<SlidersHorizontal className={sx(styles.glyphMd)} />}
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
                  <div className={sx(styles.itemListLoose)}>
                    {workspaceInformation.customFields.length === 0 ? (
                      <EmptyHint>No custom fields</EmptyHint>
                    ) : null}
                    {workspaceInformation.customFields.map((field) => (
                      <div
                        key={field.id}
                        className={sx(styles.customField)}
                      >
                        <div className={sx(styles.customFieldHead)}>
                          <Input
                            value={field.label}
                            onChange={(event) =>
                              patchCustomField(field.id, (currentField) => ({
                                ...currentField,
                                label: event.target.value,
                              }))
                            }
                            placeholder="Label"
                            xstyle={[
                              styles.bareInputPadded,
                              styles.bareInputStrong,
                            ]}
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
                            <SelectTrigger className={sx(styles.customFieldType)}>
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
                          <AdsButton
                            layout="host"
                            type="button"
                            xstyle={styles.rowRemove}
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
                            <X className={sx(styles.glyphSm)} />
                          </AdsButton>
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
              </SectionOpenContext.Provider>
            </SectionVisibilityContext.Provider>
          </SectionReorderContext.Provider>
        </SectionDragSuppressionContext.Provider>
      </div>
    </div>
  );
}
