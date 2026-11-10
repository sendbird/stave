import { i18n, useTranslation } from "@/i18n";
import type {
  HTMLAttributes,
  MouseEvent,
  ReactElement,
  ReactNode,
  RefObject,
} from "react";
import {
  createContext,
  Fragment,
  isValidElement,
  useContext,
  useMemo,
  useRef,
} from "react";
import { ExternalLink, Globe2 } from "lucide-react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { WorkspaceFileIcon } from "@/components/layout/explorer-entry-icon";
import { ExternalAnchor } from "@/components/ui/external-anchor";
import { normalizeExternalUrl } from "@/lib/external-links";
import { ServiceLinkBadge } from "@/components/ui/service-link-badge";
import {
  formatFileLinkLocation,
  isLikelyWorkspaceFilePath,
  type ResolvedWorkspaceFileLink,
} from "@/lib/message-file-links";
import { resolveServiceLinkBadge } from "@/lib/service-link-badges";
import { cx, sx } from "@/components/aui/utils/stylex";
import { focusRing } from "@/components/aui/recipes/focus-ring";
import { transition } from "@/components/aui/recipes/transition";
import { markdownStyles as styles } from "./message-markdown.styles";
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
import { hardenSetextHeadings } from "./message-markdown.setext";
import {
  LruCache,
  markdownRenderBlocks,
  splitMessageMarkdown,
  type MarkdownBlockSplit,
} from "./message-markdown-blocks";
import { TranscriptWideBlock, TranscriptWideScope } from "./transcript-wide";

