import {
  Brain,
  ClipboardCheck,
  FileText,
  FolderOpen,
  GitPullRequest,
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
  Zap,
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
  findModelShortcutOption,
  resolveModelShortcutSlot,
} from "@/lib/providers/model-shortcuts";
import {
  DEFAULT_PROMPT_COMMENT_SHORTCUT,
  isPromptCommentShortcut,
  type PromptCommentShortcut,
} from "@/lib/prompt-comment-shortcuts";
import {
  DEFAULT_STEER_QUEUE_ENTER_ACTION,
  tabActionForSteerQueueEnterAction,
  type SteerQueueEnterAction,
} from "@/lib/steer-queue-shortcuts";
import type {
  LensAnnotation,
  LensStyleEdit,
  LensSourceMappingConfig,
} from "@/lib/lens/lens.types";
import {
  buildLensAnnotationsAttachment,
  getLensCommentImageId,
  isAnyLensCommentImageAttachment,
} from "@/lib/lens/lens-annotation-attachment";
import { ModelSelector, type ModelSelectorOption } from "./model-selector";
import {
  PromptInputProviderModePill,
  type PromptInputProviderModeStatus,
} from "./prompt-input-provider-mode";
import {
  PromptInputGoalStatusStrip,
  type PromptInputGoalStatus,
} from "./prompt-input-goal-status";
import {
  PromptInputRuntimeBar,
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
  recommendedModelOptions?: readonly ModelSelectorOption[];
  modelShortcutKeys?: readonly string[];
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
  onModelSelect: (args: { selection: ModelSelectorOption }) => void;
  onAttachFilesChange: (args: { filePaths: string[] }) => void;
  onOpenFileSelector?: () => void;
  onAttachmentsChange?: (args: { attachments: Attachment[] }) => void;
  onPasteFiles?: (args: { files: File[] }) => void | Promise<void>;
  onProviderModeSelect?: (presetId: ProviderModePresetId) => void;
  effortLabel?: string;
  effortValue?: string;
  onEffortCycle?: () => void;
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
  leadingToolbarAction?: ReactNode;
  crossReviewProvider?: "claude-code" | "codex" | null;
  onCrossReview?: (args: { instructions?: string }) => void;
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
    | "default"
    | "outline"
    | "secondary"
    | "ghost"
    | "destructive"
    | "link";
  size?:
    | "default"
    | "xs"
    | "sm"
    | "lg"
    | "icon"
    | "icon-xs"
    | "icon-sm"
    | "icon-lg";
  className?: string;
}) {
  return buttonVariants({
    variant: args.variant ?? "ghost",
    size: args.size ?? "sm",
    className: args.className,
  });
}

function getPromptToolbarAccentClass(
  tone: "plan" | "thinking" | "effort" | "fast",
) {
  if (tone === "thinking")
    return "text-prompt-role-thinking hover:text-prompt-role-thinking";
  if (tone === "effort")
    return "text-prompt-role-effort hover:text-prompt-role-effort";
  if (tone === "fast")
    return "text-prompt-role-fast hover:text-prompt-role-fast";
  return "text-prompt-role-plan hover:text-prompt-role-plan";
}

function isHighestEffortValue(value?: string) {
  return value === "ultra" || value === "max" || value === "xhigh";
}

function getEffortIconToneClass(value?: string) {
  if (isHighestEffortValue(value) || value === "high") {
    return "text-prompt-role-effort";
  }
  if (value === "medium") {
    return "text-prompt-role-effort/60";
  }
  return undefined;
}

function getPaletteItemSelector(index: number) {
  return `[${PALETTE_ITEM_INDEX_ATTRIBUTE}="${index}"]`;
}

