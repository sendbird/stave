import type { ReactNode } from "react";
import {
  ArrowRight,
  ChevronDown,
  MessageSquarePlus,
  SendHorizontal,
  SquareTerminal,
} from "lucide-react";
import { ModelIcon } from "@/components/ai-elements";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Kbd,
  KbdGroup,
  KbdSeparator,
} from "@/components/ui";
import { STAVE_LOGO_URL } from "@/lib/providers/model-catalog";
import {
  getCliSessionContextLabel,
  getCliSessionProviderLabel,
  type CliSessionContextMode,
} from "@/lib/terminal/types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";

const CLI_SESSION_CHOICES = [
  { provider: "claude-code", contextMode: "workspace" },
  { provider: "codex", contextMode: "workspace" },
] as const satisfies readonly {
  provider: "claude-code" | "codex";
  contextMode: CliSessionContextMode;
}[];

interface EmptySplashProps {
  description?: string;
  layout?: "centered" | "top-card";
  onCreateTask?: () => void;
  showCreateTaskAction?: boolean;
  showCreateCliSessionAction?: boolean;
  supplementaryContent?: ReactNode;
  title?: string;
}

export function EmptySplash({
  description = "Create a task to start a conversation, or open a CLI session for workspace work.",
  layout = "centered",
  onCreateTask,
  showCreateTaskAction = false,
  showCreateCliSessionAction = false,
  supplementaryContent,
  title = "New task",
}: EmptySplashProps) {
  const createCliSessionTab = useAppStore((state) => state.createCliSessionTab);
  const providerAvailability = useAppStore(
    (state) => state.providerAvailability,
  );
  const isMac =
    typeof navigator !== "undefined" &&
    /(Mac|iPhone|iPad)/i.test(navigator.platform || navigator.userAgent);
  const shortcutModifierLabel = isMac ? "⌘" : "Ctrl";
  const isTopCard = layout === "top-card";
  const showActions = showCreateTaskAction || showCreateCliSessionAction;

  const shortcutLabel = (
    <KbdGroup aria-label={`Keyboard shortcut ${shortcutModifierLabel} N`}>
      <Kbd>{shortcutModifierLabel}</Kbd>
      <KbdSeparator>+</KbdSeparator>
      <Kbd>N</Kbd>
    </KbdGroup>
  );

  const createTaskButton = showCreateTaskAction ? (
    <Button
      onClick={onCreateTask}
      className={cn(
        isTopCard ? "h-11 w-full justify-between rounded-md px-3" : undefined,
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <MessageSquarePlus className="size-4" />
        <span className="truncate">New Task</span>
      </span>
      {isTopCard ? (
        <ArrowRight className="size-4 text-primary-foreground/80" />
      ) : (
        <KbdGroup
          className="ml-1"
          aria-label={`Keyboard shortcut ${shortcutModifierLabel} N`}
        >
          <Kbd className="bg-primary-foreground/15 text-primary-foreground/85">
            {shortcutModifierLabel}
          </Kbd>
          <KbdSeparator className="text-primary-foreground/55">+</KbdSeparator>
          <Kbd className="bg-primary-foreground/15 text-primary-foreground/85">
            N
          </Kbd>
        </KbdGroup>
      )}
    </Button>
  ) : null;

  const cliSessionDropdown = showCreateCliSessionAction ? (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className={cn(
              isTopCard
                ? "h-11 w-full justify-between rounded-md border-border bg-background/80 px-3"
                : undefined,
            )}
          />
        }
      >
        <span className="flex min-w-0 items-center gap-2">
          <SquareTerminal className="size-4" />
          <span className="truncate">New CLI Session</span>
        </span>
        {isTopCard ? (
          <ChevronDown className="size-4 text-muted-foreground" />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Start Here</DropdownMenuLabel>
        {CLI_SESSION_CHOICES.map((choice) => {
          const providerAvailable = providerAvailability[choice.provider];
          const providerLabel = getCliSessionProviderLabel(choice.provider);
          const contextLabel = getCliSessionContextLabel(choice.contextMode);
          return (
            <DropdownMenuItem
              key={`${choice.provider}:${choice.contextMode}`}
              disabled={!providerAvailable}
              className="items-start"
              onSelect={() => {
                createCliSessionTab({
                  provider: choice.provider,
                  contextMode: choice.contextMode,
                });
              }}
            >
              <div className="flex min-w-0 items-start gap-2">
                <ModelIcon
                  providerId={choice.provider}
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {providerLabel} · {contextLabel}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {!providerAvailable
                      ? `${providerLabel} is unavailable in this environment`
                      : "Use the current workspace context"}
                  </div>
                </div>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  const actionGroup = showActions ? (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
      {createTaskButton}
      {cliSessionDropdown}
    </div>
  ) : null;

  if (isTopCard) {
    return (
      <section className="flex min-h-0 w-full flex-1 items-start justify-start px-5 py-5 sm:px-6 sm:py-6">
        <div
          data-testid="empty-splash"
          className={cn(
            "mx-auto grid w-full overflow-hidden rounded-lg border border-border bg-card text-left shadow-sm",
            showActions
              ? "max-w-6xl md:grid-cols-[minmax(0,1fr)_320px]"
              : "max-w-4xl",
          )}
        >
          <div className="flex min-h-[320px] min-w-0 flex-col justify-between gap-8 p-6 sm:p-8">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-background p-1.5">
                <img
                  src={STAVE_LOGO_URL}
                  alt="Stave"
                  className="h-full w-full object-contain"
                  draggable={false}
                />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">Stave</div>
                <div className="text-xs text-muted-foreground">
                  {showActions ? "Ready" : "Task ready"}
                </div>
              </div>
            </div>

            <div className="max-w-2xl space-y-3">
              <h1 className="font-heading text-3xl font-semibold leading-tight text-foreground">
                {title}
              </h1>
              <p className="max-w-xl text-base/7 text-muted-foreground">
                {description}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {showActions ? (
                <>
                  {shortcutLabel}
                  <span>New task shortcut</span>
                </>
              ) : (
                <>
                  <SendHorizontal className="size-4" />
                  <span>Awaiting first prompt</span>
                </>
              )}
            </div>
          </div>

          {showActions ? (
            <aside className="border-t border-border bg-surface/70 p-5 md:border-t-0 md:border-l">
              <div className="flex h-full min-h-[260px] flex-col justify-between gap-6">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-foreground">
                    Choose a starting point
                  </div>
                  <p className="text-sm/6 text-muted-foreground">
                    Choose the surface for this workspace.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  {createTaskButton}
                  {cliSessionDropdown}
                </div>

                <div className="border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
                  Current workspace context is used by default.
                </div>
              </div>
            </aside>
          ) : null}

          {supplementaryContent ? (
            <div
              className={cn(
                "border-t border-border p-5",
                showActions && "md:col-span-2",
              )}
            >
              {supplementaryContent}
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section
      className={cn(
        "flex min-h-0 w-full flex-1 px-5 sm:px-6",
        "items-center justify-center py-10",
      )}
    >
      <Empty data-testid="empty-splash" className="border-none p-0">
        <EmptyHeader className="max-w-xl gap-3">
          <EmptyMedia
            variant="icon"
            className="size-14 rounded-lg bg-primary/10 p-2 text-primary"
          >
            <img
              src={STAVE_LOGO_URL}
              alt="Stave"
              className="h-full w-full object-contain"
              draggable={false}
            />
          </EmptyMedia>
          <div className="space-y-2">
            <EmptyTitle className="text-2xl font-semibold">{title}</EmptyTitle>
            <EmptyDescription>{description}</EmptyDescription>
          </div>
        </EmptyHeader>
        {supplementaryContent ? (
          <EmptyContent>{supplementaryContent}</EmptyContent>
        ) : null}
        {actionGroup}
      </Empty>
    </section>
  );
}
