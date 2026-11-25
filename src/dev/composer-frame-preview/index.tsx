import { createPastedTextFileAccess, reconcilePastedTextPaths } from "@/components/session/chat-input.attachments";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { applyAppLocale } from "@/i18n";
import {
  buildModelPickerAgents,
  useTaskAgentChoice,
} from "@/components/ai-elements/prompt-input-agent-control";
import { getBuiltinAgent } from "@/lib/agents/starters";
import type { AgentAssignment } from "@/lib/agents/assign";
import type { AgentConfig } from "@/lib/agents/schema";
import {
  buildAutoModelSelectorOption,
  buildModelSelectorOptions,
  type ModelSelectorOption,
} from "@/components/ai-elements/model-selector.utils";
import type { ModelEffortValue } from "@/components/ai-elements/model-effort-selector.utils";
import { STANCE_LABELS } from "@/lib/providers/auto-routing-profile";
import { listProviderIds } from "@/lib/providers/model-catalog";
import { CLAUDE_EFFORT_OPTIONS, findOptionLabel } from "@/lib/providers/runtime-option-contract";
import { useAgentAssignmentsStore } from "@/store/agent-assignments-store";
import { useAppStore } from "@/store/app.store";
import { PromptInput } from "@/components/ai-elements/prompt-input";
import { buildCommandPaletteItems } from "@/lib/commands";
import { useComposerRunAccountPool } from "@/components/session/use-run-account-pool";
import { useRunStartDraft } from "@/components/agent-runs/RunContract";
import {
  addTaskContextAttachment,
  buildTaskMentionOptions,
  createTaskContextAttachment,
} from "@/lib/task-context/attached-task-context";
import {
  addDocumentContextAttachment,
  buildDocumentMentionOptions,
  createDocumentContextAttachment,
} from "@/lib/documents/attached-document-context";
import type { WorkspaceDocumentCatalogEntry } from "@/lib/documents/workspace-document-schemas";
import type { Attachment, Task, UserInputPart } from "@/types/chat";

/** Documents from other workspaces the `@` palette offers in the preview. */
const PREVIEW_DOCUMENT_CATALOG: readonly WorkspaceDocumentCatalogEntry[] = [
  {
    workspaceId: "preview-ws-retry",
    workspaceName: "feature/retry-policy",
    workspaceDeleted: true,
    filePath: ".stave/context/plans/retry-design.md",
    revision: 4,
    updatedAt: "2026-10-01T09:00:00.000Z",
  },
  {
    workspaceId: "preview-ws-billing",
    workspaceName: "feat/billing-export",
    workspaceDeleted: false,
    filePath: ".stave/context/plans/export-spec.md",
    revision: 2,
    updatedAt: "2026-09-28T09:00:00.000Z",
  },
];
import { PromptInputContextMeter } from "@/components/ai-elements/prompt-input-context-meter";
import { Popover, PopoverAnchor, Toaster, TooltipProvider, toast } from "@/components/ui";
import { PromptEnhancementDiffPopover } from "@/components/session/prompt-enhancement-diff";
import { i18n } from "@/i18n";
import { ChildRequestSlot, ChildRequestView, type ChildPendingRequest } from "@/components/session/ChildRequestSlot";
import type { AppNotificationCreateInput } from "@/lib/notifications/notification.types";
import { createNotification, deleteNotificationsForWorkspaces } from "@/lib/db/notifications.db";
import { createEmptyWorkspaceState } from "@/store/workspace-session-state";
import { SecretRequestCard } from "@/components/session/secret-request-card";
import { ComposerWorkspaceBarView } from "@/components/session/composer-workspace-bar";
import { MacroControl } from "@/components/session/MacroControl";
import { MacroQuickPicks } from "@/components/session/MacroQuickPicks";
import { ChatInputApprovalQueue } from "@/components/session/chat-input-approval-queue";
import { ComposerShelf } from "@/components/session/composer-shelf/ComposerShelf";
import { reorderQueuedTurns } from "@/components/session/composer-shelf/composer-shelf.utils";
import { useComposerShelfQueue } from "@/components/session/composer-shelf/use-composer-shelf-queue";
import { TaskScopeProvider } from "@/components/session/task-scope-context";
import { SideChatPanel } from "@/components/session/side-chat/SideChatPanel";
import { TurnActivity } from "@/components/session/TurnActivity";
import {
  CLAUDE_PROVIDER_MODE_PRESETS,
  buildClaudeProviderModeSettingsPatch,
  resolveClaudeProviderModePresentation,
  type ProviderModePresetId,
} from "@/lib/providers/provider-mode-presets";
import { useComposerFrameFits } from "@/hooks/use-composer-frame-fits";
import { applyCustomTheme, applyThemeClass } from "@/lib/themes/apply";
import { BUILTIN_CUSTOM_THEMES } from "@/lib/themes/builtin-themes";
import {
  normalizeTurnActivityPlacement,
  type ComposerLayoutMode,
  type TurnActivityPlacement,
} from "@/store/app-settings";
import { Button } from "@/components/aui/components/Button";
import { sx } from "@/components/aui/utils/stylex";
import { composerFramePreviewStyles as f } from "./composer-frame-preview.styles";
import {
  PREVIEW_CHILD_APPROVAL,
  PREVIEW_CHILD_QUESTION,
  PREVIEW_CHILD_QUESTION_WITH_PREVIEW,
  PREVIEW_CLAUDE_CONTEXT_USAGE,
  PREVIEW_MACROS,
  PREVIEW_MODEL,
  PREVIEW_REVIEW_CODEX_MODEL,
  PREVIEW_SECRET_REQUEST,
  PREVIEW_SECRET_REQUEST_EXISTING,
} from "./fixtures";
import { readClaudeContextUsageCached } from "@/lib/providers/claude-context-breakdown";
import type { ProviderId } from "@/lib/providers/provider.types";
import {
  caseHasQueue,
  isShelfCaseTurnLive,
  queuePauseFor,
  isShelfCaseId,
  PREVIEW_APPROVALS,
  PREVIEW_QUEUE,
  PREVIEW_TASK_ID,
  PREVIEW_WORKSPACE_ID,
  SHELF_CASES,
  seedShelfCase,
  type ShelfCaseId,
  nextProviderFor,
} from "./shelf-cases";

