import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ModelSelectorOption } from "@/components/ai-elements/model-selector";
import { ComposerShelf } from "@/components/session/composer-shelf/ComposerShelf";
import { ShelfQueue, type ComposerShelfQueueProps } from "@/components/session/composer-shelf/ShelfQueue";
import { TurnRunLine } from "@/components/session/composer-shelf/TurnRunLine";
import type { TurnActivitySurfaceProps } from "@/components/session/TurnActivity";
import { AgentRunBarView } from "@/components/agent-runs/AgentRunBar";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import type { ProviderTurnActivitySnapshot } from "@/lib/providers/turn-status";
import type { PromptDraftQueuedTurn } from "@/types/chat";
import { buildAgentRunFixtures } from "../src/dev/agent-run-preview/agent-run-fixtures";

const CLAUDE: ModelSelectorOption = {
  key: "claude-code:claude-opus-4-6",
  providerId: "claude-code",
  model: "claude-opus-4-6",
  label: "Opus 4.6",
  available: true,
};
const CODEX: ModelSelectorOption = {
  key: "codex:gpt-5.4",
  providerId: "codex",
  model: "gpt-5.4",
  label: "GPT-5.4",
  available: true,
};

const queued = (id: string, patch: Partial<PromptDraftQueuedTurn> = {}): PromptDraftQueuedTurn => ({
  id,
  queuedAt: "2026-10-02T09:00:00.000Z",
  sourceTurnId: "turn-1",
  content: `Queued ${id}`,
  attachedFilePaths: [],
  attachments: [],
  ...patch,
});

const noop = () => {};
function queueProps(patch: Partial<ComposerShelfQueueProps> = {}): ComposerShelfQueueProps {
  return {
    listId: "task-1",
    items: [
      queued("q1", { content: "Actually check the migration too" }),
      queued("q2", {
        content: "Then look at the screenshot",
        attachedFilePaths: ["README.md"],
        attachments: [{ kind: "image", id: "img", dataUrl: "data:image/png;base64,abc", label: "shot.png" }],
        providerId: "codex",
        model: "gpt-5.4",
      }),
    ],
    actions: { canSteer: true, canSend: false },
    isTurnActive: true,
    selectedModel: CLAUDE,
    modelOptions: [CLAUDE, CODEX],
    onSteer: noop,
    onSend: noop,
    onUpdate: noop,
    onRemove: noop,
    onClearAll: noop,
    onReorder: noop,
    ...patch,
  };
}

describe("queue line", () => {
  test("folded, it counts the queue, previews the next message and offers Steer", () => {
    const html = renderToStaticMarkup(createElement(ShelfQueue, queueProps()));
    expect(html).toContain('data-testid="composer-shelf-queue"');
    expect(html).toContain("2 queued");
    expect(html).toContain("Actually check the migration too");
    expect(html).toContain('aria-label="Steer queued prompt 1 into the current response"');
    expect(html).toContain('aria-label="Show queued messages"');
    expect(html).toContain('aria-expanded="false"');
    // The per-row actions and captions wait for the list.
    expect(html).not.toContain("Then look at the screenshot");
    expect(html).not.toContain('aria-label="Edit queued prompt 1"');
    expect(html).not.toContain("Clear all");
    // What used to be a sentence over the list is the line's description.
    expect(html).toContain("or steer one into it now");
  });

  test("a message bound for another model says so on the folded line", () => {
    const [first, second] = queueProps().items;
    const html = renderToStaticMarkup(
      createElement(ShelfQueue, queueProps({ items: [second!, first!] })),
    );
    expect(html).toContain("as Codex GPT-5.4");
    // Attachments cannot ride a steer, so the front item offers none.
    expect(html).not.toContain('aria-label="Steer queued prompt 1 into the current response"');
  });

  test("open, every row has its actions, and only a mismatched row carries a caption", () => {
    const html = renderToStaticMarkup(createElement(ShelfQueue, queueProps({ defaultOpen: true })));
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("Clear all");
    expect(html).toContain('aria-label="Steer queued prompt 1 into the current response"');
    expect(html).not.toContain('aria-label="Steer queued prompt 2 into the current response"');
    expect(html).toContain('aria-label="Edit queued prompt 1"');
    expect(html).toContain('aria-label="Delete queued prompt 2"');
    expect(html).not.toContain('aria-label="Send queued prompt 1 now"');
    expect(html).toContain("Sends as Codex GPT-5.4, not Claude Opus 4.6");
    expect(html).not.toContain("Sends as Claude");
    expect(html).not.toContain("Next to send");
    expect(html).toContain("1 file · 1 image");
    // Two real items can be dragged into another order.
    expect(html).toContain('title="Drag to reorder"');
  });

  test("with nothing running, the next message can be sent now instead", () => {
    const html = renderToStaticMarkup(
      createElement(
        ShelfQueue,
        queueProps({ actions: { canSteer: false, canSend: true }, isTurnActive: false }),
      ),
    );
    expect(html).toContain('aria-label="Send queued prompt 1 now"');
    expect(html).toContain("send one now, or it sends after your next message finishes".replace(/^s/, "S"));
  });
});

