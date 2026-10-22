import type { ReactNode } from "react";
import type {
  Attachment,
  PromptDraftBatchItem,
  UserInputPart,
} from "@/types/chat";
import type {
  CommandPaletteItem,
  CommandPaletteProviderNote,
} from "@/lib/commands";
import type {
  ProviderModePresetDefinition,
  ProviderModePresetId,
} from "@/lib/providers/provider-mode-presets";
import type { ComposerControlPlacements } from "@/lib/composer-controls";
import type { SkillCatalogEntry } from "@/lib/skills/types";
import type { Macro, MacroTokenMatch } from "@/lib/macros/types";
import type { ModelShortcutEffort } from "@/lib/providers/model-shortcuts";
import type { PromptCommentShortcut } from "@/lib/prompt-comment-shortcuts";
import type { SteerQueueEnterAction } from "@/lib/steer-queue-shortcuts";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { WorkspaceInformationReferenceOption } from "@/lib/workspace-information-references";
import type { DocumentMentionOption } from "@/lib/documents/attached-document-context";
import type { TaskMentionOption } from "@/lib/task-context/attached-task-context";
import type { PromptInputRunAccountPool } from "./prompt-input-run-account-pool";
import type {
  ModelPickerAgents,
  ModelSelectorCatalogState,
} from "./model-effort-selector";
import type { ModelSelectorOption } from "./model-selector";
import type { PromptInputProviderModeStatus } from "./prompt-input-provider-mode";
import type { PromptInputGoalStatus } from "./prompt-input-goal-status";
import type { PromptInputRuntimeStatusItem } from "./prompt-input-runtime-bar";
import type { LocalChangeReviewRequest } from "./local-change-review-dialog";

