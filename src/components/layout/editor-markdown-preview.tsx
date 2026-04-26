import type { HTMLAttributes, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ExternalAnchor } from "@/components/ui/external-anchor";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { normalizeExternalUrl } from "@/lib/external-links";
import { cn } from "@/lib/utils";

interface EditorMarkdownPreviewProps extends HTMLAttributes<HTMLDivElement> {
  content: string;
  fontSize: number;
}

function renderRelativeLink(href: string | undefined, children: ReactNode) {
  return (
    <a
      href={href}
      className="text-primary underline underline-offset-2"
      onClick={(event) => {
        event.preventDefault();
      }}
    >
      {children}
    </a>
  );
}

export function EditorMarkdownPreview({
  content,
  fontSize,
  className,
  ...props
}: EditorMarkdownPreviewProps) {
  const codeFontSize = Math.max(fontSize - 1, 12);

  return (
    <div className={cn("h-full overflow-auto bg-editor", className)} {...props}>
      <div
        className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-6 py-5 text-editor-foreground"
        style={{ fontSize: `${fontSize}px`, lineHeight: 1.7 }}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => (
              <h1 className="mt-2 mb-5 text-3xl font-semibold tracking-tight first:mt-0">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="mt-8 mb-3 border-b border-border/70 pb-2 text-2xl font-semibold tracking-tight first:mt-0">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="mt-6 mb-2 text-xl font-semibold tracking-tight">
                {children}
              </h3>
            ),
            h4: ({ children }) => (
              <h4 className="mt-5 mb-2 text-base font-semibold tracking-tight">
                {children}
              </h4>
            ),
            p: ({ children }) => (
              <p className="my-3 whitespace-pre-wrap break-words [overflow-wrap:anywhere] first:mt-0 last:mb-0">
                {children}
              </p>
            ),
            ul: ({ children }) => (
              <ul className="my-3 ml-5 list-disc space-y-1 marker:text-muted-foreground">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="my-3 ml-5 list-decimal space-y-1 marker:text-muted-foreground">
                {children}
              </ol>
            ),
            li: ({ children }) => <li className="[&_p]:my-0">{children}</li>,
            blockquote: ({ children }) => (
              <blockquote className="my-4 border-l-2 border-border pl-4 text-muted-foreground">
                {children}
              </blockquote>
            ),
            hr: () => <hr className="my-6 h-px border-0 bg-border" />,
            code: ({ className: codeClassName, children }) => {
              const language = /language-([^\s]+)/.exec(
                codeClassName ?? "",
              )?.[1];
              const text = String(children ?? "");
              const code = text.replace(/\n$/, "");
              const isBlock = Boolean(language) || text.includes("\n");

              if (isBlock) {
                return (
                  <div className="my-4 overflow-hidden rounded-md border border-border/70">
                    <div className="border-b border-border/70 bg-editor-muted px-3 py-1.5 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                      {language ?? "text"}
                    </div>
                    <pre
                      className="overflow-x-auto bg-editor px-4 py-3 font-mono text-editor-foreground"
                      style={{ fontSize: `${codeFontSize}px`, lineHeight: 1.6 }}
                    >
                      <code>{code}</code>
                    </pre>
                  </div>
                );
              }

              return (
                <code
                  className="mx-0.5 rounded-md border border-border/80 bg-muted/40 px-1.5 py-0.5 font-mono"
                  style={{ fontSize: `${codeFontSize}px` }}
                >
                  {children}
                </code>
              );
            },
            pre: ({ children }) => <>{children}</>,
            a: ({ href, children }) => {
              if (!normalizeExternalUrl(href)) {
                return renderRelativeLink(href, children);
              }

              return (
                <ExternalAnchor
                  href={href}
                  className="text-primary underline underline-offset-2"
                >
                  {children}
                </ExternalAnchor>
              );
            },
            table: ({ children }) => (
              <Table className="my-4 w-full table-fixed border-separate border-spacing-0 rounded-md border border-border/70 bg-card text-left">
                {children}
              </Table>
            ),
            thead: ({ children }) => (
              <TableHeader className="bg-muted/40">{children}</TableHeader>
            ),
            tbody: ({ children }) => <TableBody>{children}</TableBody>,
            tr: ({ children }) => (
              <TableRow className="hover:bg-muted/30">{children}</TableRow>
            ),
            th: ({ children }) => (
              <TableHead className="h-auto border-r border-border/70 px-3 py-2 align-top whitespace-normal break-words [overflow-wrap:anywhere] last:border-r-0">
                {children}
              </TableHead>
            ),
            td: ({ children }) => (
              <TableCell className="border-r border-border/70 px-3 py-2 align-top whitespace-normal break-words [overflow-wrap:anywhere] last:border-r-0">
                {children}
              </TableCell>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
