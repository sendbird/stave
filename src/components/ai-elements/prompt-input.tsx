import {
  Brain,
  ClipboardCheck,
  FileText,
  FolderOpen,
  Globe2,
  Info,
  Paperclip,
  Pencil,
  Send,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import type {
  Attachment,
  PromptDraftBatchItem,
  PromptDraftQueuedTurn,
  PromptDraftQueuedNextTurn,
  UserInputPart,
} from "@/types/chat";
import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Badge,
  BorderBeam,
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  ImageLightbox,
  Input,
  Kbd,
  KbdGroup,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverTrigger,
  PopoverTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  buttonVariants,
  toast,
} from "@/components/ui";
import { useAppStore } from "@/store/app.store";
import { UserInputCard } from "./user-input-card";
import type {
  CommandPaletteItem,
  CommandPaletteProviderNote,
  SlashCommandTokenMatch,
} from "@/lib/commands";
import type {
  ProviderModePresetDefinition,
  ProviderModePresetId,
} from "@/lib/providers/provider-mode-presets";
import {
  filterCommandPaletteItems,
  getActiveSlashCommandTokenMatch,
  replaceSlashCommandToken,
} from "@/lib/commands";
import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import {
  filterSkillEntries,
  getActiveSkillTokenMatch,
  replaceSkillToken,
} from "@/lib/skills/catalog";
import type { SkillCatalogEntry, SkillTokenMatch } from "@/lib/skills/types";
import { cn } from "@/lib/utils";
import {
  collectClipboardFiles,
  mergeClipboardImageAttachments,
  partitionClipboardFiles,
} from "./prompt-input.clipboard";
import {
  getAcceptedCommandPaletteItem,
  getAcceptedPaletteItem,
  getNextCommandSelectionIndex,
  isPromptHistoryBoundaryReached,
  navigatePromptHistory,
  NO_COMMAND_SELECTION,
  NO_PROMPT_HISTORY_SELECTION,
} from "./prompt-input.utils";
import {
  findModelShortcutEffort,
  findModelShortcutOption,
  resolveModelShortcutSlot,
  type ModelShortcutEffort,
} from "@/lib/providers/model-shortcuts";
import {
  DEFAULT_PROMPT_COMMENT_SHORTCUT,
  isPromptCommentShortcut,
  type PromptCommentShortcut,
} from "@/lib/prompt-comment-shortcuts";
import {
  DEFAULT_STEER_QUEUE_ENTER_ACTION,
  formatSteerQueueEnterActionLabel,
  tabActionForSteerQueueEnterAction,
  type SteerQueueEnterAction,
} from "@/lib/steer-queue-shortcuts";
import type {
  LensAnnotationFeedback,
  LensAnnotation,
  LensStyleEdit,
  LensSourceMappingConfig,
} from "@/lib/lens/lens.types";
import {
  LENS_FEEDBACK_INTENTS,
  LENS_FEEDBACK_PRIORITIES,
} from "@/lib/lens/lens.types";
import {
  buildLensAnnotationsAttachment,
  getLensCommentImageId,
  isAnyLensCommentImageAttachment,
  removeLensCommentImageAttachments,
} from "@/lib/lens/lens-annotation-attachment";
import { resolveLensAnnotationReview } from "@/lib/lens/lens-element-message";
import { ModelEffortSelector } from "./model-effort-selector";
import type { ModelSelectorOption } from "./model-selector";
import {
  PromptInputProviderModePill,
  type PromptInputProviderModeStatus,
} from "./prompt-input-provider-mode";
import {
  PromptInputGoalStatusStrip,
  type PromptInputGoalStatus,
} from "./prompt-input-goal-status";
import {
  getPromptInputRuntimeProfile,
  PromptInputRuntimeBar,
  type PromptInputRuntimeProfile,
  type PromptInputRuntimeStatusItem,
} from "./prompt-input-runtime-bar";
import { ModelIcon } from "./model-icon";
import { Suggestion, Suggestions } from "./suggestion";
import {
  PromptLexicalEditor,
  type PromptLexicalEditorHandle,
  type PromptLexicalEditorSelectionRange,
} from "./prompt-lexical-editor";
import { hasPromptSubmitPayload } from "./prompt-input-submit";
import {
  getActiveWorkspaceInformationTokenMatch,
  replaceWorkspaceInformationToken,
  type WorkspaceInformationReferenceOption,
} from "@/lib/workspace-information-references";
import { WorkspaceInformationReferenceChip } from "@/components/workspace-information-reference-chip";
import {
  LocalChangeReviewDialog,
  type LocalChangeReviewRequest,
} from "./local-change-review-dialog";
import { useIsMobile } from "@/hooks/use-mobile";

const LENS_ANNOTATION_STYLE_FIELDS = [
  "fontSize",
  "fontWeight",
  "color",
  "backgroundColor",
  "padding",
  "margin",
] as const;

