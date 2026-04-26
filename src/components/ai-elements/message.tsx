import type { ButtonHTMLAttributes, HTMLAttributes, MouseEvent, ReactNode } from "react";
import { createContext, useContext, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Paperclip, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getKnownFilePathSet, resolveWorkspaceFileLink, type ResolvedWorkspaceFileLink } from "@/lib/message-file-links";
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui";
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

const messageFilePathCache = globalMessageFilePathCache[MESSAGE_FILE_PATH_CACHE_KEY]
  ?? (globalMessageFilePathCache[MESSAGE_FILE_PATH_CACHE_KEY] = {
    hasSubscribed: false,
    knownFilePaths: getKnownFilePathSet(EMPTY_PROJECT_FILES),
  });

function syncKnownProjectFilePaths() {
  messageFilePathCache.knownFilePaths = getKnownFilePathSet(useAppStore.getState().projectFiles);
  if (messageFilePathCache.hasSubscribed) {
    return;
  }
  messageFilePathCache.hasSubscribed = true;
  useAppStore.subscribe((state, prevState) => {
    if (state.projectFiles === prevState.projectFiles) {
      return;
    }
    messageFilePathCache.knownFilePaths = getKnownFilePathSet(state.projectFiles);
  });
}

syncKnownProjectFilePaths();

export function Message({ from, className, ...props }: MessageProps) {
  return (
    <article
      className={cn(
        "group min-w-0 flex flex-col gap-2",
        from === "user" ? "is-user" : "is-assistant",
        from === "user" ? "items-end" : "items-start",
        className
      )}
      {...props}
    />
  );
}

export function MessageContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const messageFontSize = useAppStore((state) => state.settings.messageFontSize);
  return (
    <div
      className={cn(
        "flex min-w-0 max-w-full w-full flex-col gap-3 text-foreground",
        "group-[.is-user]:rounded-md group-[.is-user]:border group-[.is-user]:border-primary/35 group-[.is-user]:bg-primary/12 group-[.is-user]:px-4 group-[.is-user]:py-3",
        className
      )}
      style={{ fontSize: `${messageFontSize}px`, lineHeight: MESSAGE_BODY_LINE_HEIGHT }}
      {...props}
    />
  );
}

interface MessageResponseProps extends HTMLAttributes<HTMLDivElement> {
  isStreaming?: boolean;
}

export function MessageResponse({ isStreaming, ...props }: MessageResponseProps) {
  const [openFileFromTree, setLayout, messageFontSize, messageCodeFontSize, workspaceCwd] = useAppStore(useShallow((state) => [
    state.openFileFromTree,
    state.setLayout,
    state.settings.messageFontSize,
    state.settings.messageCodeFontSize,
    state.workspacePathById[state.activeWorkspaceId] ?? state.projectPath ?? "",
  ] as const));
  const content = typeof props.children === "string" ? props.children : "";

  function resolveFileLink(args: { href?: string; allowUnknownPath?: boolean }) {
    return resolveWorkspaceFileLink({
      href: args.href,
      workspaceCwd,
      knownFilePaths: messageFilePathCache.knownFilePaths,
      allowUnknownPaths: args.allowUnknownPath,
    });
  }

  async function openResolvedFileLink(args: { resolved: ResolvedWorkspaceFileLink; fallbackContent?: string }) {
    await openFileFromTree({
      filePath: args.resolved.filePath,
      ...(args.resolved.line ? { line: args.resolved.line } : {}),
      ...(args.resolved.column ? { column: args.resolved.column } : {}),
      ...(args.fallbackContent ? { fallbackContent: args.fallbackContent } : {}),
    });
    setLayout({ patch: { editorVisible: true } });
  }

  async function handleFileLinkClick(args: {
    event: MouseEvent<HTMLAnchorElement>;
    href?: string;
    resolvedFileLink?: ResolvedWorkspaceFileLink | null;
    code?: string;
  }) {
    const resolved = args.resolvedFileLink ?? resolveFileLink({ href: args.href });
    if (!resolved) {
      return;
    }
    args.event.preventDefault();
    await openResolvedFileLink({ resolved, fallbackContent: args.code });
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
            <CodeBlockTitle className="min-w-0 gap-2">
              {resolvedFileLink ? (
                <MessageFileLink
                  href={fileHref ?? resolvedFileLink.filePath}
                  filePath={resolvedFileLink.filePath}
                  fileName={resolvedFileLink.fileName}
                  line={resolvedFileLink.line}
                  column={resolvedFileLink.column}
                  onClick={(event) => void handleFileLinkClick({
                    event,
                    href: fileHref ?? resolvedFileLink.filePath,
                    resolvedFileLink,
                    code,
                  })}
                />
              ) : null}
              <span className="shrink-0">
                {language ?? "code"}
              </span>
            </CodeBlockTitle>
            <CodeBlockActions>
              <CodeBlockCopyButton />
            </CodeBlockActions>
          </CodeBlockHeader>
        </CodeBlock>
      )}
      {...props}
    />
  );
}

