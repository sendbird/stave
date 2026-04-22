import { PromptInput, ZenPromptInput } from "@/components/ai-elements";
import { LoaderCircle, Swords } from "lucide-react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  buildModelSelectorOptions,
  buildRecommendedModelSelectorOptions,
  buildModelSelectorValue,
  type ModelSelectorOption,
} from "@/components/ai-elements/model-selector";
import type { PromptInputProviderModeStatus } from "@/components/ai-elements/prompt-input-provider-mode";
import type { PromptInputRuntimeStatusItem } from "@/components/ai-elements/prompt-input-runtime-bar";
import { ColiseumLauncherDialog } from "@/components/session/ColiseumLauncherDialog";
import { Badge, Button, Kbd, toast } from "@/components/ui";
import {
  buildCommandPaletteItems,
  type CommandPaletteItem,
  type CommandPaletteProviderNote,
} from "@/lib/commands";
import {
  buildClaudeProviderModeSettingsPatch,
  buildCodexProviderModeSettingsPatch,
  CLAUDE_PROVIDER_MODE_PRESETS,
  CODEX_PROVIDER_MODE_PRESETS,
  detectClaudeProviderModePreset,
  detectCodexProviderModePreset,
  resolveClaudeProviderModePresentation,
  resolveCodexProviderModePresentation,
  type ProviderModePresetDefinition,
  type ProviderModePresetId,
} from "@/lib/providers/provider-mode-presets";
import type { ClaudeSettingSource } from "@/lib/providers/provider.types";
import {
  getCachedProviderCommandCatalog,
  getInitialProviderCommandCatalog,
  setCachedProviderCommandCatalog,
  toProviderCommandCatalogState,
  type ProviderCommandCatalogState,
} from "@/lib/providers/provider-command-catalog";
import {
  getDefaultModelForProvider,
  getProviderLabel,
  listProviderIds,
  normalizeModelSelection,
  resolveClaudeEffortForModelSwitch,
  providerSupportsNativeCommandCatalog,
} from "@/lib/providers/model-catalog";
import { normalizeModelShortcutKeys } from "@/lib/providers/model-shortcuts";
import { useCodexModelCatalog } from "@/lib/providers/use-codex-model-catalog";
import {
  CLAUDE_EFFORT_OPTIONS,
  CODEX_EFFORT_OPTIONS,
  findOptionLabel,
} from "@/lib/providers/runtime-option-contract";
import {
  formatProviderTurnIdleDuration,
  resolveProviderTurnDisplayState,
} from "@/lib/providers/turn-status";
import { getEffectiveSkillEntries } from "@/lib/skills/catalog";
import {
  getTaskControlOwner,
  isTaskArchived,
  isTaskManaged,
} from "@/lib/tasks";
import type { SkillCatalogEntry } from "@/lib/skills/types";
import { cn } from "@/lib/utils";
import { resolvePathBaseName } from "@/lib/path-utils";
import { useAppStore } from "@/store/app.store";
import {
  isDefaultWorkspaceName,
  resolveProjectNameFromPath,
} from "@/store/project.utils";
import {
  findPendingApprovals,
  findLatestPendingUserInputPart,
} from "@/store/provider-message.utils";
import {
  resolvePromptDraftPlanModeChange,
  resolvePromptDraftModelForProvider,
  resolvePromptDraftRuntimeState,
} from "@/store/prompt-draft-runtime";
import type { Attachment, ChatMessage, PromptDraft } from "@/types/chat";
import { useShallow } from "zustand/react/shallow";
import {
  buildChatInputRuntimeStatusItems,
  buildCommandCatalogRuntimeOptions,
  cycleClaudeEffortValue,
  cycleCodexEffortValue,
} from "./chat-input.runtime";
import { ChatInputApprovalQueue } from "./chat-input-approval-queue";
import { toWorkspaceRelativeFilePath } from "./chat-input.attachments";
import {
  buildApprovalGuidancePrompt,
  getLatestPromptSuggestions,
  getLatestUserPromptMessage,
  getPromptHistoryEntries,
  isStaleActiveTurnDraft,
  shouldHandleApprovalEnterShortcut,
  shouldHandleApprovalTabShortcut,
} from "./chat-input.utils";

interface BaseChatInputProps {
  compact?: boolean;
}

const EMPTY_PROMPT_DRAFT: PromptDraft = {
  text: "",
  attachedFilePaths: [],
  attachments: [],
};
const EMPTY_MESSAGES: ChatMessage[] = [];
const PROMPT_DRAFT_SAVE_DELAY_MS = 1200;
const PROMPT_DRAFT_IDLE_TIMEOUT_MS = 750;
const PROVIDER_IDS = listProviderIds();
const INACTIVE_CLAUDE_SETTING_SOURCES: ClaudeSettingSource[] = ["project"];
const INACTIVE_CLAUDE_SETTINGS = [
  "auto",
  null,
  false,
  false,
  true,
  0,
  INACTIVE_CLAUDE_SETTING_SOURCES,
  "medium",
  "adaptive",
  false,
  "",
] as const;
const INACTIVE_CODEX_SETTINGS = [
  "workspace-write",
  false,
  "untrusted",
  "medium",
  "cached",
  false,
  "auto",
  "auto",
  "",
  false,
  false,
  true,
] as const;
const INACTIVE_STAVE_SETTINGS = [false, "auto", 3, true, 2] as const;
const EMPTY_PROVIDER_MODE_PRESETS: readonly ProviderModePresetDefinition[] = [];

interface ChatInputComposerProps {
  compact?: boolean;
  isEmpty: boolean;
  activeTaskId: string;
  activeProvider: ModelSelectorOption["providerId"];
  workspaceCwd?: string;
  workspaceBranch?: string;
  workspaceProjectLabel?: string;
  workspacePathLabel?: string;
  providerSelectionTarget: string;
  isTurnActive: boolean;
  approvalActionsDisabled?: boolean;
  approvalDisabledReason?: string;
  selectedModelOption: ModelSelectorOption;
  modelOptions: ModelSelectorOption[];
  recommendedModelOptions: readonly ModelSelectorOption[];
  modelShortcutKeys: readonly string[];
  commandPaletteItems: readonly CommandPaletteItem[];
  commandPaletteProviderNote?: CommandPaletteProviderNote;
  skillsEnabled: boolean;
  skillsAutoSuggest: boolean;
  skillPaletteItems: readonly SkillCatalogEntry[];
  providerModeStatus?: PromptInputProviderModeStatus | null;
  providerModePresets: readonly ProviderModePresetDefinition[];
  activeProviderModePresetId: ProviderModePresetId | null;
  runtimeStatusItems: readonly PromptInputRuntimeStatusItem[];
  effortLabel?: string;
  effortValue?: string;
  onEffortCycle?: () => void;
  fastMode?: boolean;
  onFastModeChange?: (enabled: boolean) => void;
  planMode?: boolean;
  onPlanModeChange?: (enabled: boolean) => void;
  thinkingMode?: "adaptive" | "enabled" | "disabled";
  onThinkingModeChange?: (value: "adaptive" | "enabled" | "disabled") => void;
  onProviderModeSelect?: (presetId: ProviderModePresetId) => void;
  onModelSelect: (args: { selection: ModelSelectorOption }) => void;
  coliseumAction?: ReactNode;
  crossReviewProvider?: "claude-code" | "codex" | null;
  onCrossReview?: (args: { instructions?: string }) => void;
}

