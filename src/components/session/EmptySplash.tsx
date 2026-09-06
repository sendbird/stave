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
import { sx } from "@/components/ads/utils/stylex";
import { emptySplashStyles as styles } from "@/components/session/empty-splash.styles";
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
      xstyle={isTopCard ? styles.topCardButton : undefined}
    >
      <span className={sx(styles.buttonInner)}>
        <MessageSquarePlus size={16} />
        <span className={sx(styles.buttonLabel)}>New Task</span>
      </span>
      {isTopCard ? (
        <ArrowRight size={16} className={sx(styles.arrowIcon)} />
      ) : (
        <KbdGroup
          className={sx(styles.keyGroupSpaced)}
          aria-label={`Keyboard shortcut ${shortcutModifierLabel} N`}
        >
          <Kbd className={sx(styles.onAccentKey)}>{shortcutModifierLabel}</Kbd>
          <KbdSeparator className={sx(styles.onAccentSeparator)}>
            +
          </KbdSeparator>
          <Kbd className={sx(styles.onAccentKey)}>N</Kbd>
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
            xstyle={
              isTopCard
                ? [styles.topCardButton, styles.outlineButton]
                : undefined
            }
          />
        }
      >
        <span className={sx(styles.buttonInner)}>
          <SquareTerminal size={16} />
          <span className={sx(styles.buttonLabel)}>New CLI Session</span>
        </span>
        {isTopCard ? (
          <ChevronDown size={16} className={sx(styles.chevronIcon)} />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={sx(styles.menuContent)}>
        <DropdownMenuLabel>Start Here</DropdownMenuLabel>
        {CLI_SESSION_CHOICES.map((choice) => {
          const providerAvailable = providerAvailability[choice.provider];
          const providerLabel = getCliSessionProviderLabel(choice.provider);
          const contextLabel = getCliSessionContextLabel(choice.contextMode);
          return (
            <DropdownMenuItem
              key={`${choice.provider}:${choice.contextMode}`}
              disabled={!providerAvailable}
              className={sx(styles.menuItemStart)}
              onSelect={() => {
                createCliSessionTab({
                  provider: choice.provider,
                  contextMode: choice.contextMode,
                });
              }}
            >
              <div className={sx(styles.menuItemRow)}>
                <ModelIcon
                  providerId={choice.provider}
                  className={sx(styles.menuItemIcon)}
                />
                <div className={sx(styles.menuItemCopy)}>
                  <div className={sx(styles.menuItemTitle)}>
                    {providerLabel} · {contextLabel}
                  </div>
                  <div className={sx(styles.menuItemDescription)}>
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
    <div className={sx(styles.actionGroup)}>
      {createTaskButton}
      {cliSessionDropdown}
    </div>
  ) : null;

  if (isTopCard) {
    return (
      <section className={sx(styles.topSection)}>
        <div
          data-testid="empty-splash"
          className={sx(
            styles.card,
            showActions ? styles.cardWithActions : styles.cardPlain,
          )}
        >
          <div className={sx(styles.leftColumn)}>
            <div className={sx(styles.brandRow)}>
              <div className={sx(styles.logoBox)}>
                <img
                  src={STAVE_LOGO_URL}
                  alt="Stave"
                  className={sx(styles.logoImage)}
                  draggable={false}
                />
              </div>
              <div className={sx(styles.brandCopy)}>
                <div className={sx(styles.brandName)}>Stave</div>
                <div className={sx(styles.brandStatus)}>
                  {showActions ? "Ready" : "Task ready"}
                </div>
              </div>
            </div>

            <div className={sx(styles.headingBlock)}>
              <h1 className={sx(styles.heading)}>{title}</h1>
              <p className={sx(styles.headingDescription)}>{description}</p>
            </div>

            <div className={sx(styles.metaRow)}>
              {showActions ? (
                <>
                  {shortcutLabel}
                  <span>New task shortcut</span>
                </>
              ) : (
                <>
                  <SendHorizontal size={16} />
                  <span>Awaiting first prompt</span>
                </>
              )}
            </div>
          </div>

          {showActions ? (
            <aside className={sx(styles.aside)}>
              <div className={sx(styles.asideInner)}>
                <div className={sx(styles.asideHeading)}>
                  <div className={sx(styles.asideTitle)}>
                    Choose a starting point
                  </div>
                  <p className={sx(styles.asideDescription)}>
                    Choose the surface for this workspace.
                  </p>
                </div>

                <div className={sx(styles.actionColumn)}>
                  {createTaskButton}
                  {cliSessionDropdown}
                </div>

                <div className={sx(styles.asideNote)}>
                  Current workspace context is used by default.
                </div>
              </div>
            </aside>
          ) : null}

          {supplementaryContent ? (
            <div
              className={sx(
                styles.supplementary,
                showActions && styles.supplementarySpan,
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
    <section className={sx(styles.centeredSection)}>
      <Empty data-testid="empty-splash" xstyle={styles.empty}>
        <EmptyHeader xstyle={styles.emptyHeader}>
          <EmptyMedia variant="icon" xstyle={styles.emptyMedia}>
            <img
              src={STAVE_LOGO_URL}
              alt="Stave"
              className={sx(styles.logoImage)}
              draggable={false}
            />
          </EmptyMedia>
          <div className={sx(styles.emptyCopy)}>
            <EmptyTitle xstyle={styles.emptyTitle}>{title}</EmptyTitle>
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
