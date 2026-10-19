/**
 * Ends a Claude turn that the CLI keeps open for background work after the
 * turn's `result`.
 *
 * Stave closes the SDK input when `result` arrives and then reads the stream
 * until it ends. Claude Code 2.1.302 (behind its `tengu_tidy_sloth` flag, on by
 * default) no longer winds a closed-input session down while a
 * `run_in_background` shell or an armed monitor still runs: it waits for the
 * task, then answers the task's completion notification as one more turn. A
 * shell with its own `timeout` is exempt from the CLI's 10-minute wait
 * ceiling, so a dev server started with `timeout: 7200000` kept the Stave turn
 * "running" for up to two hours after the model had finished. An agent run
 * waiting on a delegated task could not wake, because a run wakes only once
 * the lead's turn is over.
 *
 * Stave runs one provider turn per Stave turn, and the Claude system prompt
 * tells the model that background notifications cannot reach it once the turn
 * ends. So when the session sits idle after `result` and only shells or
 * monitors keep the stream open, the turn ends once the stream has been quiet
 * for a short grace. The runtime then closes the query, which stops those
 * tasks. Claude Code 2.1.284 did the same itself after its own 5 s wind-down
 * grace.
 *
 * The session is not idle while more input is queued (`queued_turn_count`),
 * once any model or tool activity follows the result (a steer or a
 * notification turn), or while the runtime still waits on an approval or a
 * question. Subagent, workflow and unknown task types can return work, so the
 * turn keeps waiting for them as before, within the CLI's own ceiling.
 */
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

/** Matches the CLI's own wind-down grace, so trailing messages still land. */
export const CLAUDE_POST_RESULT_BACKGROUND_GRACE_MS = 5_000;

/**
 * After the grace has run out, each further read still gets this long, so a
 * burst of messages that is already on its way is read rather than dropped.
 */
export const CLAUDE_POST_RESULT_MIN_QUIET_MS = 250;

/**
 * Background task types that cannot hand work back to a finished Stave turn:
 * shells (including monitor shells) and monitors.
 */
const CLAUDE_TURN_ENDING_BACKGROUND_TASK_TYPES: ReadonlySet<string> = new Set([
  "local_bash",
  "monitor_mcp",
  "monitor_ws",
]);

/**
 * Messages the CLI writes around an idle session without starting work. Any
 * other message (assistant, stream deltas, tool results, `system/init` of a
 * follow-up turn, or a type this module does not know) counts as activity, so
 * the turn keeps waiting as it did before.
 */
const CLAUDE_IDLE_MESSAGE_KEYS: ReadonlySet<string> = new Set([
  "result",
  "prompt_suggestion",
  "rate_limit_event",
  "system:background_tasks_changed",
  "system:task_updated",
  "system:task_notification",
  "system:files_persisted",
  "system:session_state_changed",
  "system:commands_changed",
]);

export interface ClaudeLiveBackgroundTask {
  id: string;
  type: string;
  description: string;
}

interface BackgroundTasksChangedMessage {
  type: "system";
  subtype: "background_tasks_changed";
  tasks?: Array<{
    task_id?: unknown;
    task_type?: unknown;
    description?: unknown;
    ambient?: unknown;
  }>;
}

function messageKey(message: SDKMessage): string {
  const subtype = (message as { subtype?: unknown }).subtype;
  return message.type === "system" && typeof subtype === "string" ? `system:${subtype}` : message.type;
}

/** Live, non-ambient tasks from a `background_tasks_changed` level signal. */
function readLiveTasks(message: BackgroundTasksChangedMessage): ClaudeLiveBackgroundTask[] {
  const tasks = Array.isArray(message.tasks) ? message.tasks : [];
  return tasks.flatMap((task) => {
    // Ambient tasks are housekeeping, and the CLI never waits for them.
    if (task.ambient === true || typeof task.task_id !== "string") return [];
    return [{
      id: task.task_id,
      type: typeof task.task_type === "string" ? task.task_type : "unknown",
      description: typeof task.description === "string" ? task.description : "",
    }];
  });
}

export interface ClaudePostResultBackgroundHold {
  /** Feed every SDK message, in order, before the runtime handles it. */
  observe(message: SDKMessage): void;
  /** The live tasks while they alone keep an idle session open, else null. */
  holdingTasks(): readonly ClaudeLiveBackgroundTask[] | null;
  /** Records that the turn ended on `tasks`. */
  markEnded(tasks: readonly ClaudeLiveBackgroundTask[]): void;
  /** The tasks that kept the stream open, once the turn ended on them. */
  heldTasks(): readonly ClaudeLiveBackgroundTask[] | null;
}

