import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ArrowUpRight, Eraser, FolderTree, Globe2, Layers3, Minus, Music4, Send, Settings2, Square } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import {
  Badge,
  Button,
  Card,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  WaveIndicator,
} from "@/components/ui";
import { ModelIcon } from "@/components/ai-elements";
import { StaveMuseTriggerButton } from "@/components/layout/StaveMuseTriggerButton";
import { WorkspaceIdentityMark } from "@/components/layout/workspace-accent";
import { AssistantMessageBody } from "@/components/session/message/assistant-trace";
import { UI_LAYER_CLASS, UI_LAYER_VALUE } from "@/lib/ui-layers";
import { STAVE_MUSE_SESSION_ID } from "@/lib/stave-muse";
import { cn } from "@/lib/utils";
import { STAVE_MUSE_OPEN_SETTINGS_EVENT, useAppStore } from "@/store/app.store";
import { isDefaultWorkspaceName } from "@/store/project.utils";

const TARGET_OPTIONS = [
  { value: "app", label: "App", icon: Globe2 },
  { value: "project", label: "Project", icon: FolderTree },
  { value: "workspace", label: "Workspace", icon: Layers3 },
] as const;

const FLOATING_TOGGLE_BOTTOM_PX = 68;
const FLOATING_TOGGLE_SIZE_PX = 40;
const FLOATING_PANEL_GAP_PX = 12;
const SIDEBAR_PANEL_BOTTOM_PX = 12;
const MOBILE_FLOATING_TOGGLE_LEFT_PX = 12;

const PANEL_STYLE = {
  background: "linear-gradient(180deg, color-mix(in oklab, var(--card) 94%, var(--muse) 6%) 0%, color-mix(in oklab, var(--card) 90%, var(--muse) 10%) 100%)",
  borderColor: "color-mix(in oklab, var(--border) 74%, var(--muse) 26%)",
  boxShadow: "0 28px 72px -44px color-mix(in oklab, var(--muse) 34%, black 66%)",
} as const;

const COMPOSER_STYLE = {
  backgroundColor: "color-mix(in oklab, var(--card) 85%, var(--muse) 15%)",
  borderColor: "color-mix(in oklab, var(--border) 70%, var(--muse) 30%)",
} as const;

function UserMessageBubble(args: { content: string }) {
  return (
    <div className="ml-auto max-w-[88%] rounded-2xl rounded-br-md border border-primary/20 bg-primary/10 px-3.5 py-2.5 text-sm text-foreground shadow-sm">
      <p className="whitespace-pre-wrap break-words leading-6">{args.content}</p>
    </div>
  );
}

function AssistantMessageBlock(args: {
  message: Parameters<typeof AssistantMessageBody>[0]["message"] & {
    id: string;
    model: string;
    providerId: "claude-code" | "codex" | "stave" | "user";
  };
  showInterimMessages: boolean;
  streamingEnabled: boolean;
}) {
  return (
    <div className="max-w-full px-1 py-1">
      <AssistantMessageBody
        message={args.message}
        taskId={STAVE_MUSE_SESSION_ID}
        messageId={args.message.id}
        streamingEnabled={args.streamingEnabled}
        traceExpansionMode="manual"
        showInterimMessages={args.showInterimMessages}
      />
    </div>
  );
}

