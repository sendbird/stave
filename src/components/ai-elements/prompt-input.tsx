import {
  Brain,
  ClipboardCheck,
  FolderOpen,
  GitPullRequest,
  Globe2,
  OctagonX,
  Paperclip,
  Send,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import type {
  Attachment,
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
  Kbd,
  KbdGroup,
  Popover,
  PopoverAnchor,
  PopoverContent,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  buttonVariants,
} from "@/components/ui";
import { useAppStore } from "@/store/app.store";
import { UserInputCard } from "./user-input-card";
import type {
  CommandPaletteItem,
  CommandPaletteProviderNote,
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
import type { SkillCatalogEntry } from "@/lib/skills/types";
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
import { ModelSelector, type ModelSelectorOption } from "./model-selector";
import {
  PromptInputProviderModePill,
  type PromptInputProviderModeStatus,
} from "./prompt-input-provider-mode";
import {
  PromptInputRuntimeBar,
  type PromptInputRuntimeStatusItem,
} from "./prompt-input-runtime-bar";
import { ModelIcon } from "./model-icon";
import { Suggestion, Suggestions } from "./suggestion";

interface PromptInputProps {
  value: string;
  minimal?: boolean;
  disabled?: boolean;
  isTurnActive?: boolean;
  submitMode?: "send" | "queue-next";
  queuedNextTurn?: PromptDraftQueuedNextTurn | null;
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
  runtimeStatusItems?: readonly PromptInputRuntimeStatusItem[];
  commandPaletteItems?: readonly CommandPaletteItem[];
  commandPaletteProviderNote?: CommandPaletteProviderNote;
  skillsEnabled?: boolean;
  skillsAutoSuggest?: boolean;
  skillPaletteItems?: readonly SkillCatalogEntry[];
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
  }) => void | Promise<void>;
  onClearQueuedNextTurn?: () => void;
  onAbort?: () => void;
}

const SUPPORTS_FIELD_SIZING_CONTENT =
  typeof CSS !== "undefined" &&
  typeof CSS.supports === "function" &&
  CSS.supports("field-sizing", "content");
const PALETTE_ITEM_INDEX_ATTRIBUTE = "data-palette-index";
const PROMPT_SURFACE_FOCUS_VISIBLE_RESET =
  "focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0";
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
  return value === "max" || value === "xhigh";
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
                <p className="text-sm font-medium text-foreground">
                  Review by
                </p>
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

