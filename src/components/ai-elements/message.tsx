import { Button as AdsButton } from "@/components/ads/components/Button";
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  MouseEvent,
  ReactNode,
} from "react";
import { createContext, useContext, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Paperclip, X } from "lucide-react";
import { cx, sx } from "@/components/ads/utils/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { transition } from "@/components/ads/recipes/transition";
import { messageStyles as styles } from "./message.styles";
import {
  getKnownFilePathSet,
  resolveWorkspaceFileLink,
  type ResolvedWorkspaceFileLink,
} from "@/lib/message-file-links";
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui";
import { ServiceLinkBadge } from "@/components/ui/service-link-badge";
import { useAppStore } from "@/store/app.store";
import { useShallow } from "zustand/react/shallow";
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockTitle,
} from "./code-block";
import { MarkdownMessage, MessageFileLink } from "./message-markdown";
import { MESSAGE_BODY_LINE_HEIGHT } from "./message-styles";
import { PromptTokenChip } from "./prompt-token-chip";
import { parsePromptTokenSegments } from "@/lib/prompt-token-chips";

interface MessageProps extends HTMLAttributes<HTMLDivElement> {
  from: "user" | "assistant";
}

const EMPTY_PROJECT_FILES: readonly string[] = [];
const MESSAGE_FILE_PATH_CACHE_KEY = "__staveMessageFilePathCache";

type MessageFilePathCache = {
  hasSubscribed: boolean;
  knownFilePaths: ReadonlySet<string>;
};

const globalMessageFilePathCache = globalThis as typeof globalThis & {
  [MESSAGE_FILE_PATH_CACHE_KEY]?: MessageFilePathCache;
};

const messageFilePathCache =
  globalMessageFilePathCache[MESSAGE_FILE_PATH_CACHE_KEY] ??
  (globalMessageFilePathCache[MESSAGE_FILE_PATH_CACHE_KEY] = {
    hasSubscribed: false,
    knownFilePaths: getKnownFilePathSet(EMPTY_PROJECT_FILES),
  });

function syncKnownProjectFilePaths() {
  messageFilePathCache.knownFilePaths = getKnownFilePathSet(
    useAppStore.getState().projectFiles,
  );
  if (messageFilePathCache.hasSubscribed) {
    return;
  }
  messageFilePathCache.hasSubscribed = true;
  useAppStore.subscribe((state, prevState) => {
    if (state.projectFiles === prevState.projectFiles) {
      return;
    }
    messageFilePathCache.knownFilePaths = getKnownFilePathSet(
      state.projectFiles,
    );
  });
}

syncKnownProjectFilePaths();

export function Message({ from, className, style, ...props }: MessageProps) {
  // `group` and `is-user`/`is-assistant` are a cross-component contract:
  // FailedOutgoingMessages targets `group-[.is-user]:` and a test asserts the
  // class, so they stay as literal class names, not utilities. The user-bubble
  // chrome is published as CSS custom properties here so `MessageContent`
  // (which has no `from` prop) can read it without an ancestor selector.
  const bubbleVars =
    from === "user"
      ? ({
          "--message-bubble-radius": vars.radiusMark,
          "--message-bubble-bg": `color-mix(in oklch, ${vars.colorAccent} 12%, transparent)`,
          "--message-bubble-pad-inline": vars.space16,
          "--message-bubble-pad-block": vars.space12,
        } as CSSProperties)
      : undefined;
  return (
    <article
      className={cx(
        sx(
          styles.article,
          from === "user" ? styles.articleUser : styles.articleAssistant,
        ),
        "group",
        from === "user" ? "is-user" : "is-assistant",
        className,
      )}
      style={bubbleVars ? { ...bubbleVars, ...style } : style}
      {...props}
    />
  );
}

export function MessageContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const messageFontSize = useAppStore(
    (state) => state.settings.messageFontSize,
  );
  return (
    <div
      className={cx(sx(styles.content), className)}
      style={{
        fontSize: `${messageFontSize}px`,
        lineHeight: MESSAGE_BODY_LINE_HEIGHT,
      }}
      {...props}
    />
  );
}

interface MessageResponseProps extends HTMLAttributes<HTMLDivElement> {
  isStreaming?: boolean;
  tokenizePromptTokens?: boolean;
}