export interface MarkdownMessageProps extends HTMLAttributes<HTMLDivElement> {
  content: string;
  /** Render local/relative destinations as text when no file context owns this message. */
  disableLocalLinks?: boolean;
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
    /** The code sits in the block a streaming reply is still writing. */
    isStreaming?: boolean;
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

function InlineCode({
  fontSize,
  children,
}: {
  fontSize: number;
  children?: ReactNode;
}) {
  useTranslation();
  const isInTableCell = useContext(MarkdownTableCellContext);
  return (
    <code
      className={sx(
        styles.inlineCode,
        isInTableCell && styles.inlineCodeInCell,
      )}
      style={{ fontSize: `${fontSize}px` }}
    >
      {children}
    </code>
  );
}

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
  useTranslation();
  const label = extractPlainText(children).trim();
  const hostname = new URL(href).hostname.replace(/^www\./, "");
  const tooltipLabel = i18n.t("composer:messageMarkdown.tooltipLabel", { value1: label, value2: hostname });

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <ExternalAnchor
              href={href}
              data-message-external-link-chip="true"
              aria-label={tooltipLabel}
              className={sx(styles.externalChip, focusRing.ring, transition.colors)}
              onClick={onClick}
            />
          }
        >
          <Globe2
            aria-hidden="true"
            className={sx(styles.externalChipIcon)}
          />
          <span className={sx(styles.externalChipLabel)}>{children}</span>
          <ExternalLink
            aria-hidden="true"
            className={sx(styles.externalChipExternalIcon)}
          />
        </TooltipTrigger>
        <TooltipContent side="top" className={sx(styles.tooltipContent)}>
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
  useTranslation();
  const locationLabel = formatFileLinkLocation({ line, column });
  const tooltipLabel = locationLabel
    ? i18n.t("composer:messageMarkdown.tooltipLabel2", { value1: filePath, value2: locationLabel })
    : i18n.t("composer:messageMarkdown.tooltipLabel3", { value1: filePath });
  const link = (
    <a
      href={href}
      data-message-file-link="true"
      aria-label={tooltipLabel}
      className={sx(styles.fileLink, focusRing.ring, transition.colors)}
      onClick={onClick}
    >
      <WorkspaceFileIcon fileName={fileName} className={sx(styles.fileLinkIcon)} />
      <span className={sx(styles.fileLinkName)}>{fileName}</span>
      {locationLabel ? (
        <span className={sx(styles.fileLinkLocation)}>
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

type MarkdownRenderHandlers = Pick<
  MarkdownMessageProps,
  "resolveFileLink" | "onFileLinkClick" | "renderBlockCode" | "disableLocalLinks"
>;

interface MarkdownRenderContextValue {
  handlers: RefObject<MarkdownRenderHandlers>;
  messageCodeFontSize: number;
}

// ---------------------------------------------------------------------------
// Module-level Markdown `components`.
//
// Markdown uses each component function as a React component type. A function
// created per render would be a *different* type, unmount the subtree, and make
// CodeBlockContent flash its plain fallback while highlighting re-runs. Keeping
// the functions at module scope also makes a rendered block independent of the
// message that rendered it, so finished blocks can be cached and reused. The
// message's callbacks reach the components through this context.
// ---------------------------------------------------------------------------
const MarkdownRenderContext = createContext<MarkdownRenderContextValue>({
  handlers: { current: {} },
  messageCodeFontSize: 14,
});

/** True inside the block a streaming reply is still writing. */
const MarkdownStreamingBlockContext = createContext(false);

const markdownComponents: Components = {
  hr: () => (
    <hr className={sx(styles.hr)} />
  ),
  h1: ({ children }: { children?: ReactNode }) => (
    <h1 className={sx(styles.heading, styles.heading1)}>{children}</h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className={sx(styles.heading, styles.heading2)}>{children}</h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className={sx(styles.heading, styles.heading3)}>{children}</h3>
  ),
  h4: ({ children }: { children?: ReactNode }) => (
    <h4 className={sx(styles.heading, styles.heading4)}>{children}</h4>
  ),
  h5: ({ children }: { children?: ReactNode }) => (
    <h5 className={sx(styles.heading, styles.heading4)}>{children}</h5>
  ),
  h6: ({ children }: { children?: ReactNode }) => (
    <h6 className={sx(styles.heading, styles.heading4)}>{children}</h6>
  ),
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className={sx(styles.strong)}>{children}</strong>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className={sx(styles.paragraph)}>
      {children}
    </p>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className={sx(styles.list, styles.listUnordered)}>
      {children}
    </ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className={sx(styles.list, styles.listOrdered)}>
      {children}
    </ol>
  ),
  // Items and quotes are indented, so blocks inside them keep their width.
  li: ({ children }: { children?: ReactNode }) => (
    <li className={sx(styles.listItem)}>
      <TranscriptWideScope enabled={false}>{children}</TranscriptWideScope>
    </li>
  ),
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote>
      <TranscriptWideScope enabled={false}>{children}</TranscriptWideScope>
    </blockquote>
  ),
  code: function MarkdownCode(rawCodeProps: unknown) {
    const { handlers, messageCodeFontSize } = useContext(
      MarkdownRenderContext,
    );
    const isStreamingBlock = useContext(MarkdownStreamingBlockContext);
    // Click handlers read `handlers.current` when clicked, so a block rendered
    // earlier in a stream still calls the latest callback.
    const { resolveFileLink, renderBlockCode } = handlers.current;
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
        ? (resolveFileLink?.({
            href: fileHref,
            allowUnknownPath: true,
          }) ?? null)
        : null;
      if (renderBlockCode) {
        return renderBlockCode({
          code,
          language: languageFromClassName,
          fileHref,
          resolvedFileLink,
          isStreaming: isStreamingBlock,
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
      ? (resolveFileLink?.({ href: inlineHref }) ??
        (inlineHref.includes("/")
          ? resolveFileLink?.({
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
            void handlers.current.onFileLinkClick?.({
              event,
              href: inlineHref,
              resolvedFileLink,
            })
          }
        />
      );
    }

    return (
      <InlineCode fontSize={messageCodeFontSize}>
        {children}
      </InlineCode>
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
    useTranslation();
    const { handlers } = useContext(MarkdownRenderContext);
    const { resolveFileLink } = handlers.current;
    const isInTableCell = useContext(MarkdownTableCellContext);
    if (handlers.current.disableLocalLinks && !normalizeExternalUrl(href)) return <span>{children}</span>;
    const resolvedFileLink =
      resolveFileLink?.({ href }) ??
      (href && href.includes("/")
        ? resolveFileLink?.({ href, allowUnknownPath: true })
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
            void handlers.current.onFileLinkClick?.({
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
            void handlers.current.onFileLinkClick?.({ event, href })
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
            void handlers.current.onFileLinkClick?.({ event, href })
          }
        >
          {children}
        </MessageExternalLinkChip>
      );
    }

    return (
      <ExternalAnchor
        href={href}
        className={sx(styles.link)}
        onClick={(event: MouseEvent<HTMLAnchorElement>) =>
          void handlers.current.onFileLinkClick?.({ event, href })
        }
      >
        {children}
      </ExternalAnchor>
    );
  },
  table: ({ children }: { children?: ReactNode }) => (
    <TranscriptWideBlock>
      <Table xstyle={styles.table}>
        {children}
      </Table>
    </TranscriptWideBlock>
  ),
  thead: ({ children }: { children?: ReactNode }) => (
    <TableHeader className={sx(styles.tableHeader)}>{children}</TableHeader>
  ),
  tbody: ({ children }: { children?: ReactNode }) => (
    <TableBody>{children}</TableBody>
  ),
  tr: ({ children }: { children?: ReactNode }) => (
    <TableRow className={sx(styles.tableRow)}>{children}</TableRow>
  ),
  th: ({ children }: { children?: ReactNode }) => (
    <TableHead className={sx(styles.tableHead)}>
      {children}
    </TableHead>
  ),
  td: ({ children }: { children?: ReactNode }) => (
    <MarkdownTableCellContext.Provider value>
      <TableCell className={sx(styles.tableCell)}>
        {children}
      </TableCell>
    </MarkdownTableCellContext.Provider>
  ),
};

const remarkPlugins = [remarkGfm];

/**
 * Render Markdown text as one document with the message components. Each
 * top-level block goes through it; tests use it on a whole message as the
 * reference a block-by-block render must match.
 */
export function renderMarkdownBlock(text: string): ReactElement {
  return Markdown({
    children: text,
    remarkPlugins,
    components: markdownComponents,
  });
}

// Rendered output of finished blocks, shared by every message: reopening a
// task or re-rendering a finished reply reuses it instead of parsing again.
// The elements hold no per-message state; callbacks come from context.
const finishedBlockElements = new LruCache<string, ReactElement>(2_000);
// Block splits of finished replies, keyed by the (setext-hardened) source.
const finishedReplySplits = new LruCache<string, MarkdownBlockSplit>(200);

function finishedBlockElement(text: string): ReactElement {
  const cached = finishedBlockElements.get(text);
  if (cached) {
    return cached;
  }
  const element = renderMarkdownBlock(text);
  finishedBlockElements.set(text, element);
  return element;
}

export function MarkdownMessage({
  content,
  disableLocalLinks,
  isStreaming,
  messageFontSize,
  messageCodeFontSize,
  resolveFileLink,
  onFileLinkClick,
  renderBlockCode,
  className,
  ...props
}: MarkdownMessageProps) {
  useTranslation();
  const handlers = useRef<MarkdownRenderHandlers>({});
  handlers.current = { resolveFileLink, onFileLinkClick, renderBlockCode, disableLocalLinks };
  const streamingContext = useMemo(
    () => ({ handlers, messageCodeFontSize }),
    [messageCodeFontSize],
  );
  // While a reply streams, finished blocks keep what they rendered and only
  // the growing block re-renders. Otherwise every render hands code and link
  // components a new context value, so they re-resolve file links and re-run
  // `renderBlockCode` (for example once the reply stops streaming).
  const renderContext = isStreaming
    ? streamingContext
    : { handlers, messageCodeFontSize };

  const previousSplit = useRef<MarkdownBlockSplit | null>(null);
  const split = useMemo(() => {
    const source = hardenSetextHeadings(content);
    if (isStreaming) {
      return splitMessageMarkdown(source, previousSplit.current, true);
    }
    const cached = finishedReplySplits.get(source);
    if (cached) {
      return cached;
    }
    const next = splitMessageMarkdown(source, previousSplit.current, false);
    finishedReplySplits.set(source, next);
    return next;
  }, [content, isStreaming]);
  previousSplit.current = split;

  const blocks = useMemo(() => markdownRenderBlocks(split), [split]);
  const streamingIndex = isStreaming ? blocks.length - 1 : -1;
  const streamingText = blocks[streamingIndex];
  const streamingElement = useMemo(
    () =>
      streamingText === undefined ? null : renderMarkdownBlock(streamingText),
    [streamingText],
  );

  return (
    <div
      className={cx(sx(styles.body), className)}
      style={{
        fontSize: `${messageFontSize}px`,
        lineHeight: MESSAGE_BODY_LINE_HEIGHT,
      }}
      data-streaming={isStreaming ? "true" : undefined}
      {...props}
    >
      <MarkdownRenderContext.Provider value={renderContext}>
        {blocks.map((text, index) => (
          // Blocks only grow at the end, so an index keeps each one mounted.
          <Fragment key={index}>
            {/* The newline a whole-document render puts between blocks. */}
            {index > 0 ? "\n" : null}
            <MarkdownStreamingBlockContext.Provider
              value={index === streamingIndex}
            >
              {index === streamingIndex
                ? streamingElement
                : finishedBlockElement(text)}
            </MarkdownStreamingBlockContext.Provider>
          </Fragment>
        ))}
      </MarkdownRenderContext.Provider>
    </div>
  );
}
