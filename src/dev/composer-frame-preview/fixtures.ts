import type { ModelSelectorOption } from "@/components/ai-elements/model-selector";
import type { ChildPendingRequest } from "@/components/session/ChildRequestSlot";
import type {
  ProviderTurnActivitySnapshot,
  ProviderTurnWorkItem,
} from "@/lib/providers/turn-status";
import { createWorkGraph } from "@/lib/work-graph/work-graph-reducer";

export const PREVIEW_MODEL: ModelSelectorOption = {
  key: "claude-code:claude-opus-5",
  providerId: "claude-code",
  model: "claude-opus-5",
  label: "Opus 5",
  available: true,
};

/** A second provider, so the review dialog can offer its cross-check. */
export const PREVIEW_REVIEW_CODEX_MODEL: ModelSelectorOption = {
  key: "codex:gpt-5.5",
  providerId: "codex",
  model: "gpt-5.5",
  label: "GPT-5.5",
  available: true,
  isDefault: true,
};

const TURN_STARTED_AT = Date.now() - 48_000;

export const PREVIEW_WORK_ITEMS: ProviderTurnWorkItem[] = [
  {
    id: "tool-read",
    kind: "tool",
    status: "completed",
    title: "Read",
    detail: "src/components/ai-elements/composer-frame.tsx",
    progressMessages: [],
    startedAt: TURN_STARTED_AT,
    updatedAt: TURN_STARTED_AT + 4_000,
  },
  {
    id: "tool-edit",
    kind: "tool",
    status: "running",
    title: "Edit",
    detail: "src/components/session/ChatInput.tsx",
    progressMessages: [],
    startedAt: TURN_STARTED_AT + 8_000,
    updatedAt: TURN_STARTED_AT + 20_000,
  },
];

export function createPreviewActivity(): ProviderTurnActivitySnapshot {
  return {
    turnId: "preview-turn",
    providerId: "claude-code",
    startedAt: TURN_STARTED_AT,
    lastEventAt: Date.now(),
    stalledAt: null,
    pendingInteraction: null,
    workItemsById: Object.fromEntries(
      PREVIEW_WORK_ITEMS.map((item) => [item.id, item]),
    ),
    orderedWorkItemIds: PREVIEW_WORK_ITEMS.map((item) => item.id),
    workGraph: createWorkGraph({
      turnId: "preview-turn",
      providerId: "claude-code",
      startedAt: TURN_STARTED_AT,
    }),
  };
}


/** Enough macros to fill the left wing's quick-pick limit in the preview. */
export const PREVIEW_MACROS = [
  {
    id: "macro-review",
    label: "Review diff",
    slug: "review",
    body: "Review the working tree diff.",
    insertMode: "replace" as const,
    runtime: {
      providerId: "claude-code" as const,
      model: "opus-5",
      effort: "high" as const,
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "macro-tests",
    label: "Focused tests",
    slug: "tests",
    body: "Run the smallest relevant tests.",
    insertMode: "append" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "macro-ship",
    label: "Ship it",
    slug: "ship",
    body: "Commit, push, and open the PR.",
    insertMode: "replace" as const,
    instantRun: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

/**
 * A delegated child's question set, long enough to need the slot's height cap
 * (`?childRequest=question`), and a child's approval (`?childRequest=approval`).
 */
export const PREVIEW_CHILD_QUESTION: ChildPendingRequest = {
  messageId: "preview-child-message",
  model: "gpt-5.5-codex",
  part: {
    type: "user_input",
    requestId: "preview-child-question",
    toolName: "AskUserQuestion",
    state: "input-requested",
    questions: [
      {
        key: "scope",
        header: "Scope",
        question: "Which surfaces should the migration cover in this pass?",
        multiSelect: true,
        options: [
          { label: "Settings dialog", description: "Every section under Settings." },
          { label: "Task panel", description: "Tabs, progress and results." },
          { label: "Sidebar", description: "Workspace list and primary nav." },
          { label: "Composer", description: "Prompt input and its shelves." },
        ],
      },
      {
        key: "tests",
        header: "Tests",
        question: "Should it add a regression test for each surface it changes?",
        options: [
          { label: "Yes, one per surface", description: "Slower, but each fix is pinned.", recommended: true },
          { label: "Only for logic", description: "Skip render-only changes." },
        ],
      },
      {
        key: "branch",
        header: "Branch",
        question: "Where should the work land?",
        options: [
          { label: "This workspace", description: "Commit on the current branch." },
          { label: "A new branch", description: "Open a separate PR for review." },
        ],
      },
      {
        key: "notes",
        header: "Notes",
        question: "Anything else the delegated task should know before it continues?",
        options: [],
        required: false,
      },
    ],
  },
};

export const PREVIEW_CHILD_APPROVAL: ChildPendingRequest = {
  messageId: "preview-child-approval-message",
  model: "gpt-5.5-codex",
  part: {
    type: "approval",
    requestId: "preview-child-approval",
    toolName: "Bash",
    description: "bun run check:design-system",
    state: "approval-requested",
  },
};