export function MessageToolbar(props: HTMLAttributes<HTMLDivElement>) {
  return <div className="flex items-center gap-1.5 text-sm text-muted-foreground" {...props} />;
}

export function MessageActions(props: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ml-1 mt-1 flex items-center gap-1", props.className)} {...props} />;
}

interface MessageActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
  tooltip?: string;
}

export function MessageAction({ label, tooltip, className, ...props }: MessageActionProps) {
  const button = (
    <Button
      variant="ghost"
      size="sm"
      type="button"
      className={cn("h-7 rounded-sm px-2 text-sm text-muted-foreground hover:text-foreground", className)}
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
        <TooltipTrigger asChild>{button}</TooltipTrigger>
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

const MessageBranchContext = createContext<MessageBranchContextValue | null>(null);

function useMessageBranchContext() {
  const context = useContext(MessageBranchContext);
  if (!context) {
    throw new Error("MessageBranch components must be used inside <MessageBranch />.");
  }
  return context;
}

interface MessageBranchProps extends HTMLAttributes<HTMLDivElement> {
  defaultBranch?: number;
  onBranchChange?: (branchIndex: number) => void;
}

export function MessageBranch({ defaultBranch = 0, onBranchChange, children, ...props }: MessageBranchProps) {
  const childArray = (Array.isArray(children) ? children : [children]).filter(Boolean);
  const total = childArray.length;
  const [branch, setBranchState] = useState(Math.min(Math.max(0, defaultBranch), Math.max(0, total - 1)));
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
  const childArray = (Array.isArray(props.children) ? props.children : [props.children]).filter(Boolean);
  return <div className={props.className}>{childArray[branch] as ReactNode}</div>;
}

interface MessageBranchSelectorProps extends HTMLAttributes<HTMLDivElement> {
  from?: "user" | "assistant";
}

export function MessageBranchSelector({ from = "assistant", className, ...props }: MessageBranchSelectorProps) {
  return (
    <div
      className={cn("inline-flex items-center gap-1 rounded-sm border border-border/70 px-1 py-0.5", from === "user" ? "self-end" : "self-start", className)}
      {...props}
    />
  );
}

export function MessageBranchPrevious(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { branch, setBranch } = useMessageBranchContext();
  const { className, onClick, ...rest } = props;
  return (
    <button
      type="button"
      className={cn("rounded-sm p-0.5 hover:bg-secondary/70", className)}
      disabled={branch <= 0}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          setBranch(branch - 1);
        }
      }}
      {...rest}
    >
      <ChevronLeft className="size-3" />
    </button>
  );
}

export function MessageBranchNext(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { branch, setBranch, total } = useMessageBranchContext();
  const { className, onClick, ...rest } = props;
  return (
    <button
      type="button"
      className={cn("rounded-sm p-0.5 hover:bg-secondary/70", className)}
      disabled={branch >= total - 1}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          setBranch(branch + 1);
        }
      }}
      {...rest}
    >
      <ChevronRight className="size-3" />
    </button>
  );
}

export function MessageBranchPage(props: HTMLAttributes<HTMLSpanElement>) {
  const { branch, total } = useMessageBranchContext();
  return <span className={cn("text-[10px] text-muted-foreground", props.className)} {...props}>{branch + 1}/{total}</span>;
}

export function MessageAttachments(props: HTMLAttributes<HTMLDivElement>) {
  const hasChildren = Boolean(props.children);
  if (!hasChildren) {
    return null;
  }
  return <div className={cn("mb-2 flex flex-wrap items-center gap-2", props.className)} {...props} />;
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

export function MessageAttachment({ data, onRemove, className, ...props }: MessageAttachmentProps) {
  const isImage = data.mediaType?.startsWith("image/");
  return (
    <div className={cn("group relative rounded-sm border border-border/70 bg-card/60 p-2", className)} {...props}>
      {isImage && data.url ? (
        <img src={data.url} alt={data.filename ?? "attachment"} className="h-24 w-24 rounded-sm object-cover" />
      ) : (
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Paperclip className="size-3.5" />
          <span className="max-w-44 truncate">{data.filename ?? "attachment"}</span>
        </div>
      )}
      {onRemove ? (
        <button
          type="button"
          className="absolute -right-2 -top-2 hidden rounded-full border border-border/80 bg-background p-0.5 group-hover:inline-flex"
          onClick={onRemove}
          aria-label="remove-attachment"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </div>
  );
}