function ChatInputComposer(args: ChatInputComposerProps) {
  const [focusNonce, setFocusNonce] = useState(0);
  const [guidanceFocusNonce, setGuidanceFocusNonce] = useState(0);
  const [
    promptDraft,
    promptFocusNonce,
    clearPromptDraft,
    updatePromptDraft,
    sendUserMessage,
    openFileFromTree,
    abortTaskTurn,
    resolveApproval,
    resolveUserInput,
    setStaveMuseOpen,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.promptDraftByTask[args.providerSelectionTarget] ??
            EMPTY_PROMPT_DRAFT,
          state.promptFocusNonce,
          state.clearPromptDraft,
          state.updatePromptDraft,
          state.sendUserMessage,
          state.openFileFromTree,
          state.abortTaskTurn,
          state.resolveApproval,
          state.resolveUserInput,
          state.setStaveMuseOpen,
        ] as const,
    ),
  );
  const [pendingUserInputMessageId, pendingUserInputPart] = useAppStore(
    useShallow((state) => {
      const messages =
        state.messagesByTask[state.activeTaskId] ?? EMPTY_MESSAGES;
      const lastMessage = messages.at(-1);
      if (!lastMessage) {
        return [null, null] as const;
      }
      const part = findLatestPendingUserInputPart({ message: lastMessage });
      return [lastMessage.id, part ?? null] as const;
    }),
  );
  const pendingUserInput = useMemo(() => {
    if (!pendingUserInputMessageId || !pendingUserInputPart) {
      return null;
    }
    return {
      messageId: pendingUserInputMessageId,
      part: pendingUserInputPart,
    };
  }, [pendingUserInputMessageId, pendingUserInputPart]);
  const activeTaskMessages = useAppStore(
    (state) => state.messagesByTask[args.activeTaskId] ?? EMPTY_MESSAGES,
  );
  const activeTurnId = useAppStore(
    (state) => state.activeTurnIdsByTask[args.activeTaskId] ?? null,
  );
  const providerTurnActivity = useAppStore(
    (state) => state.providerTurnActivityByTask[args.activeTaskId] ?? null,
  );
  const pendingApprovals = useMemo(
    () => findPendingApprovals({ messages: activeTaskMessages }),
    [activeTaskMessages],
  );
  const pendingApproval = pendingApprovals[0] ?? null;
  const queuedNextTurn = promptDraft.queuedNextTurn ?? null;
  const latestUserPromptMessage = useMemo(
    () => getLatestUserPromptMessage(activeTaskMessages),
    [activeTaskMessages],
  );
  const isInputBlocked = pendingApproval != null || pendingUserInput != null;
  const providerTurnDisplayState = useMemo(
    () =>
      resolveProviderTurnDisplayState({
        activeTurnId,
        activity: providerTurnActivity,
      }),
    [activeTurnId, providerTurnActivity],
  );
  const stalledDurationLabel = useMemo(
    () =>
      providerTurnDisplayState === "stalled"
        ? formatProviderTurnIdleDuration({ activity: providerTurnActivity })
        : null,
    [providerTurnActivity, providerTurnDisplayState],
  );
  const promptHistoryEntries = useMemo(
    () => getPromptHistoryEntries(activeTaskMessages),
    [activeTaskMessages],
  );
  const promptSuggestions = useMemo(
    () =>
      args.isTurnActive || isInputBlocked
        ? []
        : getLatestPromptSuggestions(activeTaskMessages),
    [activeTaskMessages, args.isTurnActive, isInputBlocked],
  );
  const [draftText, setDraftText] = useState(promptDraft.text);
  const draftTextRef = useRef(promptDraft.text);
  const syncedDraftRef = useRef({
    taskId: args.providerSelectionTarget,
    text: promptDraft.text,
  });
  const draftSaveTimerRef = useRef<number | null>(null);
  const draftSaveIdleRef = useRef<number | null>(null);
  const staleDraftResetTurnKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (promptFocusNonce === 0) return;
    setFocusNonce((current) => current + 1);
  }, [promptFocusNonce]);

  function cancelPendingDraftSave() {
    if (draftSaveTimerRef.current === null) {
      if (draftSaveIdleRef.current !== null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(draftSaveIdleRef.current);
        draftSaveIdleRef.current = null;
      }
      return;
    }
    window.clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = null;
    if (draftSaveIdleRef.current !== null && "cancelIdleCallback" in window) {
      window.cancelIdleCallback(draftSaveIdleRef.current);
      draftSaveIdleRef.current = null;
    }
  }

  function adoptPromptDraftText(nextDraft: { taskId: string; text: string }) {
    syncedDraftRef.current = nextDraft;
    draftTextRef.current = nextDraft.text;
    setDraftText(nextDraft.text);
  }

  function commitPromptDraftText(nextDraft: { taskId: string; text: string }) {
    cancelPendingDraftSave();
    const store = useAppStore.getState();
    const currentText = store.promptDraftByTask[nextDraft.taskId]?.text ?? "";
    if (currentText !== nextDraft.text) {
      store.updatePromptDraft({
        taskId: nextDraft.taskId,
        patch: { text: nextDraft.text },
      });
    }
    syncedDraftRef.current = nextDraft;
  }

  function commitCurrentDraftText() {
    commitPromptDraftText({
      taskId: syncedDraftRef.current.taskId,
      text: draftTextRef.current,
    });
  }

  function stageApprovalGuidance(guidanceArgs: {
    toolName: string;
    description: string;
    guidance: string;
  }) {
    const nextText = buildApprovalGuidancePrompt({
      currentDraft: draftTextRef.current,
      toolName: guidanceArgs.toolName,
      description: guidanceArgs.description,
      guidance: guidanceArgs.guidance,
    });
    adoptPromptDraftText({
      taskId: args.providerSelectionTarget,
      text: nextText,
    });
    commitPromptDraftText({
      taskId: args.providerSelectionTarget,
      text: nextText,
    });
    setFocusNonce((current) => current + 1);
    toast.message("Guidance drafted", {
      description:
        "The current approval will be denied. Send the staged follow-up after the turn stops.",
    });
  }

  function updateNonTextPromptDraft(patch: Partial<PromptDraft>) {
    commitCurrentDraftText();
    updatePromptDraft({
      taskId: args.providerSelectionTarget,
      patch,
    });
  }

  const filePicker = window.api?.fs?.pickFiles;
  const workspaceRootPath = args.workspaceCwd?.trim() || undefined;
  const handleOpenFileSelector =
    workspaceRootPath && filePicker
      ? async () => {
          const result = await filePicker({ rootPath: workspaceRootPath });
          if (!result.ok || result.filePaths.length === 0) {
            return;
          }

          const currentFilePaths =
            useAppStore.getState().promptDraftByTask[
              args.providerSelectionTarget
            ]?.attachedFilePaths ?? [];
          const nextFilePaths = [...currentFilePaths];
          for (const filePath of result.filePaths) {
            if (!nextFilePaths.includes(filePath)) {
              nextFilePaths.push(filePath);
            }
          }
          updateNonTextPromptDraft({ attachedFilePaths: nextFilePaths });
        }
      : undefined;
  const handlePasteFiles = workspaceRootPath
    ? async (input: { files: File[] }) => {
        const currentFilePaths =
          useAppStore.getState().promptDraftByTask[args.providerSelectionTarget]
            ?.attachedFilePaths ?? [];
        const nextFilePaths = [...currentFilePaths];
        let attachedCount = 0;

        for (const file of input.files) {
          const absolutePath = (file as File & { path?: string }).path?.trim();
          if (!absolutePath) {
            continue;
          }

          const relativePath = toWorkspaceRelativeFilePath({
            absolutePath,
            rootPath: workspaceRootPath,
          });
          if (!relativePath || nextFilePaths.includes(relativePath)) {
            continue;
          }

          nextFilePaths.push(relativePath);
          attachedCount += 1;
        }

        if (attachedCount === 0) {
          toast.warning("No workspace files were attached", {
            description:
              "Paste files copied from the current workspace, or use Attach Files.",
          });
          return;
        }

        updateNonTextPromptDraft({ attachedFilePaths: nextFilePaths });
      }
    : undefined;

  function schedulePromptDraftSave(nextDraft: {
    taskId: string;
    text: string;
  }) {
    cancelPendingDraftSave();
    draftSaveTimerRef.current = window.setTimeout(() => {
      draftSaveTimerRef.current = null;
      if ("requestIdleCallback" in window) {
        draftSaveIdleRef.current = window.requestIdleCallback(
          () => {
            draftSaveIdleRef.current = null;
            commitPromptDraftText(nextDraft);
          },
          { timeout: PROMPT_DRAFT_IDLE_TIMEOUT_MS },
        );
        return;
      }
      commitPromptDraftText(nextDraft);
    }, PROMPT_DRAFT_SAVE_DELAY_MS);
  }

  useEffect(() => {
    const syncedDraft = syncedDraftRef.current;
    if (args.providerSelectionTarget !== syncedDraft.taskId) {
      commitPromptDraftText({
        taskId: syncedDraft.taskId,
        text: draftTextRef.current,
      });
      adoptPromptDraftText({
        taskId: args.providerSelectionTarget,
        text: promptDraft.text,
      });
      return;
    }
    if (promptDraft.text !== syncedDraft.text) {
      adoptPromptDraftText({
        taskId: args.providerSelectionTarget,
        text: promptDraft.text,
      });
    }
  }, [args.providerSelectionTarget, promptDraft.text]);

  useLayoutEffect(() => {
    if (!activeTurnId) {
      staleDraftResetTurnKeyRef.current = null;
      return;
    }

    if (!latestUserPromptMessage) {
      return;
    }

    const resetTurnKey = `${activeTurnId}:${latestUserPromptMessage.id}`;
    if (staleDraftResetTurnKeyRef.current === resetTurnKey) {
      return;
    }
    staleDraftResetTurnKeyRef.current = resetTurnKey;

    if (
      !isStaleActiveTurnDraft({
        isTurnActive: args.isTurnActive,
        draftText: draftTextRef.current,
        latestUserPrompt: latestUserPromptMessage.content,
        queuedNextTurn,
      })
    ) {
      return;
    }

    cancelPendingDraftSave();
    clearPromptDraft({ taskId: args.providerSelectionTarget });
    adoptPromptDraftText({
      taskId: args.providerSelectionTarget,
      text: "",
    });
  }, [
    activeTurnId,
    args.isTurnActive,
    args.providerSelectionTarget,
    clearPromptDraft,
    latestUserPromptMessage,
    queuedNextTurn,
  ]);

  useEffect(
    () => () => {
      commitPromptDraftText({
        taskId: syncedDraftRef.current.taskId,
        text: draftTextRef.current,
      });
    },
    [],
  );

  useEffect(() => {
    const flushDraftText = () => {
      commitPromptDraftText({
        taskId: syncedDraftRef.current.taskId,
        text: draftTextRef.current,
      });
    };
    window.addEventListener("beforeunload", flushDraftText);
    return () => window.removeEventListener("beforeunload", flushDraftText);
  }, []);

  useEffect(() => {
    if (!pendingApproval || args.approvalActionsDisabled) {
      return;
    }

    const handleApprovalShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (
        shouldHandleApprovalTabShortcut({
          key: event.key,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
          isComposing: event.isComposing,
          targetTagName: target?.tagName,
          targetRole: target?.getAttribute("role"),
          targetIsContentEditable: target?.isContentEditable,
        })
      ) {
        event.preventDefault();
        setGuidanceFocusNonce((current) => current + 1);
        return;
      }

      if (
        !shouldHandleApprovalEnterShortcut({
          key: event.key,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
          isComposing: event.isComposing,
          targetTagName: target?.tagName,
          targetRole: target?.getAttribute("role"),
          targetIsContentEditable: target?.isContentEditable,
        })
      ) {
        return;
      }

      event.preventDefault();
      resolveApproval({
        taskId: args.activeTaskId,
        messageId: pendingApproval.messageId,
        approved: true,
      });
    };

    window.addEventListener("keydown", handleApprovalShortcut);
    return () => window.removeEventListener("keydown", handleApprovalShortcut);
  }, [
    args.activeTaskId,
    args.approvalActionsDisabled,
    pendingApproval,
    resolveApproval,
  ]);

  const PromptInputComponent = args.compact ? ZenPromptInput : PromptInput;

  return (
    <div
      className={cn(
        args.compact
          ? "bg-transparent px-0 py-0"
          : "bg-background px-3 py-2.5 sm:px-4",
        args.isEmpty && !args.compact && "pb-6",
      )}
    >
      <div className={cn("mx-auto", args.compact ? "max-w-5xl" : "max-w-6xl")}>
        {args.compact ? (
          <div className="mb-3 flex flex-col gap-1 border-b border-border/50 pb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-primary/85">
                {args.workspaceProjectLabel ?? "user@stave"}
              </span>
              {args.workspaceBranch ? (
                <span>
                  <span className="text-muted-foreground/55">branch:</span>{" "}
                  <span className="text-foreground">
                    {args.workspaceBranch}
                  </span>
                </span>
              ) : null}
              {args.workspacePathLabel ? (
                <span>
                  <span className="text-muted-foreground/55">worktree:</span>{" "}
                  <span className="text-foreground">
                    {args.workspacePathLabel}
                  </span>
                </span>
              ) : null}
            </div>
            {args.workspaceCwd ? (
              <div className="truncate text-[10px] normal-case tracking-normal text-muted-foreground/65">
                {args.workspaceCwd}
              </div>
            ) : null}
          </div>
        ) : null}
        {pendingApprovals.length > 0 ? (
          <ChatInputApprovalQueue
            approvals={pendingApprovals}
            compact={args.compact}
            disabled={args.approvalActionsDisabled}
            disabledReason={args.approvalDisabledReason}
            guidanceFocusNonce={guidanceFocusNonce}
            onResolveApproval={({ messageId, approved }) => {
              resolveApproval({
                taskId: args.activeTaskId,
                messageId,
                approved,
              });
            }}
            onDraftGuidance={({
              messageId,
              toolName,
              description,
              guidance,
            }) => {
              stageApprovalGuidance({
                toolName,
                description,
                guidance,
              });
              resolveApproval({
                taskId: args.activeTaskId,
                messageId,
                approved: false,
              });
            }}
          />
        ) : null}
        {providerTurnDisplayState === "stalled" ? (
          <div className="mb-3 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-muted-foreground dark:bg-warning/15">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="warning" className="uppercase tracking-[0.12em]">
                Stalled
              </Badge>
              <span>
                No provider events for {stalledDurationLabel ?? "a while"}. This
                run may be stuck. Press <Kbd>Esc</Kbd> or use stop to interrupt
                it.
              </span>
            </div>
          </div>
        ) : null}
        <PromptInputComponent
          focusToken={`${args.providerSelectionTarget}:${focusNonce}`}
          value={draftText}
          onBlur={commitCurrentDraftText}
          disabled={isInputBlocked}
          isTurnActive={args.isTurnActive}
          submitMode={args.isTurnActive ? "queue-next" : "send"}
          queuedNextTurn={queuedNextTurn}
          onClearQueuedNextTurn={
            queuedNextTurn
              ? () => {
                  cancelPendingDraftSave();
                  clearPromptDraft({ taskId: args.providerSelectionTarget });
                  adoptPromptDraftText({
                    taskId: args.providerSelectionTarget,
                    text: "",
                  });
                }
              : undefined
          }
          selectedModel={args.selectedModelOption}
          modelOptions={args.modelOptions}
          recommendedModelOptions={args.recommendedModelOptions}
          modelShortcutKeys={args.modelShortcutKeys}
          attachedFilePaths={promptDraft.attachedFilePaths}
          promptHistoryEntries={promptHistoryEntries}
          promptSuggestions={promptSuggestions}
          commandPaletteItems={args.commandPaletteItems}
          commandPaletteProviderNote={args.commandPaletteProviderNote}
          skillsEnabled={args.skillsEnabled}
          skillsAutoSuggest={args.skillsAutoSuggest}
          skillPaletteItems={args.skillPaletteItems}
          onValueChange={(value) => {
            draftTextRef.current = value;
            setDraftText(value);
            schedulePromptDraftSave({
              taskId: args.providerSelectionTarget,
              text: value,
            });
          }}
          onSuggestionSelect={async (suggestion) => {
            cancelPendingDraftSave();
            const result = await sendUserMessage({
              taskId: args.activeTaskId,
              content: suggestion,
            });
            if (result.status === "started" || result.status === "queued") {
              adoptPromptDraftText({
                taskId: args.providerSelectionTarget,
                text: "",
              });
            }
          }}
          onModelSelect={(selectionArgs) => {
            commitCurrentDraftText();
            args.onModelSelect(selectionArgs);
          }}
          fastMode={args.fastMode}
          onFastModeChange={
            args.onFastModeChange
              ? (enabled) => {
                  commitCurrentDraftText();
                  args.onFastModeChange?.(enabled);
                }
              : undefined
          }
          planMode={args.planMode}
          onPlanModeChange={
            args.onPlanModeChange
              ? (enabled) => {
                  commitCurrentDraftText();
                  args.onPlanModeChange?.(enabled);
                }
              : undefined
          }
          thinkingMode={args.thinkingMode}
          onThinkingModeChange={
            args.onThinkingModeChange
              ? (value) => {
                  commitCurrentDraftText();
                  args.onThinkingModeChange?.(value);
                }
              : undefined
          }
          pendingUserInput={pendingUserInput}
          onUserInputSubmit={
            pendingUserInput
              ? ({ messageId, answers }) => {
                  resolveUserInput({
                    taskId: args.activeTaskId,
                    messageId,
                    answers,
                  });
                }
              : undefined
          }
          onUserInputDeny={
            pendingUserInput
              ? ({ messageId }) => {
                  resolveUserInput({
                    taskId: args.activeTaskId,
                    messageId,
                    denied: true,
                  });
                }
              : undefined
          }
          providerModeStatus={args.providerModeStatus}
          providerModePresets={args.providerModePresets}
          activeProviderModePresetId={args.activeProviderModePresetId}
          onProviderModeSelect={
            args.onProviderModeSelect
              ? (presetId) => {
                  commitCurrentDraftText();
                  args.onProviderModeSelect?.(presetId);
                }
              : undefined
          }
          runtimeStatusItems={args.runtimeStatusItems}
          effortLabel={args.effortLabel}
          effortValue={args.effortValue}
          onEffortCycle={
            args.onEffortCycle
              ? () => {
                  commitCurrentDraftText();
                  args.onEffortCycle?.();
                }
              : undefined
          }
          attachments={promptDraft.attachments}
          onAttachFilesChange={({ filePaths }) =>
            updateNonTextPromptDraft({ attachedFilePaths: filePaths })
          }
          onOpenFileSelector={handleOpenFileSelector}
          onPasteFiles={handlePasteFiles}
          onAttachmentsChange={({ attachments }) =>
            updateNonTextPromptDraft({ attachments })
          }
          leadingToolbarAction={args.coliseumAction}
          crossReviewProvider={args.crossReviewProvider}
          onCrossReview={args.onCrossReview}
          onFocus={() => setStaveMuseOpen({ open: false })}
          onSubmit={async ({ text, filePaths }) => {
            cancelPendingDraftSave();
            const submittedDraft = {
              taskId: args.providerSelectionTarget,
              text: draftTextRef.current,
            };
            adoptPromptDraftText({
              taskId: submittedDraft.taskId,
              text: "",
            });
            const restoreSubmittedDraft = () => {
              if (
                syncedDraftRef.current.taskId !== submittedDraft.taskId ||
                draftTextRef.current !== ""
              ) {
                return;
              }
              adoptPromptDraftText(submittedDraft);
              commitPromptDraftText(submittedDraft);
            };
            try {
              for (const fp of filePaths) {
                await openFileFromTree({ filePath: fp });
              }
              const latestTabs = useAppStore.getState().editorTabs;
              const fileContexts = filePaths
                .map((fp) => latestTabs.find((item) => item.filePath === fp))
                .filter((tab): tab is NonNullable<typeof tab> => tab != null)
                .map((tab) => ({
                  filePath: tab.filePath,
                  content: tab.content,
                  language: tab.language,
                }));
              const currentAttachments =
                useAppStore.getState().promptDraftByTask[
                  args.providerSelectionTarget
                ]?.attachments ?? [];
              const imageContexts = currentAttachments
                .filter(
                  (a): a is Extract<Attachment, { kind: "image" }> =>
                    a.kind === "image",
                )
                .map((a) => ({
                  dataUrl: a.dataUrl,
                  label: a.label,
                  mimeType: "image/png",
                }));
              const result = await sendUserMessage({
                taskId: args.activeTaskId,
                content: text,
                fileContexts:
                  fileContexts.length > 0 ? fileContexts : undefined,
                imageContexts:
                  imageContexts.length > 0 ? imageContexts : undefined,
              });
              if (result.status === "blocked") {
                restoreSubmittedDraft();
              }
            } catch (error) {
              restoreSubmittedDraft();
              throw error;
            }
          }}
          onAbort={() => abortTaskTurn({ taskId: args.activeTaskId })}
        />
      </div>
    </div>
  );
}