/**
 * Dev-only mount of the real composer tree. Opened from `src/main.tsx` when
 * `?stavePreview=composer-frame` is present, so App bootstrap does not run.
 */


/**
 * The preview runs the real Models | Agents selector against a small fake
 * host, so every choice works: pick an agent (Agent mode), pick a model (Chat),
 * pin a model beside the agent, go back to Auto.
 *
 * `?agent=<id>` starts the task as that agent; `&route=pinned|fixed` starts it
 * pinned to a model or on the agent's fixed model (Auto otherwise);
 * `&auto=off` turns Stave Auto off; `&effort=xhigh` passes the label of a
 * Claude effort setting, as the real composer always does; `&theme=light`
 * starts in light mode, and `&theme=<built-in theme id>` renders under that
 * theme; `&lang=ko` renders it in Korean.
 * `&attachments=all` attaches one Information item, one task and one document,
 * so the three context chips render side by side; `&partial=1` attaches a task
 * whose reply is still streaming.
 * `&childRequest=question|preview|approval` shows a delegated task's request above the
 * composer, the slot `ChatInputComposer` mounts; `&childRequest=answered`
 * mounts the real `ChildRequestSlot` on a seeded store: a child approval that
 * was already answered (with the close control), and a still-pending one
 * queued behind it (add `&queued=0` to drop the queued one).
 * `&childRequest=live` exercises a question with a failed first delivery and a retry.
 * `&childRequest=async-ended` is a Codex child's asynchronous question whose
 * delegation was cancelled after its turn ended: nothing can carry an answer,
 * so Continue says so and offers Close, and Decline closes it.
 * `&draft=empty` starts with an empty draft, so the placeholder shows. With
 * `&case=needs-input` the composer stays usable and sending redirects the agent;
 * `&redirect=queue` shows the variant for a turn that cannot be steered.
 * `&secretRequest=new|existing|enter|full` shows an agent's secret request card
 * there: a new variable, one the vault already has, that one with the value
 * field open, or a task whose bound-secret set is full.
 *
 * The composer shelf: `&case=<id>` (see `SHELF_CASES`) seeds the stores with a
 * turn, an agent run, a pending approval or a queue; `&placement=docked|
 * floating|panel` picks where details open; `&open=1` starts them open; `&w=420`
 * caps the composer measure; `&panel=1` adds the Task panel's Activity tab
 * at its usual 384px.
 */
/** Tasks the `@` palette can attach in the preview. */
const PREVIEW_TASK_MENTIONS = buildTaskMentionOptions({
  workspaceId: "preview-workspace",
  tasks: [
    { id: "t-research", title: "Research the login redirect bug", updatedAt: "2026-10-03T09:00:00.000Z" },
    { id: "t-review", title: "Review the queue restore PR", updatedAt: "2026-10-03T08:00:00.000Z" },
    { id: "t-notes", title: "Release notes for 0.25", updatedAt: "2026-10-02T08:00:00.000Z" },
  ].map((task) => ({ ...task, provider: "claude-code", unread: false, archivedAt: null }) as Task),
});

const previewParams = new URLSearchParams(window.location.search);
const NO_FILE_PATHS: string[] = [];
const PREVIEW_PINNED_MODEL = "claude-opus-5-5";
const PREVIEW_EFFORT = previewParams.get("effort");
const PREVIEW_EFFORT_LABEL = PREVIEW_EFFORT ? findOptionLabel(CLAUDE_EFFORT_OPTIONS, PREVIEW_EFFORT) : undefined;

function previewAgent(): AgentConfig | null {
  const agent = getBuiltinAgent(previewParams.get("agent") ?? "");
  if (!agent) return null;
  return previewParams.get("route") === "fixed"
    ? { ...agent, model: { mode: "fixed", providerId: "claude-code", model: PREVIEW_PINNED_MODEL } }
    : agent;
}

function previewAssignment(agent: AgentConfig, id: string, endedAt?: string): AgentAssignment {
  return {
    id,
    taskId: PREVIEW_TASK_ID,
    agentConfigId: agent.id,
    agentName: agent.name,
    agent,
    agentContentHash: id,
    received: [],
    support: [],
    state: "started",
    providerId: "claude-code",
    model: null,
    workspaceMode: "same-workspace",
    branch: null,
    detail: null,
    createdAt: "",
    updatedAt: "",
    ...(endedAt ? { endedAt } : {}),
  } as unknown as AgentAssignment;
}

