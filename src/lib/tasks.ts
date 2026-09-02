import type { ProviderId } from "@/lib/providers/provider.types";
import { resolveProviderDisplayId } from "@/lib/providers/model-catalog";
import type {
  ChatMessage,
  Task,
  TaskControlMode,
  TaskControlOwner,
} from "@/types/chat";

export type TaskFilter = "active" | "archived" | "all";

export const MANAGED_TASK_STOP_NOTICE =
  "Managed run stopped from Stave before completion.";

const relativeTimeFormatter =
  typeof Intl !== "undefined"
    ? new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
    : null;
const AUTO_TASK_TITLE_MAX_LENGTH = 80;
const AUTO_TASK_TITLE_MAX_WORDS = 12;

/**
 * The automatic task-name suggestion loop only needs the opening exchange to
 * infer a stable title. Firing a suggestion query on every prompt for the whole
 * life of a task wastes a full single-turn LLM call (plus its IPC payload) each
 * time. Re-running it on turns 2 and 3 almost always re-derives the same name
 * from the same opening prompt, so the default is one call; users who want the
 * title to keep adapting can raise the `taskName` lane's `maxUserTurns`.
 */
export const AUTO_TASK_NAME_MAX_USER_TURNS = 1;
/** Per-message content budget sent to the suggestion query (chars). */
export const AUTO_TASK_NAME_HISTORY_MESSAGE_CHARS = 500;
/** Number of trailing history messages sent to the suggestion query. */
export const AUTO_TASK_NAME_HISTORY_MESSAGES = 4;
/** Latest-prompt content budget sent to the suggestion query (chars). */
export const AUTO_TASK_NAME_PROMPT_CHARS = 1000;
const AUTO_TASK_TITLE_DISALLOWED_PATTERNS = [
  /\b(i\s+(?:do not|don't)\s+have\s+enough\s+context|not enough context|need more context|without (?:the )?(?:full )?context)\b/i,
  /\b(i\s+(?:can't|cannot|am unable|unable))\b/i,
  /\b(latest message|conversation history|appears to be)\b/i,
  /\bas an ai\b/i,
];

export function isTaskArchived(task: Pick<Task, "archivedAt">) {
  return Boolean(task.archivedAt);
}

/**
 * A task created by another task's delegation. Its own surfaces are the child
 * rows under the parent (and the task itself once opened), so it must not also
 * appear as a peer in workspace-level task listings, counts, or roll-ups —
 * otherwise one delegated unit of work is counted twice and a workspace looks
 * busier than it is.
 *
 * This is a *listing* predicate only. Paths that deliberately walk every task
 * (aborting turns on workspace switch, orphan reaping, persistence
 * reconciliation) must keep seeing child tasks and must not call it.
 */
export function isDelegatedChildTask(task: Pick<Task, "parentTaskId">) {
  return Boolean(task.parentTaskId);
}

/**
 * Reconcile a task list against the archived state that persistence currently
 * holds as authoritative.
 *
 * The host-service MCP runtime keeps a long-lived in-memory copy of each
 * workspace session (including its `tasks`). When the renderer archives (or
 * restores) a task, that in-memory copy goes stale, and a later host-side
 * persist would otherwise write the stale `archivedAt` back over the whole
 * snapshot — reviving an archived session on the next restart. Task lifecycle
 * (archive/restore) is owned by the renderer and durably reflected in the
 * `tasks` table, so before the host re-persists we take each persisted row's
 * `archivedAt` as the source of truth.
 *
 * Tasks that are absent from `persistedTasks` are left untouched: those are
 * host-created tasks that have not been written to the `tasks` table yet, and
 * dropping/altering them here would lose a freshly created session.
 */
export function reconcileTasksWithPersistedArchival(args: {
  tasks: Task[];
  persistedTasks: Array<{ id: string; archivedAt?: string | null }>;
}): Task[] {
  if (args.persistedTasks.length === 0) {
    return args.tasks;
  }
  const persistedArchivedById = new Map(
    args.persistedTasks.map(
      (task) => [task.id, task.archivedAt ?? null] as const,
    ),
  );
  let changed = false;
  const reconciled = args.tasks.map((task) => {
    if (!persistedArchivedById.has(task.id)) {
      return task;
    }
    const persistedArchivedAt = persistedArchivedById.get(task.id) ?? null;
    const currentArchivedAt = task.archivedAt ?? null;
    if (persistedArchivedAt === currentArchivedAt) {
      return task;
    }
    changed = true;
    return { ...task, archivedAt: persistedArchivedAt };
  });
  return changed ? reconciled : args.tasks;
}

export function getTaskControlMode(
  task: Pick<Task, "controlMode"> | null | undefined,
): TaskControlMode {
  return task?.controlMode ?? "interactive";
}

export function getTaskControlOwner(
  task: Pick<Task, "controlOwner"> | null | undefined,
): TaskControlOwner {
  return task?.controlOwner ?? "stave";
}

export function findWorkspaceTaskOrThrow(args: {
  tasks: Task[];
  requestedTaskId?: string | null;
}) {
  const requestedTaskId = args.requestedTaskId?.trim();
  if (!requestedTaskId) {
    return null;
  }

  const task =
    args.tasks.find((candidate) => candidate.id === requestedTaskId) ?? null;
  if (!task) {
    throw new Error(`Task not found in this workspace: ${requestedTaskId}`);
  }

  return task;
}

export function normalizeTaskControl(task: Task): Task {
  return {
    ...task,
    controlMode: getTaskControlMode(task),
    controlOwner: getTaskControlOwner(task),
  };
}

export function isTaskManaged(
  task: Pick<Task, "controlMode"> | null | undefined,
) {
  return getTaskControlMode(task) === "managed";
}

export function isExternallyManagedTask(
  task: Pick<Task, "controlMode" | "controlOwner"> | null | undefined,
) {
  return isTaskManaged(task) && getTaskControlOwner(task) === "external";
}

export function canTakeOverTask(args: {
  task: Pick<Task, "controlMode" | "controlOwner"> | null | undefined;
}) {
  return isTaskManaged(args.task);
}

function matchesTaskFilter(args: {
  task: Pick<Task, "archivedAt" | "parentTaskId">;
  filter: TaskFilter;
}) {
  // Not filter-dependent: a delegated child is never a peer in this listing,
  // not even under "all". `reorderTasksWithinFilter` shares this predicate, so
  // the reorder mapping stays aligned with what the list actually renders.
  if (isDelegatedChildTask(args.task)) {
    return false;
  }
  if (args.filter === "all") {
    return true;
  }
  return args.filter === "archived"
    ? isTaskArchived(args.task)
    : !isTaskArchived(args.task);
}

export function getVisibleTasks(args: {
  tasks: Task[];
  filter: TaskFilter;
}) {
  return args.tasks.filter((task) =>
    matchesTaskFilter({ task, filter: args.filter }),
  );
}

function moveArrayItem<T>(items: T[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex) {
    return items;
  }

  const nextItems = [...items];
  const [movedItem] = nextItems.splice(fromIndex, 1);
  if (typeof movedItem === "undefined") {
    return items;
  }
  nextItems.splice(toIndex, 0, movedItem);
  return nextItems;
}

export function reorderTasksWithinFilter(args: {
  tasks: Task[];
  activeTaskId: string;
  overTaskId: string;
  filter: TaskFilter;
}) {
  if (args.activeTaskId === args.overTaskId) {
    return args.tasks;
  }

  const visibleTasks = getVisibleTasks({
    tasks: args.tasks,
    filter: args.filter,
  });
  const fromIndex = visibleTasks.findIndex(
    (task) => task.id === args.activeTaskId,
  );
  const toIndex = visibleTasks.findIndex((task) => task.id === args.overTaskId);
  if (fromIndex < 0 || toIndex < 0) {
    return args.tasks;
  }

  const reorderedVisibleTasks = moveArrayItem(visibleTasks, fromIndex, toIndex);
  if (reorderedVisibleTasks === visibleTasks) {
    return args.tasks;
  }

  let reorderedVisibleIndex = 0;
  return args.tasks.map((task) => {
    if (!matchesTaskFilter({ task, filter: args.filter })) {
      return task;
    }

    const nextTask = reorderedVisibleTasks[reorderedVisibleIndex];
    reorderedVisibleIndex += 1;
    return nextTask ?? task;
  });
}

export function getTaskCounts(args: {
  tasks: Array<Pick<Task, "archivedAt" | "parentTaskId">>;
}) {
  const tasks = args.tasks.filter((task) => !isDelegatedChildTask(task));
  const archived = tasks.filter((task) => isTaskArchived(task)).length;
  return {
    active: tasks.length - archived,
    archived,
    all: tasks.length,
  };
}

/**
 * The set of past tasks Task History has to offer, most recently updated first.
 *
 * A task qualifies when it is archived, or when it is still live but no longer
 * occupies a pane tab. That second case is the one an archived-only list used
 * to strand: `closeTaskTab` closes the pane *without* archiving, and hydration
 * deliberately preserves an empty `openTaskTabIds` instead of reopening an
 * arbitrary task. Such a task is therefore rendered by no surface at all, so
 * leaving it out of history makes a workspace full of real work look empty.
 *
 * `openTaskTabIds: null` means the pane state is unknown — a shell summary or
 * snapshot that predates the field. `normalizePaneState` resolves that same
 * absence to "every non-archived task open", so this follows suit instead of
 * assuming nothing is open; otherwise a legacy workspace would report all of
 * its live tasks as closed until its summary is written again.
 */
export function selectTaskHistoryEntries(args: {
  tasks: Task[];
  openTaskTabIds: readonly string[] | null;
}): Task[] {
  const tasks = args.tasks.filter((task) => !isDelegatedChildTask(task));
  const openTaskIds = args.openTaskTabIds
    ? new Set(args.openTaskTabIds)
    : new Set(
        tasks.filter((task) => !isTaskArchived(task)).map((task) => task.id),
      );
  return tasks
    .filter((task) => isTaskArchived(task) || !openTaskIds.has(task.id))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function filterTasksByName(args: { tasks: Task[]; query: string }) {
  // Only reallocate when a child is actually present, so the common case keeps
  // returning the caller's own array reference.
  const tasks = args.tasks.some((task) => isDelegatedChildTask(task))
    ? args.tasks.filter((task) => !isDelegatedChildTask(task))
    : args.tasks;
  const trimmed = args.query.trim();
  if (!trimmed) {
    return tasks;
  }
  const lower = trimmed.toLowerCase();
  return tasks.filter((task) => task.title.toLowerCase().includes(lower));
}

export function normalizeSuggestedTaskTitle(args: { title: string }) {
  const firstNonEmptyLine = args.title
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstNonEmptyLine) {
    return null;
  }

  const normalized = firstNonEmptyLine
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return null;
  }
  if (normalized.length > AUTO_TASK_TITLE_MAX_LENGTH) {
    return null;
  }
  if (normalized.split(/\s+/).length > AUTO_TASK_TITLE_MAX_WORDS) {
    return null;
  }
  if (
    AUTO_TASK_TITLE_DISALLOWED_PATTERNS.some((pattern) =>
      pattern.test(normalized),
    )
  ) {
    return null;
  }
  if (/[.!?]/.test(normalized) && normalized.length > 40) {
    return null;
  }

  return normalized;
}

/**
 * Decide whether the automatic task-name suggestion query should fire for this
 * prompt. Skips when the user has already named the task by hand, and stops
 * once the opening naming window has passed so the query does not re-run on
 * every subsequent prompt.
 */
export function shouldSuggestTaskName(args: {
  task: Pick<Task, "titleManuallySet"> | null | undefined;
  priorUserTurnCount: number;
  /** Overrides the default window; 0 disables naming entirely. */
  maxUserTurns?: number;
}) {
  if (args.task?.titleManuallySet) {
    return false;
  }
  const maxUserTurns =
    typeof args.maxUserTurns === "number" && args.maxUserTurns >= 0
      ? args.maxUserTurns
      : AUTO_TASK_NAME_MAX_USER_TURNS;
  return args.priorUserTurnCount < maxUserTurns;
}

/**
 * Build the compact payload for the task-name suggestion query. Trailing
 * history is clipped both in count and per-message length so a large tool
 * output living in a message never bloats the IPC payload (or trips the
 * request schema's per-field size cap, which would silently drop the query).
 */
export function buildSuggestTaskNamePayload(args: {
  prompt: string;
  history: Array<Pick<ChatMessage, "role" | "content">>;
}) {
  return {
    prompt: args.prompt.slice(0, AUTO_TASK_NAME_PROMPT_CHARS),
    history: args.history
      .slice(-AUTO_TASK_NAME_HISTORY_MESSAGES)
      .map((message) => ({
        role: message.role as string,
        content: message.content.slice(0, AUTO_TASK_NAME_HISTORY_MESSAGE_CHARS),
      })),
  };
}

export function getArchiveFallbackTaskId(args: {
  tasks: Task[];
  archivedTaskId: string;
}) {
  const activeFallback = args.tasks.find(
    (task) => task.id !== args.archivedTaskId && !isTaskArchived(task),
  );
  return activeFallback?.id ?? "";
}

export function getRespondingTasks<T extends Pick<Task, "id" | "archivedAt">>(args: {
  tasks: T[];
  activeTurnIdsByTask: Record<string, string | undefined>;
}) {
  return args.tasks.filter(
    (task) =>
      !isTaskArchived(task) && Boolean(args.activeTurnIdsByTask[task.id]),
  );
}

export function getRespondingProviderId(args: {
  fallbackProviderId: ProviderId;
  messages: ChatMessage[];
}) {
  let latestResolvedAssistantProviderId: ProviderId | null = null;

  for (let index = args.messages.length - 1; index >= 0; index -= 1) {
    const message = args.messages[index];
    if (message?.role !== "assistant" || message.providerId === "user") {
      continue;
    }

    const resolvedProviderId = resolveProviderDisplayId({
      providerId: message.providerId,
      model: message.model,
    });

    if (message.isStreaming) {
      return resolvedProviderId;
    }

    if (!latestResolvedAssistantProviderId) {
      latestResolvedAssistantProviderId = resolvedProviderId;
    }
  }

  return (
    latestResolvedAssistantProviderId ??
    resolveProviderDisplayId({ providerId: args.fallbackProviderId })
  );
}

export function formatTaskUpdatedAt(args: {
  value: string;
  now?: number | Date;
}) {
  const parsed = Date.parse(args.value);
  if (Number.isNaN(parsed)) {
    return args.value;
  }

  const now =
    args.now instanceof Date ? args.now.getTime() : (args.now ?? Date.now());
  const diffMs = parsed - now;
  const diffSeconds = Math.round(diffMs / 1000);
  const absSeconds = Math.abs(diffSeconds);

  if (absSeconds < 45) {
    return "just now";
  }

  if (absSeconds < 60 * 60) {
    return (
      relativeTimeFormatter?.format(Math.round(diffSeconds / 60), "minute") ??
      `${Math.round(absSeconds / 60)} min ago`
    );
  }

  if (absSeconds < 60 * 60 * 24) {
    return (
      relativeTimeFormatter?.format(
        Math.round(diffSeconds / (60 * 60)),
        "hour",
      ) ?? `${Math.round(absSeconds / (60 * 60))} hr ago`
    );
  }

  if (absSeconds < 60 * 60 * 24 * 7) {
    return (
      relativeTimeFormatter?.format(
        Math.round(diffSeconds / (60 * 60 * 24)),
        "day",
      ) ?? `${Math.round(absSeconds / (60 * 60 * 24))} days ago`
    );
  }

  const date = new Date(parsed);
  const currentYear = new Date(now).getFullYear();
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === currentYear ? {} : { year: "numeric" }),
  }).format(date);
}
