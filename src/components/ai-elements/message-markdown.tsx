import type { HTMLAttributes, MouseEvent, ReactNode } from "react";
import {
  createContext,
  isValidElement,
  useContext,
  useMemo,
  useRef,
} from "react";
import { ExternalLink, Globe2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { WorkspaceFileIcon } from "@/components/layout/explorer-entry-icon";
import { ExternalAnchor } from "@/components/ui/external-anchor";
import { LinkifiedText } from "@/components/ui/linkified-text";
import { ServiceLinkBadge } from "@/components/ui/service-link-badge";
import {
  formatFileLinkLocation,
  isLikelyWorkspaceFilePath,
  type ResolvedWorkspaceFileLink,
} from "@/lib/message-file-links";
import { resolveServiceLinkBadge } from "@/lib/service-link-badges";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MESSAGE_BODY_LINE_HEIGHT } from "./message-styles";

export interface MarkdownMessageProps extends HTMLAttributes<HTMLDivElement> {
  content: string;
  isStreaming?: boolean;
  messageFontSize: number;
  messageCodeFontSize: number;
  resolveFileLink?: (args: {
    href?: string;
    allowUnknownPath?: boolean;
  }) => ResolvedWorkspaceFileLink | null;
  onFileLinkClick?: (args: {
    event: MouseEvent<HTMLAnchorElement>;
    href?: string;
    resolvedFileLink?: ResolvedWorkspaceFileLink | null;
    code?: string;
  }) => void | Promise<void>;
  renderBlockCode?: (args: {
    code: string;
    language?: string;
    fileHref?: string;
    resolvedFileLink?: ResolvedWorkspaceFileLink | null;
  }) => ReactNode;
}

export interface MessageFileLinkProps {
  href?: string;
  filePath: string;
  fileName: string;
  line?: number;
  column?: number;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}

interface MarkdownCodeNodeLike {
  data?: {
    meta?: unknown;
  };
  properties?: Record<string, unknown>;
}

const MarkdownTableCellContext = createContext(false);

function extractPlainText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(extractPlainText).join("");
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return extractPlainText(node.props.children);
  }
  return "";
}