export function createClaudePostResultBackgroundHold(args: {
  /** True while the runtime waits on an approval or a question. */
  isTurnBusy?: () => boolean;
} = {}): ClaudePostResultBackgroundHold {
  let live: ClaudeLiveBackgroundTask[] = [];
  let idleAfterResult = false;
  let held: ClaudeLiveBackgroundTask[] | null = null;
  return {
    observe(message) {
      const key = messageKey(message);
      if (key === "system:background_tasks_changed") {
        // A level signal with REPLACE semantics: the payload is the whole set.
        live = readLiveTasks(message as unknown as BackgroundTasksChangedMessage);
      } else if (key === "result") {
        // A queued send means one more user turn follows without new input.
        const queued = (message as { queued_turn_count?: unknown }).queued_turn_count;
        idleAfterResult = !(typeof queued === "number" && queued > 0);
      } else if (!CLAUDE_IDLE_MESSAGE_KEYS.has(key)) {
        idleAfterResult = false;
      }
    },
    holdingTasks() {
      if (held !== null || !idleAfterResult || live.length === 0) return null;
      if (!live.every((task) => CLAUDE_TURN_ENDING_BACKGROUND_TASK_TYPES.has(task.type))) return null;
      if (args.isTurnBusy?.()) return null;
      return live;
    },
    markEnded(tasks) {
      held = [...tasks];
    },
    heldTasks: () => held,
  };
}

const QUIET = Symbol("quiet");

function quietFor(ms: number): { promise: Promise<typeof QUIET>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<typeof QUIET>((resolve) => {
    timer = setTimeout(() => resolve(QUIET), ms);
  });
  return { promise, cancel: () => clearTimeout(timer) };
}

/**
 * Yields `source`, feeding each message to the hold first, and returns early
 * once an idle session held open by background shells has been quiet for
 * `graceMs`. Only time spent waiting for the next message counts, so work the
 * caller does between messages never shortens the grace. An early return is a
 * normal end: the caller finishes the turn with the stop reason its `result`
 * gave and closes the query.
 */
export async function* readClaudeStreamUntilBackgroundHold<T extends SDKMessage>(
  source: AsyncIterable<T>,
  hold: ClaudePostResultBackgroundHold,
  options: { graceMs?: number; minQuietMs?: number } = {},
): AsyncGenerator<T, void, undefined> {
  const graceMs = options.graceMs ?? CLAUDE_POST_RESULT_BACKGROUND_GRACE_MS;
  const minQuietMs = options.minQuietMs ?? CLAUDE_POST_RESULT_MIN_QUIET_MS;
  const iterator = source[Symbol.asyncIterator]();
  // Grace left for the current hold; reset whenever the hold lets go.
  let graceLeftMs: number | null = null;
  while (true) {
    const next = iterator.next();
    let step: IteratorResult<T>;
    while (true) {
      const holding = hold.holdingTasks();
      if (!holding) {
        graceLeftMs = null;
        step = await next;
        break;
      }
      graceLeftMs ??= graceMs;
      const waitMs = Math.max(graceLeftMs, minQuietMs);
      const startedAt = Date.now();
      const quiet = quietFor(waitMs);
      let outcome: IteratorResult<T> | typeof QUIET;
      try {
        outcome = await Promise.race([next, quiet.promise]);
      } finally {
        // A read that fails (the CLI exits) must not leave the timer behind.
        quiet.cancel();
      }
      graceLeftMs = Math.max(0, graceLeftMs - (Date.now() - startedAt));
      if (outcome !== QUIET) {
        step = outcome;
        break;
      }
      // Re-read at expiry: an approval or question may have started meanwhile.
      const stillHolding = hold.holdingTasks();
      if (stillHolding) {
        hold.markEnded(stillHolding);
        // The query closes in the caller's cleanup; this read settles then.
        next.catch(() => undefined);
        return;
      }
    }
    if (step.done) return;
    hold.observe(step.value);
    yield step.value;
  }
}

const MAX_LISTED_TASKS = 3;
const MAX_DESCRIPTION_LENGTH = 80;

/** The turn notice naming the background work that was stopped. */
export function buildClaudeBackgroundHoldNotice(tasks: readonly ClaudeLiveBackgroundTask[]): string {
  const names = tasks.slice(0, MAX_LISTED_TASKS).map((task) => {
    const label = task.description.trim() || task.id;
    return label.length > MAX_DESCRIPTION_LENGTH ? `${label.slice(0, MAX_DESCRIPTION_LENGTH - 1)}…` : label;
  });
  const more = tasks.length > MAX_LISTED_TASKS ? ` and ${tasks.length - MAX_LISTED_TASKS} more` : "";
  // i18n-ignore: provider runtime notice, same channel as the MCP readiness notice
  return `Claude finished, but background work was still running: ${names.join("; ")}${more}. Stave ends a Claude turn when Claude finishes, so that work was stopped. Start it again in a later turn if it is still needed.`;
}
