import type { ModelSelectorOption } from "@/components/ai-elements/model-selector";
import type { AdvisorArmState } from "@/lib/providers/advisor";
import { listManagedExecutionProviderIds } from "@/lib/providers/model-catalog";
import type {
  AdvisorTarget,
  ManagedExecutionProviderId,
} from "@/lib/providers/provider.types";
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

export function createPreviewAdvisorArm(enabled: boolean): AdvisorArmState {
  const target: AdvisorTarget = {
    providerId: "claude-code",
    model: PREVIEW_MODEL.model,
  };
  const targetByProvider = Object.fromEntries(
    listManagedExecutionProviderIds().map((providerId) => [
      providerId,
      { ...target, providerId },
    ]),
  ) as Record<ManagedExecutionProviderId, AdvisorTarget>;

  return {
    enabled,
    target: enabled ? target : null,
    effectiveTarget: enabled ? target : null,
    overridden: true,
    targetByProvider,
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
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];