/** A host that keeps the assignment ledger in memory. */
function installAgentsBridge(initial: AgentConfig | null) {
  const rows: AgentAssignment[] = initial ? [previewAssignment(initial, "preview-initial")] : [];
  const api = ((window as { api?: Record<string, unknown> }).api ??= {});
  api.agents = {
    recordTask: async (input: { agent: AgentConfig }) => {
      const row = previewAssignment(input.agent, `preview-${rows.length + 1}`);
      rows.unshift(row);
      return { ok: true, value: row };
    },
    releaseTask: async () => {
      const current = rows[0];
      if (!current || current.endedAt) return { ok: true, value: null };
      rows[0] = previewAssignment(current.agent, current.id, "now");
      return { ok: true, value: rows[0] };
    },
    listAssignments: async () => ({ ok: true, value: [...rows] }),
    subscribeChanged: () => () => {},
  };
}
const INITIAL_AGENT = previewAgent();
/**
 * `&contextProvider=codex` shows the meter for a provider that reports only a
 * total. The Claude read is a fake host call that counts itself on
 * `window.__contextBreakdownLoads`, behind the real short cache.
 */
/**
 * `&enhanceDiff=1` shows Enhance's finished state: the rewritten draft and the
 * real "Prompt enhanced" toast with View changes and Undo, wired the way
 * `ChatInputComposer` wires them.
 */
const ENHANCE_DIFF = previewParams.get("enhanceDiff") === "1";
const PREVIEW_ENHANCE_SOURCE = "fix the bug in login where users end up on the wrong page";
const PREVIEW_ENHANCED_PROMPT =
  "Fix the login redirect bug: after sign-in, users land on /home instead of the page they requested. Add a regression test.";
const CONTEXT_PROVIDER: ProviderId =
  previewParams.get("contextProvider") === "codex" ? "codex" : "claude-code";
function loadPreviewContextBreakdown() {
  return readClaudeContextUsageCached("composer-frame-preview", async () => {
    const host = window as { __contextBreakdownLoads?: number };
    host.__contextBreakdownLoads = (host.__contextBreakdownLoads ?? 0) + 1;
    await new Promise((resolve) => setTimeout(resolve, 150));
    return { ok: true, detail: "preview", usage: PREVIEW_CLAUDE_CONTEXT_USAGE };
  });
}
const CHILD_REQUESTS: Record<string, ChildPendingRequest> = {
  question: PREVIEW_CHILD_QUESTION,
  preview: PREVIEW_CHILD_QUESTION_WITH_PREVIEW,
  approval: PREVIEW_CHILD_APPROVAL,
};
const CHILD_REQUEST_CASE = previewParams.get("childRequest");
const CHILD_REQUEST = CHILD_REQUESTS[CHILD_REQUEST_CASE ?? ""] ?? null;
const CHILD_REQUEST_SETTLED = CHILD_REQUEST_CASE === "answered";
const CHILD_REQUEST_ASYNC_ENDED = CHILD_REQUEST_CASE === "async-ended";
// Both seed one question; `async-ended` makes it asynchronous with no turn.
const CHILD_REQUEST_LIVE = CHILD_REQUEST_CASE === "live" || CHILD_REQUEST_ASYNC_ENDED;
const CHILD_REQUEST_QUEUED = previewParams.get("queued") === "0" ? 0 : 1;
const PREVIEW_REPOSITORY_PATH = "/tmp/preview-repo";

/**
 * `&childRequest=answered`: notifications for two requests from a delegated
 * child in another workspace, with the child loaded in the runtime cache. The
 * older one was approved in the child, so the slot reads it as answered; the
 * newer one still waits. The notifications go through the notification store
 * (the browser's fallback persistence here) and the list is hydrated from it,
 * so a reload shows what was saved: a closed request stays closed. The slot,
 * its loading and its close are the real ones.
 */