function CrossReviewPopover(args: {
  provider: "claude-code" | "codex";
  disabled: boolean;
  onSubmit: (submitArgs: { instructions?: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState("");
  const providerLabel = args.provider === "codex" ? "Codex" : "Claude Code";
  const crossReviewLabel = `Review by ${providerLabel}`;

  function handleSubmit() {
    const trimmed = instructions.trim();
    args.onSubmit({ instructions: trimmed || undefined });
    setOpen(false);
    setInstructions("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverAnchor asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={args.disabled}
              onClick={() => setOpen((prev) => !prev)}
              className="h-8 gap-2 px-3 text-muted-foreground hover:bg-secondary/30 hover:text-foreground"
              aria-label={crossReviewLabel}
            >
              <GitPullRequest className="size-3.5" />
              <span>Review by</span>
              <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
                <ModelIcon providerId={args.provider} className="size-3.5" />
                {providerLabel}
              </span>
            </Button>
          </PopoverAnchor>
        </TooltipTrigger>
        {!open ? (
          <TooltipContent side="top">{crossReviewLabel}</TooltipContent>
        ) : null}
      </Tooltip>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        className="w-72 rounded-lg border border-border/80 bg-popover p-3 shadow-lg"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="space-y-2.5">
          <div className="flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <GitPullRequest className="size-4" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">Review by</p>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ModelIcon providerId={args.provider} className="size-3.5" />
                  {providerLabel}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Run the alternate model&apos;s review flow on the current task.
              </p>
            </div>
          </div>
          <Textarea
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            placeholder="Optional instructions, e.g. focus on regressions or missing tests..."
            className="min-h-[60px] resize-y text-sm"
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                handleSubmit();
              }
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              <kbd className="rounded border border-border/70 px-1 py-px text-[10px]">
                ⌘
              </kbd>{" "}
              <kbd className="rounded border border-border/70 px-1 py-px text-[10px]">
                ↵
              </kbd>
            </span>
            <Button
              type="button"
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={handleSubmit}
            >
              Start review
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
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
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          disabled={disabled || !annotation.selector}
          aria-label={`Edit styles for comment ${annotation.pin}`}
        >
          <SlidersHorizontal className="size-3" />
        </Button>
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
              <span className="font-medium text-muted-foreground">
                {field}
              </span>
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
    recommendedModelOptions,
    modelShortcutKeys,
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
    onEffortCycle,
    fastMode,
    onFastModeChange,
    planMode,
    onPlanModeChange,
    thinkingMode,
    onThinkingModeChange,
    pendingUserInput,
    onUserInputSubmit,
    onUserInputDeny,
    leadingToolbarAction,
    crossReviewProvider,
    onCrossReview,
    onSubmit,
    onStagePromptBatch,
    onRemovePromptBatchItem,
    onUpdateQueuedTurn,
    onRemoveQueuedTurn,
    onClearQueuedNextTurn,
    onAbort,
  } = args;
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
    () => new Map(imageAttachments.map((attachment) => [attachment.id, attachment])),
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
        ): attachment is Extract<Attachment, { kind: "workspace-information" }> =>
          attachment.kind === "workspace-information",
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
  const [dismissedWorkspaceInformationToken, setDismissedWorkspaceInformationToken] =
    useState<string | null>(null);
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
  const deferredSkillQuery = useDeferredValue(activeSkillToken?.query ?? "");
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
  const filteredSkillItems = useMemo(() => {
    const query = deferredSkillQuery.trim().toLowerCase();
    const items = skillPaletteItems ?? [];
    if (!query) {
      return items;
    }
    return items.filter((skill) => {
      const haystacks = [
        skill.slug,
        skill.name,
        skill.description,
        skill.scope,
        skill.provider,
      ];
      return haystacks.some((entry) => entry.toLowerCase().includes(query));
    });
  }, [deferredSkillQuery, skillPaletteItems]);
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
    dismissedWorkspaceInformationToken !== activeWorkspaceInformationToken.token,
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
  const hasRuntimeDrawerContent = Boolean(
    (runtimeStatusItems?.length ?? 0) > 0,
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
    if (interactionsDisabled) {
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
      onModelSelect({ selection: shortcutOption });
      window.requestAnimationFrame(() => focusComposer());
    };

    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [
    focusComposer,
    handleShiftTabShortcut,
    interactionsDisabled,
    modelOptions,
    modelShortcutKeys,
    onModelSelect,
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
    }) => {
      if (!args.attachment.workspaceId || !onAttachmentsChange) {
        return;
      }
      const currentAttachments = attachments ?? [];
      const nextAttachment =
        args.annotations.length > 0
          ? buildLensAnnotationsAttachment({
              id: args.attachment.id,
              workspaceId: args.attachment.workspaceId,
              annotations: args.annotations,
              sourceMappingConfig: lensSourceMappingConfig,
            })
          : null;
      onAttachmentsChange({
        attachments: currentAttachments.flatMap((candidate) => {
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

  const removeLensAnnotation = useCallback(
    async (
      attachment: Extract<Attachment, { kind: "lens-annotations" }>,
      annotation: LensAnnotation,
    ) => {
      if (attachment.workspaceId) {
        const result = await window.api?.lens?.removeAnnotation?.({
          workspaceId: attachment.workspaceId,
          annotationId: annotation.id,
        });
        if (!result?.ok) {
          toast.error("Comment removal failed", {
            description: result?.message ?? "Lens could not remove that comment.",
          });
        }
      }
      updateLensAnnotationAttachment({
        attachment,
        annotations: (attachment.annotations ?? []).filter(
          (candidate) => candidate.id !== annotation.id,
        ),
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
        selector: annotation.selector,
        patch,
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
          return {
            ...candidate,
            computedStyles: {
              ...(candidate.computedStyles ?? {}),
              ...Object.fromEntries(
                edits.map((edit) => [edit.property, edit.after]),
              ),
            },
            styleEdits: [...(candidate.styleEdits ?? []), ...edits],
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
        ? getActiveSlashCommandTokenMatch({
            value: currentValue,
            caretIndex: caretPosition,
          }) ?? activeCommandToken
        : null;
    pendingSkillTokenRef.current =
      activePalette === "skill"
        ? getActiveSkillTokenMatch({
            value: currentValue,
            caretIndex: caretPosition,
          }) ?? activeSkillToken
        : null;
    pendingWorkspaceInformationTokenRef.current =
      activePalette === "info"
        ? getActiveWorkspaceInformationTokenMatch({
            text: currentValue,
            caretIndex: caretPosition,
          }) ?? activeWorkspaceInformationToken
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
      <div className="space-y-3 rounded-xl border border-primary/40 bg-background/95 p-3">
        <UserInputCard
          toolName={pendingUserInput.part.toolName}
          questions={pendingUserInput.part.questions}
          state={pendingUserInput.part.state}
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
        size={borderBeamSize}
        colorVariant={borderBeamVariant}
        strength={borderBeamStrength}
        theme="auto"
        className={cn(
          "transition-[box-shadow]",
          !minimal &&
            "rounded-xl focus-within:ring-4 focus-within:ring-ring/10",
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
              : "rounded-xl border border-border/70 bg-background/95 p-3 focus-within:border-ring",
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
            <div className="space-y-2 rounded-xl border border-border/80 bg-card/95 px-3 py-2.5 shadow-lg supports-backdrop-filter:backdrop-blur-md">
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
          <Popover open={activePalette !== null} modal={false}>
            <PopoverAnchor asChild>
              <div className={cn("space-y-2", minimal && "space-y-3")}>
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
                            imageFiles.length > 0 &&
                            Boolean(onAttachmentsChange);
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
                                selectedIndex:
                                  selectedWorkspaceInformationIndex,
                                triggerKey: event.key,
                              });
                              if (selectedItem) {
                                event.preventDefault();
                                applyWorkspaceInformationSelection(
                                  selectedItem,
                                );
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
                              const selectedItem =
                                getAcceptedCommandPaletteItem({
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
                          if (isPromptCommentShortcut({
                            shortcut: promptCommentShortcut,
                            key: event.key,
                            shiftKey: event.shiftKey,
                            altKey: event.altKey,
                            ctrlKey: event.ctrlKey,
                            metaKey: event.metaKey,
                            isComposing: event.nativeEvent.isComposing,
                          })) {
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
                                ? steerQueueEnterAction === "steer"
                                  ? "Steer this turn..."
                                  : "Queue a follow-up..."
                                : isQueueNextMode
                                  ? "Type the next turn..."
                                  : "Type a request..."
                              : isSteerOrQueueMode
                                ? steerQueueEnterAction === "steer"
                                  ? "Steer this turn… (↵)"
                                  : "Queue a follow-up… (↵)"
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
              </div>
            </PopoverAnchor>
            <PopoverContent
              align="start"
              side="top"
              sideOffset={8}
              onOpenAutoFocus={(event) => event.preventDefault()}
              // Focus lives in the composer (outside this content) while the
              // palette is open, so transient focus churn must not dismiss it.
              // Dismissal is driven by pointer-down outside only.
              onFocusOutside={(event) => event.preventDefault()}
              onInteractOutside={(event) => {
                if (event.detail.originalEvent.type === "focusin") {
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
              className="max-h-[min(40rem,var(--radix-popover-content-available-height))] w-[min(44rem,calc(100vw-2rem))] gap-0 overflow-hidden rounded-xl border border-border/80 bg-popover p-1 shadow-lg"
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
                    <CommandEmpty>No matching Information reference.</CommandEmpty>
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
                              className="min-h-14 cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5"
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
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">
                                    {item.name}
                                  </span>
                                  <Badge
                                    variant="secondary"
                                    className="h-5 px-1.5 text-[10px] uppercase tracking-wide"
                                  >
                                    {item.provider === "shared"
                                      ? "Shared"
                                      : item.provider === "claude-code"
                                        ? "Claude"
                                        : "Codex"}
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
                      {activePalette === "skill" &&
                      userSkillItems.length > 0 ? (
                        <CommandGroup heading="User skills">
                          {userSkillItems.map(({ item, index }) => (
                            <CommandItem
                              key={item.id}
                              value={item.slug}
                              className="min-h-14 cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5"
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
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">
                                    {item.name}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className="h-5 px-1.5 text-[10px] uppercase tracking-wide"
                                  >
                                    {item.provider === "shared"
                                      ? "Shared"
                                      : item.provider === "claude-code"
                                        ? "Claude"
                                        : "Codex"}
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
                      {activePalette === "skill" &&
                      globalSkillItems.length > 0 ? (
                        <CommandGroup heading="Global skills">
                          {globalSkillItems.map(({ item, index }) => (
                            <CommandItem
                              key={item.id}
                              value={item.slug}
                              className="min-h-14 cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5"
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
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">
                                    {item.name}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className="h-5 px-1.5 text-[10px] uppercase tracking-wide"
                                  >
                                    {item.provider === "shared"
                                      ? "Shared"
                                      : item.provider === "claude-code"
                                        ? "Claude"
                                        : "Codex"}
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
                      Enter or Tab inserts the highlighted Information reference.
                    </p>
                    <p className="mt-2">
                      Type `@` to search Information. Selection inserts
                      `@info:section` for a full section or
                      `@info:section/item` for one item. `@lens` references the
                      current Lens browser page.
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
                  {commentItemCount === 1 ? "" : "s"}{" "}
                  will send as one prompt
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
                      <span className="truncate text-foreground">{summary}</span>
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
                            <TooltipTrigger asChild>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  title={
                                    attachment.displayContent ??
                                    attachment.content
                                  }
                                  className="flex min-w-0 items-center gap-1.5 px-2 py-1 hover:bg-secondary/70"
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
                                </button>
                              </PopoverTrigger>
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
                    const screenshot = attachment.workspaceId
                      ? imageAttachmentsById.get(
                          getLensCommentImageId({
                            workspaceId: attachment.workspaceId,
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
                            <TooltipTrigger asChild>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  title={annotation.comment}
                                  className="min-w-0 flex-1 text-left hover:text-foreground"
                                >
                                  <span className="block truncate font-medium">
                                    {annotation.comment}
                                  </span>
                                  <span className="block truncate text-[10px] text-muted-foreground">
                                    {annotation.kind === "area"
                                      ? "area"
                                      : annotation.selector}
                                  </span>
                                </button>
                              </PopoverTrigger>
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
                <ModelSelector
                  value={selectedModel}
                  options={modelOptions}
                  recommendedOptions={recommendedModelOptions}
                  disabled={interactionsDisabled}
                  openToken={
                    modelSelectorOpenNonce > 0
                      ? modelSelectorOpenNonce
                      : undefined
                  }
                  onSelect={({ selection }) => {
                    onModelSelect({ selection });
                    window.requestAnimationFrame(() => focusComposer());
                  }}
                />
                {providerModeStatus ? (
                  <PromptInputProviderModePill
                    status={providerModeStatus}
                    presets={providerModePresets ?? []}
                    activePresetId={activeProviderModePresetId ?? null}
                    onSelect={onProviderModeSelect}
                    disabled={interactionsDisabled}
                  />
                ) : null}
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
                {onEffortCycle && effortLabel ? (
                  <Tooltip>
                    <TooltipTrigger
                      type="button"
                      disabled={interactionsDisabled}
                      onClick={() => onEffortCycle()}
                      className={tooltipTriggerButtonClassName({
                        className: cn(
                          PROMPT_TOOLBAR_BUTTON,
                          isHighestEffortValue(effortValue)
                            ? getPromptToolbarAccentClass("effort")
                            : undefined,
                          interactionsDisabled &&
                            "cursor-not-allowed opacity-60",
                        ),
                      })}
                    >
                      <Sparkles
                        className={cn(
                          "size-3.5",
                          getEffortIconToneClass(effortValue),
                        )}
                      />
                      <span>{effortLabel}</span>
                    </TooltipTrigger>
                    <TooltipContent side="top">{`Effort: ${effortLabel} — click to cycle`}</TooltipContent>
                  </Tooltip>
                ) : null}
                {onFastModeChange ? (
                  <Tooltip>
                    <TooltipTrigger
                      type="button"
                      disabled={interactionsDisabled}
                      onClick={() => onFastModeChange(!fastMode)}
                      className={tooltipTriggerButtonClassName({
                        className: cn(
                          PROMPT_TOOLBAR_BUTTON,
                          fastMode
                            ? getPromptToolbarAccentClass("fast")
                            : undefined,
                          interactionsDisabled &&
                            "cursor-not-allowed opacity-60",
                        ),
                      })}
                    >
                      <Zap
                        className={cn("size-3.5", fastMode && "fill-current")}
                      />
                      <span>Fast</span>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {fastMode
                        ? "Fast mode ON — faster responses with smaller model"
                        : "Fast mode OFF"}
                    </TooltipContent>
                  </Tooltip>
                ) : null}
                {hasRuntimeDrawerContent ? (
                  <Drawer direction="bottom">
                    <DrawerTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={interactionsDisabled}
                        className={cn(PROMPT_TOOLBAR_ICON_BUTTON, "h-9 w-9")}
                        aria-label="Current Runtime"
                        title="Current runtime status"
                      >
                        <SlidersHorizontal className="size-3.5" />
                      </Button>
                    </DrawerTrigger>
                    <DrawerContent className="border-border/80 bg-background shadow-2xl data-[vaul-drawer-direction=bottom]:max-h-[78vh]">
                      <DrawerHeader className="gap-2 border-b border-border/70 px-5 pb-5 pt-5 text-left md:px-6">
                        <DrawerTitle className="text-lg font-semibold">
                          Current Runtime
                        </DrawerTitle>
                        <DrawerDescription>
                          Inspect the effective runtime configuration for the
                          next turn from this composer.
                        </DrawerDescription>
                      </DrawerHeader>
                      <div className="flex-1 overflow-y-auto px-5 py-5 md:px-6">
                        <PromptInputRuntimeBar
                          statusItems={runtimeStatusItems}
                          withBorder={false}
                        />
                      </div>
                    </DrawerContent>
                  </Drawer>
                ) : null}
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              {leadingToolbarAction}
              {crossReviewProvider && !isTurnActive ? (
                <CrossReviewPopover
                  provider={crossReviewProvider}
                  disabled={interactionsDisabled}
                  onSubmit={(submitArgs) => onCrossReview?.(submitArgs)}
                />
              ) : null}
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