export function PromptInput(args: PromptInputProps) {
  const {
    disabled,
    minimal = false,
    isTurnActive,
    submitMode = "send",
    queuedNextTurn,
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
    runtimeStatusItems,
    commandPaletteItems,
    commandPaletteProviderNote,
    skillsEnabled,
    skillsAutoSuggest,
    skillPaletteItems,
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
    onClearQueuedNextTurn,
    onAbort,
  } = args;
  const queuedPromptPreview = queuedNextTurn?.content?.trim() ?? "";
  const queuedPromptSummary = queuedPromptPreview.replace(/\s+/g, " ").trim();
  const imageAttachments = useMemo(
    () =>
      (attachments ?? []).filter(
        (a): a is Extract<Attachment, { kind: "image" }> => a.kind === "image",
      ),
    [attachments],
  );
  const queuedFileCount = queuedNextTurn ? attachedFilePaths.length : 0;
  const queuedImageCount = queuedNextTurn ? imageAttachments.length : 0;
  const [imagePreviewSrc, setImagePreviewSrc] = useState<{
    dataUrl: string;
    label: string;
  } | null>(null);
  const [dismissedCommandToken, setDismissedCommandToken] = useState<
    string | null
  >(null);
  const [selectedCommandIndex, setSelectedCommandIndex] =
    useState(NO_COMMAND_SELECTION);
  const [dismissedSkillToken, setDismissedSkillToken] = useState<string | null>(
    null,
  );
  const [selectedSkillIndex, setSelectedSkillIndex] =
    useState(NO_COMMAND_SELECTION);
  const [selectedPromptHistoryIndex, setSelectedPromptHistoryIndex] = useState(
    NO_PROMPT_HISTORY_SELECTION,
  );
  const [draftBeforeHistory, setDraftBeforeHistory] = useState("");
  const [caretIndex, setCaretIndex] = useState(value.length);
  const [isPromptInputFocused, setIsPromptInputFocused] = useState(false);
  const [modelSelectorOpenNonce, setModelSelectorOpenNonce] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const textareaAutosizeFrameRef = useRef<number | null>(null);
  const commandListRef = useRef<HTMLDivElement | null>(null);
  const wasTurnActiveRef = useRef(Boolean(isTurnActive));
  const borderBeamEnabled = useAppStore(
    (state) => state.settings.borderBeamEnabled,
  );
  const borderBeamSize = useAppStore((state) => state.settings.borderBeamSize);
  const borderBeamVariant = useAppStore(
    (state) => state.settings.borderBeamVariant,
  );
  const showBorderBeam = borderBeamEnabled && !minimal && Boolean(isTurnActive);
  const interactionsDisabled = Boolean(disabled);
  const hasDraftPayload =
    value.trim().length > 0 ||
    attachedFilePaths.length > 0 ||
    imageAttachments.length > 0;
  const primaryActionDisabled = Boolean(disabled || !hasDraftPayload);
  const isQueueNextMode = submitMode === "queue-next";
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
  const indexedCommandItems = useMemo(
    () => filteredCommandItems.map((item, index) => ({ item, index })),
    [filteredCommandItems],
  );
  const indexedSkillItems = useMemo(
    () => filteredSkillItems.map((item, index) => ({ item, index })),
    [filteredSkillItems],
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
  const commandPaletteOpen = Boolean(
    activeCommandToken &&
    dismissedCommandToken !== activeCommandToken.token &&
    (filteredCommandItems.length > 0 || commandPaletteProviderNote),
  );
  const skillPaletteOpen = Boolean(
    skillsEnabled &&
    skillsAutoSuggest &&
    activeSkillToken &&
    dismissedSkillToken !== activeSkillToken.token,
  );
  const activePalette = skillPaletteOpen
    ? "skill"
    : commandPaletteOpen
      ? "command"
      : null;
  const paletteValue = useMemo(() => {
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
    selectedSkillIndex,
    selectedCommandIndex,
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
    !queuedNextTurn;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    if (SUPPORTS_FIELD_SIZING_CONTENT) {
      textarea.style.height = "";
      textarea.style.overflowY = "auto";
      return;
    }
    const measureHeight = () => {
      textarea.style.height = "auto";
      const scrollHeight = textarea.scrollHeight;
      const nextHeight = Math.min(scrollHeight, maxTextareaHeight);
      const nextOverflowY =
        scrollHeight > maxTextareaHeight ? "auto" : "hidden";
      if (textarea.style.height !== `${nextHeight}px`) {
        textarea.style.height = `${nextHeight}px`;
      }
      if (textarea.style.overflowY !== nextOverflowY) {
        textarea.style.overflowY = nextOverflowY;
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
      textareaRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [focusToken, interactionsDisabled]);

  useEffect(() => {
    const wasTurnActive = wasTurnActiveRef.current;
    const isTurnNowActive = Boolean(isTurnActive);
    if (wasTurnActive && !isTurnNowActive) {
      textareaRef.current?.focus();
    }
    wasTurnActiveRef.current = isTurnNowActive;
  }, [isTurnActive]);

  const focusComposer = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.focus();
    const nextCaretIndex = textarea.value.length;
    textarea.setSelectionRange(nextCaretIndex, nextCaretIndex);
    setCaretIndex(nextCaretIndex);
  }, []);

  const syncComposerFocus = useCallback(() => {
    setIsPromptInputFocused(
      typeof document !== "undefined" &&
        document.activeElement === textareaRef.current,
    );
  }, []);

  const handleShiftTabShortcut = useCallback(
    (event: KeyboardEvent | ReactKeyboardEvent<HTMLTextAreaElement>) => {
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
        if (
          !textareaRef.current ||
          document.activeElement === textareaRef.current
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
    setSelectedCommandIndex(NO_COMMAND_SELECTION);
  }, [activeCommandToken?.token]);

  useEffect(() => {
    setSelectedSkillIndex(NO_COMMAND_SELECTION);
  }, [activeSkillToken?.token]);

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
    const list = commandListRef.current;
    if (!list || activePalette === null) {
      return;
    }
    const selectedIndex =
      activePalette === "skill" ? selectedSkillIndex : selectedCommandIndex;
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
  }, [activePalette, selectedCommandIndex, selectedSkillIndex]);

  async function submitCurrentMessage() {
    const nextText = value.trim();
    if (
      !nextText &&
      attachedFilePaths.length === 0 &&
      imageAttachments.length === 0
    ) {
      return;
    }
    await onSubmit({ text: nextText, filePaths: attachedFilePaths });
    setSelectedPromptHistoryIndex(NO_PROMPT_HISTORY_SELECTION);
    setDraftBeforeHistory("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitCurrentMessage();
  }

  function syncCaretPosition(nextTarget: HTMLTextAreaElement | null) {
    setCaretIndex(nextTarget?.selectionStart ?? 0);
  }

  function applyCommandSelection(item: CommandPaletteItem) {
    if (!activeCommandToken) {
      return;
    }
    const nextValue = replaceSlashCommandToken({
      value,
      match: activeCommandToken,
      command: item,
    });
    const nextCaretIndex = activeCommandToken.start + item.command.length + 1;
    onValueChange(nextValue);
    setDismissedCommandToken(null);
    setCaretIndex(nextCaretIndex);
    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }
      textarea.focus();
      textarea.setSelectionRange(nextCaretIndex, nextCaretIndex);
    });
  }

  function applySkillSelection(item: SkillCatalogEntry) {
    if (!activeSkillToken) {
      return;
    }
    const nextValue = replaceSkillToken({
      value,
      match: activeSkillToken,
      skill: item,
    });
    const nextCaretIndex = activeSkillToken.start + item.slug.length + 2;
    onValueChange(nextValue);
    setDismissedSkillToken(null);
    setCaretIndex(nextCaretIndex);
    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }
      textarea.focus();
      textarea.setSelectionRange(nextCaretIndex, nextCaretIndex);
    });
  }

  function applyPromptHistoryNavigation(direction: "previous" | "next") {
    const textarea = textareaRef.current;
    const shouldUseBoundaryCheck =
      selectedPromptHistoryIndex === NO_PROMPT_HISTORY_SELECTION;

    if (shouldUseBoundaryCheck) {
      if (!textarea) {
        return false;
      }
      const selectionStart = textarea.selectionStart ?? 0;
      const selectionEnd = textarea.selectionEnd ?? selectionStart;
      const boundaryReached = isPromptHistoryBoundaryReached({
        value,
        selectionStart,
        selectionEnd,
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
    setSelectedPromptHistoryIndex(navigation.selectedIndex);
    setDraftBeforeHistory(navigation.draftBeforeHistory);
    const nextCaretIndex = navigation.value.length;
    setCaretIndex(nextCaretIndex);
    window.requestAnimationFrame(() => {
      const nextTextarea = textareaRef.current;
      if (!nextTextarea) {
        return;
      }
      nextTextarea.focus();
      nextTextarea.setSelectionRange(nextCaretIndex, nextCaretIndex);
    });
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

        The `focus-within:ring-*` pulse would be clipped by the library
        wrapper's `overflow: hidden`, so we relocate it onto the wrapper
        itself (matching `rounded-xl` on the non-minimal form keeps the ring
        radius visually aligned with the inner border).
      */}
      <BorderBeam
        active={showBorderBeam}
        size={borderBeamSize}
        colorVariant={borderBeamVariant}
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
        {queuedNextTurn ? (
          <div className="flex flex-wrap items-start gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
            <Badge
              variant="secondary"
              className="mt-0.5 h-5 px-1.5 text-[10px] uppercase tracking-wide"
            >
              Queued next
            </Badge>
            <div className="min-w-0 flex-1 space-y-1">
              {queuedPromptSummary ? (
                <p
                  className="truncate text-sm font-medium text-foreground"
                  title={queuedPromptPreview}
                >
                  {queuedPromptSummary}
                </p>
              ) : (
                <p className="text-sm font-medium text-foreground">
                  {queuedFileCount > 0 || queuedImageCount > 0
                    ? "Queued follow-up with attached context."
                    : "Next-turn draft is staged."}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span>
                  {isTurnActive
                    ? "Sends automatically when the current response finishes."
                    : "Queued follow-up is ready to send."}
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
              </div>
            </div>
            {onClearQueuedNextTurn ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onClearQueuedNextTurn()}
                className="ml-auto h-7 px-2 text-xs"
              >
                Clear
              </Button>
            ) : null}
          </div>
        ) : null}
        <Popover open={activePalette !== null} modal={false}>
          <PopoverAnchor asChild>
            <div className={cn("space-y-2", minimal && "space-y-3")}>
              <div
                className={cn(
                  minimal
                    ? "rounded-md border border-border/60 bg-background/55 px-3 py-2.5 supports-backdrop-filter:backdrop-blur-md"
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
                            "pointer-events-auto h-8 gap-2 shadow-sm supports-backdrop-filter:backdrop-blur-md",
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
                    <Textarea
                      ref={textareaRef}
                      value={value}
                      disabled={interactionsDisabled}
                      onChange={(event) => {
                        syncCaretPosition(event.target);
                        onValueChange(event.target.value);
                      }}
                      onFocus={(event) => {
                        syncCaretPosition(event.currentTarget);
                        onFocus?.();
                      }}
                      onBlur={() => onBlur?.()}
                      onClick={(event) =>
                        syncCaretPosition(event.currentTarget)
                      }
                      onKeyUp={(event) =>
                        syncCaretPosition(event.currentTarget)
                      }
                      onSelect={(event) =>
                        syncCaretPosition(event.currentTarget)
                      }
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
                        if (event.key !== "Enter") {
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
                          activePalette === "skill"
                            ? filteredSkillItems.length > 0
                            : activePalette === "command"
                              ? filteredCommandItems.length > 0
                              : false;
                        if (paletteHasAcceptedItems) {
                          event.preventDefault();
                          return;
                        }
                        event.preventDefault();
                        void submitCurrentMessage();
                      }}
                      placeholder={
                        minimal && isPromptInputFocused
                          ? ""
                          : minimal
                            ? isQueueNextMode
                              ? "Type the next turn..."
                              : "Type a request..."
                            : isQueueNextMode
                              ? "Use / for commands, $ for skills (Enter to queue next)"
                              : "Use / for commands, $ for skills (Enter to send)"
                      }
                      rows={minimal ? 1 : undefined}
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
            onInteractOutside={() => {
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
                {activePalette === "skill" &&
                filteredSkillItems.length === 0 ? (
                  <CommandEmpty>No matching skill.</CommandEmpty>
                ) : activePalette === "command" &&
                  filteredCommandItems.length === 0 ? (
                  <CommandEmpty>No matching slash command.</CommandEmpty>
                ) : (
                  <>
                    {activePalette === "skill" && localSkillItems.length > 0 ? (
                      <CommandGroup heading="Workspace skills">
                        {localSkillItems.map(({ item, index }) => (
                          <CommandItem
                            key={item.id}
                            value={item.slug}
                            className="min-h-14 cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5"
                            data-palette-index={index}
                            onMouseEnter={() => setSelectedSkillIndex(index)}
                            onMouseDown={(event) => event.preventDefault()}
                            onSelect={() => applySkillSelection(item)}
                          >
                            <div className="flex items-start pt-0.5">
                              {renderSkillScopeIcon(item.scope)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{item.name}</span>
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
                    {activePalette === "skill" && userSkillItems.length > 0 ? (
                      <CommandGroup heading="User skills">
                        {userSkillItems.map(({ item, index }) => (
                          <CommandItem
                            key={item.id}
                            value={item.slug}
                            className="min-h-14 cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5"
                            data-palette-index={index}
                            onMouseEnter={() => setSelectedSkillIndex(index)}
                            onMouseDown={(event) => event.preventDefault()}
                            onSelect={() => applySkillSelection(item)}
                          >
                            <div className="flex items-start pt-0.5">
                              {renderSkillScopeIcon(item.scope)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{item.name}</span>
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
                            onMouseDown={(event) => event.preventDefault()}
                            onSelect={() => applySkillSelection(item)}
                          >
                            <div className="flex items-start pt-0.5">
                              {renderSkillScopeIcon(item.scope)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{item.name}</span>
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
                            onMouseEnter={() => setSelectedCommandIndex(index)}
                            onMouseDown={(event) => event.preventDefault()}
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
              {activePalette === "skill" ? (
                <div className="border-t border-border/70 px-3 py-2.5 text-xs text-muted-foreground">
                  <p className="flex items-center gap-2 font-medium text-foreground">
                    <Sparkles className="size-3.5" />
                    Tab inserts the highlighted skill token. Selected skills are
                    normalized on send.
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
                    Tab inserts the highlighted command. Enter sends normally
                    when nothing is selected.
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
        {!queuedNextTurn &&
        (attachedFilePaths.length > 0 || imageAttachments.length > 0) ? (
          <div className="flex flex-wrap gap-1.5">
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
            {imageAttachments.map((img) => (
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
                        interactionsDisabled && "cursor-not-allowed opacity-60",
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
                        interactionsDisabled && "cursor-not-allowed opacity-60",
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
                        interactionsDisabled && "cursor-not-allowed opacity-60",
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
                        interactionsDisabled && "cursor-not-allowed opacity-60",
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
                  <DrawerContent className="border-border/80 bg-background/95 shadow-2xl supports-backdrop-filter:backdrop-blur-xl data-[vaul-drawer-direction=bottom]:max-h-[78vh]">
                    <DrawerHeader className="gap-2 border-b border-border/70 px-5 pb-5 pt-5 text-left md:px-6">
                      <DrawerTitle className="text-lg font-semibold">
                        Current Runtime
                      </DrawerTitle>
                      <DrawerDescription>
                        Inspect the effective runtime configuration for the next
                        turn from this composer.
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
            {isTurnActive ? (
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
                  aria-label="Abort"
                  onClick={() => onAbort?.()}
                >
                  <OctagonX className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent side="top">
                  <span>Stop responding</span>
                  <Kbd>Esc</Kbd>
                </TooltipContent>
              </Tooltip>
            ) : null}
            <Tooltip>
              <TooltipTrigger
                type="submit"
                className={tooltipTriggerButtonClassName({
                  variant: "default",
                  size: isQueueNextMode ? "sm" : "icon-sm",
                  className: cn(
                    "rounded-md",
                    PROMPT_SURFACE_PRIMARY_FOCUS,
                    isQueueNextMode && "h-8 gap-2 px-3",
                    minimal &&
                      !isQueueNextMode &&
                      "h-8 w-8 border border-primary/40 bg-primary/10 text-primary hover:bg-primary/15",
                    minimal &&
                      isQueueNextMode &&
                      "border border-primary/40 bg-primary/10 text-primary hover:bg-primary/15",
                  ),
                })}
                disabled={primaryActionDisabled}
                aria-label={
                  isQueueNextMode
                    ? queuedNextTurn
                      ? "Update queued next turn"
                      : "Queue next turn"
                    : "Send"
                }
              >
                <Send className="size-3.5" />
                {isQueueNextMode ? (
                  <span>{queuedNextTurn ? "Update queued" : "Queue next"}</span>
                ) : null}
              </TooltipTrigger>
              <TooltipContent side="top">
                <span>
                  {isQueueNextMode ? "Queue the next turn" : "Send message"}
                </span>
                <KbdGroup>
                  <Kbd>↵</Kbd>
                </KbdGroup>
              </TooltipContent>
            </Tooltip>
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

export function ZenPromptInput(args: Omit<PromptInputProps, "minimal">) {
  return <PromptInput {...args} minimal />;
}