const NOW = Date.now();
function activity(patch: Partial<ProviderTurnActivitySnapshot> = {}): ProviderTurnActivitySnapshot {
  return {
    turnId: "turn-1",
    providerId: "claude-code",
    startedAt: NOW - 48_000,
    lastEventAt: NOW,
    stalledAt: null,
    pendingInteraction: null,
    workItemsById: {},
    orderedWorkItemIds: [],
    ...patch,
  };
}
const TODOS = [
  { content: "Read the frame", status: "completed" as const },
  { content: "Map the placement", status: "completed" as const },
  { content: "Fold the run bar", status: "completed" as const },
  { content: "Move the queue", status: "in_progress" as const },
  { content: "Collapse by default", status: "pending" as const },
  { content: "Check the themes", status: "pending" as const },
  { content: "Open the PR", status: "pending" as const },
];
function surface(patch: Partial<TurnActivitySurfaceProps> = {}): TurnActivitySurfaceProps {
  return {
    activeTurnId: "turn-1",
    activity: activity(),
    isPlanPreparing: false,
    workItems: [
      {
        id: "edit",
        kind: "tool",
        status: "running",
        title: "Edit file",
        detail: "src/components/session/ChatInput.tsx",
        progressMessages: [],
        startedAt: NOW - 8_000,
        updatedAt: NOW - 2_000,
      },
    ],
    todos: TODOS,
    ...patch,
  };
}
const runLine = (props: Partial<Parameters<typeof TurnRunLine>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(TurnRunLine, {
      surface: surface(),
      steering: false,
      panel: { label: "Open activity in the Task panel", onOpen: noop, keep: "wide" },
      detail: { kind: "inline", open: false, onToggle: noop },
      onStop: noop,
      ...props,
    }),
  );

describe("turn run line", () => {
  test("says Working, the current step, the to-do progress and the elapsed time, with Stop", () => {
    const html = runLine();
    expect(html).toContain('data-testid="composer-shelf-run"');
    expect(html).toContain('data-state="active"');
    expect(html).toContain("Working");
    expect(html).toContain("Edit file");
    expect(html).toContain("src/components/session/ChatInput.tsx");
    expect(html).toContain('aria-label="3 of 7 to-dos done"');
    expect(html).toContain("3/7");
    expect(html).toContain("48s");
    expect(html).toContain(">Stop<");
    expect(html).toContain('aria-label="Open activity in the Task panel"');
    expect(html).toContain('aria-label="Show activity details"');
  });

  test("a stalled turn is a tone of the line, not a banner of its own", () => {
    const html = runLine({
      surface: surface({ activity: activity({ lastEventAt: NOW - 134_000, stalledAt: NOW - 44_000 }) }),
    });
    expect(html).toContain('data-state="stalled"');
    expect(html).toContain("Stalled");
    expect(html).toContain("No updates for 2m 14s");
    expect(html).toContain("Esc stops it");
    expect(html).toContain('data-loader-paused="true"');
  });

  test("steering and waiting are tones too; a question its card asks is not asked again", () => {
    expect(runLine({ steering: true })).toContain("Steering");
    const waiting = runLine({
      surface: surface({ activity: activity({ pendingInteraction: "approval" }), hasPendingInteractionCard: true }),
    });
    expect(waiting).toContain('data-state="waiting"');
    expect(waiting).toContain("Waiting for approval");
    expect(waiting).not.toContain("Review to continue");
    expect(waiting).not.toContain("Approval needed");
  });

  test("a failed turn rests on its outcome glyph and drops Stop", () => {
    const html = runLine({
      surface: surface({
        activity: activity({ turnError: "Provider stream failed", completedAt: NOW }),
      }),
    });
    expect(html).toContain('data-state="failed"');
    expect(html).toContain("Provider stream failed");
    expect(html).toContain('data-rest-mark="failed"');
    expect(html).not.toContain(">Stop<");
  });
});