export interface PromptInputProps {
  value: string;
  minimal?: boolean;
  disabled?: boolean;
  isTurnActive?: boolean;
  /**
   * "steer-or-queue" offers the user an explicit choice per Codex CLI's
   * convention: one key steers into the live turn, the other explicitly
   * queues for after it finishes. Which key does which is controlled by
   * `steerQueueEnterAction`. Neither is a fallback for the other — see
   * `submitCurrentMessage`'s `intent` param.
   */
  submitMode?: "send" | "queue-next" | "steer-or-queue";
  promptBatch?: readonly PromptDraftBatchItem[];
  promptCommentShortcut?: PromptCommentShortcut;
  /**
   * Which key (Enter or Tab) steers vs queues in "steer-or-queue" mode.
   * Defaults to Enter=queue, Tab=steer.
   */
  steerQueueEnterAction?: SteerQueueEnterAction;
  focusToken?: string;
  selectedModel: ModelSelectorOption;
  modelOptions: readonly ModelSelectorOption[];
  modelCatalogs?: Partial<Record<ProviderId, ModelSelectorCatalogState>>;
  onRefreshModelCatalogs?: () => void;
  modelShortcutKeys?: readonly string[];
  modelShortcutEfforts?: readonly ModelShortcutEffort[];
  windowShortcutsEnabled?: boolean;
  attachedFilePaths: string[];
  attachments?: Attachment[];
  attachmentScopeId?: string;
  promptHistoryEntries?: readonly string[];
  promptSuggestions?: readonly string[];
  providerModeStatus?: PromptInputProviderModeStatus | null;
  providerModePresets?: readonly ProviderModePresetDefinition[];
  activeProviderModePresetId?: ProviderModePresetId | null;
  goalStatus?: PromptInputGoalStatus | null;
  contextMeter?: ReactNode;
  runAccountPool?: PromptInputRunAccountPool | null;
  /**
   * Wrap the raised card in the four-bar composer frame and move toolbar
   * controls into the side wings when the viewport is wide enough.
   */
  framed?: boolean;
  frameTop?: ReactNode;
  frameBottom?: ReactNode;
  runtimeStatusItems?: readonly PromptInputRuntimeStatusItem[];
  commandPaletteItems?: readonly CommandPaletteItem[];
  commandPaletteProviderNote?: CommandPaletteProviderNote;
  skillsEnabled?: boolean;
  skillsAutoSuggest?: boolean;
  skillPaletteItems?: readonly SkillCatalogEntry[];
  macros?: readonly Macro[];
  onMacroSelect?: (args: {
    macro: Macro;
    match: MacroTokenMatch | null;
    draftText: string;
  }) => { text: string; caretIndex: number; instantRun?: boolean } | null;
  workspaceInformationReferenceOptions?: readonly WorkspaceInformationReferenceOption[];
  /** Tasks `@` can attach as context, most recent first. */
  taskMentionOptions?: readonly TaskMentionOption[];
  /** Attach a task picked with `@` or dropped on the composer. */
  onAttachTask?: (task: { taskId: string; workspaceId: string; title: string }) => void;
  /** Documents from other workspaces `@` can attach as context, most recent first. */
  documentMentionOptions?: readonly DocumentMentionOption[];
  onAttachDocument?: (document: DocumentMentionOption) => void;
  onValueChange: (value: string) => void;
  onEnhancePrompt?: () => void | Promise<void>;
  promptEnhancementPending?: boolean;
  promptEnhancementRevealing?: boolean;
  promptEnhancementRevealVersion?: number;
  /** The draft the enhancement replaced; the reveal diffs against it. */
  promptEnhancementSourceText?: string;
  onPromptEnhancementRevealComplete?: () => void;
  onSuggestionSelect?: (suggestion: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onModelSelect: (args: {
    selection: ModelSelectorOption;
    effort?: Exclude<ModelShortcutEffort, "">;
    fastMode?: boolean;
  }) => void;
  onAttachFilesChange: (args: { filePaths: string[] }) => void;
  onOpenAttachedFile?: (args: { filePath: string }) => void | Promise<void>;
  onOpenFileSelector?: () => void;
  onAttachmentsChange?: (args: {
    attachments: Attachment[] | ((current: Attachment[]) => Attachment[]);
  }) => void;
  onPasteFiles?: (args: { files: File[] }) => void | Promise<void>;
  onProviderModeSelect?: (presetId: ProviderModePresetId) => void;
  effortLabel?: string;
  effortValue?: string;
  fastMode?: boolean;
  onFastModeChange?: (enabled: boolean) => void;
  thinkingMode?: "adaptive" | "enabled" | "disabled";
  onThinkingModeChange?: (value: "adaptive" | "enabled" | "disabled") => void;
  pendingUserInput?: { messageId: string; part: UserInputPart } | null;
  /** Answers name their request, like approvals do. */
  onUserInputSubmit?: (args: {
    messageId: string;
    requestId: string;
    answers: Record<string, string>;
  }) => void;
  onUserInputDeny?: (args: { messageId: string; requestId: string }) => void;
  /**
   * Agents offered inside the model picker, which splits into agent and model
   * segments while an agent runs the task. Absent where the picker lists
   * models only; no control moves.
   */
  modelPickerAgents?: ModelPickerAgents;
  /** The next send assigns the task's agent: the send button reads Assign, then Send. */
  assignOnSend?: boolean;
  /**
   * Secrets and Compare are separate slots rather than one fragment: placement
   * is per-control, and a fragment cannot be routed to two different
   * containers.
   */
  secretsControl?: ReactNode;
  secretsActive?: boolean;
  macroControl?: ReactNode;
  /**
   * Saved macros as one-click entries for the left wing. Framed layout only —
   * the classic toolbar reaches them through the Macros control.
   */
  macroQuickPicks?: ReactNode;
  compareControl?: ReactNode;
  composerControlPlacements?: ComposerControlPlacements;
  onComposerControlPlacementsChange?: (next: ComposerControlPlacements) => void;
  workspaceCwd?: string;
  reviewModelOptions?: readonly ModelSelectorOption[];
  preferredReviewModelKey?: string;
  onLocalChangeReview?: (
    request: LocalChangeReviewRequest,
  ) => boolean | Promise<boolean>;
  onSubmit: (args: {
    text: string;
    filePaths: string[];
    /** Present only in "steer-or-queue" mode; which key the user pressed. */
    intent?: "steer" | "queue";
  }) => void | Promise<void>;
  onStagePromptBatch?: () => void;
  onRemovePromptBatchItem?: (args: { itemId: string }) => void;
  onAbort?: () => void;
}