function isHttpExternalLink(href?: string) {
  if (!href) {
    return false;
  }
  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function MessageExternalLinkChip({
  href,
  children,
  onClick,
}: {
  href: string;
  children?: ReactNode;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const label = extractPlainText(children).trim();
  const hostname = new URL(href).hostname.replace(/^www\./, "");
  const tooltipLabel = `Open ${label} on ${hostname}`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <ExternalAnchor
              href={href}
              data-message-external-link-chip="true"
              aria-label={tooltipLabel}
              className="inline-flex max-w-full items-center gap-[0.35em] rounded-md border border-border/70 bg-muted/45 px-[0.5em] py-[0.14em] align-middle text-[0.8125em] font-medium leading-none text-foreground no-underline shadow-xs transition-[background-color,border-color,box-shadow] hover:border-border hover:bg-muted hover:text-foreground hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              onClick={onClick}
            />
          }
        >
          <Globe2
            aria-hidden="true"
            className="size-[1em] shrink-0 text-muted-foreground"
          />
          <span className="min-w-0 max-w-64 truncate">{children}</span>
          <ExternalLink
            aria-hidden="true"
            className="size-[0.9em] shrink-0 text-muted-foreground"
          />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-96 break-all">
          {tooltipLabel}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function toOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeCodeFencePathCandidate(value: string) {
  const normalized = value
    .trim()
    .replace(/^["'`]+/, "")
    .replace(/["'`]+$/, "")
    .replace(/[),.;:!?]+$/g, "");
  return normalized.length > 0 ? normalized : null;
}

function isLikelyCodeFenceFilePath(value: string) {
  const normalized = normalizeCodeFencePathCandidate(value);
  if (!normalized) {
    return false;
  }
  return isLikelyWorkspaceFilePath(normalized);
}

function parseCodeFenceMetaForFilePath(meta?: string | null) {
  if (!meta) {
    return null;
  }

  const explicitMatch = meta.match(
    /(?:^|\s)(?:file|path|filename|title)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s]+))/i,
  );
  const explicitCandidate =
    explicitMatch?.[1] ?? explicitMatch?.[2] ?? explicitMatch?.[3] ?? null;
  if (explicitCandidate && isLikelyCodeFenceFilePath(explicitCandidate)) {
    return normalizeCodeFencePathCandidate(explicitCandidate);
  }

  for (const rawToken of meta.split(/\s+/)) {
    const token = normalizeCodeFencePathCandidate(rawToken);
    if (!token) {
      continue;
    }
    if (isLikelyCodeFenceFilePath(token)) {
      return token;
    }
  }

  return null;
}

function extractCodeFenceMeta(args: {
  node?: MarkdownCodeNodeLike;
  props: Record<string, unknown>;
}) {
  const candidates: unknown[] = [
    args.props.metastring,
    args.props["data-meta"],
    args.props.meta,
    args.node?.data?.meta,
    args.node?.properties?.metastring,
    args.node?.properties?.["data-meta"],
    args.node?.properties?.meta,
  ];

  for (const candidate of candidates) {
    const value = toOptionalString(candidate);
    if (value) {
      return value;
    }
  }

  return null;
}

export function MessageFileLink({
  href,
  filePath,
  fileName,
  line,
  column,
  onClick,
}: MessageFileLinkProps) {
  const locationLabel = formatFileLinkLocation({ line, column });
  const tooltipLabel = locationLabel
    ? `Open ${filePath} (reference ${locationLabel})`
    : `Open ${filePath}`;
  const link = (
    <a
      href={href}
      data-message-file-link="true"
      aria-label={tooltipLabel}
      className={cn(
        "inline-flex max-w-full items-center gap-[0.3em] rounded-md border border-border/80 bg-muted/40 px-[0.45em] py-[0.1em] align-middle text-[0.8125em] font-medium leading-none text-foreground no-underline transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
      )}
      onClick={onClick}
    >
      <WorkspaceFileIcon fileName={fileName} className="h-[1.1em] w-[0.9em]" />
      <span className="min-w-0 max-w-64 truncate">{fileName}</span>
      {locationLabel ? (
        <span className="shrink-0 rounded-sm border border-border bg-background/70 px-[0.4em] py-0 text-[0.625em] leading-[1.4] text-muted-foreground">
          {locationLabel}
        </span>
      ) : null}
    </a>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={link}></TooltipTrigger>
        <TooltipContent side="top">{tooltipLabel}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function MarkdownMessage({
  content,
  isStreaming,
  messageFontSize,
  messageCodeFontSize,
  resolveFileLink,
  onFileLinkClick,
  renderBlockCode,
  className,
  ...props
}: MarkdownMessageProps) {
  // ---------------------------------------------------------------------------
  // Stable ReactMarkdown `components` object.
  //
  // ReactMarkdown uses each component function as a React component type via
  // createElement(). If the function reference changes between renders, React
  // treats it as a *different* component and unmounts/remounts the subtree.
  // For CodeBlockContent this means losing the highlighted-HTML state and
  // flashing the un-highlighted fallback while Shiki re-runs.
  //
  // We keep the component functions stable by storing mutable props in refs
  // and reading them inside the (stable) component closures.
  // ---------------------------------------------------------------------------
  const renderBlockCodeRef = useRef(renderBlockCode);
  renderBlockCodeRef.current = renderBlockCode;
  const messageCodeFontSizeRef = useRef(messageCodeFontSize);
  messageCodeFontSizeRef.current = messageCodeFontSize;
  const resolveFileLinkRef = useRef(resolveFileLink);
  resolveFileLinkRef.current = resolveFileLink;
  const onFileLinkClickRef = useRef(onFileLinkClick);
  onFileLinkClickRef.current = onFileLinkClick;

  const components = useMemo(
    () => ({
      hr: () => (
        <hr className="my-4 h-px border-0 bg-border first:mt-0 last:mb-0" />
      ),
      strong: ({ children }: { children?: ReactNode }) => (
        <strong className="font-semibold">{children}</strong>
      ),
      p: ({ children }: { children?: ReactNode }) => (
        <p className="my-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere] first:mt-0 last:mb-0">
          {children}
        </p>
      ),
      ul: ({ children }: { children?: ReactNode }) => (
        <ul className="my-2 ml-5 list-disc pl-1 marker:text-muted-foreground [&_ol]:my-1 [&_ol]:ml-5 [&_ol]:list-decimal [&_ul]:my-1 [&_ul]:ml-5 [&_ul]:list-disc">
          {children}
        </ul>
      ),
      ol: ({ children }: { children?: ReactNode }) => (
        <ol className="my-2 ml-5 list-decimal pl-1 marker:text-muted-foreground [&_ol]:my-1 [&_ol]:ml-5 [&_ol]:list-decimal [&_ul]:my-1 [&_ul]:ml-5 [&_ul]:list-disc">
          {children}
        </ol>
      ),
      li: ({ children }: { children?: ReactNode }) => (
        <li className="my-1 marker:text-muted-foreground [&>p]:my-0">
          {children}
        </li>
      ),
      code: (rawCodeProps: unknown) => {
        const {
          className: codeClassName,
          children,
          node,
          ...codeProps
        } = (rawCodeProps ?? {}) as {
          className?: string;
          children?: ReactNode;
          node?: MarkdownCodeNodeLike;
          metastring?: string;
          meta?: string;
          "data-meta"?: string;
        };
        const languageToken = /language-([^\s]+)/.exec(
          codeClassName ?? "",
        )?.[1];
        const languageFromClassName =
          languageToken && !isLikelyCodeFenceFilePath(languageToken)
            ? languageToken
            : undefined;
        const fileHrefFromClassName =
          languageToken && isLikelyCodeFenceFilePath(languageToken)
            ? normalizeCodeFencePathCandidate(languageToken)
            : null;
        const meta = extractCodeFenceMeta({ node, props: codeProps });
        const fileHrefFromMeta = parseCodeFenceMetaForFilePath(meta);
        const text = String(children ?? "");
        const code = text.replace(/\n$/, "");
        const fileHref = fileHrefFromMeta ?? fileHrefFromClassName ?? undefined;
        const isBlock =
          Boolean(languageFromClassName) ||
          Boolean(fileHref) ||
          text.includes("\n");
        if (isBlock) {
          const resolvedFileLink = fileHref
            ? (resolveFileLinkRef.current?.({
                href: fileHref,
                allowUnknownPath: true,
              }) ?? null)
            : null;
          const renderFn = renderBlockCodeRef.current;
          if (renderFn) {
            return renderFn({
              code,
              language: languageFromClassName,
              fileHref,
              resolvedFileLink,
            });
          }
          return (
            <pre>
              <code>{code}</code>
            </pre>
          );
        }

        const inlineHref = text.trim();
        const resolvedFileLink = inlineHref
          ? (resolveFileLinkRef.current?.({ href: inlineHref }) ??
            (inlineHref.includes("/")
              ? resolveFileLinkRef.current?.({
                  href: inlineHref,
                  allowUnknownPath: true,
                })
              : null))
          : null;
        if (resolvedFileLink) {
          return (
            <MessageFileLink
              href={inlineHref}
              filePath={resolvedFileLink.filePath}
              fileName={resolvedFileLink.fileName}
              line={resolvedFileLink.line}
              column={resolvedFileLink.column}
              onClick={(event: MouseEvent<HTMLAnchorElement>) =>
                void onFileLinkClickRef.current?.({
                  event,
                  href: inlineHref,
                  resolvedFileLink,
                })
              }
            />
          );
        }

        return (
          <code
            className="mx-0.5 rounded-md border border-border/80 bg-muted/40 px-1.5 py-0.5 font-mono break-words [overflow-wrap:anywhere]"
            style={{ fontSize: `${messageCodeFontSizeRef.current}px` }}
          >
            {children}
          </code>
        );
      },
      pre: ({ children }: { children?: ReactNode }) => <>{children}</>,
      a: function MarkdownLink({
        href,
        children,
      }: {
        href?: string;
        children?: ReactNode;
      }) {
        const isInTableCell = useContext(MarkdownTableCellContext);
        const resolvedFileLink =
          resolveFileLinkRef.current?.({ href }) ??
          (href && href.includes("/")
            ? resolveFileLinkRef.current?.({ href, allowUnknownPath: true })
            : null);
        if (resolvedFileLink) {
          return (
            <MessageFileLink
              href={href}
              filePath={resolvedFileLink.filePath}
              fileName={resolvedFileLink.fileName}
              line={resolvedFileLink.line}
              column={resolvedFileLink.column}
              onClick={(event: MouseEvent<HTMLAnchorElement>) =>
                void onFileLinkClickRef.current?.({
                  event,
                  href,
                  resolvedFileLink,
                })
              }
            />
          );
        }

        const serviceLinkBadge = resolveServiceLinkBadge(href);
        if (href && serviceLinkBadge) {
          const childText = extractPlainText(children).trim();
          return (
            <ServiceLinkBadge
              href={href}
              badge={serviceLinkBadge}
              label={childText && childText !== href ? childText : undefined}
              onClick={(event: MouseEvent<HTMLAnchorElement>) =>
                void onFileLinkClickRef.current?.({ event, href })
              }
            />
          );
        }

        const childText = extractPlainText(children).trim();
        if (
          href &&
          childText &&
          (childText !== href || isInTableCell) &&
          isHttpExternalLink(href)
        ) {
          return (
            <MessageExternalLinkChip
              href={href}
              onClick={(event: MouseEvent<HTMLAnchorElement>) =>
                void onFileLinkClickRef.current?.({ event, href })
              }
            >
              {children}
            </MessageExternalLinkChip>
          );
        }

        return (
          <ExternalAnchor
            href={href}
            className="text-primary underline underline-offset-2"
            onClick={(event: MouseEvent<HTMLAnchorElement>) =>
              void onFileLinkClickRef.current?.({ event, href })
            }
          >
            {children}
          </ExternalAnchor>
        );
      },
      table: ({ children }: { children?: ReactNode }) => (
        <Table className="my-3 w-full table-fixed border-separate border-spacing-0 rounded-md border border-border/70 bg-card text-[0.875em]">
          {children}
        </Table>
      ),
      thead: ({ children }: { children?: ReactNode }) => (
        <TableHeader className="bg-muted/40">{children}</TableHeader>
      ),
      tbody: ({ children }: { children?: ReactNode }) => (
        <TableBody>{children}</TableBody>
      ),
      tr: ({ children }: { children?: ReactNode }) => (
        <TableRow className="hover:bg-muted/30">{children}</TableRow>
      ),
      th: ({ children }: { children?: ReactNode }) => (
        <TableHead className="h-auto border-r border-border/70 px-3 py-2 align-top whitespace-normal break-words [overflow-wrap:anywhere] [&_code]:whitespace-pre-wrap [&_code]:break-all last:border-r-0">
          {children}
        </TableHead>
      ),
      td: ({ children }: { children?: ReactNode }) => (
        <MarkdownTableCellContext.Provider value>
          <TableCell className="border-r border-border/70 px-3 py-2 align-top whitespace-normal break-words [overflow-wrap:anywhere] [&_code]:whitespace-pre-wrap [&_code]:break-all last:border-r-0">
            {children}
          </TableCell>
        </MarkdownTableCellContext.Provider>
      ),
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }),
    [],
  );

  return (
    <div
      className={cn("min-w-0 max-w-full", className)}
      style={{
        fontSize: `${messageFontSize}px`,
        lineHeight: MESSAGE_BODY_LINE_HEIGHT,
      }}
      data-streaming={isStreaming ? "true" : undefined}
      {...props}
    >
      {isStreaming ? (
        <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          {content}
        </div>
      ) : (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {content}
        </ReactMarkdown>
      )}
    </div>
  );
}