function seedChildRequest() {
  // Each case keeps its own saved rows; the other case's are removed so a
  // switch between them in one browser does not show both.
  const scenario = CHILD_REQUEST_ASYNC_ENDED ? "async-ended" : CHILD_REQUEST_LIVE ? "question" : CHILD_REQUEST_QUEUED ? "queued" : "single";
  const childWorkspaceId = `preview-child-workspace-${scenario}`;
  const otherWorkspaceIds = ["queued", "single", "question", "async-ended"].filter((key) => key !== scenario)
    .map((key) => `preview-child-workspace-${key}`);
  const childTaskId = "preview-child-task";
  const turnId = "preview-child-turn";
  const at = (second: number) => `2026-10-02T09:00:0${second}.000Z`;
  const question: ChildPendingRequest = CHILD_REQUEST_ASYNC_ENDED
    ? { ...PREVIEW_CHILD_QUESTION_WITH_PREVIEW, model: "gpt-5.5-codex", part: {
      ...(PREVIEW_CHILD_QUESTION_WITH_PREVIEW.part as UserInputPart), requestId: "codex-async:preview-call", delivery: "async" } }
    : PREVIEW_CHILD_QUESTION_WITH_PREVIEW;
  const messages = CHILD_REQUEST_LIVE
    ? [{ id: question.messageId, role: "assistant" as const, providerId: "codex" as const, model: question.model ?? "", content: "", parts: [question.part] }]
    : [
    { id: "preview-child-answered-message", role: "assistant" as const, providerId: "codex" as const, model: "gpt-5.5-codex", content: "",
      parts: [{ type: "approval" as const, requestId: "preview-child-answered", toolName: "Bash", description: "bun run lint", state: "approval-responded" as const }] },
    ...(CHILD_REQUEST_QUEUED
      ? [{ id: PREVIEW_CHILD_APPROVAL.messageId, role: "assistant" as const, providerId: "codex" as const, model: "gpt-5.5-codex", content: "",
        parts: [PREVIEW_CHILD_APPROVAL.part] }]
      : []),
  ];
  const root = { parentTaskId: PREVIEW_TASK_ID, ancestorTaskIds: [PREVIEW_TASK_ID], rootTaskId: PREVIEW_TASK_ID,
    rootWorkspaceId: PREVIEW_WORKSPACE_ID, rootWorkspaceName: "Preview", rootTaskTitle: "Review the composer layout" };
  const notification = (id: string, requestId: string, messageId: string, createdAt: string): AppNotificationCreateInput => ({
    id, kind: "task.approval_requested", title: "Review the composer layout", body: "", repositoryPath: PREVIEW_REPOSITORY_PATH,
    repositoryName: "preview-repo", workspaceId: childWorkspaceId, workspaceName: "Child", taskId: childTaskId,
    taskTitle: "Migrate settings sections to the new tokens", turnId, providerId: "codex",
    action: { type: "approval", requestId, messageId }, payload: { ...root, toolName: "Bash" }, createdAt,
    dedupeKey: `task.approval_requested:${childWorkspaceId}:${turnId}:${requestId}`,
  });
  useAppStore.setState((state) => ({
    repositoryPath: PREVIEW_REPOSITORY_PATH,
    workspaces: [
      ...state.workspaces.filter(({ id }) => id !== childWorkspaceId),
      { id: childWorkspaceId, name: "Child", updatedAt: at(0) },
    ],
    taskWorkspaceIdById: { ...state.taskWorkspaceIdById, [childTaskId]: childWorkspaceId },
    workspaceRuntimeCacheById: { ...state.workspaceRuntimeCacheById, [childWorkspaceId]: {
      ...createEmptyWorkspaceState(), nativeSessionReadyByTask: {},
      tasks: [{ id: childTaskId, title: "Migrate settings sections to the new tokens", provider: "codex", updatedAt: at(0), unread: false,
        controlMode: "managed", controlOwner: "external", parentTaskId: PREVIEW_TASK_ID }],
      activeTaskId: childTaskId,
      messagesByTask: { [childTaskId]: messages },
      messageCountByTask: { [childTaskId]: messages.length },
      // An asynchronous question outlives its turn; this one's turn ended.
      activeTurnIdsByTask: CHILD_REQUEST_ASYNC_ENDED ? {} : { [childTaskId]: turnId },
    } },
  }));
  const notifications = CHILD_REQUEST_LIVE ? [{
    ...notification("preview-child-ask", question.part.requestId, question.messageId, at(1)),
    kind: "task.user_input_requested" as const,
    action: null,
    payload: { ...root, requestId: question.part.requestId, messageId: question.messageId },
  }] : [
    notification("preview-child-answered-notification", "preview-child-answered", "preview-child-answered-message", at(1)),
    ...(CHILD_REQUEST_QUEUED
      ? [notification("preview-child-pending-notification", PREVIEW_CHILD_APPROVAL.part.requestId, PREVIEW_CHILD_APPROVAL.messageId, at(2))]
      : []),
  ];
  if (CHILD_REQUEST_ASYNC_ENDED && window.api) {
    // The delegation that ran the child was cancelled: it takes no follow-up.
    const cancelled = { runId: "preview-run", stepId: "preview-step", parentTaskId: PREVIEW_TASK_ID, delegationKey: "preview-slice",
      delegatedTaskId: childTaskId, delegatedWorkspaceId: childWorkspaceId, delegatedTurnId: turnId, providerId: "codex" as const,
      lifecycle: "one-turn" as const, phase: "cancelled" as const, reason: "Provider turn was interrupted before it completed.",
      attempt: 1, createdAt: at(0), updatedAt: at(1), completedAt: at(1) };
    window.api.runs = {
      ...window.api.runs,
      listDelegatedTasks: async () => [cancelled],
    };
    // Records a decline; an answer never gets here, since nothing could send it.
    window.api.localMcp = {
      respondUserInput: async (answer) => ({ ok: answer.denied === true && answer.answerDelivered === true }),
    };
  } else if (CHILD_REQUEST_LIVE && window.api) {
    let attempts = 0;
    window.api.localMcp = {
      respondUserInput: async (answer) => {
        if (++attempts === 1) return { ok: false, message: "fixture: transport interrupted", reason: "write-failed" };
        if (previewParams.has("holdAnswer")) {
          await new Promise<void>((resolve) => window.addEventListener("fixture-deliver-answer", () => resolve(), { once: true }));
        }
        return {
          ok: answer.taskId === childTaskId && answer.workspaceId === childWorkspaceId &&
            answer.requestId === question.part.requestId && answer.expectedMessageId === question.messageId &&
            Boolean(answer.denied || answer.answers?.layout === "Scroll container"),
        };
      },
    };
  }
  // An existing row (same dedupe key) is kept as saved, closed or not.
  // `preview-child-workspace` held both cases' rows before they were split.
  void deleteNotificationsForWorkspaces({ workspaceIds: [...otherWorkspaceIds, "preview-child-workspace"] })
    .then(() => Promise.all(notifications.map((item) => createNotification({ notification: item }))))
    .then(() => useAppStore.getState().hydrateNotifications());
}
const SECRET_REQUEST_CASE = previewParams.get("secretRequest");
const SECRET_REQUEST =
  SECRET_REQUEST_CASE === "existing" || SECRET_REQUEST_CASE === "enter"
    ? PREVIEW_SECRET_REQUEST_EXISTING
    : SECRET_REQUEST_CASE === "new" || SECRET_REQUEST_CASE === "full"
      ? PREVIEW_SECRET_REQUEST
      : null;
