import { create } from "zustand";
import {
  snapshotProviderAccounts,
  selectedProviderAccount,
} from "@/lib/providers/provider-account-selection";
import type { ProviderId } from "@/lib/providers/provider.types";
import {
  appendQuotedAnswer,
  buildSideChatPrompt,
  describeSideChatActivity,
  isSideChatProvider,
  parseSideChatCommand,
  SIDE_CHAT_QUESTION_MAX_CHARS,
} from "@/lib/side-chat/side-chat";
import { useAppStore } from "@/store/app.store";
import { resolvePromptDraftModelForProvider } from "@/store/prompt-draft-runtime";
import { useTaskReviewModeStore } from "@/store/task-review-mode-store";

/**
 * Side questions, kept in memory only: the open panel, the question being
 * typed and the recent exchanges per task, oldest first. Nothing here is persisted, and
 * nothing here writes to the task's conversation; "Copy to composer" is the
 * one path into the task, and only into the draft the user still sends.
 */
export type SideChatExchange =
  | { id: string; question: string; providerId: ProviderId; status: "asking" }
  | { id: string; question: string; providerId: ProviderId; status: "answered"; answer: string }
  | {
      id: string;
      question: string;
      providerId: ProviderId;
      status: "failed";
      /** `unsupported`: the task's provider has no read-only path; `unavailable`: no desktop bridge. */
      reason: "unsupported" | "unavailable" | "error";
      detail?: string;
    };

interface SideChatState {
  /** The task whose side panel is open, if any. */
  openTaskId: string | null;
  /** Bumped to move focus to the question field. */
  focusNonce: number;
  draftByTask: Record<string, string>;
  /** The task's side questions, oldest first, at most `SIDE_CHAT_THREAD_LIMIT`. */
  threadByTask: Record<string, readonly SideChatExchange[] | undefined>;
  open: (taskId: string, question?: string) => void;
  close: () => void;
  setDraft: (taskId: string, text: string) => void;
  /** Ask the draft question for the task, or `question` while leaving the draft alone. */
  ask: (taskId: string, question?: string) => Promise<void>;
  /** Ask a failed question again, in place of its failure. */
  retry: (taskId: string, exchangeId: string) => Promise<void>;
  /** Forget the task's side questions; a late answer to one is dropped. */
  clearThread: (taskId: string) => void;
}

/** How many side questions a task keeps; older ones fall off the top. */
export const SIDE_CHAT_THREAD_LIMIT = 20;

/** The task's newest side question, if any. */
export function latestSideExchange(thread: readonly SideChatExchange[] | undefined) {
  return thread?.[thread.length - 1];
}

function newExchangeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `side-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** The task's provider, model, account and folder, as its next turn would use them. */
function resolveSideChatTarget(taskId: string) {
  const app = useAppStore.getState();
  const providerId = app.tasks.find((task) => task.id === taskId)?.provider ?? null;
  if (!isSideChatProvider(providerId)) {
    const unsupported: ProviderId = providerId ?? "claude-code";
    return { ok: false as const, providerId: unsupported };
  }
  const overrides = app.promptDraftByTask[taskId]?.runtimeOverrides;
  const model = resolvePromptDraftModelForProvider({
    providerId,
    runtimeOverrides: overrides,
    fallbackModel: providerId === "claude-code" ? app.settings.modelClaude : app.settings.modelCodex,
  });
  const accounts = snapshotProviderAccounts({
    claudeAccountProfileId: overrides?.claudeAccountProfileId ?? app.settings.claudeAccountProfileId,
    codexAccountProfileId: overrides?.codexAccountProfileId ?? app.settings.codexAccountProfileId,
  });
  const account = selectedProviderAccount(providerId, accounts);
  return {
    ok: true as const,
    providerId,
    model,
    cwd: app.workspacePathById[app.activeWorkspaceId] ?? app.repositoryPath ?? undefined,
    runtimeOptions: {
      ...(providerId === "claude-code" ? { claudeAccountProfileId: account } : { codexAccountProfileId: account }),
      ...(app.settings.claudeBinaryPath ? { claudeBinaryPath: app.settings.claudeBinaryPath } : {}),
      ...(app.settings.codexBinaryPath ? { codexBinaryPath: app.settings.codexBinaryPath } : {}),
    },
  };
}

/** The prompt for a question about the task: its conversation excerpt and live activity. */
export function buildSideChatPromptForTask(
  taskId: string,
  question: string,
  earlier: readonly SideChatExchange[] = [],
) {
  const app = useAppStore.getState();
  const messages = app.messagesByTask[taskId] ?? [];
  const activity = app.providerTurnActivityByTask[taskId];
  const running = Boolean(app.activeTurnIdsByTask[taskId]);
  return buildSideChatPrompt({
    messages,
    question,
    earlier: earlier.flatMap((exchange) =>
      exchange.status === "answered" ? [{ question: exchange.question, answer: exchange.answer }] : [],
    ),
    activity: describeSideChatActivity({
      messages,
      running,
      pendingInteraction: running ? activity?.pendingInteraction ?? null : null,
      stalled: running && activity?.stalledAt != null,
    }),
  });
}

export const useSideChatStore = create<SideChatState>((set, get) => ({
  openTaskId: null,
  focusNonce: 0,
  draftByTask: {},
  threadByTask: {},
  open: (taskId, question) => {
    set((state) => ({
      openTaskId: taskId,
      focusNonce: state.focusNonce + 1,
      ...(question !== undefined
        ? { draftByTask: { ...state.draftByTask, [taskId]: question.slice(0, SIDE_CHAT_QUESTION_MAX_CHARS) } }
        : {}),
    }));
    if (question?.trim()) {
      void get().ask(taskId);
    }
  },
  close: () => set({ openTaskId: null }),
  setDraft: (taskId, text) =>
    set((state) => ({ draftByTask: { ...state.draftByTask, [taskId]: text.slice(0, SIDE_CHAT_QUESTION_MAX_CHARS) } })),
  retry: async (taskId, exchangeId) => {
    const thread = get().threadByTask[taskId];
    const failed = thread?.find((entry) => entry.id === exchangeId);
    if (failed?.status !== "failed" || latestSideExchange(thread)?.status === "asking") return;
    set((state) => ({
      threadByTask: {
        ...state.threadByTask,
        [taskId]: (state.threadByTask[taskId] ?? []).filter((entry) => entry.id !== exchangeId),
      },
    }));
    await get().ask(taskId, failed.question);
  },
  clearThread: (taskId) =>
    set((state) => ({
      threadByTask: { ...state.threadByTask, [taskId]: undefined },
      focusNonce: state.focusNonce + 1,
    })),
  ask: async (taskId, asked) => {
    const fromDraft = asked === undefined;
    const question = (fromDraft ? get().draftByTask[taskId] ?? "" : asked).trim().slice(0, SIDE_CHAT_QUESTION_MAX_CHARS);
    const earlier = get().threadByTask[taskId] ?? [];
    if (!question || latestSideExchange(earlier)?.status === "asking") return;
    const id = newExchangeId();
    const target = resolveSideChatTarget(taskId);
    const put = (exchange: SideChatExchange) =>
      set((state) => ({
        threadByTask: {
          ...state.threadByTask,
          [taskId]: [...(state.threadByTask[taskId] ?? []), exchange].slice(-SIDE_CHAT_THREAD_LIMIT),
        },
        ...(fromDraft ? { draftByTask: { ...state.draftByTask, [taskId]: "" } } : {}),
      }));
    if (!target.ok) {
      put({ id, question, providerId: target.providerId, status: "failed", reason: "unsupported" });
      return;
    }
    const askSideQuestion = window.api?.provider?.askSideQuestion;
    if (!askSideQuestion) {
      put({ id, question, providerId: target.providerId, status: "failed", reason: "unavailable" });
      return;
    }
    put({ id, question, providerId: target.providerId, status: "asking" });
    const settle = (exchange: SideChatExchange) => {
      // A cleared thread wins over a late answer.
      const thread = get().threadByTask[taskId];
      if (!thread?.some((entry) => entry.id === id)) return;
      set((state) => ({
        threadByTask: {
          ...state.threadByTask,
          [taskId]: (state.threadByTask[taskId] ?? []).map((entry) => (entry.id === id ? exchange : entry)),
        },
      }));
    };
    try {
      const response = await askSideQuestion({
        providerId: target.providerId,
        model: target.model,
        ...(target.cwd ? { cwd: target.cwd } : {}),
        prompt: buildSideChatPromptForTask(taskId, question, earlier),
        runtimeOptions: target.runtimeOptions,
      });
      settle(
        response.ok
          ? { id, question, providerId: target.providerId, status: "answered", answer: response.text }
          : { id, question, providerId: target.providerId, status: "failed", reason: "error", detail: response.message },
      );
    } catch (error) {
      settle({
        id,
        question,
        providerId: target.providerId,
        status: "failed",
        reason: "error",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  },
}));

/**
 * Put the answer in the task's composer as a quote, below what the draft
 * already says, and focus the composer. The user decides whether to send it.
 */
export function copySideAnswerToComposer(taskId: string, answer: string) {
  const app = useAppStore.getState();
  const draft = app.promptDraftByTask[taskId]?.text ?? "";
  app.updatePromptDraft({ taskId, patch: { text: appendQuotedAnswer(draft, answer) } });
  // The composer is hidden under Review: show the conversation the draft is in.
  useTaskReviewModeStore.getState().showConversation(taskId);
  useAppStore.setState((state) => ({ promptFocusNonce: state.promptFocusNonce + 1 }));
}

/**
 * The composer's `/aside` command: open the panel for the task and ask the
 * question typed after the command, if any. True when the text was the
 * command, so the composer sends nothing.
 */
export function askAsideFromComposer(args: { taskId: string; text: string }) {
  const command = parseSideChatCommand(args.text);
  if (!command || !args.taskId) return false;
  useSideChatStore.getState().open(args.taskId, command.question);
  return true;
}