export function StaveMuseWidget(args: {
  leftInset?: number;
  rightInset?: number;
  showFloatingTrigger?: boolean;
}) {
  const [
    open,
    targetKind,
    messages,
    promptText,
    focusNonce,
    activeTurnId,
    museAutoHandoffToTask,
    showInterimMessages,
    projectName,
    projectPath,
    activeWorkspaceName,
    setOpen,
    setTarget,
    clearConversation,
    updatePromptDraft,
    sendMessage,
    abortTurn,
  ] = useAppStore(useShallow((state) => [
    state.staveMuse.open,
    state.staveMuse.target.kind,
    state.staveMuse.messages,
    state.staveMuse.promptDraft.text,
    state.staveMuse.focusNonce,
    state.staveMuse.activeTurnId,
    state.settings.museAutoHandoffToTask,
    state.settings.showInterimMessages,
    state.projectName,
    state.projectPath,
    state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId)?.name ?? null,
    state.setStaveMuseOpen,
    state.setStaveMuseTarget,
    state.clearStaveMuseConversation,
    state.updateStaveMusePromptDraft,
    state.sendStaveMuseMessage,
    state.abortStaveMuseTurn,
  ] as const));
  const [submitting, setSubmitting] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const showFloatingTrigger = args.showFloatingTrigger ?? true;
  const floatingToggleLeftPx = MOBILE_FLOATING_TOGGLE_LEFT_PX;
  const panelBottomPx = args.leftInset !== undefined
    ? SIDEBAR_PANEL_BOTTOM_PX
    : FLOATING_TOGGLE_BOTTOM_PX;
  const openContainerStyle = {
    left: `${args.leftInset ?? (floatingToggleLeftPx + FLOATING_TOGGLE_SIZE_PX + FLOATING_PANEL_GAP_PX)}px`,
    right: args.rightInset && args.rightInset > 0 ? `${16 + args.rightInset}px` : "16px",
    bottom: `${panelBottomPx}px`,
    zIndex: UI_LAYER_VALUE.muse,
  } as const;
  const floatingToggleStyle = {
    left: `${floatingToggleLeftPx}px`,
    bottom: `${FLOATING_TOGGLE_BOTTOM_PX}px`,
    zIndex: UI_LAYER_VALUE.muse,
  } as const;
  const isTurnActive = Boolean(activeTurnId);
  const isBusy = submitting || isTurnActive;
  const livePromptText = textareaRef.current?.value ?? promptText;
  const trimmedPrompt = livePromptText.trim();
  const workspaceLabel = activeWorkspaceName ?? "No workspace selected";
  const selectedTargetOption = useMemo(
    () => TARGET_OPTIONS.find((option) => option.value === targetKind) ?? TARGET_OPTIONS[0],
    [targetKind],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    textareaRef.current?.focus();
  }, [focusNonce, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    container.scrollTop = container.scrollHeight;
  }, [messages, open]);

  const handleSubmit = async () => {
    const nextPrompt = (textareaRef.current?.value ?? promptText).trim();
    if (!nextPrompt || isTurnActive || submitting || isComposing) {
      return;
    }
    setSubmitting(true);
    try {
      await sendMessage({ content: nextPrompt });
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || isComposing) {
      return;
    }
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    event.preventDefault();
    void handleSubmit();
  };

  if (!open) {
    if (!showFloatingTrigger) {
      return null;
    }
    return (
      <div className="pointer-events-none fixed" style={floatingToggleStyle}>
        <StaveMuseTriggerButton className="pointer-events-auto shadow-2xl" />
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={120}>
      <div className="pointer-events-none fixed flex justify-start" style={openContainerStyle}>
        <Card
          className="pointer-events-auto flex h-[min(72vh,680px)] w-full max-w-[min(30rem,calc(100vw-2rem))] flex-col gap-0 overflow-hidden border py-0 supports-backdrop-filter:backdrop-blur-xl"
          style={PANEL_STYLE}
        >
          <div className="border-b border-border/60 px-3.5 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className="h-7 gap-2 rounded-full border-muse/20 bg-muse/10 px-3 text-sm font-semibold text-foreground [&>svg]:size-3.5!"
                  >
                    <Music4 className="text-muse" />
                    Muse
                  </Badge>
                  {museAutoHandoffToTask ? (
                    <Badge variant="outline" className="gap-1.5 rounded-full border-border/80 bg-background/35 px-2.5 py-0.5 text-[11px]">
                      <ArrowUpRight className="size-3.5 text-muse" />
                      Auto handoff
                    </Badge>
                  ) : null}
                  {isBusy ? (
                    <Badge variant="outline" className="gap-1.5 rounded-full border-muse/25 bg-background/35 px-2.5 py-0.5 text-[11px] text-muse">
                      <WaveIndicator className="text-muse" animate />
                      Responding
                    </Badge>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg"
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent(STAVE_MUSE_OPEN_SETTINGS_EVENT, {
                          detail: { section: "muse" },
                        }));
                      }}
                    >
                      <Settings2 className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Muse settings</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg"
                      onClick={() => clearConversation()}
                    >
                      <Eraser className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Clear conversation</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg"
                      onClick={() => setOpen({ open: false })}
                    >
                      <Minus className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Minimize Muse</TooltipContent>
                </Tooltip>
              </div>
            </div>
            <div className="mt-3 flex items-start gap-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <FolderTree className="size-4 shrink-0 text-muse" />
                  <span className="truncate">
                    {projectName ?? (projectPath ? "Current Project" : "No project open")}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <WorkspaceIdentityMark
                    workspaceName={activeWorkspaceName ?? "Workspace"}
                    isDefault={isDefaultWorkspaceName(activeWorkspaceName)}
                    className="size-4 rounded-md"
                    iconClassName="size-2.5"
                  />
                  <span className="truncate">{workspaceLabel}</span>
                </div>
              </div>
              <Select
                value={targetKind}
                onValueChange={(value) => setTarget({ kind: value as typeof targetKind })}
              >
                <SelectTrigger className="ml-auto h-8 w-[8.75rem] shrink-0 rounded-lg border-border/70 bg-background/35 px-2.5 text-xs">
                  <div className="flex min-w-0 items-center gap-2">
                    <selectedTargetOption.icon className="size-3.5 shrink-0 text-muse" />
                    <span className="truncate">{selectedTargetOption.label}</span>
                  </div>
                </SelectTrigger>
                <SelectContent className={UI_LAYER_CLASS.popover}>
                  {TARGET_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="text-xs">
                      <div className="flex items-center gap-2">
                        <option.icon className="size-3.5 shrink-0 text-muted-foreground" />
                        <span>{option.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
            {messages.length === 0 ? (
              <Empty className="h-full border-0 bg-transparent">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Music4 className="size-5 text-muse" />
                  </EmptyMedia>
                  <EmptyTitle>Muse for project workflows</EmptyTitle>
                  <EmptyDescription>
                    Ask Muse to navigate Stave, work across Slack/Jira/Confluence/Figma/GitHub, and update the Information panel.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="space-y-3">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn("flex w-full", message.role === "user" ? "justify-end" : "justify-start")}
                  >
                    {message.role === "user" ? (
                      <UserMessageBubble content={message.content} />
                    ) : (
                      <AssistantMessageBlock
                        message={message}
                        showInterimMessages={showInterimMessages}
                        streamingEnabled
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-border/60 px-3.5 py-3">
            <div
              className="rounded-2xl border px-3 py-3 shadow-sm transition-[border-color,box-shadow,background-color] focus-within:border-muse/55 focus-within:ring-4 focus-within:ring-muse/10"
              style={COMPOSER_STYLE}
            >
              <Textarea
                ref={textareaRef}
                value={promptText}
                rows={3}
                placeholder="Ask Muse to navigate, coordinate tools, update Information, or hand work off to task chat..."
                className="min-h-[5.5rem] resize-none border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0"
                onChange={(event) => updatePromptDraft({ patch: { text: event.target.value } })}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={(event) => {
                  setIsComposing(false);
                  updatePromptDraft({ patch: { text: event.currentTarget.value } });
                }}
                onKeyDown={handleKeyDown}
              />
              <div className="mt-3 flex items-center justify-end">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon-sm"
                      className={cn(
                        "rounded-lg transition-colors",
                        isTurnActive && "bg-muse/10 text-muse hover:bg-muse/15 hover:text-muse",
                      )}
                      disabled={!isTurnActive && (!trimmedPrompt || isBusy)}
                      onClick={() => {
                        if (isTurnActive) {
                          abortTurn();
                          return;
                        }
                        void handleSubmit();
                      }}
                    >
                      {isTurnActive ? <Square className="size-3.5" /> : <Send className="size-3.5" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {isTurnActive ? "Abort Muse response" : "Send message"}
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </TooltipProvider>
  );
}
