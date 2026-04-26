import type { ReactNode } from "react";
import { MessageSquarePlus, SquareTerminal } from "lucide-react";
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
import { getProviderIconUrl } from "@/lib/providers/model-catalog";
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
  description = "Select a task to continue, or create one to start a new conversation with your agent.",
  layout = "centered",
  onCreateTask,
  showCreateTaskAction = false,
  showCreateCliSessionAction = false,
  supplementaryContent,
  title = "Stave",
}: EmptySplashProps) {
  const isDarkMode = useAppStore((state) => state.isDarkMode);
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

  return (
    <section
      className={cn(
        "flex min-h-0 w-full flex-1 px-6",
        isTopCard
          ? "items-start justify-start py-6"
          : "items-center justify-center py-10",
      )}
    >
      <Empty
        data-testid="empty-splash"
        className={cn(
          "border-none p-0",
          isTopCard &&
            "max-w-5xl items-stretch gap-5 rounded-[28px] border border-border/70 bg-card/65 p-6 text-left shadow-sm supports-backdrop-filter:backdrop-blur-sm",
        )}
      >
        <EmptyHeader
          className={cn(
            isTopCard
              ? "max-w-none flex-row items-center gap-4"
              : "max-w-xl gap-3",
          )}
        >
          <EmptyMedia
            variant="icon"
            className={cn(
              "rounded-2xl bg-primary/10 p-2",
              isTopCard ? "size-11 text-primary" : "size-14",
            )}
          >
            <img
              src={getProviderIconUrl({ providerId: "stave", isDarkMode })}
              alt="Stave"
              className="h-full w-full object-contain"
              draggable={false}
            />
          </EmptyMedia>
          <div className={cn("space-y-2", isTopCard && "min-w-0 space-y-1")}>
            <EmptyTitle
              className={cn(
                isTopCard ? "text-left text-base" : "text-2xl font-semibold",
              )}
            >
              {title}
            </EmptyTitle>
            <EmptyDescription className={cn(isTopCard && "text-left")}>
              {description}
            </EmptyDescription>
          </div>
        </EmptyHeader>
        {supplementaryContent ? (
          <EmptyContent
            className={cn(isTopCard && "max-w-none items-stretch gap-3")}
          >
            {supplementaryContent}
          </EmptyContent>
        ) : null}
        {showActions ? (
          <div
            className={cn(
              "mt-2 flex items-center gap-2",
              isTopCard && "justify-end",
            )}
          >
            {showCreateTaskAction ? (
              <Button onClick={onCreateTask}>
                <MessageSquarePlus className="size-4" />
                New Task
                <KbdGroup
                  className="ml-1"
                  aria-label={`Keyboard shortcut ${shortcutModifierLabel} N`}
                >
                  <Kbd>{shortcutModifierLabel}</Kbd>
                  <KbdSeparator>+</KbdSeparator>
                  <Kbd>N</Kbd>
                </KbdGroup>
              </Button>
            ) : null}
            {showCreateCliSessionAction ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <SquareTerminal className="size-4" />
                    New CLI Session
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel>Start Here</DropdownMenuLabel>
                  {CLI_SESSION_CHOICES.map((choice) => {
                    const providerAvailable =
                      providerAvailability[choice.provider];
                    const providerLabel = getCliSessionProviderLabel(
                      choice.provider,
                    );
                    const contextLabel = getCliSessionContextLabel(
                      choice.contextMode,
                    );
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
            ) : null}
          </div>
        ) : null}
      </Empty>
    </section>
  );
}