function BaseChatInput(args: BaseChatInputProps = {}) {
  const [providerCommandCatalog, setProviderCommandCatalog] = useState(() =>
    getCachedProviderCommandCatalog({
      providerId: "claude-code",
    }),
  );
  const [
    activeTaskId,
    providerAvailability,
    providerCommandCatalogRefreshNonce,
    setTaskProvider,
    updatePromptDraft,
    clearTaskProviderSession,
    abortTaskTurn,
    restoreColiseum,
    updateSettings,
    refreshSkillCatalog,
    sendUserMessage,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.activeTaskId,
          state.providerAvailability,
          state.providerCommandCatalogRefreshNonce,
          state.setTaskProvider,
          state.updatePromptDraft,
          state.clearTaskProviderSession,
          state.abortTaskTurn,
          state.restoreColiseum,
          state.updateSettings,
          state.refreshSkillCatalog,
          state.sendUserMessage,
        ] as const,
    ),
  );
  const activeTask = useAppStore(
    (state) =>
      state.tasks.find(
        (task) => task.id === state.activeTaskId && !isTaskArchived(task),
      ) ?? null,
  );
  const [activeColiseum, activeColiseumRunningBranches, activeColiseumReviewerRunning] = useAppStore(
    useShallow((state) => {
      const group = state.activeColiseumsByTask[state.activeTaskId] ?? null;
      const runningBranches = group
        ? group.branchTaskIds.reduce(
            (count, branchTaskId) =>
              count + (state.activeTurnIdsByTask[branchTaskId] ? 1 : 0),
            0,
          )
        : 0;
      const reviewerRunning = Boolean(
        group
        && (
          (group.reviewerTaskId && state.activeTurnIdsByTask[group.reviewerTaskId])
          || group.reviewerVerdict?.status === "running"
        ),
      );
      return [group, runningBranches, reviewerRunning] as const;
    }),
  );
  const draftProvider = useAppStore((state) => state.draftProvider);
  const activeProvider = activeTask?.provider ?? draftProvider;
  const codexBinaryPathForCatalog = useAppStore(
    (state) => state.settings.codexBinaryPath,
  );
  const promptDraftRuntimeOverrides = useAppStore(
    (state) =>
      state.promptDraftByTask[activeTaskId || "draft:session"]
        ?.runtimeOverrides,
  );
  const workspaceCwd = useAppStore(
    (state) =>
      state.workspacePathById[state.activeWorkspaceId] ??
      state.projectPath ??
      undefined,
  );
  const [activeWorkspaceBranch, activeWorkspaceName, projectPath] = useAppStore(
    useShallow(
      (state) =>
        [
          state.workspaceBranchById[state.activeWorkspaceId] ?? undefined,
          state.workspaces.find(
            (workspace) => workspace.id === state.activeWorkspaceId,
          )?.name ?? null,
          state.projectPath,
        ] as const,
    ),
  );
  const activeMessageCount = useAppStore(
    (state) =>
      state.messageCountByTask[state.activeTaskId] ??
      (state.messagesByTask[state.activeTaskId] ?? EMPTY_MESSAGES).length,
  );
  const isTurnActive = useAppStore((state) =>
    Boolean(state.activeTurnIdsByTask[state.activeTaskId]),
  );
  const latestMessageIsPlanResponse = useAppStore((state) => {
    const messages = state.messagesByTask[state.activeTaskId] ?? EMPTY_MESSAGES;
    const lastMessage = messages[messages.length - 1];
    return Boolean(
      lastMessage &&
      lastMessage.role === "assistant" &&
      lastMessage.isPlanResponse === true &&
      lastMessage.planText?.trim(),
    );
  });
  const [
    modelClaude,
    modelCodex,
    modelStave,
    storedClaudeEffort,
    skillsEnabled,
    skillsAutoSuggest,
    providerTimeoutMs,
    modelShortcutKeys,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.modelClaude,
          state.settings.modelCodex,
          state.settings.modelStave,
          state.settings.claudeEffort,
          state.settings.skillsEnabled,
          state.settings.skillsAutoSuggest,
          state.settings.providerTimeoutMs,
          state.settings.modelShortcutKeys,
        ] as const,
    ),
  );
  const [
    claudePermissionMode,
    claudePermissionModeBeforePlan,
    claudeAllowDangerouslySkipPermissions,
    claudeSandboxEnabled,
    claudeAllowUnsandboxedCommands,
    claudeTaskBudgetTokens,
    claudeSettingSources,
    claudeEffort,
    claudeThinkingMode,
    claudeAgentProgressSummaries,
    claudeBinaryPath,
  ] = useAppStore(
    useShallow((state) =>
      activeProvider === "claude-code" || activeProvider === "stave"
        ? ([
            state.settings.claudePermissionMode,
            state.settings.claudePermissionModeBeforePlan,
            state.settings.claudeAllowDangerouslySkipPermissions,
            state.settings.claudeSandboxEnabled,
            state.settings.claudeAllowUnsandboxedCommands,
            state.settings.claudeTaskBudgetTokens,
            state.settings.claudeSettingSources,
            state.settings.claudeEffort,
            state.settings.claudeThinkingMode,
            state.settings.claudeAgentProgressSummaries,
            state.settings.claudeBinaryPath,
          ] as const)
        : INACTIVE_CLAUDE_SETTINGS,
    ),
  );
  const [
    codexFileAccess,
    codexNetworkAccess,
    codexApprovalPolicy,
    codexReasoningEffort,
    codexWebSearch,
    codexShowRawReasoning,
    codexReasoningSummary,
    codexReasoningSummarySupport,
    codexBinaryPath,
    codexPlanMode,
    codexFastMode,
    codexFastModeVisible,
  ] = useAppStore(
    useShallow((state) =>
      activeProvider === "codex"
        ? ([
            state.settings.codexFileAccess,
            state.settings.codexNetworkAccess,
            state.settings.codexApprovalPolicy,
            state.settings.codexReasoningEffort,
            state.settings.codexWebSearch,
            state.settings.codexShowRawReasoning,
            state.settings.codexReasoningSummary,
            state.settings.codexReasoningSummarySupport,
            state.settings.codexBinaryPath,
            state.settings.codexPlanMode,
            state.settings.codexFastMode,
            state.settings.codexFastModeVisible,
          ] as const)
        : INACTIVE_CODEX_SETTINGS,
    ),
  );
  const [
    staveAutoFastMode,
    staveAutoOrchestrationMode,
    staveAutoMaxSubtasks,
    staveAutoAllowCrossProviderWorkers,
    staveAutoMaxParallelSubtasks,
  ] = useAppStore(
    useShallow((state) =>
      activeProvider === "stave"
        ? ([
            state.settings.staveAutoFastMode,
            state.settings.staveAutoOrchestrationMode,
            state.settings.staveAutoMaxSubtasks,
            state.settings.staveAutoAllowCrossProviderWorkers,
            state.settings.staveAutoMaxParallelSubtasks,
          ] as const)
        : INACTIVE_STAVE_SETTINGS,
    ),
  );
  const providerSelectionTarget = activeTaskId || "draft:session";
  const skillCatalog = useAppStore((state) => state.skillCatalog);
  const taskRuntimeState = useMemo(
    () =>
      resolvePromptDraftRuntimeState({
        promptDraft: promptDraftRuntimeOverrides
          ? {
              ...EMPTY_PROMPT_DRAFT,
              runtimeOverrides: promptDraftRuntimeOverrides,
            }
          : null,
        fallback: {
          claudePermissionMode,
          claudePermissionModeBeforePlan,
          codexPlanMode,
        },
      }),
    [
      claudePermissionMode,
      claudePermissionModeBeforePlan,
      codexPlanMode,
      promptDraftRuntimeOverrides,
    ],
  );
  const effectiveClaudePermissionMode = taskRuntimeState.claudePermissionMode;
  const effectiveClaudePermissionModeBeforePlan =
    taskRuntimeState.claudePermissionModeBeforePlan;
  const effectiveCodexPlanMode = taskRuntimeState.codexPlanMode;
  const isEmpty = activeMessageCount === 0;
  const activeModel =
    activeProvider === "claude-code"
      ? resolvePromptDraftModelForProvider({
          providerId: activeProvider,
          runtimeOverrides: promptDraftRuntimeOverrides,
          fallbackModel: modelClaude,
        })
      : activeProvider === "stave"
        ? resolvePromptDraftModelForProvider({
            providerId: activeProvider,
            runtimeOverrides: promptDraftRuntimeOverrides,
            fallbackModel: modelStave,
          })
        : resolvePromptDraftModelForProvider({
            providerId: activeProvider,
            runtimeOverrides: promptDraftRuntimeOverrides,
            fallbackModel: modelCodex,
          });
  const activeProviderAvailable = providerAvailability[activeProvider];
  const coliseumAction = useMemo(() => {
    if (!activeTaskId || !activeTask) {
      return null;
    }

    if (activeColiseum?.minimized) {
      const coliseumBusy =
        activeColiseumRunningBranches > 0 || activeColiseumReviewerRunning;
      return (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "h-8 gap-2 px-3 text-muted-foreground hover:bg-secondary/30 hover:text-foreground",
            args.compact && "h-8 gap-1.5 px-2.5 text-xs",
          )}
          onClick={() => restoreColiseum({ parentTaskId: activeTaskId })}
          aria-label="Reopen Coliseum arena"
          title={
            coliseumBusy
              ? "Reopen the running Coliseum arena"
              : "Reopen the paused Coliseum arena"
          }
        >
          {coliseumBusy ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <Swords className="size-3.5" />
          )}
          <span>Reopen arena</span>
        </Button>
      );
    }

    const disabledReason = isTaskManaged(activeTask)
      ? "This task is managed externally."
      : isTurnActive
        ? "Wait for the current turn to finish before starting a Coliseum."
        : undefined;

    return (
      <ColiseumLauncherDialog
        parentTaskId={activeTaskId}
        defaultProviderId={activeProvider}
        defaultModel={activeModel}
        workspaceRootPath={workspaceCwd}
        disabled={Boolean(disabledReason)}
        disabledReason={disabledReason}
        tooltipSide="top"
        renderTrigger={({ disabled }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 gap-2 px-3 text-muted-foreground hover:bg-secondary/30 hover:text-foreground",
              args.compact && "h-8 gap-1.5 px-2.5 text-xs",
            )}
            disabled={disabled}
            aria-label="Open Coliseum"
          >
            <Swords className="size-3.5" />
            <span>Coliseum</span>
          </Button>
        )}
      />
    );
  }, [
    activeColiseum?.minimized,
    activeColiseumReviewerRunning,
    activeColiseumRunningBranches,
    activeModel,
    activeProvider,
    activeTask,
    activeTaskId,
    args.compact,
    isTurnActive,
    restoreColiseum,
    workspaceCwd,
  ]);
  const selectedModelOption = useMemo<ModelSelectorOption>(
    () =>
      buildModelSelectorValue({
        providerId: activeProvider,
        model: activeModel,
        available: activeProviderAvailable,
      }),
    [activeModel, activeProvider, activeProviderAvailable],
  );
  const codexModelCatalog = useCodexModelCatalog({
    enabled: true,
    codexBinaryPath: codexBinaryPathForCatalog,
  });
  const codexModelEnrichment = useMemo(() => {
    if (codexModelCatalog.entries.length === 0) {
      return undefined;
    }
    const map = new Map<
      string,
      { description?: string; isDefault?: boolean }
    >();
    for (const entry of codexModelCatalog.entries) {
      const id = entry.model.trim();
      if (id) {
        map.set(id, {
          description: entry.description || undefined,
          isDefault: entry.isDefault || undefined,
        });
      }
    }
    return map.size > 0 ? map : undefined;
  }, [codexModelCatalog.entries]);
  const modelOptions = useMemo<ModelSelectorOption[]>(
    () =>
      buildModelSelectorOptions({
        providerIds: PROVIDER_IDS,
        availabilityByProvider: providerAvailability,
        modelsByProvider: {
          codex: codexModelCatalog.models,
        },
        enrichmentByModel: codexModelEnrichment,
      }),
    [codexModelCatalog.models, codexModelEnrichment, providerAvailability],
  );
  const recommendedModelOptions = useMemo<ModelSelectorOption[]>(
    () => buildRecommendedModelSelectorOptions({ options: modelOptions }),
    [modelOptions],
  );
  const normalizedModelShortcutKeys = useMemo(
    () => normalizeModelShortcutKeys(modelShortcutKeys),
    [modelShortcutKeys],
  );
  const workspacePathLabel = useMemo(() => {
    return resolvePathBaseName({ path: workspaceCwd }) || undefined;
  }, [workspaceCwd]);
  const workspaceProjectLabel = useMemo(() => {
    const projectLabel = projectPath
      ? resolveProjectNameFromPath({ projectPath })
      : "stave";
    if (
      activeWorkspaceName?.trim() &&
      !isDefaultWorkspaceName(activeWorkspaceName)
    ) {
      return `user@${projectLabel}:${activeWorkspaceName.trim()}`;
    }
    return `user@${projectLabel}`;
  }, [activeWorkspaceName, projectPath]);
  const approvalActionsDisabled = isTaskManaged(activeTask);
  const approvalDisabledReason = approvalActionsDisabled
    ? `This request is managed by ${getTaskControlOwner(activeTask) === "external" ? "an external controller" : "Stave"}. Respond from the originating client or take over after the run ends.`
    : undefined;
  const effortLabel = useMemo(() => {
    if (activeProvider === "claude-code") {
      return findOptionLabel(CLAUDE_EFFORT_OPTIONS, claudeEffort);
    }
    if (activeProvider === "codex") {
      return findOptionLabel(CODEX_EFFORT_OPTIONS, codexReasoningEffort);
    }
    return undefined;
  }, [activeProvider, claudeEffort, codexReasoningEffort]);
  const effortValue =
    activeProvider === "claude-code"
      ? claudeEffort
      : activeProvider === "codex"
        ? codexReasoningEffort
        : undefined;
  const onEffortCycle = useMemo(() => {
    if (activeProvider === "claude-code") {
      return () =>
        updateSettings({
          patch: { claudeEffort: cycleClaudeEffortValue(claudeEffort) },
        });
    }
    if (activeProvider === "codex") {
      return () =>
        updateSettings({
          patch: {
            codexReasoningEffort: cycleCodexEffortValue(codexReasoningEffort),
          },
        });
    }
    return undefined;
  }, [activeProvider, claudeEffort, codexReasoningEffort, updateSettings]);
  const runtimeStatusItems = useMemo(() => {
    return buildChatInputRuntimeStatusItems({
      activeProvider,
      providerTimeoutMs,
      claudePermissionMode: effectiveClaudePermissionMode,
      claudeAllowDangerouslySkipPermissions,
      claudeSandboxEnabled,
      claudeAllowUnsandboxedCommands,
      claudeTaskBudgetTokens,
      claudeSettingSources,
      claudeEffort,
      claudeThinkingMode,
      claudeAgentProgressSummaries,
      claudeBinaryPath,
      codexFileAccess,
      codexNetworkAccess,
      codexApprovalPolicy,
      codexReasoningEffort,
      codexWebSearch,
      codexShowRawReasoning,
      codexReasoningSummary,
      codexReasoningSummarySupport,
      codexFastMode,
      codexPlanMode: effectiveCodexPlanMode,
      codexBinaryPath,
      staveAutoFastMode,
      staveAutoOrchestrationMode,
      staveAutoMaxSubtasks,
      staveAutoAllowCrossProviderWorkers,
      staveAutoMaxParallelSubtasks,
      claudePermissionModeBeforePlan: effectiveClaudePermissionModeBeforePlan,
    });
  }, [
    activeProvider,
    claudeAllowDangerouslySkipPermissions,
    claudeAgentProgressSummaries,
    claudeAllowUnsandboxedCommands,
    claudeEffort,
    claudeBinaryPath,
    claudeSandboxEnabled,
    claudeSettingSources,
    claudeTaskBudgetTokens,
    claudeThinkingMode,
    codexApprovalPolicy,
    codexFastMode,
    codexReasoningEffort,
    codexNetworkAccess,
    codexBinaryPath,
    codexReasoningSummary,
    codexFileAccess,
    codexShowRawReasoning,
    codexReasoningSummarySupport,
    codexWebSearch,
    effectiveClaudePermissionMode,
    effectiveClaudePermissionModeBeforePlan,
    effectiveCodexPlanMode,
    providerTimeoutMs,
    staveAutoAllowCrossProviderWorkers,
    staveAutoFastMode,
    staveAutoMaxParallelSubtasks,
    staveAutoMaxSubtasks,
    staveAutoOrchestrationMode,
  ]);
  const providerModeStatus =
    useMemo<PromptInputProviderModeStatus | null>(() => {
      if (activeProvider === "claude-code") {
        return {
          providerLabel: "Claude",
          ...resolveClaudeProviderModePresentation({
            settings: {
              claudePermissionMode,
              claudeAllowDangerouslySkipPermissions,
              claudeSandboxEnabled,
              claudeAllowUnsandboxedCommands,
            },
            planMode: effectiveClaudePermissionMode === "plan",
          }),
        };
      }

      if (activeProvider === "codex") {
        return {
          providerLabel: "Codex",
          ...resolveCodexProviderModePresentation({
            settings: {
              codexFileAccess,
              codexApprovalPolicy,
              codexNetworkAccess,
              codexWebSearch,
            },
            planMode: effectiveCodexPlanMode,
          }),
        };
      }

      return null;
    }, [
      activeProvider,
      claudeAllowDangerouslySkipPermissions,
      claudeAllowUnsandboxedCommands,
      claudePermissionMode,
      claudeSandboxEnabled,
      codexApprovalPolicy,
      codexFileAccess,
      codexNetworkAccess,
      codexWebSearch,
      effectiveClaudePermissionMode,
      effectiveCodexPlanMode,
    ]);
  const activeProviderModePresetId =
    useMemo<ProviderModePresetId | null>(() => {
      if (activeProvider === "claude-code") {
        return detectClaudeProviderModePreset({
          settings: {
            claudePermissionMode,
            claudeAllowDangerouslySkipPermissions,
            claudeSandboxEnabled,
            claudeAllowUnsandboxedCommands,
          },
        });
      }

      if (activeProvider === "codex") {
        return detectCodexProviderModePreset({
          settings: {
            codexFileAccess,
            codexApprovalPolicy,
            codexNetworkAccess,
            codexWebSearch,
          },
        });
      }

      return null;
    }, [
      activeProvider,
      claudeAllowDangerouslySkipPermissions,
      claudeAllowUnsandboxedCommands,
      claudePermissionMode,
      claudeSandboxEnabled,
      codexApprovalPolicy,
      codexFileAccess,
      codexNetworkAccess,
      codexWebSearch,
    ]);
  const providerModePresets = useMemo(() => {
    if (activeProvider === "claude-code") {
      return CLAUDE_PROVIDER_MODE_PRESETS;
    }
    if (activeProvider === "codex") {
      return CODEX_PROVIDER_MODE_PRESETS;
    }
    return EMPTY_PROVIDER_MODE_PRESETS;
  }, [activeProvider]);
  const onProviderModeSelect = useMemo(() => {
    if (activeProvider === "claude-code") {
      return (presetId: ProviderModePresetId) =>
        updateSettings({
          patch: buildClaudeProviderModeSettingsPatch({ presetId }),
        });
    }
    if (activeProvider === "codex") {
      return (presetId: ProviderModePresetId) =>
        updateSettings({
          patch: buildCodexProviderModeSettingsPatch({ presetId }),
        });
    }
    return undefined;
  }, [activeProvider, updateSettings]);

  useEffect(() => {
    let cancelled = false;

    if (!providerSupportsNativeCommandCatalog({ providerId: activeProvider })) {
      const nextCatalog = getInitialProviderCommandCatalog({
        providerId: activeProvider,
      });
      setProviderCommandCatalog(nextCatalog);
      setCachedProviderCommandCatalog({
        providerId: activeProvider,
        cwd: workspaceCwd,
        catalog: nextCatalog,
      });
      return () => {
        cancelled = true;
      };
    }

    const getCommandCatalog = window.api?.provider?.getCommandCatalog;
    if (!getCommandCatalog) {
      const nextCatalog: ProviderCommandCatalogState = {
        providerId: activeProvider,
        status: "error",
        commands: [],
        detail: "Provider command catalog API is unavailable in this build.",
      };
      setProviderCommandCatalog(nextCatalog);
      setCachedProviderCommandCatalog({
        providerId: activeProvider,
        cwd: workspaceCwd,
        catalog: nextCatalog,
      });
      return () => {
        cancelled = true;
      };
    }

    const loadingCatalog: ProviderCommandCatalogState = {
      providerId: activeProvider,
      status: "loading",
      commands: [],
      detail: `Loading ${getProviderLabel({ providerId: activeProvider })} native slash commands...`,
    };
    setProviderCommandCatalog(loadingCatalog);
    setCachedProviderCommandCatalog({
      providerId: activeProvider,
      cwd: workspaceCwd,
      catalog: loadingCatalog,
    });

    const runtimeOptions = buildCommandCatalogRuntimeOptions({
      activeProvider,
      model: activeModel,
      claudePermissionMode: effectiveClaudePermissionMode,
      claudeAllowDangerouslySkipPermissions,
      claudeSandboxEnabled,
      claudeAllowUnsandboxedCommands,
      claudeSettingSources,
      claudeEffort,
      claudeThinkingMode,
      claudeAgentProgressSummaries,
      claudeBinaryPath,
    });

    void getCommandCatalog({
      providerId: activeProvider,
      cwd: workspaceCwd,
      runtimeOptions,
    })
      .then((response) => {
        if (cancelled) {
          return;
        }
        const nextCatalog = toProviderCommandCatalogState({
          providerId: activeProvider,
          response,
        });
        setProviderCommandCatalog(nextCatalog);
        setCachedProviderCommandCatalog({
          providerId: activeProvider,
          cwd: workspaceCwd,
          catalog: nextCatalog,
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        const nextCatalog = toProviderCommandCatalogState({
          providerId: activeProvider,
          error,
        });
        setProviderCommandCatalog(nextCatalog);
        setCachedProviderCommandCatalog({
          providerId: activeProvider,
          cwd: workspaceCwd,
          catalog: nextCatalog,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeProvider,
    claudeAllowDangerouslySkipPermissions,
    claudeAgentProgressSummaries,
    claudeAllowUnsandboxedCommands,
    claudeEffort,
    effectiveClaudePermissionMode,
    claudeSandboxEnabled,
    claudeSettingSources,
    providerCommandCatalogRefreshNonce,
    claudeThinkingMode,
    activeModel,
    workspaceCwd,
  ]);

  const commandPalette = useMemo(
    () =>
      buildCommandPaletteItems({
        provider: activeProvider,
        providerCommandCatalog,
      }),
    [activeProvider, providerCommandCatalog],
  );
  const skillPalette = useMemo(
    () =>
      getEffectiveSkillEntries({
        skills: skillCatalog.skills,
        providerId: activeProvider,
      }),
    [activeProvider, skillCatalog.skills],
  );
  const deferredCommandPaletteItems = useDeferredValue(commandPalette.items);
  const deferredSkillPalette = useDeferredValue(skillPalette);

  // ── Cross-review: detect last assistant provider and offer opposite review ──
  const lastAssistantProviderId = useAppStore((state) => {
    const messages = state.messagesByTask[state.activeTaskId] ?? EMPTY_MESSAGES;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as ChatMessage | undefined;
      if (!msg) continue;
      if (
        msg.role === "assistant" &&
        (msg.providerId === "claude-code" || msg.providerId === "codex")
      ) {
        return msg.providerId;
      }
    }
    return null;
  });
  const crossReviewProvider = useMemo<"claude-code" | "codex" | null>(() => {
    if (!lastAssistantProviderId || isTurnActive) return null;
    if (lastAssistantProviderId === "claude-code") return "codex";
    if (lastAssistantProviderId === "codex") return "claude-code";
    return null;
  }, [lastAssistantProviderId, isTurnActive]);
  const crossReviewReturnProviderRef = useRef<
    "claude-code" | "codex" | "stave" | null
  >(null);
  const handleCrossReview = useCallback(
    async (reviewArgs: { instructions?: string }) => {
      if (!crossReviewProvider || !activeTaskId) return;
      // Remember the current provider so we can revert after the review turn.
      crossReviewReturnProviderRef.current = activeProvider;
      setTaskProvider({
        taskId: providerSelectionTarget,
        provider: crossReviewProvider,
      });
      // Yield a microtask so the provider state update fully settles
      // before dispatching (setTaskProvider fires cleanupTask IPC concurrently).
      await Promise.resolve();
      const content = reviewArgs.instructions
        ? `/review ${reviewArgs.instructions}`
        : "/review";
      await sendUserMessage({
        taskId: activeTaskId,
        content,
      });
    },
    [
      activeProvider,
      activeTaskId,
      crossReviewProvider,
      providerSelectionTarget,
      sendUserMessage,
      setTaskProvider,
    ],
  );
  // Revert provider after cross-review turn completes.
  const wasTurnActiveRef = useRef(isTurnActive);
  useEffect(() => {
    const wasActive = wasTurnActiveRef.current;
    wasTurnActiveRef.current = isTurnActive;
    if (wasActive && !isTurnActive && crossReviewReturnProviderRef.current) {
      const returnProvider = crossReviewReturnProviderRef.current;
      crossReviewReturnProviderRef.current = null;
      setTaskProvider({
        taskId: providerSelectionTarget,
        provider: returnProvider,
      });
    }
  }, [isTurnActive, providerSelectionTarget, setTaskProvider]);

  useEffect(() => {
    if (!skillsEnabled) {
      return;
    }
    const targetPath = workspaceCwd ?? null;
    if (skillCatalog.workspacePath === targetPath) {
      if (skillCatalog.status === "loading") {
        return;
      }
      const fetchedAtMs = skillCatalog.fetchedAt
        ? Date.parse(skillCatalog.fetchedAt)
        : 0;
      if (skillCatalog.status === "ready") {
        const CATALOG_TTL_MS = 5 * 60 * 1000;
        if (Date.now() - fetchedAtMs < CATALOG_TTL_MS) {
          return;
        }
      }
      if (skillCatalog.status === "error") {
        const ERROR_RETRY_TTL_MS = 30 * 1000;
        if (Date.now() - fetchedAtMs < ERROR_RETRY_TTL_MS) {
          return;
        }
      }
    }
    void refreshSkillCatalog({ workspacePath: targetPath });
  }, [
    refreshSkillCatalog,
    skillsEnabled,
    skillCatalog.status,
    skillCatalog.workspacePath,
    skillCatalog.fetchedAt,
    workspaceCwd,
  ]);

  return (
    <ChatInputComposer
      compact={args.compact}
      isEmpty={isEmpty}
      activeTaskId={activeTaskId}
      activeProvider={activeProvider}
      workspaceCwd={workspaceCwd}
      workspaceBranch={activeWorkspaceBranch}
      workspaceProjectLabel={workspaceProjectLabel}
      workspacePathLabel={workspacePathLabel}
      providerSelectionTarget={providerSelectionTarget}
      isTurnActive={isTurnActive}
      approvalActionsDisabled={approvalActionsDisabled}
      approvalDisabledReason={approvalDisabledReason}
      selectedModelOption={selectedModelOption}
      modelOptions={modelOptions}
      recommendedModelOptions={recommendedModelOptions}
      modelShortcutKeys={normalizedModelShortcutKeys}
      commandPaletteItems={deferredCommandPaletteItems}
      commandPaletteProviderNote={commandPalette.providerNote}
      skillsEnabled={skillsEnabled}
      skillsAutoSuggest={skillsAutoSuggest}
      skillPaletteItems={deferredSkillPalette}
      providerModeStatus={providerModeStatus}
      providerModePresets={providerModePresets}
      activeProviderModePresetId={activeProviderModePresetId}
      onProviderModeSelect={onProviderModeSelect}
      runtimeStatusItems={runtimeStatusItems}
      effortLabel={effortLabel}
      effortValue={effortValue}
      onEffortCycle={onEffortCycle}
      coliseumAction={coliseumAction}
      crossReviewProvider={crossReviewProvider}
      onCrossReview={crossReviewProvider ? handleCrossReview : undefined}
      onModelSelect={({ selection }) => {
        const nextModel = normalizeModelSelection({
          value: selection.model,
          fallback: getDefaultModelForProvider({
            providerId: selection.providerId,
          }),
        });
        setTaskProvider({
          taskId: providerSelectionTarget,
          provider: selection.providerId,
        });
        updatePromptDraft({
          taskId: providerSelectionTarget,
          patch: {
            runtimeOverrides: {
              ...(promptDraftRuntimeOverrides ?? {}),
              model: nextModel,
            },
          },
        });
        if (selection.providerId === "claude-code") {
          updateSettings({
            patch: {
              claudeEffort: resolveClaudeEffortForModelSwitch({
                previousModel: resolvePromptDraftModelForProvider({
                  providerId: "claude-code",
                  runtimeOverrides: promptDraftRuntimeOverrides,
                  fallbackModel: modelClaude,
                }),
                nextModel,
                currentEffort: storedClaudeEffort,
              }),
            },
          });
          return;
        }
      }}
      fastMode={activeProvider === "codex" ? codexFastMode : undefined}
      onFastModeChange={
        activeProvider === "codex" && codexFastModeVisible
          ? (enabled) => {
              updateSettings({ patch: { codexFastMode: enabled } });
            }
          : undefined
      }
      planMode={
        activeProvider === "codex"
          ? effectiveCodexPlanMode
          : (activeProvider === "claude-code" || activeProvider === "stave") &&
            effectiveClaudePermissionMode === "plan"
      }
      onPlanModeChange={
        activeProvider === "codex"
          ? (enabled) => {
              const nextPlanModeState = resolvePromptDraftPlanModeChange({
                providerId: activeProvider,
                enabled,
                runtimeOverrides: promptDraftRuntimeOverrides,
                claudePermissionMode: effectiveClaudePermissionMode,
                claudePermissionModeBeforePlan:
                  effectiveClaudePermissionModeBeforePlan,
                codexPlanMode: effectiveCodexPlanMode,
                isTurnActive,
                hasPlanResponse: latestMessageIsPlanResponse,
              });
              updatePromptDraft({
                taskId: providerSelectionTarget,
                patch: {
                  runtimeOverrides: nextPlanModeState.runtimeOverrides,
                },
              });
              if (nextPlanModeState.shouldAbortActiveTurn) {
                abortTaskTurn({ taskId: providerSelectionTarget });
              } else if (nextPlanModeState.shouldClearCodexSession) {
                clearTaskProviderSession({
                  taskId: providerSelectionTarget,
                  providerId: "codex",
                });
              }
            }
          : activeProvider === "claude-code" || activeProvider === "stave"
            ? (enabled) => {
                const nextPlanModeState = resolvePromptDraftPlanModeChange({
                  providerId: activeProvider,
                  enabled,
                  runtimeOverrides: promptDraftRuntimeOverrides,
                  claudePermissionMode: effectiveClaudePermissionMode,
                  claudePermissionModeBeforePlan:
                    effectiveClaudePermissionModeBeforePlan,
                  codexPlanMode: effectiveCodexPlanMode,
                });
                updatePromptDraft({
                  taskId: providerSelectionTarget,
                  patch: {
                    runtimeOverrides: nextPlanModeState.runtimeOverrides,
                  },
                });
              }
            : undefined
      }
      thinkingMode={
        activeProvider === "claude-code" ? claudeThinkingMode : undefined
      }
      onThinkingModeChange={
        activeProvider === "claude-code"
          ? (value) => updateSettings({ patch: { claudeThinkingMode: value } })
          : undefined
      }
    />
  );
}

export function ChatInput() {
  return <BaseChatInput />;
}

export function ZenChatInput() {
  return <BaseChatInput compact />;
}