installAgentsBridge(INITIAL_AGENT);

export function ComposerFramePreviewApp() {
  const [dark, setDark] = useState(previewParams.get("theme") !== "light");
  const [layoutPreference, setLayoutPreference] =
    useState<ComposerLayoutMode>("framed");
  const [squeezed, setSqueezed] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const pastePreview = previewParams.get("paste");
  const pastedFiles = useMemo(() => {
    if (!pastePreview) return undefined;
    const files = new Map<string, string>();
    return createPastedTextFileAccess("/preview", {
      async importAttachments({ entries }) {
        if (pastePreview === "pending") await new Promise((resolve) => setTimeout(resolve, 1_500));
        if (pastePreview === "fail") return { ok: false, filePaths: [], failures: [] };
        const filePaths = entries.flatMap((entry) => {
          if (!("data" in entry)) return [];
          const filePath = ".stave/attachments/" + crypto.randomUUID().slice(0, 8) + "/" + entry.name;
          files.set(filePath, new TextDecoder("utf-8", { ignoreBOM: true }).decode(entry.data));
          return [filePath];
        });
        return { ok: true, filePaths, failures: [] };
      },
      async readFile({ filePath }) {
        if (pastePreview === "pending") await new Promise((resolve) => setTimeout(resolve, 1_500));
        const content = files.get(filePath);
        return { ok: content !== undefined, content: content ?? "", revision: "" };
      },
    });
  }, [pastePreview]);
  const [caseId, setCaseId] = useState<ShelfCaseId>(() => {
    const requested = previewParams.get("case");
    return isShelfCaseId(requested) ? requested : "running";
  });
  const [placement, setPlacement] = useState<TurnActivityPlacement>(() =>
    normalizeTurnActivityPlacement(previewParams.get("placement")),
  );
  const [queue, setQueue] = useState(PREVIEW_QUEUE);
  const measureWidth = Number(previewParams.get("w")) || null;
  const showPanel = previewParams.get("panel") === "1" || placement === "panel";
  const { ref: composerMeasureRef, fits: composerFrameFits } =
    useComposerFrameFits();
  const framed = layoutPreference === "framed" && composerFrameFits;
  const [draft, setDraft] = useState(
    ENHANCE_DIFF
      ? PREVIEW_ENHANCED_PROMPT
      : previewParams.get("draft") === "empty"
        ? ""
        : "Tighten the four-bar composer so the side shelves match the input card height.",
  );
  const [enhanceDiffOpen, setEnhanceDiffOpen] = useState(false);
  const enhanceToastShown = useRef(false);
  useEffect(() => {
    if (!ENHANCE_DIFF || enhanceToastShown.current) return;
    enhanceToastShown.current = true;
    toast.success(i18n.t("session:chatInputComposer.handlePromptEnhancementRevealComplete"), {
      duration: 0,
      secondaryAction: {
        label: i18n.t("session:chatInputComposer.viewEnhancementChanges"),
        onClick: () => setEnhanceDiffOpen(true),
      },
      action: {
        label: i18n.t("session:chatInputComposer.label"),
        onClick: () => setDraft(PREVIEW_ENHANCE_SOURCE),
      },
    });
  }, []);
  const [thinkingMode, setThinkingMode] = useState<
    "adaptive" | "enabled" | "disabled"
  >("enabled");
  const [providerMode, setProviderMode] =
    useState<ProviderModePresetId>("guided");
  // The selector lists Models and Agents; with an agent running the task the
  // trigger splits into agent | model.
  const autoOn = previewParams.get("auto") !== "off";
  // The Auto option names the saved preference, as the real composer's does.
  const stance = useAppStore((state) => state.settings.autoRoutingProfile.stance);
  const modelOptions = useMemo<ModelSelectorOption[]>(
    () => [
      buildAutoModelSelectorOption({
        providerId: "claude-code",
        available: autoOn,
        stanceLabel: STANCE_LABELS[stance],
      }),
      ...buildModelSelectorOptions({ providerIds: listProviderIds() }),
    ],
    [autoOn, stance],
  );
  const [pickedModel, setPickedModel] = useState<ModelSelectorOption>(() => {
    const model = modelOptions.find((option) => option.model === PREVIEW_PINNED_MODEL) ?? PREVIEW_MODEL;
    if (!INITIAL_AGENT) return model;
    const route = previewParams.get("route");
    return route === "pinned" || route === "fixed" || !autoOn ? model : (modelOptions[0] ?? model);
  });
  const selectedModel = pickedModel.isAuto ? (modelOptions[0] ?? pickedModel) : pickedModel;
  const runAccountPool = useComposerRunAccountPool(PREVIEW_TASK_ID, selectedModel.providerId);
  const [effort, setEffort] = useState<ModelEffortValue | undefined>();
  const agentChoice = useTaskAgentChoice({
    taskId: PREVIEW_TASK_ID,
    selectedModel,
    modelOptions,
    onModelSelect: ({ selection, effort: picked }) => {
      setPickedModel(selection);
      setEffort(picked);
    },
  });
  useEffect(() => {
    useAppStore.setState({ repositoryPath: PREVIEW_REPOSITORY_PATH });
    void useAgentAssignmentsStore.getState().load();
  }, []);
  useLayoutEffect(() => {
    seedShelfCase({ caseId, placement, detailsOpen: previewParams.get("open") === "1" });
    if (CHILD_REQUEST_SETTLED || CHILD_REQUEST_LIVE) seedChildRequest();
    if (previewParams.get("attachments") === "all") {
      // One chip of each context kind, so the shared chip shape can be compared.
      const document = buildDocumentMentionOptions({ entries: PREVIEW_DOCUMENT_CATALOG, attachments: [] })[1]!;
      setAttachments([
        {
          kind: "workspace-information",
          id: "preview-information",
          reference: { section: "notes", scope: "item", itemId: "retry", label: "Retry policy decision", token: "@info:notes/retry" },
        },
        createTaskContextAttachment(PREVIEW_TASK_MENTIONS[0]!),
        createDocumentContextAttachment(document),
      ]);
    }
    if (previewParams.get("partial") === "1") {
      const task = PREVIEW_TASK_MENTIONS[0]!;
      const attachment = createTaskContextAttachment(task);
      setAttachments([attachment]);
      useAppStore.setState((state) => ({ messagesByTask: { ...state.messagesByTask,
        [task.taskId]: [{ id: "partial-preview", role: "assistant", providerId: "codex", model: "model",
          content: "The investigation is still in progress.", isStreaming: true, parts: [] }],
      } }));
    }
  }, [caseId, placement]);
  useLayoutEffect(() => {
    applyAppLocale(previewParams.get("lang") ?? "en");
  }, []);
  useEffect(() => {
    document.title = "Composer frame mock";
    // `&theme=<built-in theme id>` renders under that theme.
    const builtin = BUILTIN_CUSTOM_THEMES.find((theme) => theme.id === previewParams.get("theme")) ?? null;
    applyThemeClass({ enabled: builtin ? builtin.baseMode === "dark" : dark });
    applyCustomTheme({ theme: builtin });
  }, [dark]);

  const turnActive = isShelfCaseTurnLive(caseId);
  const shelfQueue = useComposerShelfQueue({
    listId: PREVIEW_TASK_ID,
    queuedTurns: caseHasQueue(caseId) ? queue : [],
    queuedNextTurn: null,
    submitMode: turnActive ? "steer-or-queue" : "send",
    disabled: caseId === "needs-input" || caseId === "steering",
    isTurnActive: turnActive,
    canSteerQueuedTurn: turnActive && caseId !== "stalled",
    selectedModel,
    modelOptions,
    onSteer: (itemId) => setQueue((items) => items.filter((item) => item.id !== itemId)),
    onSend: (itemId) => setQueue((items) => items.filter((item) => item.id !== itemId)),
    onUpdate: ({ itemId, content }) =>
      setQueue((items) => items.map((item) => (item.id === itemId ? { ...item, content } : item))),
    onRemove: (itemId) => setQueue((items) => items.filter((item) => item.id !== itemId)),
    onClearAll: () => setQueue([]),
    onReorder: (move) => setQueue((items) => [...reorderQueuedTurns(items, move)]),
    pause: queuePauseFor(caseId),
    onResume: () => undefined,
  });
  const runStartDraft = useRunStartDraft(draft, { attachedFilePaths: NO_FILE_PATHS, attachments });
  const shelf = (
    <ComposerShelf
      framed={framed}
      steering={caseId === "steering"}
      queue={shelfQueue}
      providerId={nextProviderFor(caseId) ?? selectedModel.providerId}
      {...runStartDraft}
    />
  );

  const providerModeStatus = useMemo(() => {
    const presentation = resolveClaudeProviderModePresentation({
      settings: buildClaudeProviderModeSettingsPatch({
        presetId: providerMode,
      }),
    });
    return {
      ...presentation,
      providerLabel: "Claude",
      // Lists what the chosen preset does on its own, as the app does.
      providerId: "claude-code" as const,
    };
  }, [providerMode]);

  return (
    <TooltipProvider>
      <TaskScopeProvider taskId={PREVIEW_TASK_ID}>
      <div className={sx(f.page)}>
        <header className={sx(f.header)}>
          <h1 className={sx(f.headerTitle)}>Composer frame preview</h1>
          <p className={sx(f.headerNote)}>
            Real PromptInput, composer shelf, and workspace bar
          </p>
          <div className={sx(f.headerControls)}>
            {SHELF_CASES.map((item) => (
              <Button
                key={item.id}
                layout="host"
                type="button"
                data-preview-case={item.id}
                xstyle={[f.toggle, caseId === item.id && f.toggleActive]}
                onClick={() => {
                  setQueue(PREVIEW_QUEUE);
                  setCaseId(item.id);
                }}
              >
                {item.label}
              </Button>
            ))}
            <Button
              layout="host"
              type="button"
              data-preview-placement={placement}
              xstyle={[f.toggle]}
              onClick={() =>
                setPlacement((value) =>
                  value === "docked" ? "floating" : value === "floating" ? "panel" : "docked",
                )
              }
            >
              {`Details: ${placement}`}
            </Button>
            <Button
              layout="host"
              type="button"
              xstyle={[
                f.toggle,
                layoutPreference === "framed" && f.toggleActive,
              ]}
              onClick={() =>
                setLayoutPreference((value) =>
                  value === "framed" ? "classic" : "framed",
                )
              }
            >
              {layoutPreference === "framed" ? "Framed" : "Classic"}
            </Button>
            <Button
              layout="host"
              type="button"
              xstyle={[f.toggle, squeezed && f.toggleActive]}
              onClick={() => setSqueezed((value) => !value)}
            >
              {squeezed ? "Squeezed" : "Full width"}
            </Button>
            <span className={sx(f.statusNote)} data-testid="preview-task-mode">
              {agentChoice.current
                ? `Agent · ${agentChoice.current.agentName} · ${agentChoice.route}`
                : "Chat"}
            </span>
            <span className={sx(f.statusNote)}>
              {framed ? "frame on" : "frame off"}
            </span>
            <Button
              layout="host"
              type="button"
              xstyle={[f.toggle, dark && f.toggleActive]}
              onClick={() => setDark((value) => !value)}
            >
              {dark ? "Dark" : "Light"}
            </Button>
          </div>
        </header>

        <div className={sx(f.workspace)}>
        <div className={sx(f.main)}>
          <div className={sx(f.conversation)}>
            <div className={sx(f.conversationMeasure)}>
              <p>Earlier turn</p>
              <p className={sx(f.conversationBody)}>
                Message column stays at the conversation measure. The raised
                card is narrower so hovered side shelves fit inside that
                measure.
              </p>
            </div>
            <div className={sx(f.overlay)}>
              <TurnActivity host="floating" />
              <SideChatPanel taskId={PREVIEW_TASK_ID} host="conversation" />
            </div>
          </div>

          <div className={sx(f.composerDock)}>
            <Popover
              open={enhanceDiffOpen}
              onOpenChange={(open) => {
                if (!open) setEnhanceDiffOpen(false);
              }}
            >
            <div className={sx(f.composerPad)}>
              <div
                ref={composerMeasureRef}
                data-testid="preview-composer-measure"
                style={measureWidth ? { maxWidth: measureWidth } : undefined}
                className={sx(
                  f.composerMeasure,
                  squeezed ? f.composerMeasureSqueezed : f.composerMeasureWide,
                )}
              >
                {/* The composer measure's top edge, where `ChatInputComposer`
                    anchors the Enhance diff. */}
                {ENHANCE_DIFF ? (
                  <PopoverAnchor render={<div className={sx(f.enhanceAnchor)} />} />
                ) : null}
                {caseId === "needs-input" ? (
                  <ChatInputApprovalQueue
                    approvals={PREVIEW_APPROVALS}
                    onDraftGuidance={() => {}}
                    onResolveApproval={() => {}}
                  />
                ) : null}
                {framed ? null : shelf}
                {CHILD_REQUEST ? (
                  <ChildRequestView
                    requestId={CHILD_REQUEST.part.requestId}
                    childTitle="Migrate settings sections to the new tokens"
                    providerId="codex"
                    pending={CHILD_REQUEST}
                    queuedCount={1}
                    busy={false}
                    error={null}
                    settled={false}
                    onRespond={() => {}}
                  />
                ) : null}
                {CHILD_REQUEST_SETTLED || CHILD_REQUEST_LIVE ? <ChildRequestSlot taskId={PREVIEW_TASK_ID} /> : null}
                {SECRET_REQUEST ? (
                  <SecretRequestCard
                    request={SECRET_REQUEST}
                    queuedCount={SECRET_REQUEST_CASE === "new" ? 1 : 0}
                    busy={false}
                    error={null}
                    bindingBlocked={SECRET_REQUEST_CASE === "full"}
                    initialMode={SECRET_REQUEST_CASE === "enter" ? "enter" : "existing"}
                    onSave={() => {}}
                    onUseExisting={() => {}}
                    onDecline={() => {}}
                  />
                ) : null}
                <PromptInput
                  pendingUserInput={
                    previewParams.get("questionPreview") === "1" &&
                    PREVIEW_CHILD_QUESTION_WITH_PREVIEW.part.type === "user_input"
                      ? {
                          messageId: PREVIEW_CHILD_QUESTION_WITH_PREVIEW.messageId,
                          part: PREVIEW_CHILD_QUESTION_WITH_PREVIEW.part,
                        }
                      : undefined
                  }
                  onUserInputSubmit={() => {}}
                  onUserInputDeny={() => {}}
                  runAccountPool={runAccountPool}
                  framed={framed}
                  isTurnActive={turnActive}
                  submitMode={
                    caseId === "needs-input"
                      ? previewParams.get("redirect") === "queue"
                        ? "redirect-queue"
                        : "redirect-steer"
                      : turnActive
                        ? "steer-or-queue"
                        : "send"
                  }
                  macroControl={
                    <MacroControl macros={PREVIEW_MACROS} onSelect={() => {}} />
                  }
                  macroQuickPicks={
                    <MacroQuickPicks
                      macros={PREVIEW_MACROS}
                      onSelect={() => {}}
                    />
                  }
                  value={draft}
                  onValueChange={setDraft}
                  // The slash menu: Stave's own commands (no provider catalog in the preview).
                  commandPaletteItems={buildCommandPaletteItems({ provider: selectedModel.providerId }).items}
                  selectedModel={selectedModel}
                  modelOptions={modelOptions}
                  effortValue={effort}
                  {...(PREVIEW_EFFORT_LABEL ? { effortLabel: PREVIEW_EFFORT_LABEL } : {})}
                  attachedFilePaths={pastedFiles ? reconcilePastedTextPaths([], [], attachments) : []}
                  pastedTextFiles={pastedFiles}
                  attachments={attachments}
                  onAttachmentsChange={({ attachments: next }) => setAttachments(next)}
                  taskMentionOptions={PREVIEW_TASK_MENTIONS}
                  documentMentionOptions={buildDocumentMentionOptions({
                    entries: PREVIEW_DOCUMENT_CATALOG,
                    attachments,
                  })}
                  onAttachDocument={(document) =>
                    setAttachments((current) => [
                      ...addDocumentContextAttachment({
                        attachments: current,
                        attachment: createDocumentContextAttachment(document),
                      }),
                    ])
                  }
                  onAttachTask={(task) =>
                    setAttachments((current) => [
                      ...addTaskContextAttachment({
                        attachments: current,
                        attachment: createTaskContextAttachment(task),
                      }),
                    ])
                  }
                  reviewModelOptions={[PREVIEW_MODEL, PREVIEW_REVIEW_CODEX_MODEL]}
                  preferredReviewModelKey={PREVIEW_MODEL.key}
                  onLocalChangeReview={() => true}
                  thinkingMode={thinkingMode}
                  onThinkingModeChange={setThinkingMode}
                  providerModeStatus={providerModeStatus}
                  providerModePresets={CLAUDE_PROVIDER_MODE_PRESETS}
                  activeProviderModePresetId={providerMode}
                  onProviderModeSelect={setProviderMode}
                  modelPickerAgents={buildModelPickerAgents(agentChoice, { locked: false })}
                  assignOnSend={agentChoice.assignOnSend}
                  runtimeStatusItems={[
                    {
                      id: "sandbox",
                      label: "Sandbox",
                      value: "workspace-write",
                    },
                    { id: "approval", label: "Approval", value: "on-request" },
                  ]}
                  contextMeter={
                    <PromptInputContextMeter
                      usage={{
                        usedPercent: 72,
                        usedTokens: 72_000,
                        windowTokens: 100_000,
                        messageId: "assistant-preview",
                      }}
                      compactAvailable
                      compactDisabled={false}
                      onCompact={() => {}}
                      providerId={CONTEXT_PROVIDER}
                      loadBreakdown={CONTEXT_PROVIDER === "claude-code" ? loadPreviewContextBreakdown : undefined}
                    />
                  }
                  frameTop={framed ? shelf : undefined}
                  frameBottom={
                    framed ? (
                      <ComposerWorkspaceBarView
                        repositoryLabel="stave"
                        workspaceLabel="Agentic Workflow"
                        folderLabel="feat__agent-manager--1dlzwt1"
                        branchLabel="feat/agent-manager"
                      />
                    ) : undefined
                  }
                  onComposerControlPlacementsChange={() => {}}
                  onModelSelect={agentChoice.selectModel}
                  onAttachFilesChange={() => {}}
                  onSubmit={({ text }) => {
                    if (pastePreview) {
                      // e2e reads the sent text to check collapsed pastes still send the original.
                      document.documentElement.dataset.previewLastSubmit = text;
                      setDraft("");
                      setAttachments([]);
                    }
                  }}
                  onAbort={() => {}}
                />
              </div>
            </div>
            {ENHANCE_DIFF ? (
              <PromptEnhancementDiffPopover
                enhancedPrompt={PREVIEW_ENHANCED_PROMPT}
                sourceText={PREVIEW_ENHANCE_SOURCE}
                onKeep={() => setEnhanceDiffOpen(false)}
                onRevert={() => {
                  setEnhanceDiffOpen(false);
                  setDraft(PREVIEW_ENHANCE_SOURCE);
                }}
              />
            ) : null}
            </Popover>
          </div>
        </div>
        {showPanel ? (
          <aside className={sx(f.panel)} data-testid="preview-task-panel" aria-label="Task panel activity">
            <TurnActivity host="panel" />
          </aside>
        ) : null}
        </div>
      </div>
      </TaskScopeProvider>
      {ENHANCE_DIFF || pastePreview ? <Toaster /> : null}
    </TooltipProvider>
  );
}