export function MessageResponse({
  isStreaming,
  tokenizePromptTokens,
  children,
  className,
  style,
  ...props
}: MessageResponseProps) {
  const [openFileFromTree, messageFontSize, messageCodeFontSize, workspaceCwd] =
    useAppStore(
      useShallow(
        (state) =>
          [
            state.openFileFromTree,
            state.settings.messageFontSize,
            state.settings.messageCodeFontSize,
            state.workspacePathById[state.activeWorkspaceId] ??
              state.projectPath ??
              "",
          ] as const,
      ),
    );
  const content = typeof children === "string" ? children : "";
  const tokenSegments = useMemo(
    () =>
      tokenizePromptTokens
        ? parsePromptTokenSegments(content, {
            allowGenericCommandTokens: true,
            allowGenericSkillTokens: true,
          })
        : [],
    [content, tokenizePromptTokens],
  );
  const hasPromptTokenSegments = tokenSegments.some(
    (segment) => segment.type === "token",
  );

  function resolveFileLink(args: {
    href?: string;
    allowUnknownPath?: boolean;
  }) {
    return resolveWorkspaceFileLink({
      href: args.href,
      workspaceCwd,
      knownFilePaths: messageFilePathCache.knownFilePaths,
      allowUnknownPaths: args.allowUnknownPath,
    });
  }

  async function openResolvedFileLink(args: {
    resolved: ResolvedWorkspaceFileLink;
    fallbackContent?: string;
  }) {
    await openFileFromTree({
      filePath: args.resolved.filePath,
      ...(args.resolved.line ? { line: args.resolved.line } : {}),
      ...(args.resolved.column ? { column: args.resolved.column } : {}),
      ...(args.fallbackContent
        ? { fallbackContent: args.fallbackContent }
        : {}),
    });
  }

  async function handleFileLinkClick(args: {
    event: MouseEvent<HTMLAnchorElement>;
    href?: string;
    resolvedFileLink?: ResolvedWorkspaceFileLink | null;
    code?: string;
  }) {
    const resolved =
      args.resolvedFileLink ?? resolveFileLink({ href: args.href });
    if (!resolved) {
      return;
    }
    args.event.preventDefault();
    await openResolvedFileLink({ resolved, fallbackContent: args.code });
  }

  if (hasPromptTokenSegments) {
    return (
      <div
        className={cx(sx(styles.responseBody), className)}
        style={{
          fontSize: `${messageFontSize}px`,
          lineHeight: MESSAGE_BODY_LINE_HEIGHT,
          ...style,
        }}
        data-streaming={isStreaming ? "true" : undefined}
        {...props}
      >
        {tokenSegments.map((segment, index) => {
          if (segment.type === "text") {
            return <span key={`text-${index}`}>{segment.text}</span>;
          }

          const { descriptor } = segment;
          const key = `token-${index}-${descriptor.token}`;
          if (descriptor.kind === "link" && descriptor.serviceLink) {
            return (
              <ServiceLinkBadge
                key={key}
                href={descriptor.token}
                badge={{
                  kind: descriptor.serviceLink,
                  label: descriptor.label,
                }}
                label={descriptor.label}
              />
            );
          }

          return (
            <PromptTokenChip
              key={key}
              descriptor={descriptor}
              compact
              className={sx(styles.tokenMargin)}
            />
          );
        })}
      </div>
    );
  }

  return (
    <MarkdownMessage
      content={content}
      isStreaming={isStreaming}
      messageFontSize={messageFontSize}
      messageCodeFontSize={messageCodeFontSize}
      resolveFileLink={resolveFileLink}
      onFileLinkClick={handleFileLinkClick}
      renderBlockCode={({ code, language, fileHref, resolvedFileLink }) => (
        <CodeBlock code={code} language={language}>
          <CodeBlockHeader>
            <CodeBlockTitle className={sx(styles.codeTitle)}>
              {resolvedFileLink ? (
                <MessageFileLink
                  href={fileHref ?? resolvedFileLink.filePath}
                  filePath={resolvedFileLink.filePath}
                  fileName={resolvedFileLink.fileName}
                  line={resolvedFileLink.line}
                  column={resolvedFileLink.column}
                  onClick={(event) =>
                    void handleFileLinkClick({
                      event,
                      href: fileHref ?? resolvedFileLink.filePath,
                      resolvedFileLink,
                      code,
                    })
                  }
                />
              ) : null}
              <span className={sx(styles.codeLanguage)}>{language ?? "code"}</span>
            </CodeBlockTitle>
            <CodeBlockActions>
              <CodeBlockCopyButton />
            </CodeBlockActions>
          </CodeBlockHeader>
        </CodeBlock>
      )}
      className={className}
      style={style}
      {...props}
    />
  );
}

export function MessageToolbar(props: HTMLAttributes<HTMLDivElement>) {
  return <div className={sx(styles.toolbar)} {...props} />;
}

export function MessageActions(props: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx(sx(styles.actions), props.className)} {...props} />
  );
}

interface MessageActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
  tooltip?: string;
}