const runs = buildAgentRunFixtures(new Date(NOW - 4 * 60_000));
const agentLine = (detail: AgentRunDetail, patch: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(AgentRunBarView, {
      detail,
      nowPhrase: "Reading the export handler",
      now: NOW,
      reducedMotion: false,
      agentActions: { onStop: noop, onTakeControl: noop },
      actions: { onOpenPanel: noop },
      ...patch,
    }),
  );

describe("agent run line", () => {
  test("a staged run draws the compact track, and says the stage in words once it is too narrow for it", () => {
    const html = agentLine(runs.workflow, {
      panelKeep: "wide",
      detailToggle: { kind: "inline", open: false, onToggle: noop },
    });
    expect(html).toContain('data-testid="agent-run-bar"');
    expect(html).toContain("<ol");
    // The words the narrow line uses in place of the track.
    expect(html).toContain(" · Cause 2/3");
    // A one-line host already names the count, so the track drops its percent.
    expect(html).not.toMatch(/>\d+%</);
    expect(html).toContain('aria-label="Open Progress in the Task panel"');
    expect(html).toContain('aria-label="Show activity details"');
    expect(html).toContain(">Stop<");
    expect(html).toContain("Take control");
  });

  test("a one-stage run shows its turn's to-dos instead of a track", () => {
    const html = agentLine(runs.working, {
      todo: { done: 3, total: 7, segments: ["done", "done", "done", "active", "pending", "pending", "pending"] },
    });
    expect(html).not.toContain("<ol");
    expect(html).toContain('aria-label="3 of 7 to-dos done"');
  });

  test("a sign-off already asked in its card is not repeated on the line", () => {
    const html = agentLine(runs.needsYou, { reasonShownElsewhere: true, nowPhrase: null });
    expect(html).toContain("Needs you");
    expect(html).not.toContain("Which breakpoint should the table switch at");
    expect(agentLine(runs.needsYou, { nowPhrase: null })).toContain("Which breakpoint should the table switch at");
  });

  test("a stalled turn under the run says so, with the way out, instead of Working", () => {
    const html = agentLine(runs.working, {
      turnAlert: {
        tone: "stalled",
        label: "Stalled",
        text: "No updates for 2m 14s",
        detail: "Esc stops it, or send a message to interrupt and continue",
      },
    });
    expect(html).toContain('data-testid="shelf-turn-alert"');
    expect(html).toContain('data-tone="stalled"');
    expect(html).toContain("No updates for 2m 14s");
    expect(html).toContain("Esc stops it");
    // One line: the run's own state and live step give way, its actions stay.
    expect(html).not.toContain(">Working<");
    expect(html).not.toContain("Reading the export handler");
    expect(html).toContain(">Stop<");
    expect(html).toContain("Take control");
  });

  test("steering and a failure are tones of the run's line too", () => {
    const steering = agentLine(runs.working, {
      turnAlert: { tone: "steering", label: "Steering", text: "Waiting for the provider to accept your message", detail: null },
    });
    expect(steering).toContain('data-tone="steering"');
    expect(steering).toContain("Waiting for the provider to accept your message");
    const failed = agentLine(runs.working, {
      turnAlert: { tone: "failed", label: "Failed", text: "Provider stream failed", detail: null },
    });
    expect(failed).toContain('data-tone="failed"');
    expect(failed).toContain("Provider stream failed");
  });
});

describe("composer shelf", () => {
  test("takes no room while nothing is in flight", () => {
    expect(
      renderToStaticMarkup(createElement(ComposerShelf, { framed: true, steering: false, queue: null })),
    ).toBe("");
  });
});