interface PromptInputProps {
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
  queuedNextTurn?: PromptDraftQueuedNextTurn | null;
  queuedTurns?: readonly PromptDraftQueuedTurn[];
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
  modelShortcutKeys?: readonly string[];
  modelShortcutEfforts?: readonly ModelShortcutEffort[];
  windowShortcutsEnabled?: boolean;
  attachedFilePaths: string[];
  attachments?: Attachment[];
  promptHistoryEntries?: readonly string[];
  promptSuggestions?: readonly string[];
  providerModeStatus?: PromptInputProviderModeStatus | null;
  providerModePresets?: readonly ProviderModePresetDefinition[];
  activeProviderModePresetId?: ProviderModePresetId | null;
  goalStatus?: PromptInputGoalStatus | null;
  runtimeStatusItems?: readonly PromptInputRuntimeStatusItem[];
  commandPaletteItems?: readonly CommandPaletteItem[];
  commandPaletteProviderNote?: CommandPaletteProviderNote;
  skillsEnabled?: boolean;
  skillsAutoSuggest?: boolean;
  skillPaletteItems?: readonly SkillCatalogEntry[];
  workspaceInformationReferenceOptions?: readonly WorkspaceInformationReferenceOption[];
  onValueChange: (value: string) => void;
  onSuggestionSelect?: (suggestion: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onModelSelect: (args: {
    selection: ModelSelectorOption;
    effort?: Exclude<ModelShortcutEffort, "">;
    fastMode?: boolean;
  }) => void;
  onAttachFilesChange: (args: { filePaths: string[] }) => void;
  onOpenFileSelector?: () => void;
  onAttachmentsChange?: (args: { attachments: Attachment[] }) => void;
  onPasteFiles?: (args: { files: File[] }) => void | Promise<void>;
  onProviderModeSelect?: (presetId: ProviderModePresetId) => void;
  effortLabel?: string;
  effortValue?: string;
  fastMode?: boolean;
  onFastModeChange?: (enabled: boolean) => void;
  planMode?: boolean;
  onPlanModeChange?: (enabled: boolean) => void;
  thinkingMode?: "adaptive" | "enabled" | "disabled";
  onThinkingModeChange?: (value: "adaptive" | "enabled" | "disabled") => void;
  pendingUserInput?: { messageId: string; part: UserInputPart } | null;
  onUserInputSubmit?: (args: {
    messageId: string;
    answers: Record<string, string>;
  }) => void;
  onUserInputDeny?: (args: { messageId: string }) => void;
  /**
   * Advisor arming control. A slot rather than typed props because it is driven
   * entirely by task-scoped store state, and it renders during an active turn
   * (unlike `beforeRuntimeAction`) so a blocked turn stays explainable.
   */
  advisorControl?: ReactNode;
  beforeRuntimeAction?: ReactNode;
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
  onUpdateQueuedTurn?: (args: { itemId: string; content: string }) => void;
  onRemoveQueuedTurn?: (args: { itemId: string }) => void;
  /**
   * Dispatch one queued turn immediately. Only offered while the composer is
   * in plain "send" mode (idle or stalled turn) — during an active turn the
   * queue drains automatically on completion instead.
   */
  onSendQueuedTurn?: (args: { itemId: string }) => void;
  onClearQueuedNextTurn?: () => void;
  onAbort?: () => void;
}

const PALETTE_ITEM_INDEX_ATTRIBUTE = "data-palette-index";
const PROMPT_SURFACE_FOCUS_VISIBLE_RESET =
  "focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0";
type WorkspaceInformationTokenMatch = NonNullable<
  ReturnType<typeof getActiveWorkspaceInformationTokenMatch>
>;
const PROMPT_SURFACE_PRIMARY_FOCUS = `${PROMPT_SURFACE_FOCUS_VISIBLE_RESET} focus-visible:border-transparent`;
const PROMPT_FLOATING_SURFACE =
  "border border-border/60 bg-background/90 text-foreground hover:bg-background/95";
const PROMPT_TOOLBAR_BUTTON = `${PROMPT_SURFACE_FOCUS_VISIBLE_RESET} h-9 rounded-md border border-transparent bg-transparent px-2.5 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground`;
const PROMPT_TOOLBAR_ICON_BUTTON = `${PROMPT_SURFACE_FOCUS_VISIBLE_RESET} rounded-md border border-transparent bg-transparent p-0 text-muted-foreground hover:bg-muted/60 hover:text-foreground`;

function tooltipTriggerButtonClassName(args: {
  variant?:
    "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
  size?:
    "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";
  className?: string;
}) {
  return buttonVariants({
    variant: args.variant ?? "ghost",
    size: args.size ?? "sm",
    className: args.className,
  });
}

function getPromptToolbarAccentClass(tone: "plan" | "thinking") {
  if (tone === "thinking")
    return "text-prompt-role-thinking hover:text-prompt-role-thinking";
  return "text-prompt-role-plan hover:text-prompt-role-plan";
}

function getRuntimeProfileToneClass(tone: PromptInputRuntimeProfile["tone"]) {
  if (tone === "warning") {
    return "text-warning";
  }
  if (tone === "custom") {
    return "text-primary";
  }
  return "text-success";
}

function PromptInputRuntimeTriggerIcon(args: {
  profile: PromptInputRuntimeProfile;
}) {
  return (
    <span className="relative inline-flex size-4 items-center justify-center">
      <SlidersHorizontal aria-hidden="true" className="size-4" />
      <span
        aria-hidden="true"
        className={cn(
          "absolute -right-1 -top-1 size-2 rounded-full border-2 border-card",
          args.profile.tone === "warning"
            ? "bg-warning"
            : args.profile.tone === "custom"
              ? "bg-primary"
              : "bg-success",
        )}
      />
      <span className="sr-only">Runtime profile: {args.profile.label}</span>
    </span>
  );
}

function getPaletteItemSelector(index: number) {
  return `[${PALETTE_ITEM_INDEX_ATTRIBUTE}="${index}"]`;
}

function resolveLensAnnotationStyleValue(
  annotation: LensAnnotation,
  field: (typeof LENS_ANNOTATION_STYLE_FIELDS)[number],
): string {
  const edit = annotation.styleEdits
    ?.slice()
    .reverse()
    .find((candidate) => candidate.property === field);
  return edit?.after ?? annotation.computedStyles?.[field] ?? "";
}

function LensAnnotationStylePopover(args: {
  annotation: LensAnnotation;
  disabled: boolean;
  onApply: (
    annotation: LensAnnotation,
    patch: Record<string, string>,
  ) => Promise<void>;
}) {
  const { annotation, disabled, onApply } = args;
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const field of LENS_ANNOTATION_STYLE_FIELDS) {
      next[field] = resolveLensAnnotationStyleValue(annotation, field);
    }
    setDraft(next);
  }, [annotation]);

  const patch = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(draft).filter(([field, value]) => {
          const trimmed = value.trim();
          return (
            trimmed !== "" &&
            trimmed !==
              resolveLensAnnotationStyleValue(
                annotation,
                field as (typeof LENS_ANNOTATION_STYLE_FIELDS)[number],
              )
          );
        }),
      ),
    [annotation, draft],
  );

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            disabled={disabled || !annotation.selector}
            aria-label={`Edit styles for comment ${annotation.pin}`}
          />
        }
      >
        <SlidersHorizontal className="size-3" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <div>
          <PopoverTitle>Style</PopoverTitle>
          <PopoverDescription>
            Live inline edits for the selected element.
          </PopoverDescription>
        </div>
        <div className="grid gap-2">
          {LENS_ANNOTATION_STYLE_FIELDS.map((field) => (
            <label key={field} className="grid gap-1 text-xs">
              <span className="font-medium text-muted-foreground">{field}</span>
              <Input
                value={draft[field] ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    [field]: event.target.value,
                  }))
                }
                className="h-7 font-mono text-xs"
              />
            </label>
          ))}
        </div>
        <Button
          type="button"
          size="xs"
          className="w-full"
          disabled={saving || Object.keys(patch).length === 0}
          onClick={() => {
            setSaving(true);
            void onApply(annotation, patch).finally(() => setSaving(false));
          }}
        >
          Apply
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function formatLensFeedbackOption(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function LensAnnotationFeedbackPopover(args: {
  annotation: LensAnnotation;
  disabled: boolean;
  onApply: (
    annotation: LensAnnotation,
    feedback: LensAnnotationFeedback,
  ) => void;
}) {
  const { annotation, disabled, onApply } = args;
  const feedback = resolveLensAnnotationReview(annotation).feedback;
  const [intent, setIntent] = useState(feedback.intent);
  const [priority, setPriority] = useState(feedback.priority);

  useEffect(() => {
    setIntent(feedback.intent);
    setPriority(feedback.priority);
  }, [feedback.intent, feedback.priority]);

  const changed =
    intent !== feedback.intent || priority !== feedback.priority;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            disabled={disabled}
            aria-label={`Edit intent and priority for comment ${annotation.pin}`}
          />
        }
      >
        <Pencil className="size-3" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3">
        <div>
          <PopoverTitle>Review details</PopoverTitle>
          <PopoverDescription>
            Set what this comment asks for and how urgent it is.
          </PopoverDescription>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-xs">
            <span className="font-medium text-muted-foreground">Intent</span>
            <Select value={intent} onValueChange={setIntent}>
              <SelectTrigger
                size="sm"
                className="w-full"
                aria-label={`Intent for comment ${annotation.pin}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                {LENS_FEEDBACK_INTENTS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {formatLensFeedbackOption(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="grid gap-1 text-xs">
            <span className="font-medium text-muted-foreground">Priority</span>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger
                size="sm"
                className="w-full"
                aria-label={`Priority for comment ${annotation.pin}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                {LENS_FEEDBACK_PRIORITIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {formatLensFeedbackOption(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
        <Button
          type="button"
          size="xs"
          className="w-full"
          disabled={!changed}
          onClick={() =>
            onApply(annotation, {
              ...feedback,
              intent,
              priority,
            })
          }
        >
          Apply
        </Button>
      </PopoverContent>
    </Popover>
  );
}

export function PromptInput(args: PromptInputProps) {
  const {
    disabled,
    minimal = false,
    isTurnActive,
    submitMode = "send",
    queuedNextTurn,
    queuedTurns = [],
    promptBatch = [],
    promptCommentShortcut = DEFAULT_PROMPT_COMMENT_SHORTCUT,
    steerQueueEnterAction = DEFAULT_STEER_QUEUE_ENTER_ACTION,
    focusToken,
    value,
    selectedModel,
    modelOptions,
    modelShortcutKeys,
    modelShortcutEfforts,
    windowShortcutsEnabled = true,
    attachedFilePaths,
    attachments,
    promptHistoryEntries,
    promptSuggestions,
    providerModeStatus,
    providerModePresets,
    activeProviderModePresetId,
    goalStatus,
    runtimeStatusItems,
    commandPaletteItems,
    commandPaletteProviderNote,
    skillsEnabled,
    skillsAutoSuggest,
    skillPaletteItems,
    workspaceInformationReferenceOptions,
    onValueChange,
    onSuggestionSelect,
    onFocus,
    onBlur,
    onModelSelect,
    onAttachFilesChange,
    onOpenFileSelector,
    onAttachmentsChange,
    onPasteFiles,
    onProviderModeSelect,
    effortLabel,
    effortValue,
    fastMode,
    onFastModeChange,
    planMode,
    onPlanModeChange,
    thinkingMode,
    onThinkingModeChange,
    pendingUserInput,
    onUserInputSubmit,
    onUserInputDeny,
    advisorControl,
    beforeRuntimeAction,
    workspaceCwd,
    reviewModelOptions,
    preferredReviewModelKey,
    onLocalChangeReview,
    onSubmit,
    onStagePromptBatch,
    onRemovePromptBatchItem,
    onUpdateQueuedTurn,
    onRemoveQueuedTurn,
    onSendQueuedTurn,
    onClearQueuedNextTurn,
    onAbort,
  } = args;
  const isMobile = useIsMobile();
  const legacyQueuedTurns = useMemo<readonly PromptDraftQueuedTurn[]>(
    () =>
      queuedNextTurn?.content?.trim()
        ? [
            {
              id: `legacy-${queuedNextTurn.queuedAt}`,
              queuedAt: queuedNextTurn.queuedAt,
              sourceTurnId: queuedNextTurn.sourceTurnId,
              content: queuedNextTurn.content,
              attachedFilePaths: [],
              attachments: [],
            },
          ]
        : [],
    [queuedNextTurn],
  );
  const visibleQueuedTurns =
    queuedTurns.length > 0 ? queuedTurns : legacyQueuedTurns;
  const imageAttachments = useMemo(
    () =>
      (attachments ?? []).filter(
        (a): a is Extract<Attachment, { kind: "image" }> => a.kind === "image",
      ),
    [attachments],
  );
  const standaloneImageAttachments = useMemo(
    () => imageAttachments.filter((a) => !isAnyLensCommentImageAttachment(a)),
    [imageAttachments],
  );
  const imageAttachmentsById = useMemo(
    () =>
      new Map(
        imageAttachments.map((attachment) => [attachment.id, attachment]),
      ),
    [imageAttachments],
  );
  const lensAnnotationAttachments = useMemo(
    () =>
      (attachments ?? []).filter(
        (
          attachment,
        ): attachment is Extract<Attachment, { kind: "lens-annotations" }> =>
          attachment.kind === "lens-annotations",
      ),
    [attachments],
  );
  const workspaceInformationAttachments = useMemo(
    () =>
      (attachments ?? []).filter(
        (
          attachment,
        ): attachment is Extract<
          Attachment,
          { kind: "workspace-information" }
        > => attachment.kind === "workspace-information",
      ),
    [attachments],
  );
  const queuedFileCount = visibleQueuedTurns.reduce(
    (count, item) => count + item.attachedFilePaths.length,
    0,
  );
  const queuedImageCount = visibleQueuedTurns.reduce(
    (count, item) =>
      count +
      item.attachments.filter((attachment) => attachment.kind === "image")
        .length,
    0,
  );
  const lensCommentCount = lensAnnotationAttachments.reduce(
    (count, attachment) =>
      count + (attachment.annotations?.length ?? attachment.count),
    0,
  );
  const commentItemCount = promptBatch.length + lensCommentCount;
  const [imagePreviewSrc, setImagePreviewSrc] = useState<{
    dataUrl: string;
    label: string;
  } | null>(null);
  const [dismissedCommandToken, setDismissedCommandToken] = useState<
    string | null
  >(null);
  const [suppressedAutocompleteValue, setSuppressedAutocompleteValue] =
    useState<{ palette: "command" | "skill" | "info"; value: string } | null>(
      null,
    );
  const [selectedCommandIndex, setSelectedCommandIndex] =
    useState(NO_COMMAND_SELECTION);
  const [dismissedSkillToken, setDismissedSkillToken] = useState<string | null>(
    null,
  );
  const [selectedSkillIndex, setSelectedSkillIndex] =
    useState(NO_COMMAND_SELECTION);
  const [
    dismissedWorkspaceInformationToken,
    setDismissedWorkspaceInformationToken,
  ] = useState<string | null>(null);
  const [
    selectedWorkspaceInformationIndex,
    setSelectedWorkspaceInformationIndex,
  ] = useState(NO_COMMAND_SELECTION);
  const [selectedPromptHistoryIndex, setSelectedPromptHistoryIndex] = useState(
    NO_PROMPT_HISTORY_SELECTION,
  );
  const [draftBeforeHistory, setDraftBeforeHistory] = useState("");
  const [caretIndex, setCaretIndex] = useState(value.length);
  const editorSelectionRange = useMemo(
    () => ({ start: caretIndex, end: caretIndex }),
    [caretIndex],
  );
  const [isPromptInputFocused, setIsPromptInputFocused] = useState(false);
  const [modelSelectorOpenNonce, setModelSelectorOpenNonce] = useState(0);
  const [editingQueuedTurnId, setEditingQueuedTurnId] = useState<string | null>(
    null,
  );
  const [editingQueuedTurnContent, setEditingQueuedTurnContent] = useState("");
  const promptEditorRef = useRef<PromptLexicalEditorHandle | null>(null);
  const valueRef = useRef(value);
  const caretIndexRef = useRef(caretIndex);
  const pendingCommandTokenRef = useRef<SlashCommandTokenMatch | null>(null);
  const pendingSkillTokenRef = useRef<SkillTokenMatch | null>(null);
  const pendingWorkspaceInformationTokenRef =
    useRef<WorkspaceInformationTokenMatch | null>(null);
  const textareaAutosizeFrameRef = useRef<number | null>(null);
  const commandListRef = useRef<HTMLDivElement | null>(null);
  const wasTurnActiveRef = useRef(Boolean(isTurnActive));
  valueRef.current = value;
  caretIndexRef.current = caretIndex;
  const borderBeamEnabled = useAppStore(
    (state) => state.settings.borderBeamEnabled,
  );
  const borderBeamSize = useAppStore((state) => state.settings.borderBeamSize);
  const borderBeamVariant = useAppStore(
    (state) => state.settings.borderBeamVariant,
  );
  const borderBeamStrength = useAppStore(
    (state) => state.settings.borderBeamStrength,
  );
  const lensSourceMappingHeuristic = useAppStore(
    (state) => state.settings.lensSourceMappingHeuristic,
  );
  const lensSourceMappingReactDebugSource = useAppStore(
    (state) => state.settings.lensSourceMappingReactDebugSource,
  );
  const lensSourceMappingConfig = useMemo(
    (): LensSourceMappingConfig => ({
      heuristic: lensSourceMappingHeuristic,
      reactDebugSource: lensSourceMappingReactDebugSource,
    }),
    [lensSourceMappingHeuristic, lensSourceMappingReactDebugSource],
  );
  const showBorderBeam = borderBeamEnabled && !minimal && Boolean(isTurnActive);
  const interactionsDisabled = Boolean(disabled);
  const hasDraftPayload =
    value.trim().length > 0 ||
    attachedFilePaths.length > 0 ||
    imageAttachments.length > 0 ||
    lensAnnotationAttachments.length > 0 ||
    workspaceInformationAttachments.length > 0 ||
    promptBatch.length > 0;
  const primaryActionDisabled = Boolean(disabled || !hasDraftPayload);
  const isQueueNextMode = submitMode === "queue-next";
  const isSteerOrQueueMode = submitMode === "steer-or-queue";
  // Manual queued-turn dispatch is only offered in plain "send" mode (no live
  // turn, or a stalled one about to be replaced) and only for store-backed
  // queue items — the legacy single-item fallback has no dispatchable id.
  const canSendQueuedTurnNow =
    Boolean(onSendQueuedTurn) &&
    submitMode === "send" &&
    !interactionsDisabled &&
    queuedTurns.length > 0;
  const modifierLabel = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      /(Mac|iPhone|iPad)/i.test(navigator.platform || navigator.userAgent)
        ? "Cmd"
        : "Ctrl",
    [],
  );
  const maxTextareaHeight = 240;
  const normalizedPromptHistoryEntries = useMemo(
    () =>
      (promptHistoryEntries ?? []).filter((entry) => entry.trim().length > 0),
    [promptHistoryEntries],
  );
  const activeCommandToken = useMemo(
    () =>
      getActiveSlashCommandTokenMatch({
        value,
        caretIndex,
      }),
    [caretIndex, value],
  );
  const deferredCommandQuery = useDeferredValue(
    activeCommandToken?.query ?? "",
  );
  const activeSkillToken = useMemo(
    () =>
      skillsEnabled
        ? getActiveSkillTokenMatch({
            value,
            caretIndex,
          })
        : null,
    [caretIndex, skillsEnabled, value],
  );
  const activeWorkspaceInformationToken = useMemo(
    () =>
      getActiveWorkspaceInformationTokenMatch({
        text: value,
        caretIndex,
      }),
    [caretIndex, value],
  );
  const deferredWorkspaceInformationQuery = useDeferredValue(
    activeWorkspaceInformationToken?.query ?? "",
  );
  const filteredCommandItems = useMemo(
    () =>
      filterCommandPaletteItems({
        items: commandPaletteItems ?? [],
        query: deferredCommandQuery,
      }),
    [commandPaletteItems, deferredCommandQuery],
  );
  const filteredSkillItems = useMemo(
    () =>
      filterSkillEntries({
        skills: skillPaletteItems ?? [],
        providerId: selectedModel.providerId,
        query: activeSkillToken?.query ?? "",
      }),
    [activeSkillToken?.query, selectedModel.providerId, skillPaletteItems],
  );
  const filteredWorkspaceInformationItems = useMemo(() => {
    const query = deferredWorkspaceInformationQuery.trim().toLowerCase();
    const items = workspaceInformationReferenceOptions ?? [];
    if (!query) {
      return items;
    }
    return items.filter((item) => item.searchText.includes(query));
  }, [deferredWorkspaceInformationQuery, workspaceInformationReferenceOptions]);
  const indexedCommandItems = useMemo(
    () => filteredCommandItems.map((item, index) => ({ item, index })),
    [filteredCommandItems],
  );
  const indexedSkillItems = useMemo(
    () => filteredSkillItems.map((item, index) => ({ item, index })),
    [filteredSkillItems],
  );
  const indexedWorkspaceInformationItems = useMemo(
    () =>
      filteredWorkspaceInformationItems.map((item, index) => ({
        item,
        index,
      })),
    [filteredWorkspaceInformationItems],
  );
  const providerCommandItems = useMemo(
    () =>
      indexedCommandItems.filter(
        ({ item }) => item.source === "provider_native",
      ),
    [indexedCommandItems],
  );
  const localSkillItems = useMemo(
    () => indexedSkillItems.filter(({ item }) => item.scope === "local"),
    [indexedSkillItems],
  );
  const userSkillItems = useMemo(
    () => indexedSkillItems.filter(({ item }) => item.scope === "user"),
    [indexedSkillItems],
  );
  const globalSkillItems = useMemo(
    () => indexedSkillItems.filter(({ item }) => item.scope === "global"),
    [indexedSkillItems],
  );
  const workspaceInformationSectionItems = useMemo(
    () =>
      indexedWorkspaceInformationItems.filter(
        ({ item }) => item.kind === "section",
      ),
    [indexedWorkspaceInformationItems],
  );
  const workspaceInformationEntryItems = useMemo(
    () =>
      indexedWorkspaceInformationItems.filter(
        ({ item }) => item.kind === "item",
      ),
    [indexedWorkspaceInformationItems],
  );
  const commandPaletteOpen = Boolean(
    activeCommandToken &&
    !(
      suppressedAutocompleteValue?.palette === "command" &&
      suppressedAutocompleteValue.value === value
    ) &&
    dismissedCommandToken !== activeCommandToken.token &&
    (filteredCommandItems.length > 0 || commandPaletteProviderNote),
  );
  const skillPaletteOpen = Boolean(
    skillsEnabled &&
    skillsAutoSuggest &&
    activeSkillToken &&
    !(
      suppressedAutocompleteValue?.palette === "skill" &&
      suppressedAutocompleteValue.value === value
    ) &&
    dismissedSkillToken !== activeSkillToken.token,
  );
  const workspaceInformationPaletteOpen = Boolean(
    activeWorkspaceInformationToken &&
    !(
      suppressedAutocompleteValue?.palette === "info" &&
      suppressedAutocompleteValue.value === value
    ) &&
    dismissedWorkspaceInformationToken !==
      activeWorkspaceInformationToken.token,
  );
  const activePalette = workspaceInformationPaletteOpen
    ? "info"
    : skillPaletteOpen
      ? "skill"
      : commandPaletteOpen
        ? "command"
        : null;
  const paletteValue = useMemo(() => {
    if (
      activePalette === "info" &&
      selectedWorkspaceInformationIndex !== NO_COMMAND_SELECTION
    ) {
      return (
        filteredWorkspaceInformationItems[selectedWorkspaceInformationIndex]
          ?.reference.token ?? ""
      );
    }
    if (
      activePalette === "skill" &&
      selectedSkillIndex !== NO_COMMAND_SELECTION
    ) {
      return filteredSkillItems[selectedSkillIndex]?.slug ?? "";
    }
    if (
      activePalette === "command" &&
      selectedCommandIndex !== NO_COMMAND_SELECTION
    ) {
      return filteredCommandItems[selectedCommandIndex]?.command ?? "";
    }
    return "";
  }, [
    activePalette,
    selectedWorkspaceInformationIndex,
    selectedSkillIndex,
    selectedCommandIndex,
    filteredWorkspaceInformationItems,
    filteredSkillItems,
    filteredCommandItems,
  ]);
  const hasRuntimeContent = Boolean((runtimeStatusItems?.length ?? 0) > 0);
  const runtimeProfile = useMemo(
    () => getPromptInputRuntimeProfile(runtimeStatusItems ?? []),
    [runtimeStatusItems],
  );
  const shouldShowFocusHint =
    !minimal &&
    !isPromptInputFocused &&
    !interactionsDisabled &&
    !hasDraftPayload &&
    visibleQueuedTurns.length === 0 &&
    promptBatch.length === 0;

  useEffect(() => {
    const editorElement = promptEditorRef.current?.getRootElement();
    if (!editorElement) return;
    const measureHeight = () => {
      editorElement.style.height = "auto";
      const scrollHeight = editorElement.scrollHeight;
      const nextHeight = Math.min(scrollHeight, maxTextareaHeight);
      const nextOverflowY =
        scrollHeight > maxTextareaHeight ? "auto" : "hidden";
      if (editorElement.style.height !== `${nextHeight}px`) {
        editorElement.style.height = `${nextHeight}px`;
      }
      if (editorElement.style.overflowY !== nextOverflowY) {
        editorElement.style.overflowY = nextOverflowY;
      }
      textareaAutosizeFrameRef.current = null;
    };
    textareaAutosizeFrameRef.current =
      window.requestAnimationFrame(measureHeight);
    return () => {
      if (textareaAutosizeFrameRef.current !== null) {
        window.cancelAnimationFrame(textareaAutosizeFrameRef.current);
        textareaAutosizeFrameRef.current = null;
      }
    };
  }, [value, maxTextareaHeight]);

  useEffect(() => {
    if (interactionsDisabled) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      promptEditorRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [focusToken, interactionsDisabled]);

  useEffect(() => {
    const wasTurnActive = wasTurnActiveRef.current;
    const isTurnNowActive = Boolean(isTurnActive);
    if (wasTurnActive && !isTurnNowActive) {
      promptEditorRef.current?.focus();
    }
    wasTurnActiveRef.current = isTurnNowActive;
  }, [isTurnActive]);

  const focusComposer = useCallback(() => {
    const editor = promptEditorRef.current;
    if (!editor) {
      return;
    }
    editor.focus();
    const nextCaretIndex = value.length;
    editor.setSelectionRange(nextCaretIndex, nextCaretIndex);
    caretIndexRef.current = nextCaretIndex;
    setCaretIndex(nextCaretIndex);
  }, [value.length]);

  const syncComposerFocus = useCallback(() => {
    const rootElement = promptEditorRef.current?.getRootElement();
    setIsPromptInputFocused(
      typeof document !== "undefined" &&
        Boolean(
          rootElement &&
          document.activeElement &&
          rootElement.contains(document.activeElement),
        ),
    );
  }, []);

  const handleShiftTabShortcut = useCallback(
    (event: KeyboardEvent | ReactKeyboardEvent<HTMLElement>) => {
      if (
        event.key !== "Tab" ||
        !event.shiftKey ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return false;
      }

      if (!onPlanModeChange) {
        return false;
      }

      event.preventDefault();
      onPlanModeChange(!planMode);
      return true;
    },
    [onPlanModeChange, planMode],
  );

  useEffect(() => {
    if (interactionsDisabled || !windowShortcutsEnabled) {
      return;
    }

    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      if (handleShiftTabShortcut(event)) {
        return;
      }

      const hasMod = event.ctrlKey || event.metaKey;
      if (
        hasMod &&
        !event.altKey &&
        !event.shiftKey &&
        (event.key.toLowerCase() === "l" || event.key.toLowerCase() === "j")
      ) {
        const rootElement = promptEditorRef.current?.getRootElement();
        if (
          !rootElement ||
          (document.activeElement &&
            rootElement.contains(document.activeElement))
        ) {
          return;
        }
        event.preventDefault();
        focusComposer();
        return;
      }

      const isAltP =
        !event.ctrlKey &&
        !event.metaKey &&
        event.altKey &&
        !event.shiftKey &&
        (event.code === "KeyP" || event.key.toLowerCase() === "p");
      if (isAltP) {
        event.preventDefault();
        setModelSelectorOpenNonce((current) => current + 1);
        return;
      }

      const modelShortcutSlot = resolveModelShortcutSlot({
        key: event.key,
        code: event.code,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
      });
      if (modelShortcutSlot === null) {
        return;
      }

      const shortcutOption = findModelShortcutOption({
        slotIndex: modelShortcutSlot,
        shortcutKeys: modelShortcutKeys,
        options: modelOptions,
      });
      if (!shortcutOption) {
        return;
      }

      event.preventDefault();
      onModelSelect({
        selection: shortcutOption,
        effort: findModelShortcutEffort({
          slotIndex: modelShortcutSlot,
          shortcutKeys: modelShortcutKeys,
          shortcutEfforts: modelShortcutEfforts,
        }),
      });
      window.requestAnimationFrame(() => focusComposer());
    };

    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [
    focusComposer,
    handleShiftTabShortcut,
    interactionsDisabled,
    modelOptions,
    modelShortcutEfforts,
    modelShortcutKeys,
    onModelSelect,
    windowShortcutsEnabled,
  ]);

  useEffect(() => {
    setSelectedPromptHistoryIndex(NO_PROMPT_HISTORY_SELECTION);
    setDraftBeforeHistory("");
  }, [focusToken]);

  useEffect(() => {
    if (selectedPromptHistoryIndex === NO_PROMPT_HISTORY_SELECTION) {
      return;
    }
    if (normalizedPromptHistoryEntries.length === 0) {
      setSelectedPromptHistoryIndex(NO_PROMPT_HISTORY_SELECTION);
      setDraftBeforeHistory("");
      return;
    }
    if (selectedPromptHistoryIndex >= normalizedPromptHistoryEntries.length) {
      setSelectedPromptHistoryIndex(normalizedPromptHistoryEntries.length - 1);
    }
  }, [normalizedPromptHistoryEntries.length, selectedPromptHistoryIndex]);

  useEffect(() => {
    if (
      suppressedAutocompleteValue &&
      suppressedAutocompleteValue.value !== value
    ) {
      setSuppressedAutocompleteValue(null);
    }
  }, [suppressedAutocompleteValue, value]);

  useEffect(() => {
    if (
      dismissedCommandToken &&
      activeCommandToken?.token !== dismissedCommandToken
    ) {
      setDismissedCommandToken(null);
    }
  }, [activeCommandToken?.token, dismissedCommandToken]);

  useEffect(() => {
    if (
      dismissedSkillToken &&
      activeSkillToken?.token !== dismissedSkillToken
    ) {
      setDismissedSkillToken(null);
    }
  }, [activeSkillToken?.token, dismissedSkillToken]);

  useEffect(() => {
    if (
      dismissedWorkspaceInformationToken &&
      activeWorkspaceInformationToken?.token !==
        dismissedWorkspaceInformationToken
    ) {
      setDismissedWorkspaceInformationToken(null);
    }
  }, [
    activeWorkspaceInformationToken?.token,
    dismissedWorkspaceInformationToken,
  ]);

  useEffect(() => {
    setSelectedCommandIndex(NO_COMMAND_SELECTION);
  }, [activeCommandToken?.token]);

  useEffect(() => {
    setSelectedSkillIndex(NO_COMMAND_SELECTION);
  }, [activeSkillToken?.token]);

  useEffect(() => {
    setSelectedWorkspaceInformationIndex(NO_COMMAND_SELECTION);
  }, [activeWorkspaceInformationToken?.token]);

  useEffect(() => {
    if (!commandPaletteOpen) {
      setSelectedCommandIndex(NO_COMMAND_SELECTION);
      return;
    }
    setSelectedCommandIndex((current) => {
      if (current === NO_COMMAND_SELECTION) {
        return NO_COMMAND_SELECTION;
      }
      return Math.min(current, Math.max(filteredCommandItems.length - 1, 0));
    });
  }, [commandPaletteOpen, filteredCommandItems.length]);

  useEffect(() => {
    if (!skillPaletteOpen) {
      setSelectedSkillIndex(NO_COMMAND_SELECTION);
      return;
    }
    setSelectedSkillIndex((current) => {
      if (current === NO_COMMAND_SELECTION) {
        return NO_COMMAND_SELECTION;
      }
      return Math.min(current, Math.max(filteredSkillItems.length - 1, 0));
    });
  }, [filteredSkillItems.length, skillPaletteOpen]);

  useEffect(() => {
    if (!workspaceInformationPaletteOpen) {
      setSelectedWorkspaceInformationIndex(NO_COMMAND_SELECTION);
      return;
    }
    setSelectedWorkspaceInformationIndex((current) => {
      if (current === NO_COMMAND_SELECTION) {
        return NO_COMMAND_SELECTION;
      }
      return Math.min(
        current,
        Math.max(filteredWorkspaceInformationItems.length - 1, 0),
      );
    });
  }, [
    filteredWorkspaceInformationItems.length,
    workspaceInformationPaletteOpen,
  ]);

  useEffect(() => {
    const list = commandListRef.current;
    if (!list || activePalette === null) {
      return;
    }
    const selectedIndex =
      activePalette === "info"
        ? selectedWorkspaceInformationIndex
        : activePalette === "skill"
          ? selectedSkillIndex
          : selectedCommandIndex;
    if (selectedIndex === NO_COMMAND_SELECTION) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      const selectedItem = list.querySelector<HTMLElement>(
        getPaletteItemSelector(selectedIndex),
      );
      selectedItem?.scrollIntoView({ block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [
    activePalette,
    selectedCommandIndex,
    selectedSkillIndex,
    selectedWorkspaceInformationIndex,
  ]);

  async function submitCurrentMessage(intent?: "steer" | "queue") {
    const nextText = value.trim();
    if (
      !hasPromptSubmitPayload({
        text: nextText,
        attachedFilePaths,
        imageAttachments,
        lensAnnotationAttachments,
        workspaceInformationAttachments,
        promptBatch,
      })
    ) {
      return;
    }
    await onSubmit({ text: nextText, filePaths: attachedFilePaths, intent });
    setSelectedPromptHistoryIndex(NO_PROMPT_HISTORY_SELECTION);
    setDraftBeforeHistory("");
  }

  const updateLensAnnotationAttachment = useCallback(
    (args: {
      attachment: Extract<Attachment, { kind: "lens-annotations" }>;
      annotations: readonly LensAnnotation[];
      removeImageAnnotationIds?: readonly string[];
    }) => {
      if (!args.attachment.workspaceId || !onAttachmentsChange) {
        return;
      }
      const currentAttachments = attachments ?? [];
      const retainedAttachments = removeLensCommentImageAttachments({
        attachments: currentAttachments,
        workspaceId: args.attachment.workspaceId,
        lensSessionId: args.attachment.lensSessionId,
        annotationIds: args.removeImageAnnotationIds ?? [],
      });
      const nextAttachment =
        args.annotations.length > 0
          ? buildLensAnnotationsAttachment({
              id: args.attachment.id,
              workspaceId: args.attachment.workspaceId,
              lensSessionId: args.attachment.lensSessionId,
              annotations: args.annotations,
              sourceMappingConfig: lensSourceMappingConfig,
            })
          : null;
      onAttachmentsChange({
        attachments: retainedAttachments.flatMap((candidate) => {
          if (
            candidate.kind === "lens-annotations" &&
            candidate.id === args.attachment.id
          ) {
            return nextAttachment ? [nextAttachment] : [];
          }
          return [candidate];
        }),
      });
    },
    [attachments, lensSourceMappingConfig, onAttachmentsChange],
  );

  const applyLensAnnotationFeedback = useCallback(
    (
      attachment: Extract<Attachment, { kind: "lens-annotations" }>,
      annotation: LensAnnotation,
      feedback: LensAnnotationFeedback,
    ) => {
      updateLensAnnotationAttachment({
        attachment,
        annotations: (attachment.annotations ?? []).map((candidate) => {
          if (candidate.id !== annotation.id) {
            return candidate;
          }
          const review = resolveLensAnnotationReview(candidate);
          return {
            ...candidate,
            comment: feedback.comment,
            review: {
              ...review,
              feedback,
            },
          };
        }),
      });
    },
    [updateLensAnnotationAttachment],
  );

  const removeLensAnnotation = useCallback(
    async (
      attachment: Extract<Attachment, { kind: "lens-annotations" }>,
      annotation: LensAnnotation,
    ) => {
      if (attachment.workspaceId) {
        const result = await window.api?.lens?.removeAnnotation?.({
          workspaceId: attachment.workspaceId,
          lensSessionId: attachment.lensSessionId,
          annotationId: annotation.id,
          documentId: resolveLensAnnotationReview(annotation).page.documentId,
        });
        if (!result?.ok) {
          toast.error("Comment removal failed", {
            description:
              result?.message ?? "Lens could not remove that comment.",
          });
        }
      }
      updateLensAnnotationAttachment({
        attachment,
        annotations: (attachment.annotations ?? []).filter(
          (candidate) => candidate.id !== annotation.id,
        ),
        removeImageAnnotationIds: [annotation.id],
      });
    },
    [updateLensAnnotationAttachment],
  );

  const applyLensAnnotationStyle = useCallback(
    async (
      attachment: Extract<Attachment, { kind: "lens-annotations" }>,
      annotation: LensAnnotation,
      patch: Record<string, string>,
    ) => {
      if (!attachment.workspaceId || !annotation.selector) {
        return;
      }

      const result = await window.api?.lens?.setElementStyle?.({
        workspaceId: attachment.workspaceId,
        lensSessionId: attachment.lensSessionId,
        annotationId: annotation.id,
        selector: annotation.selector,
        patch,
        documentId: resolveLensAnnotationReview(annotation).page.documentId,
      });

      if (!result?.ok || !result.edits) {
        toast.error("Style edit failed", {
          description: result?.message ?? "Lens could not edit that element.",
        });
        return;
      }

      const edits: LensStyleEdit[] = result.edits;
      updateLensAnnotationAttachment({
        attachment,
        annotations: (attachment.annotations ?? []).map((candidate) => {
          if (candidate.id !== annotation.id) {
            return candidate;
          }
          const nextComputedStyles = {
            ...(candidate.computedStyles ?? {}),
            ...Object.fromEntries(
              edits.map((edit) => [edit.property, edit.after]),
            ),
          };
          const nextStyleEdits = [
            ...(candidate.styleEdits ?? []),
            ...edits,
          ];
          return {
            ...candidate,
            computedStyles: nextComputedStyles,
            styleEdits: nextStyleEdits,
            ...(candidate.review
              ? {
                  review: {
                    ...candidate.review,
                    anchor: {
                      ...candidate.review.anchor,
                      computedStyles: nextComputedStyles,
                    },
                    evidence: {
                      ...candidate.review.evidence,
                      styleEdits: nextStyleEdits,
                    },
                  },
                }
              : {}),
          };
        }),
      });

      toast.success("Style updated", {
        description: `${edits.length} propert${edits.length === 1 ? "y" : "ies"} changed.`,
      });
    },
    [updateLensAnnotationAttachment],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The submit button mirrors Enter's configured action; the secondary
    // in-composer action mirrors Tab.
    await submitCurrentMessage(
      isSteerOrQueueMode ? steerQueueEnterAction : undefined,
    );
  }

  function syncCaretPosition(
    nextRange?: PromptLexicalEditorSelectionRange | null,
  ) {
    const nextCaretIndex = nextRange?.end ?? 0;
    caretIndexRef.current = nextCaretIndex;
    setCaretIndex(nextCaretIndex);
  }

  function restoreComposerSelection(nextCaretIndex: number) {
    caretIndexRef.current = nextCaretIndex;
    setCaretIndex(nextCaretIndex);
    window.requestAnimationFrame(() => {
      const editor = promptEditorRef.current;
      if (!editor) {
        return;
      }
      editor.focus();
      editor.setSelectionRange(nextCaretIndex, nextCaretIndex);
    });
  }

  function getLiveCaretIndex(currentValue: string) {
    const liveRange = promptEditorRef.current?.getSelectionRange();
    const nextCaretIndex = liveRange?.end ?? caretIndexRef.current;
    return Math.max(0, Math.min(nextCaretIndex, currentValue.length));
  }

  function isCurrentTokenMatch(
    currentValue: string,
    match:
      | SlashCommandTokenMatch
      | SkillTokenMatch
      | WorkspaceInformationTokenMatch
      | null,
  ) {
    return Boolean(
      match &&
      match.start >= 0 &&
      match.end <= currentValue.length &&
      currentValue.slice(match.start, match.end) === match.token,
    );
  }

  function resolveCommandTokenSelection() {
    const currentValue = valueRef.current;
    const pendingToken = pendingCommandTokenRef.current;
    if (isCurrentTokenMatch(currentValue, pendingToken)) {
      return pendingToken;
    }
    const liveToken = getActiveSlashCommandTokenMatch({
      value: currentValue,
      caretIndex: getLiveCaretIndex(currentValue),
    });
    if (liveToken) {
      return liveToken;
    }
    if (isCurrentTokenMatch(currentValue, activeCommandToken)) {
      return activeCommandToken;
    }
    return getActiveSlashCommandTokenMatch({
      value: currentValue,
      caretIndex: currentValue.length,
    });
  }

  function resolveSkillTokenSelection() {
    const currentValue = valueRef.current;
    const pendingToken = pendingSkillTokenRef.current;
    if (isCurrentTokenMatch(currentValue, pendingToken)) {
      return pendingToken;
    }
    const liveToken = getActiveSkillTokenMatch({
      value: currentValue,
      caretIndex: getLiveCaretIndex(currentValue),
    });
    if (liveToken) {
      return liveToken;
    }
    if (isCurrentTokenMatch(currentValue, activeSkillToken)) {
      return activeSkillToken;
    }
    return getActiveSkillTokenMatch({
      value: currentValue,
      caretIndex: currentValue.length,
    });
  }

  function resolveWorkspaceInformationTokenSelection() {
    const currentValue = valueRef.current;
    const pendingToken = pendingWorkspaceInformationTokenRef.current;
    if (isCurrentTokenMatch(currentValue, pendingToken)) {
      return pendingToken;
    }
    const liveToken = getActiveWorkspaceInformationTokenMatch({
      text: currentValue,
      caretIndex: getLiveCaretIndex(currentValue),
    });
    if (liveToken) {
      return liveToken;
    }
    if (isCurrentTokenMatch(currentValue, activeWorkspaceInformationToken)) {
      return activeWorkspaceInformationToken;
    }
    return getActiveWorkspaceInformationTokenMatch({
      text: currentValue,
      caretIndex: currentValue.length,
    });
  }

  function rememberActivePaletteTokenSelection() {
    const currentValue = valueRef.current;
    const caretPosition = getLiveCaretIndex(currentValue);
    pendingCommandTokenRef.current =
      activePalette === "command"
        ? (getActiveSlashCommandTokenMatch({
            value: currentValue,
            caretIndex: caretPosition,
          }) ?? activeCommandToken)
        : null;
    pendingSkillTokenRef.current =
      activePalette === "skill"
        ? (getActiveSkillTokenMatch({
            value: currentValue,
            caretIndex: caretPosition,
          }) ?? activeSkillToken)
        : null;
    pendingWorkspaceInformationTokenRef.current =
      activePalette === "info"
        ? (getActiveWorkspaceInformationTokenMatch({
            text: currentValue,
            caretIndex: caretPosition,
          }) ?? activeWorkspaceInformationToken)
        : null;
  }

  function applyCommandSelection(item: CommandPaletteItem) {
    const match = resolveCommandTokenSelection();
    pendingCommandTokenRef.current = null;
    if (!match) {
      return;
    }
    const currentValue = valueRef.current;
    const nextValue = replaceSlashCommandToken({
      value: currentValue,
      match,
      command: item,
    });
    const nextCaretIndex = match.start + item.command.length + 1;
    valueRef.current = nextValue;
    onValueChange(nextValue);
    setSuppressedAutocompleteValue({ palette: "command", value: nextValue });
    setDismissedCommandToken(item.command);
    setSelectedCommandIndex(NO_COMMAND_SELECTION);
    restoreComposerSelection(nextCaretIndex);
  }

  function applySkillSelection(item: SkillCatalogEntry) {
    const match = resolveSkillTokenSelection();
    pendingSkillTokenRef.current = null;
    if (!match) {
      return;
    }
    const currentValue = valueRef.current;
    const nextValue = replaceSkillToken({
      value: currentValue,
      match,
      skill: item,
    });
    const nextCaretIndex = match.start + item.slug.length + 2;
    valueRef.current = nextValue;
    onValueChange(nextValue);
    setSuppressedAutocompleteValue({ palette: "skill", value: nextValue });
    setDismissedSkillToken(`$${item.slug}`);
    setSelectedSkillIndex(NO_COMMAND_SELECTION);
    restoreComposerSelection(nextCaretIndex);
  }

  function applyWorkspaceInformationSelection(
    item: WorkspaceInformationReferenceOption,
  ) {
    const match = resolveWorkspaceInformationTokenSelection();
    pendingWorkspaceInformationTokenRef.current = null;
    if (!match) {
      return;
    }
    const currentValue = valueRef.current;
    const nextValue = replaceWorkspaceInformationToken({
      text: currentValue,
      match,
      reference: item.reference,
    });
    const nextCaretIndex = match.start + item.reference.token.length + 1;
    valueRef.current = nextValue;
    onValueChange(nextValue);
    setSuppressedAutocompleteValue({ palette: "info", value: nextValue });
    setDismissedWorkspaceInformationToken(item.reference.token);
    setSelectedWorkspaceInformationIndex(NO_COMMAND_SELECTION);
    restoreComposerSelection(nextCaretIndex);
  }

  function applyPromptHistoryNavigation(direction: "previous" | "next") {
    const editor = promptEditorRef.current;
    const shouldUseBoundaryCheck =
      selectedPromptHistoryIndex === NO_PROMPT_HISTORY_SELECTION;

    if (shouldUseBoundaryCheck) {
      if (!editor) {
        return false;
      }
      const selection = editor.getSelectionRange();
      const boundaryReached = isPromptHistoryBoundaryReached({
        value,
        selectionStart: selection.start,
        selectionEnd: selection.end,
        direction,
      });
      if (!boundaryReached) {
        return false;
      }
    }

    const navigation = navigatePromptHistory({
      entries: normalizedPromptHistoryEntries,
      selectedIndex: selectedPromptHistoryIndex,
      direction,
      draftBeforeHistory,
      currentValue: value,
    });
    if (!navigation) {
      return false;
    }

    onValueChange(navigation.value);
    valueRef.current = navigation.value;
    setSelectedPromptHistoryIndex(navigation.selectedIndex);
    setDraftBeforeHistory(navigation.draftBeforeHistory);
    const nextCaretIndex = navigation.value.length;
    restoreComposerSelection(nextCaretIndex);
    return true;
  }

  function renderSkillScopeIcon(scope: SkillCatalogEntry["scope"]) {
    if (scope === "local") {
      return <FolderOpen className="size-3.5 text-foreground/80" />;
    }
    if (scope === "user") {
      return <UserRound className="size-3.5 text-foreground/80" />;
    }
    return <Globe2 className="size-3.5 text-foreground/80" />;
  }

  if (pendingUserInput && onUserInputSubmit && onUserInputDeny) {
    return (
      <div
        className="prompt-input-shell relative z-10 rounded-xl bg-card outline-none"
        data-testid="user-input-composer"
        data-turn-active={isTurnActive ? "true" : undefined}
        data-pending-interaction="true"
        data-pending-interaction-request-id={pendingUserInput.part.requestId}
        tabIndex={-1}
      >
        <UserInputCard
          toolName={pendingUserInput.part.toolName}
          questions={pendingUserInput.part.questions}
          state={pendingUserInput.part.state}
          presentation="composer"
          onSubmit={(answers) =>
            onUserInputSubmit({
              messageId: pendingUserInput.messageId,
              answers,
            })
          }
          onDeny={() =>
            onUserInputDeny({ messageId: pendingUserInput.messageId })
          }
        />
      </div>
    );
  }

  return (
    <>
      {/*
        BorderBeam wraps the form rather than sitting as an absolute sibling
        inside it, so the library (which owns its own `<style>` + mask
        compositing) is the positioning context for the beam layers.

        The focus ring belongs on the wrapper so it tracks both rotate and
        pulse presets while preserving the inner form's border radius.
      */}
      <BorderBeam
        active={showBorderBeam}
        data-turn-active={!minimal && isTurnActive ? "true" : undefined}
        size={borderBeamSize}
        colorVariant={borderBeamVariant}
        strength={borderBeamStrength}
        theme="auto"
        className={cn(
          "transition-[box-shadow] duration-200 ease-out motion-reduce:transition-none",
          // `relative z-10` is load-bearing: the turn activity shelf overlaps
          // the composer from above with a negative bottom margin, and this
          // keeps the composer painting on top of that tucked-under edge.
          !minimal && "prompt-input-shell relative z-10 rounded-xl",
        )}
      >
        <form
          data-prompt-input-root
          onSubmit={handleSubmit}
          onFocusCapture={syncComposerFocus}
          onBlurCapture={() => {
            window.requestAnimationFrame(syncComposerFocus);
          }}
          className={cn(
            "relative space-y-3 transition-[border-color,background-color]",
            minimal
              ? "space-y-2 border-0 border-t border-border/60 bg-transparent p-0 pt-3 focus-within:border-border/60"
              : "rounded-xl border-0 bg-card p-3",
          )}
        >
          {goalStatus ? (
            <PromptInputGoalStatusStrip status={goalStatus} compact={minimal} />
          ) : null}
          {!minimal && promptSuggestions && promptSuggestions.length > 0 ? (
            <Suggestions aria-label="Suggestions" className="-ml-1.5 mb-0.5">
              {promptSuggestions.map((suggestion) => (
                <Suggestion
                  key={suggestion}
                  suggestion={suggestion}
                  onClick={onSuggestionSelect}
                  title={suggestion}
                  variant="ghost"
                  className="h-7 rounded-full bg-muted/40 px-3.5 text-xs text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                />
              ))}
            </Suggestions>
          ) : null}
          {visibleQueuedTurns.length > 0 ? (
            <div className="space-y-2 rounded-xl border border-border/70 bg-card px-3 py-2.5 shadow-[0_10px_28px_-18px_oklch(0_0_0/0.28),0_2px_7px_-4px_oklch(0_0_0/0.16)]">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="secondary"
                  className="h-5 px-1.5 text-[10px] uppercase tracking-wide"
                >
                  Queue
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {visibleQueuedTurns.length} queued follow-up
                  {visibleQueuedTurns.length === 1 ? "" : "s"}
                  {isTurnActive
                    ? " · next sends automatically when the current response finishes"
                    : canSendQueuedTurnNow
                      ? " · send one now, or it sends after your next message finishes"
                      : ""}
                </span>
                {queuedFileCount > 0 ? (
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                    {queuedFileCount} {queuedFileCount === 1 ? "file" : "files"}
                  </Badge>
                ) : null}
                {queuedImageCount > 0 ? (
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                    {queuedImageCount}{" "}
                    {queuedImageCount === 1 ? "image" : "images"}
                  </Badge>
                ) : null}
                {onClearQueuedNextTurn ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onClearQueuedNextTurn()}
                    className="ml-auto h-7 px-2 text-xs"
                  >
                    Clear all
                  </Button>
                ) : null}
              </div>
              <div className="space-y-1.5">
                {visibleQueuedTurns.map((item, index) => {
                  const isEditing = editingQueuedTurnId === item.id;
                  const summary =
                    item.content.replace(/\s+/g, " ").trim() ||
                    "Queued follow-up with attached context.";
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "group relative rounded-lg border border-border/50 bg-background/80 px-2.5 py-2 shadow-sm transition-all hover:border-border hover:shadow-md",
                        index === 0 && !isEditing && "border-primary/30",
                      )}
                    >
                      {isEditing ? (
                        <div className="space-y-2">
                          <Textarea
                            value={editingQueuedTurnContent}
                            onChange={(event) =>
                              setEditingQueuedTurnContent(event.target.value)
                            }
                            onKeyDown={(event) => {
                              if (
                                event.key === "Enter" &&
                                !event.shiftKey &&
                                !event.altKey &&
                                !event.ctrlKey &&
                                !event.metaKey
                              ) {
                                event.preventDefault();
                                onUpdateQueuedTurn?.({
                                  itemId: item.id,
                                  content: editingQueuedTurnContent.trim(),
                                });
                                setEditingQueuedTurnId(null);
                                setEditingQueuedTurnContent("");
                              }
                            }}
                            className="min-h-20 resize-y text-sm"
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingQueuedTurnId(null);
                                setEditingQueuedTurnContent("");
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => {
                                onUpdateQueuedTurn?.({
                                  itemId: item.id,
                                  content: editingQueuedTurnContent.trim(),
                                });
                                setEditingQueuedTurnId(null);
                                setEditingQueuedTurnContent("");
                              }}
                            >
                              Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex min-w-0 items-start gap-2">
                          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                            {index + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-sm font-medium text-foreground">
                              {summary}
                            </p>
                            {index === 0 ? (
                              <p className="mt-0.5 text-xs font-medium text-primary/80">
                                Next to send
                              </p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                            {canSendQueuedTurnNow ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                className="text-muted-foreground hover:text-primary"
                                aria-label={`Send queued prompt ${index + 1} now`}
                                onClick={() =>
                                  onSendQueuedTurn?.({ itemId: item.id })
                                }
                              >
                                <Send className="size-3.5" />
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              aria-label={`Edit queued prompt ${index + 1}`}
                              onClick={() => {
                                setEditingQueuedTurnId(item.id);
                                setEditingQueuedTurnContent(item.content);
                              }}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              className="text-muted-foreground hover:text-destructive"
                              aria-label={`Delete queued prompt ${index + 1}`}
                              onClick={() =>
                                onRemoveQueuedTurn?.({ itemId: item.id })
                              }
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          <Popover
            open={activePalette !== null}
            modal={false}
            onOpenChange={(nextOpen, eventDetails) => {
              if (nextOpen) {
                return;
              }
              if (eventDetails.reason === "focus-out") {
                eventDetails.cancel();
                return;
              }
              if (eventDetails.reason !== "outside-press") {
                return;
              }
              if (activePalette === "info") {
                setDismissedWorkspaceInformationToken(
                  activeWorkspaceInformationToken?.token ?? null,
                );
                return;
              }
              if (activePalette === "skill") {
                setDismissedSkillToken(activeSkillToken?.token ?? null);
                return;
              }
              setDismissedCommandToken(activeCommandToken?.token ?? null);
            }}
          >
            <PopoverAnchor
              render={
                <div className={cn("space-y-2", minimal && "space-y-3")} />
              }
            >
              <div
                className={cn(
                  minimal
                    ? "rounded-md border border-border/60 bg-background px-3 py-2.5"
                    : undefined,
                )}
              >
                <div
                  className={cn(
                    minimal ? "flex items-start gap-3" : "space-y-2",
                  )}
                >
                  {minimal ? (
                    <span className="select-none font-mono text-base leading-7 text-primary/90">
                      &gt;
                    </span>
                  ) : null}
                  <div className="relative min-w-0 flex-1">
                    {shouldShowFocusHint ? (
                      <div
                        className={cn(
                          "pointer-events-none absolute right-0 top-0",
                          UI_LAYER_CLASS.floatingChrome,
                        )}
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={focusComposer}
                          className={cn(
                            PROMPT_TOOLBAR_BUTTON,
                            PROMPT_FLOATING_SURFACE,
                            "pointer-events-auto h-8 gap-2 shadow-sm",
                          )}
                        >
                          <span>Focus</span>
                          <KbdGroup>
                            <Kbd>{modifierLabel}</Kbd>
                            <Kbd>L</Kbd>
                          </KbdGroup>
                          <span className="text-xs text-muted-foreground">
                            or
                          </span>
                          <KbdGroup>
                            <Kbd>{modifierLabel}</Kbd>
                            <Kbd>J</Kbd>
                          </KbdGroup>
                        </Button>
                      </div>
                    ) : null}
                    <PromptLexicalEditor
                      ref={promptEditorRef}
                      value={value}
                      selectionRange={editorSelectionRange}
                      disabled={interactionsDisabled}
                      minimal={minimal}
                      commandPaletteItems={commandPaletteItems}
                      skillPaletteItems={skillPaletteItems}
                      workspaceInformationReferenceOptions={
                        workspaceInformationReferenceOptions
                      }
                      onChange={(nextValue) => {
                        onValueChange(nextValue);
                      }}
                      onSelectionChange={syncCaretPosition}
                      onFocus={() => {
                        syncCaretPosition(
                          promptEditorRef.current?.getSelectionRange(),
                        );
                        onFocus?.();
                      }}
                      onBlur={() => onBlur?.()}
                      onPaste={(event) => {
                        const clipboardData = event.clipboardData;
                        if (!clipboardData) {
                          return;
                        }
                        const { imageFiles, nonImageFiles: pastedFiles } =
                          partitionClipboardFiles(
                            collectClipboardFiles({
                              items: clipboardData.items,
                              files: clipboardData.files,
                            }),
                          );
                        const shouldHandleImages =
                          imageFiles.length > 0 && Boolean(onAttachmentsChange);
                        const shouldHandleFiles =
                          pastedFiles.length > 0 && Boolean(onPasteFiles);
                        if (!shouldHandleImages && !shouldHandleFiles) {
                          return;
                        }
                        event.preventDefault();
                        if (shouldHandleFiles) {
                          void onPasteFiles?.({ files: pastedFiles });
                        }
                        if (shouldHandleImages) {
                          Promise.all(
                            imageFiles.map(
                              (file) =>
                                new Promise<
                                  Extract<Attachment, { kind: "image" }>
                                >((resolve) => {
                                  const reader = new FileReader();
                                  reader.onload = () => {
                                    resolve({
                                      kind: "image",
                                      id: crypto.randomUUID(),
                                      dataUrl: reader.result as string,
                                      label: file.name || "Pasted image",
                                      mimeType: file.type || "image/png",
                                    });
                                  };
                                  reader.readAsDataURL(file);
                                }),
                            ),
                          ).then((newImages) => {
                            const existingImageAttachments = (
                              attachments ?? []
                            ).filter(
                              (
                                attachment,
                              ): attachment is Extract<
                                Attachment,
                                { kind: "image" }
                              > => attachment.kind === "image",
                            );
                            const retainedAttachments = (
                              attachments ?? []
                            ).filter(
                              (attachment) => attachment.kind !== "image",
                            );
                            onAttachmentsChange?.({
                              attachments: [
                                ...retainedAttachments,
                                ...mergeClipboardImageAttachments({
                                  existing: existingImageAttachments,
                                  incoming: newImages,
                                }),
                              ],
                            });
                          });
                        }
                      }}
                      onKeyDown={(event) => {
                        if (
                          activePalette === "info" &&
                          filteredWorkspaceInformationItems.length > 0 &&
                          !event.shiftKey &&
                          !event.altKey &&
                          !event.ctrlKey &&
                          !event.metaKey
                        ) {
                          if (event.key === "ArrowDown") {
                            event.preventDefault();
                            setSelectedWorkspaceInformationIndex((current) =>
                              getNextCommandSelectionIndex({
                                currentIndex: current,
                                itemCount:
                                  filteredWorkspaceInformationItems.length,
                                direction: "next",
                              }),
                            );
                            return;
                          }
                          if (event.key === "ArrowUp") {
                            event.preventDefault();
                            setSelectedWorkspaceInformationIndex((current) =>
                              getNextCommandSelectionIndex({
                                currentIndex: current,
                                itemCount:
                                  filteredWorkspaceInformationItems.length,
                                direction: "previous",
                              }),
                            );
                            return;
                          }
                          if (event.key === "Enter" || event.key === "Tab") {
                            if (event.nativeEvent.isComposing) {
                              return;
                            }
                            const selectedItem = getAcceptedPaletteItem({
                              items: filteredWorkspaceInformationItems,
                              selectedIndex: selectedWorkspaceInformationIndex,
                              triggerKey: event.key,
                            });
                            if (selectedItem) {
                              event.preventDefault();
                              applyWorkspaceInformationSelection(selectedItem);
                              return;
                            }
                          }
                        }
                        if (
                          activePalette === "skill" &&
                          filteredSkillItems.length > 0 &&
                          !event.shiftKey &&
                          !event.altKey &&
                          !event.ctrlKey &&
                          !event.metaKey
                        ) {
                          if (event.key === "ArrowDown") {
                            event.preventDefault();
                            setSelectedSkillIndex((current) =>
                              getNextCommandSelectionIndex({
                                currentIndex: current,
                                itemCount: filteredSkillItems.length,
                                direction: "next",
                              }),
                            );
                            return;
                          }
                          if (event.key === "ArrowUp") {
                            event.preventDefault();
                            setSelectedSkillIndex((current) =>
                              getNextCommandSelectionIndex({
                                currentIndex: current,
                                itemCount: filteredSkillItems.length,
                                direction: "previous",
                              }),
                            );
                            return;
                          }
                          if (event.key === "Enter" || event.key === "Tab") {
                            if (event.nativeEvent.isComposing) {
                              return;
                            }
                            const selectedItem = getAcceptedPaletteItem({
                              items: filteredSkillItems,
                              selectedIndex: selectedSkillIndex,
                              triggerKey: event.key,
                            });
                            if (selectedItem) {
                              event.preventDefault();
                              applySkillSelection(selectedItem);
                              return;
                            }
                          }
                        }
                        if (
                          activePalette === "command" &&
                          filteredCommandItems.length > 0 &&
                          !event.shiftKey &&
                          !event.altKey &&
                          !event.ctrlKey &&
                          !event.metaKey
                        ) {
                          if (event.key === "ArrowDown") {
                            event.preventDefault();
                            setSelectedCommandIndex((current) =>
                              getNextCommandSelectionIndex({
                                currentIndex: current,
                                itemCount: filteredCommandItems.length,
                                direction: "next",
                              }),
                            );
                            return;
                          }
                          if (event.key === "ArrowUp") {
                            event.preventDefault();
                            setSelectedCommandIndex((current) =>
                              getNextCommandSelectionIndex({
                                currentIndex: current,
                                itemCount: filteredCommandItems.length,
                                direction: "previous",
                              }),
                            );
                            return;
                          }
                          if (event.key === "Enter" || event.key === "Tab") {
                            if (event.nativeEvent.isComposing) {
                              return;
                            }
                            const selectedItem = getAcceptedCommandPaletteItem({
                              items: filteredCommandItems,
                              selectedIndex: selectedCommandIndex,
                              triggerKey: event.key,
                            });
                            if (selectedItem) {
                              event.preventDefault();
                              applyCommandSelection(selectedItem);
                              return;
                            }
                          }
                        }
                        if (
                          activePalette === "info" &&
                          event.key === "Escape"
                        ) {
                          event.preventDefault();
                          setDismissedWorkspaceInformationToken(
                            activeWorkspaceInformationToken?.token ?? null,
                          );
                          return;
                        }
                        if (
                          activePalette === "skill" &&
                          event.key === "Escape"
                        ) {
                          event.preventDefault();
                          setDismissedSkillToken(
                            activeSkillToken?.token ?? null,
                          );
                          return;
                        }
                        if (
                          activePalette === "command" &&
                          event.key === "Escape"
                        ) {
                          event.preventDefault();
                          setDismissedCommandToken(
                            activeCommandToken?.token ?? null,
                          );
                          return;
                        }
                        if (
                          activePalette === null &&
                          isTurnActive &&
                          event.key === "Escape" &&
                          !event.nativeEvent.isComposing
                        ) {
                          event.preventDefault();
                          onAbort?.();
                          return;
                        }
                        if (
                          activePalette === null &&
                          (event.key === "ArrowUp" ||
                            event.key === "ArrowDown") &&
                          !event.shiftKey &&
                          !event.altKey &&
                          !event.ctrlKey &&
                          !event.metaKey &&
                          !event.nativeEvent.isComposing
                        ) {
                          const consumed = applyPromptHistoryNavigation(
                            event.key === "ArrowUp" ? "previous" : "next",
                          );
                          if (consumed) {
                            event.preventDefault();
                            return;
                          }
                        }
                        if (handleShiftTabShortcut(event)) {
                          return;
                        }
                        if (
                          isSteerOrQueueMode &&
                          activePalette === null &&
                          event.key === "Tab" &&
                          !event.shiftKey &&
                          !event.altKey &&
                          !event.ctrlKey &&
                          !event.metaKey &&
                          !event.nativeEvent.isComposing
                        ) {
                          event.preventDefault();
                          void submitCurrentMessage(
                            tabActionForSteerQueueEnterAction(
                              steerQueueEnterAction,
                            ),
                          );
                          return;
                        }
                        if (event.key !== "Enter") {
                          return;
                        }
                        if (
                          isPromptCommentShortcut({
                            shortcut: promptCommentShortcut,
                            key: event.key,
                            shiftKey: event.shiftKey,
                            altKey: event.altKey,
                            ctrlKey: event.ctrlKey,
                            metaKey: event.metaKey,
                            isComposing: event.nativeEvent.isComposing,
                          })
                        ) {
                          event.preventDefault();
                          onStagePromptBatch?.();
                          return;
                        }
                        if (
                          event.shiftKey ||
                          event.altKey ||
                          event.ctrlKey ||
                          event.metaKey
                        ) {
                          return;
                        }
                        if (event.nativeEvent.isComposing) {
                          return;
                        }
                        const paletteHasAcceptedItems =
                          activePalette === "info"
                            ? filteredWorkspaceInformationItems.length > 0
                            : activePalette === "skill"
                              ? filteredSkillItems.length > 0
                              : activePalette === "command"
                                ? filteredCommandItems.length > 0
                                : false;
                        if (paletteHasAcceptedItems) {
                          event.preventDefault();
                          return;
                        }
                        event.preventDefault();
                        void submitCurrentMessage(
                          isSteerOrQueueMode
                            ? steerQueueEnterAction
                            : undefined,
                        );
                      }}
                      placeholder={
                        minimal && isPromptInputFocused
                          ? ""
                          : minimal
                            ? isSteerOrQueueMode
                              ? formatSteerQueueEnterActionLabel(
                                  steerQueueEnterAction,
                                )
                              : isQueueNextMode
                                ? "Type the next turn..."
                                : "Type a request..."
                            : isSteerOrQueueMode
                              ? formatSteerQueueEnterActionLabel(
                                  steerQueueEnterAction,
                                )
                              : isQueueNextMode
                                ? "Queue the next turn… (↵)"
                                : "Use / for commands, $ for skills, @ for Information"
                      }
                      className={cn(
                        "resize-none overflow-y-auto rounded-none border-0 bg-transparent px-0 py-0 shadow-none dark:bg-transparent",
                        minimal
                          ? "min-h-[32px] max-h-[168px] font-mono text-[15px] leading-7 tracking-[-0.01em] caret-primary md:text-[15px]"
                          : "min-h-[104px] max-h-[240px] text-lg leading-8 md:text-lg",
                        PROMPT_SURFACE_FOCUS_VISIBLE_RESET,
                      )}
                    />
                    {minimal && isPromptInputFocused && value.length === 0 ? (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute left-0 top-1.5 h-5 w-2 rounded-[1px] bg-foreground/85 motion-safe:animate-terminal-caret"
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            </PopoverAnchor>
            <PopoverContent
              align="start"
              side="top"
              sideOffset={8}
              initialFocus={false}
              className="max-h-[min(40rem,var(--available-height))] w-[min(44rem,calc(100vw-2rem))] gap-0 overflow-hidden rounded-xl border border-border/80 bg-popover p-1 shadow-lg"
            >
              <Command
                shouldFilter={false}
                value={paletteValue}
                onValueChange={() => {}}
                className="rounded-lg border border-border/60 bg-background/70 p-0"
              >
                <CommandList
                  ref={commandListRef}
                  className="max-h-[32rem] scroll-py-2"
                >
                  {activePalette === "info" &&
                  filteredWorkspaceInformationItems.length === 0 ? (
                    <CommandEmpty>
                      No matching Information reference.
                    </CommandEmpty>
                  ) : activePalette === "skill" &&
                    filteredSkillItems.length === 0 ? (
                    <CommandEmpty>No matching skill.</CommandEmpty>
                  ) : activePalette === "command" &&
                    filteredCommandItems.length === 0 ? (
                    <CommandEmpty>No matching slash command.</CommandEmpty>
                  ) : (
                    <>
                      {activePalette === "info" &&
                      workspaceInformationSectionItems.length > 0 ? (
                        <CommandGroup heading="Information sections">
                          {workspaceInformationSectionItems.map(
                            ({ item, index }) => (
                              <CommandItem
                                key={item.reference.token}
                                value={item.reference.token}
                                className="min-h-14 cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5"
                                data-palette-index={index}
                                onMouseEnter={() =>
                                  setSelectedWorkspaceInformationIndex(index)
                                }
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  rememberActivePaletteTokenSelection();
                                }}
                                onSelect={() =>
                                  applyWorkspaceInformationSelection(item)
                                }
                              >
                                <div className="flex items-start pt-0.5 text-primary">
                                  <Info className="size-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">
                                      {item.title}
                                    </span>
                                    <Badge
                                      variant="secondary"
                                      className="h-5 px-1.5 text-[10px] uppercase tracking-wide"
                                    >
                                      Section
                                    </Badge>
                                  </div>
                                  <p className="mt-0.5 text-xs text-muted-foreground">
                                    {item.description}
                                  </p>
                                </div>
                              </CommandItem>
                            ),
                          )}
                        </CommandGroup>
                      ) : null}
                      {activePalette === "info" &&
                      workspaceInformationEntryItems.length > 0 ? (
                        <CommandGroup heading="Information items">
                          {workspaceInformationEntryItems.map(
                            ({ item, index }) => (
                              <CommandItem
                                key={item.reference.token}
                                value={item.reference.token}
                                className="min-h-14 cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5"
                                data-palette-index={index}
                                onMouseEnter={() =>
                                  setSelectedWorkspaceInformationIndex(index)
                                }
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  rememberActivePaletteTokenSelection();
                                }}
                                onSelect={() =>
                                  applyWorkspaceInformationSelection(item)
                                }
                              >
                                <div className="flex items-start pt-0.5 text-primary">
                                  <Info className="size-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">
                                      {item.title}
                                    </span>
                                    <Badge
                                      variant="outline"
                                      className="h-5 px-1.5 text-[10px] uppercase tracking-wide"
                                    >
                                      Item
                                    </Badge>
                                  </div>
                                  <p className="mt-0.5 text-xs text-muted-foreground">
                                    {item.description}
                                  </p>
                                </div>
                              </CommandItem>
                            ),
                          )}
                        </CommandGroup>
                      ) : null}
                      {activePalette === "skill" &&
                      localSkillItems.length > 0 ? (
                        <CommandGroup heading="Workspace skills">
                          {localSkillItems.map(({ item, index }) => (
                            <CommandItem
                              key={item.id}
                              value={item.slug}
                              className="h-[4.5rem] min-h-[4.5rem] cursor-pointer items-start gap-3 overflow-hidden rounded-lg px-3 py-2.5"
                              data-palette-index={index}
                              onMouseEnter={() => setSelectedSkillIndex(index)}
                              onMouseDown={(event) => {
                                event.preventDefault();
                                rememberActivePaletteTokenSelection();
                              }}
                              onSelect={() => applySkillSelection(item)}
                            >
                              <div className="flex items-start pt-0.5">
                                {renderSkillScopeIcon(item.scope)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 items-center gap-2">
                                  <span className="truncate font-medium">
                                    {item.name}
                                  </span>
                                  <Badge
                                    variant="secondary"
                                    className="h-5 shrink-0 px-1.5 text-[10px] uppercase tracking-wide"
                                  >
                                    {item.provider === "shared"
                                      ? "Shared"
                                      : item.provider === "claude-code"
                                        ? "Claude"
                                        : "Codex"}
                                  </Badge>
                                </div>
                                <p
                                  className="mt-0.5 line-clamp-2 text-xs leading-4 text-muted-foreground"
                                  title={item.description}
                                >
                                  {item.description}
                                </p>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      ) : null}
                      {activePalette === "skill" &&
                      userSkillItems.length > 0 ? (
                        <CommandGroup heading="User skills">
                          {userSkillItems.map(({ item, index }) => (
                            <CommandItem
                              key={item.id}
                              value={item.slug}
                              className="h-[4.5rem] min-h-[4.5rem] cursor-pointer items-start gap-3 overflow-hidden rounded-lg px-3 py-2.5"
                              data-palette-index={index}
                              onMouseEnter={() => setSelectedSkillIndex(index)}
                              onMouseDown={(event) => {
                                event.preventDefault();
                                rememberActivePaletteTokenSelection();
                              }}
                              onSelect={() => applySkillSelection(item)}
                            >
                              <div className="flex items-start pt-0.5">
                                {renderSkillScopeIcon(item.scope)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 items-center gap-2">
                                  <span className="truncate font-medium">
                                    {item.name}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className="h-5 shrink-0 px-1.5 text-[10px] uppercase tracking-wide"
                                  >
                                    {item.provider === "shared"
                                      ? "Shared"
                                      : item.provider === "claude-code"
                                        ? "Claude"
                                        : "Codex"}
                                  </Badge>
                                </div>
                                <p
                                  className="mt-0.5 line-clamp-2 text-xs leading-4 text-muted-foreground"
                                  title={item.description}
                                >
                                  {item.description}
                                </p>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      ) : null}
                      {activePalette === "skill" &&
                      globalSkillItems.length > 0 ? (
                        <CommandGroup heading="Global skills">
                          {globalSkillItems.map(({ item, index }) => (
                            <CommandItem
                              key={item.id}
                              value={item.slug}
                              className="h-[4.5rem] min-h-[4.5rem] cursor-pointer items-start gap-3 overflow-hidden rounded-lg px-3 py-2.5"
                              data-palette-index={index}
                              onMouseEnter={() => setSelectedSkillIndex(index)}
                              onMouseDown={(event) => {
                                event.preventDefault();
                                rememberActivePaletteTokenSelection();
                              }}
                              onSelect={() => applySkillSelection(item)}
                            >
                              <div className="flex items-start pt-0.5">
                                {renderSkillScopeIcon(item.scope)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 items-center gap-2">
                                  <span className="truncate font-medium">
                                    {item.name}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className="h-5 shrink-0 px-1.5 text-[10px] uppercase tracking-wide"
                                  >
                                    {item.provider === "shared"
                                      ? "Shared"
                                      : item.provider === "claude-code"
                                        ? "Claude"
                                        : "Codex"}
                                  </Badge>
                                </div>
                                <p
                                  className="mt-0.5 line-clamp-2 text-xs leading-4 text-muted-foreground"
                                  title={item.description}
                                >
                                  {item.description}
                                </p>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      ) : null}
                      {activePalette === "command" &&
                      providerCommandItems.length > 0 ? (
                        <CommandGroup
                          heading={
                            selectedModel.providerId === "claude-code"
                              ? "Claude native commands"
                              : selectedModel.providerId === "codex"
                                ? "Codex commands"
                                : "Provider commands"
                          }
                        >
                          {providerCommandItems.map(({ item, index }) => (
                            <CommandItem
                              key={item.id}
                              value={item.command}
                              className="min-h-14 cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5"
                              data-palette-index={index}
                              onMouseEnter={() =>
                                setSelectedCommandIndex(index)
                              }
                              onMouseDown={(event) => {
                                event.preventDefault();
                                rememberActivePaletteTokenSelection();
                              }}
                              onSelect={() => applyCommandSelection(item)}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">
                                    {item.command}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className="h-5 px-1.5 text-[10px] uppercase tracking-wide"
                                  >
                                    {selectedModel.providerId === "claude-code"
                                      ? "Claude"
                                      : selectedModel.providerId === "codex"
                                        ? "Codex"
                                        : "Provider"}
                                  </Badge>
                                </div>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {item.description}
                                </p>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      ) : null}
                    </>
                  )}
                </CommandList>
                {activePalette === "info" ? (
                  <div className="border-t border-border/70 px-3 py-2.5 text-xs text-muted-foreground">
                    <p className="flex items-center gap-2 font-medium text-foreground">
                      <Info className="size-3.5" />
                      Enter or Tab inserts the highlighted Information
                      reference.
                    </p>
                    <p className="mt-2">
                      Type `@` to search Information. Selection inserts
                      `@info:section` for a full section or `@info:section/item`
                      for one item. `@lens` references the current Lens browser
                      page.
                    </p>
                  </div>
                ) : activePalette === "skill" ? (
                  <div className="border-t border-border/70 px-3 py-2.5 text-xs text-muted-foreground">
                    <p className="flex items-center gap-2 font-medium text-foreground">
                      <Sparkles className="size-3.5" />
                      Enter or Tab inserts the highlighted skill token. Selected
                      skills are normalized on send.
                    </p>
                    <p className="mt-2">
                      `$skill` activates Stave skill instructions for both
                      `Claude` and `Codex` via prompt context. Use `/` commands
                      only for provider-native commands.
                    </p>
                  </div>
                ) : activePalette === "command" ? (
                  <div className="border-t border-border/70 px-3 py-2.5 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">
                      Enter or Tab inserts the highlighted command.
                    </p>
                    {commandPaletteProviderNote ? (
                      <>
                        <p className="mt-2 font-medium text-foreground">
                          {commandPaletteProviderNote.title}
                        </p>
                        <p className="mt-1 whitespace-pre-line">
                          {commandPaletteProviderNote.description}
                        </p>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </Command>
            </PopoverContent>
          </Popover>
          {commentItemCount > 0 ? (
            <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/15 px-3 py-2">
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="h-5 px-1.5 text-[10px] uppercase tracking-wide"
                >
                  Comment
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {commentItemCount} item
                  {commentItemCount === 1 ? "" : "s"} will send as one prompt
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {promptBatch.map((item, index) => {
                  const summary = item.content.replace(/\s+/g, " ").trim();
                  const attachmentCount =
                    (item.attachedFilePaths?.length ?? 0) +
                    (item.attachments?.filter(
                      (attachment) => attachment.kind === "image",
                    ).length ?? 0);
                  return (
                    <div
                      key={item.id}
                      className="flex max-w-full items-center gap-1.5 rounded-md border border-border/70 bg-background/75 px-2 py-1 text-xs"
                      title={item.content}
                    >
                      <span className="shrink-0 font-medium text-muted-foreground">
                        {index + 1}
                      </span>
                      <span className="truncate text-foreground">
                        {summary}
                      </span>
                      {attachmentCount > 0 ? (
                        <span
                          className="inline-flex shrink-0 items-center gap-0.5 text-muted-foreground"
                          title={`${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}`}
                        >
                          <Paperclip className="size-3" />
                          {attachmentCount}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        disabled={interactionsDisabled}
                        onClick={() =>
                          onRemovePromptBatchItem?.({ itemId: item.id })
                        }
                        className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
                        aria-label={`Remove comment ${index + 1}`}
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  );
                })}
                {lensAnnotationAttachments.map((attachment) => {
                  const annotationItems = attachment.annotations ?? [];
                  if (annotationItems.length === 0) {
                    return (
                      <div
                        key={attachment.id}
                        className="flex max-w-full items-center rounded-md border border-border/70 bg-secondary/50 text-xs text-foreground"
                      >
                        <Popover modal={false}>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <PopoverTrigger
                                  render={
                                    <button
                                      type="button"
                                      title={
                                        attachment.displayContent ??
                                        attachment.content
                                      }
                                      className="flex min-w-0 items-center gap-1.5 px-2 py-1 hover:bg-secondary/70"
                                    />
                                  }
                                />
                              }
                            >
                              <FileText className="size-3.5 shrink-0" />
                              <span className="truncate">
                                {attachment.label}
                              </span>
                              <Badge
                                variant="outline"
                                className="h-5 px-1.5 text-[10px]"
                              >
                                {attachment.count}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-80">
                              {attachment.summary}
                            </TooltipContent>
                          </Tooltip>
                          <PopoverContent
                            side="top"
                            align="start"
                            className="max-h-96 w-[min(42rem,calc(100vw-2rem))] overflow-auto rounded-lg border border-border/80 bg-popover p-3 shadow-lg"
                          >
                            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-popover-foreground">
                              {attachment.displayContent ?? attachment.content}
                            </pre>
                          </PopoverContent>
                        </Popover>
                        <button
                          type="button"
                          disabled={interactionsDisabled}
                          onClick={() =>
                            onAttachmentsChange?.({
                              attachments: (attachments ?? []).filter(
                                (candidate) =>
                                  !(
                                    candidate.kind === "lens-annotations" &&
                                    candidate.id === attachment.id
                                  ),
                              ),
                            })
                          }
                          className="border-l border-border/70 px-1.5 py-1 text-muted-foreground hover:text-foreground"
                          aria-label={`Remove ${attachment.label}`}
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    );
                  }
                  return annotationItems.map((annotation) => {
                    const feedback =
                      resolveLensAnnotationReview(annotation).feedback;
                    const screenshot = attachment.workspaceId
                      ? imageAttachmentsById.get(
                          getLensCommentImageId({
                            workspaceId: attachment.workspaceId,
                            lensSessionId: attachment.lensSessionId,
                            annotationId: annotation.id,
                          }),
                        )
                      : null;
                    return (
                      <div
                        key={`${attachment.id}:${annotation.id}`}
                        className="flex max-w-full items-start gap-2 rounded-md border border-border/70 bg-secondary/50 px-2 py-1.5 text-xs text-foreground"
                      >
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                          {annotation.pin}
                        </span>
                        {screenshot ? (
                          <button
                            type="button"
                            className="shrink-0 rounded-sm border border-border/70 bg-background p-0.5 hover:border-border"
                            title="View visual comment screenshot"
                            onClick={() =>
                              setImagePreviewSrc({
                                dataUrl: screenshot.dataUrl,
                                label: screenshot.label,
                              })
                            }
                          >
                            <img
                              src={screenshot.dataUrl}
                              alt={screenshot.label}
                              className="h-10 w-16 rounded-[2px] object-cover"
                            />
                          </button>
                        ) : null}
                        <Popover modal={false}>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <PopoverTrigger
                                  render={
                                    <button
                                      type="button"
                                      title={annotation.comment}
                                      className="min-w-0 flex-1 text-left hover:text-foreground"
                                    />
                                  }
                                />
                              }
                            >
                              <span className="block truncate font-medium">
                                {annotation.comment}
                              </span>
                              <span className="block truncate text-[10px] text-muted-foreground">
                                {formatLensFeedbackOption(feedback.intent)} ·{" "}
                                {formatLensFeedbackOption(feedback.priority)}
                                {" · "}
                                {annotation.kind === "area"
                                  ? "area"
                                  : annotation.selector}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-80">
                              {annotation.comment}
                            </TooltipContent>
                          </Tooltip>
                          <PopoverContent
                            side="top"
                            align="start"
                            className="max-h-96 w-[min(42rem,calc(100vw-2rem))] overflow-auto rounded-lg border border-border/80 bg-popover p-3 shadow-lg"
                          >
                            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-popover-foreground">
                              {attachment.displayContent ?? attachment.content}
                            </pre>
                          </PopoverContent>
                        </Popover>
                        <LensAnnotationFeedbackPopover
                          annotation={annotation}
                          disabled={interactionsDisabled}
                          onApply={(targetAnnotation, nextFeedback) =>
                            applyLensAnnotationFeedback(
                              attachment,
                              targetAnnotation,
                              nextFeedback,
                            )
                          }
                        />
                        <LensAnnotationStylePopover
                          annotation={annotation}
                          disabled={
                            interactionsDisabled ||
                            !attachment.workspaceId ||
                            annotation.kind !== "element"
                          }
                          onApply={(targetAnnotation, patch) =>
                            applyLensAnnotationStyle(
                              attachment,
                              targetAnnotation,
                              patch,
                            )
                          }
                        />
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          disabled={interactionsDisabled}
                          aria-label={`Remove comment ${annotation.pin}`}
                          onClick={() => {
                            void removeLensAnnotation(attachment, annotation);
                          }}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    );
                  });
                })}
              </div>
            </div>
          ) : null}
          {visibleQueuedTurns.length === 0 &&
          (attachedFilePaths.length > 0 ||
            standaloneImageAttachments.length > 0 ||
            workspaceInformationAttachments.length > 0) ? (
            <div className="flex flex-wrap gap-1.5">
              {workspaceInformationAttachments.map((attachment) => (
                <WorkspaceInformationReferenceChip
                  key={attachment.id}
                  reference={attachment.reference}
                  disabled={interactionsDisabled}
                  compact={minimal}
                  onRemove={() =>
                    onAttachmentsChange?.({
                      attachments: (attachments ?? []).filter(
                        (candidate) =>
                          !(
                            candidate.kind === "workspace-information" &&
                            candidate.id === attachment.id
                          ),
                      ),
                    })
                  }
                />
              ))}
              {attachedFilePaths.map((filePath) => (
                <div
                  key={filePath}
                  className={cn(
                    "flex items-center gap-1 rounded-sm border px-2 py-1 text-sm",
                    minimal
                      ? "border-border/60 bg-transparent font-mono text-xs text-muted-foreground"
                      : "border-border/80 bg-secondary/50",
                  )}
                >
                  <span className="font-medium">{filePath}</span>
                  <button
                    type="button"
                    disabled={interactionsDisabled}
                    onClick={() =>
                      onAttachFilesChange({
                        filePaths: attachedFilePaths.filter(
                          (p) => p !== filePath,
                        ),
                      })
                    }
                    className="ml-0.5 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
              {standaloneImageAttachments.map((img) => (
                <div
                  key={img.id}
                  className={cn(
                    "relative flex items-center gap-1 rounded-sm border p-1",
                    minimal
                      ? "border-border/60 bg-transparent"
                      : "border-border/80 bg-secondary/50",
                  )}
                >
                  <img
                    src={img.dataUrl}
                    alt={img.label}
                    className="max-h-16 max-w-24 cursor-zoom-in rounded-sm object-cover"
                    title="Click to view full size"
                    onClick={() =>
                      setImagePreviewSrc({
                        dataUrl: img.dataUrl,
                        label: img.label,
                      })
                    }
                  />
                  <button
                    type="button"
                    disabled={interactionsDisabled}
                    onClick={() =>
                      onAttachmentsChange?.({
                        attachments: (attachments ?? []).filter(
                          (a) => !(a.kind === "image" && a.id === img.id),
                        ),
                      })
                    }
                    className="absolute -right-1 -top-1 rounded-full bg-background p-0.5 text-muted-foreground shadow-sm hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-2",
              minimal && "justify-end",
            )}
          >
            {!minimal ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <ModelEffortSelector
                  value={selectedModel}
                  options={modelOptions}
                  effortValue={
                    effortValue as Exclude<ModelShortcutEffort, ""> | undefined
                  }
                  effortLabel={effortLabel}
                  fastMode={fastMode}
                  disabled={interactionsDisabled}
                  openToken={
                    modelSelectorOpenNonce > 0
                      ? modelSelectorOpenNonce
                      : undefined
                  }
                  onFastModeChange={onFastModeChange}
                  onSelect={({ selection, effort, fastMode: nextFastMode }) => {
                    onModelSelect({
                      selection,
                      effort,
                      fastMode: nextFastMode,
                    });
                    window.requestAnimationFrame(() => focusComposer());
                  }}
                />
                {onPlanModeChange ? (
                  <Tooltip>
                    <TooltipTrigger
                      type="button"
                      disabled={interactionsDisabled}
                      onClick={() => onPlanModeChange(!planMode)}
                      className={tooltipTriggerButtonClassName({
                        className: cn(
                          PROMPT_TOOLBAR_BUTTON,
                          planMode
                            ? getPromptToolbarAccentClass("plan")
                            : undefined,
                          interactionsDisabled &&
                            "cursor-not-allowed opacity-60",
                        ),
                      })}
                    >
                      <ClipboardCheck className="size-3.5" />
                      <span>Plan</span>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {planMode ? "Plan mode ON" : "Plan mode OFF"}
                    </TooltipContent>
                  </Tooltip>
                ) : null}
                {providerModeStatus ? (
                  <PromptInputProviderModePill
                    status={providerModeStatus}
                    presets={providerModePresets ?? []}
                    activePresetId={activeProviderModePresetId ?? null}
                    onSelect={onProviderModeSelect}
                    disabled={interactionsDisabled}
                  />
                ) : null}
                {onThinkingModeChange ? (
                  <Tooltip>
                    <TooltipTrigger
                      type="button"
                      disabled={interactionsDisabled}
                      onClick={() => {
                        const cycle = {
                          adaptive: "enabled",
                          enabled: "disabled",
                          disabled: "adaptive",
                        } as const;
                        onThinkingModeChange(cycle[thinkingMode ?? "adaptive"]);
                      }}
                      className={tooltipTriggerButtonClassName({
                        className: cn(
                          PROMPT_TOOLBAR_BUTTON,
                          thinkingMode === "enabled"
                            ? getPromptToolbarAccentClass("thinking")
                            : thinkingMode === "disabled"
                              ? "text-muted-foreground/50"
                              : undefined,
                          interactionsDisabled &&
                            "cursor-not-allowed opacity-60",
                        ),
                      })}
                    >
                      <Brain
                        className={cn(
                          "size-3.5",
                          thinkingMode === "adaptive" &&
                            "text-prompt-role-thinking",
                        )}
                      />
                      <span>Thinking</span>
                    </TooltipTrigger>
                    <TooltipContent side="top">{`Thinking: ${thinkingMode ?? "adaptive"}`}</TooltipContent>
                  </Tooltip>
                ) : null}
                {advisorControl}
                {reviewModelOptions?.length &&
                onLocalChangeReview &&
                !isTurnActive ? (
                  <LocalChangeReviewDialog
                    workspaceCwd={workspaceCwd}
                    reviewerOptions={reviewModelOptions}
                    preferredReviewerKey={preferredReviewModelKey}
                    disabled={interactionsDisabled}
                    onSubmit={onLocalChangeReview}
                  />
                ) : null}
                {beforeRuntimeAction}
                {hasRuntimeContent ? (
                  isMobile ? (
                    <Drawer swipeDirection="down" showSwipeHandle>
                      <DrawerTrigger
                        render={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={interactionsDisabled}
                            className={cn(PROMPT_TOOLBAR_ICON_BUTTON, "size-9")}
                            aria-label={`Runtime · ${runtimeProfile.label}`}
                            title="Runtime profile for the next turn"
                          />
                        }
                      >
                        <PromptInputRuntimeTriggerIcon
                          profile={runtimeProfile}
                        />
                      </DrawerTrigger>
                      <DrawerContent className="bg-popover shadow-2xl data-[swipe-direction=down]:max-h-[78vh]">
                        <DrawerHeader className="gap-1.5 px-5 pb-4 pt-4 text-left">
                          <div className="flex items-baseline justify-between gap-4">
                            <DrawerTitle className="text-base font-semibold">
                              Runtime profile
                            </DrawerTitle>
                            <span
                              className={cn(
                                "text-xs font-semibold",
                                getRuntimeProfileToneClass(runtimeProfile.tone),
                              )}
                            >
                              {runtimeProfile.label}
                            </span>
                          </div>
                          <DrawerDescription>
                            {runtimeProfile.description} Effective values for
                            the next turn are shown below.
                          </DrawerDescription>
                        </DrawerHeader>
                        <div className="min-h-0 flex-1 overflow-y-auto">
                          <PromptInputRuntimeBar
                            statusItems={runtimeStatusItems}
                          />
                        </div>
                      </DrawerContent>
                    </Drawer>
                  ) : (
                    <Popover>
                      <PopoverTrigger
                        render={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={interactionsDisabled}
                            className={cn(PROMPT_TOOLBAR_ICON_BUTTON, "size-9")}
                            aria-label={`Runtime · ${runtimeProfile.label}`}
                            title="Runtime profile for the next turn"
                          />
                        }
                      >
                        <PromptInputRuntimeTriggerIcon
                          profile={runtimeProfile}
                        />
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        side="top"
                        sideOffset={10}
                        className="w-[min(25rem,calc(100vw-2rem))] gap-0 rounded-xl bg-popover p-0 shadow-xl ring-1 ring-foreground/10"
                      >
                        <div className="px-5 pb-3.5 pt-4">
                          <div className="flex items-baseline justify-between gap-4">
                            <PopoverTitle className="text-base font-semibold">
                              Runtime profile
                            </PopoverTitle>
                            <span
                              className={cn(
                                "text-xs font-semibold",
                                getRuntimeProfileToneClass(runtimeProfile.tone),
                              )}
                            >
                              {runtimeProfile.label}
                            </span>
                          </div>
                          <PopoverDescription className="mt-1">
                            {runtimeProfile.description} Effective values for
                            the next turn are shown below.
                          </PopoverDescription>
                        </div>
                        <PromptInputRuntimeBar
                          statusItems={runtimeStatusItems}
                        />
                      </PopoverContent>
                    </Popover>
                  )
                ) : null}
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              {minimal &&
              reviewModelOptions?.length &&
              onLocalChangeReview &&
              !isTurnActive ? (
                <LocalChangeReviewDialog
                  workspaceCwd={workspaceCwd}
                  reviewerOptions={reviewModelOptions}
                  preferredReviewerKey={preferredReviewModelKey}
                  disabled={interactionsDisabled}
                  onSubmit={onLocalChangeReview}
                />
              ) : null}
              {minimal ? beforeRuntimeAction : null}
              <Tooltip>
                <TooltipTrigger
                  type="button"
                  disabled={interactionsDisabled || !onOpenFileSelector}
                  onClick={() => {
                    void onOpenFileSelector?.();
                  }}
                  className={tooltipTriggerButtonClassName({
                    size: "icon-sm",
                    className: cn(
                      PROMPT_TOOLBAR_ICON_BUTTON,
                      minimal &&
                        "h-8 w-8 rounded-md border border-border/60 bg-background/50 text-foreground hover:bg-muted/40",
                    ),
                  })}
                  aria-label="Attach files"
                >
                  <Paperclip className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent side="top">Attach files</TooltipContent>
              </Tooltip>
              {isTurnActive && !hasDraftPayload ? (
                <Tooltip>
                  <TooltipTrigger
                    type="button"
                    className={tooltipTriggerButtonClassName({
                      size: "icon-sm",
                      className: cn(
                        PROMPT_TOOLBAR_ICON_BUTTON,
                        "text-destructive hover:bg-destructive/10 hover:text-destructive",
                        minimal &&
                          "h-8 w-8 rounded-md border border-destructive/30 bg-background/50",
                      ),
                    })}
                    aria-label="Stop responding"
                    onClick={() => onAbort?.()}
                  >
                    <Square className="size-3 fill-current" />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <span className="inline-flex items-center gap-1">
                      Stop responding
                      <KbdGroup>
                        <Kbd>Esc</Kbd>
                      </KbdGroup>
                    </span>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger
                    type="submit"
                    className={tooltipTriggerButtonClassName({
                      variant: "default",
                      size: "icon-sm",
                      className: cn(
                        "rounded-md",
                        PROMPT_SURFACE_PRIMARY_FOCUS,
                        minimal &&
                          "h-8 w-8 border border-primary/40 bg-primary/10 text-primary hover:bg-primary/15",
                      ),
                    })}
                    disabled={primaryActionDisabled}
                    aria-label={
                      isSteerOrQueueMode
                        ? steerQueueEnterAction === "steer"
                          ? "Steer this turn"
                          : "Queue next turn"
                        : isQueueNextMode
                          ? "Queue next turn"
                          : "Send"
                    }
                  >
                    <Send className="size-3.5" />
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    className={
                      isSteerOrQueueMode
                        ? "flex-col items-start gap-0.5"
                        : undefined
                    }
                  >
                    <span className="inline-flex items-center gap-1">
                      {isSteerOrQueueMode
                        ? steerQueueEnterAction === "steer"
                          ? "Steer"
                          : "Queue"
                        : isQueueNextMode
                          ? "Queue next turn"
                          : "Send"}
                      <KbdGroup>
                        <Kbd>↵</Kbd>
                      </KbdGroup>
                    </span>
                    {isSteerOrQueueMode ? (
                      <span className="inline-flex items-center gap-1 text-background/70">
                        {steerQueueEnterAction === "steer" ? "Queue" : "Steer"}
                        <KbdGroup>
                          <Kbd>Tab</Kbd>
                        </KbdGroup>
                      </span>
                    ) : null}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </form>
      </BorderBeam>
      <ImageLightbox
        open={Boolean(imagePreviewSrc)}
        imageSrc={imagePreviewSrc?.dataUrl ?? ""}
        alt={imagePreviewSrc?.label ?? "Image preview"}
        imageTitle="Click to close"
        onClose={() => setImagePreviewSrc(null)}
      />
    </>
  );
}