export function MessageAction({
  label,
  tooltip,
  className,
  ...props
}: MessageActionProps) {
  const button = (
    <Button
      variant="ghost"
      size="sm"
      type="button"
      className={cx(sx(styles.action), className)}
      aria-label={label}
      {...props}
    />
  );

  if (!tooltip && !label) {
    return button;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={button}></TooltipTrigger>
        <TooltipContent side="top">{tooltip ?? label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface MessageBranchContextValue {
  branch: number;
  setBranch: (index: number) => void;
  total: number;
}

const MessageBranchContext = createContext<MessageBranchContextValue | null>(
  null,
);

function useMessageBranchContext() {
  const context = useContext(MessageBranchContext);
  if (!context) {
    throw new Error(
      "MessageBranch components must be used inside <MessageBranch />.",
    );
  }
  return context;
}

interface MessageBranchProps extends HTMLAttributes<HTMLDivElement> {
  defaultBranch?: number;
  onBranchChange?: (branchIndex: number) => void;
}

export function MessageBranch({
  defaultBranch = 0,
  onBranchChange,
  children,
  ...props
}: MessageBranchProps) {
  const childArray = (Array.isArray(children) ? children : [children]).filter(
    Boolean,
  );
  const total = childArray.length;
  const [branch, setBranchState] = useState(
    Math.min(Math.max(0, defaultBranch), Math.max(0, total - 1)),
  );
  const setBranch = (index: number) => {
    const clamped = Math.min(Math.max(0, index), Math.max(0, total - 1));
    setBranchState(clamped);
    onBranchChange?.(clamped);
  };
  const value = useMemo(() => ({ branch, setBranch, total }), [branch, total]);

  return (
    <MessageBranchContext.Provider value={value}>
      <div {...props}>{children}</div>
    </MessageBranchContext.Provider>
  );
}

export function MessageBranchContent(props: HTMLAttributes<HTMLDivElement>) {
  const { branch } = useMessageBranchContext();
  const childArray = (
    Array.isArray(props.children) ? props.children : [props.children]
  ).filter(Boolean);
  return (
    <div className={props.className}>{childArray[branch] as ReactNode}</div>
  );
}

interface MessageBranchSelectorProps extends HTMLAttributes<HTMLDivElement> {
  from?: "user" | "assistant";
}

export function MessageBranchSelector({
  from = "assistant",
  className,
  ...props
}: MessageBranchSelectorProps) {
  return (
    <div
      className={cx(
        sx(
          styles.branchSelector,
          from === "user"
            ? styles.branchSelectorUser
            : styles.branchSelectorAssistant,
        ),
        className,
      )}
      {...props}
    />
  );
}

export function MessageBranchPrevious(
  props: ButtonHTMLAttributes<HTMLButtonElement>,
) {
  const { branch, setBranch } = useMessageBranchContext();
  const { className, onClick, ...rest } = props;
  return (
    <AdsButton
      layout="host"
      type="button"
      xstyle={[styles.branchArrow, transition.colors]}
      className={className}
      disabled={branch <= 0}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          setBranch(branch - 1);
        }
      }}
      {...rest}
    >
      <ChevronLeft className={sx(styles.branchArrowIcon)} />
    </AdsButton>
  );
}

export function MessageBranchNext(
  props: ButtonHTMLAttributes<HTMLButtonElement>,
) {
  const { branch, setBranch, total } = useMessageBranchContext();
  const { className, onClick, ...rest } = props;
  return (
    <AdsButton
      layout="host"
      type="button"
      xstyle={[styles.branchArrow, transition.colors]}
      className={className}
      disabled={branch >= total - 1}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          setBranch(branch + 1);
        }
      }}
      {...rest}
    >
      <ChevronRight className={sx(styles.branchArrowIcon)} />
    </AdsButton>
  );
}

export function MessageBranchPage(props: HTMLAttributes<HTMLSpanElement>) {
  const { branch, total } = useMessageBranchContext();
  return (
    <span
      className={cx(sx(styles.branchPage), props.className)}
      {...props}
    >
      {branch + 1}/{total}
    </span>
  );
}

export function MessageAttachments(props: HTMLAttributes<HTMLDivElement>) {
  const hasChildren = Boolean(props.children);
  if (!hasChildren) {
    return null;
  }
  return (
    <div
      className={cx(sx(styles.attachments), props.className)}
      {...props}
    />
  );
}

interface MessageAttachmentData {
  url: string;
  mediaType?: string;
  filename?: string;
}

interface MessageAttachmentProps extends HTMLAttributes<HTMLDivElement> {
  data: MessageAttachmentData;
  onRemove?: () => void;
}

export function MessageAttachment({
  data,
  onRemove,
  className,
  ...props
}: MessageAttachmentProps) {
  const isImage = data.mediaType?.startsWith("image/");
  return (
    <div className={cx(sx(styles.attachment), className)} {...props}>
      {isImage && data.url ? (
        <img
          src={data.url}
          alt={data.filename ?? "attachment"}
          className={sx(styles.attachmentImage)}
        />
      ) : (
        <div className={sx(styles.attachmentFile)}>
          <Paperclip className={sx(styles.attachmentFileIcon)} />
          <span className={sx(styles.attachmentFileName)}>
            {data.filename ?? "attachment"}
          </span>
        </div>
      )}
      {onRemove ? (
        <AdsButton
          layout="host"
          type="button"
          xstyle={styles.attachmentRemove}
          onClick={onRemove}
          aria-label="remove-attachment"
        >
          <X className={sx(styles.attachmentRemoveIcon)} />
        </AdsButton>
      ) : null}
    </div>
  );
}
