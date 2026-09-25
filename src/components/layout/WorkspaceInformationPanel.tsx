import { Button as AdsButton } from "@/components/ads/components/Button";
import { EmptyState } from "@/components/ads/components/EmptyState";
import {
  BookOpen,
  Brain,
  Cable,
  ClipboardCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDot,
  Globe,
  Hash,
  Link,
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
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from "@/components/ui";
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
  type WorkspaceInfoCustomField,
  type WorkspaceInfoFieldType,
  type WorkspaceInformationState,
  WORKSPACE_INFO_FIELD_TYPES,
  WORKSPACE_INFO_FIELD_TYPE_LABELS,
} from "@/lib/workspace-information";
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
import { sx } from "@/components/ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import { extractPlanTodoItems } from "@/lib/plans";
import {
  SortableDropIndicator,
  useSortableListMonitor,
  useSortableRow,
} from "@/hooks/use-sortable-list";
import { WorkspacePlansSection } from "./WorkspacePlansSection";
import { WorkspaceMemorySection } from "./WorkspaceMemorySection";
import {
  useMartinInformationCardAvailable,
  WorkspaceInformationMartinCard,
} from "./WorkspaceInformationMartinCard";
import { WorkspaceTurnSummary } from "./WorkspaceTurnSummary";
import { WorkspaceResumeBrief } from "./WorkspaceResumeBrief";
import { workspaceInformationPanelStyles as styles } from "./workspace-information-panel.styles";
import {
  formatFigmaKindLabel,
  fetchLinkedPullRequestPreview,
  GitHubIcon,
  JiraIcon,
  FigmaIcon,
  SlackIcon,
  ConfluenceIcon,
  StorybookAccessBadges,
  InlineLinkRow,
  CreateTaskActionButton,
  InlineUrlInput,
  GitHubPrRow,
  type LinkedPullRequestPreview,
} from "./workspace-information/workspace-information-link-rows";
import { renderCustomFieldInput } from "./workspace-information/workspace-information-custom-fields";
import { NotesSectionBody } from "./workspace-information/workspace-information-notes";

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

const WORKSPACE_INFORMATION_ACCORDION_STORAGE_KEY =
  "stave:workspace-information-open-sections:v2";

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
      xstyle={[
        styles.sectionItem,
        props.first && styles.sectionItemFirst,
        isDragging && styles.sectionItemDragging,
      ]}
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

  return (
    <div
      className={sx(styles.root)}
      style={infoPanelScale !== 1 ? { zoom: infoPanelScale } : undefined}
    >
      <div className={sx(styles.body)}>
        <WorkspaceResumeBrief key={activeWorkspaceId} workspaceId={activeWorkspaceId} brief={workspaceInformation.resumeBrief} />
        {showMartinCard ? (
          <div className={sx(styles.topCards)}>
            <WorkspaceInformationMartinCard />
          </div>
        ) : null}
        <SectionDragSuppressionContext.Provider value={suppressSectionClickRef}>
          <SectionReorderContext.Provider value={moveSectionForKeyboard}>
            <SectionVisibilityContext.Provider value={visibleSections}>
              <SectionOpenContext.Provider value={openSectionSet}>
              <Accordion
                multiple
                xstyle={styles.sectionList}
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
                    // The panel already owns the surface, so this is the
                    // `plain` EmptyState: one ADS copy block (type ramp, gap,
                    // padding) instead of a square tinted box with asymmetric
                    // padding and margin-driven spacing.
                    <EmptyState
                      variant="plain"
                      description="The latest request, outcome, and model will appear here after the first completed response."
                      title="No completed turn yet"
                    />
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
                              <Badge size="sm"
                                variant="outline"
                                xstyle={styles.chip}
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
                              <Badge size="sm"
                                variant="outline"
                                xstyle={styles.chip}
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
                            badge={<StorybookAccessBadges access={access} />}
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
