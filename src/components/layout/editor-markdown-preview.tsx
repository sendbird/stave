import type { HTMLAttributes, ReactNode } from "react";
import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MarkdownFrontmatterCard } from "@/components/layout/markdown-frontmatter-card";
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
import { parseMarkdownFrontmatter } from "@/lib/markdown-frontmatter";
import { cx, sx } from "@/components/ads/utils/stylex";
import { editorMarkdownPreviewStyles as styles } from "@/components/layout/editor-markdown-preview.styles";

interface EditorMarkdownPreviewProps extends HTMLAttributes<HTMLDivElement> {
  content: string;
  fontSize: number;
  variant?: "editor" | "embedded";
}

interface MarkdownAstNode {
  type?: string;
  value?: unknown;
  children?: MarkdownAstNode[];
}

/**
 * Supports HTML-style line breaks without enabling arbitrary raw HTML in the
 * preview. Code spans and fenced code blocks are unaffected because they are
 * parsed as code nodes rather than HTML nodes.
 */
function remarkHtmlBreaks() {
  return (tree: MarkdownAstNode) => {
    const visit = (node: MarkdownAstNode): void => {
      if (!node.children) {
        return;
      }

      for (const child of node.children) {
        if (
          child.type === "html" &&
          /^<br\s*\/?\s*>$/i.test(String(child.value))
        ) {
          child.type = "break";
          delete child.value;
          continue;
        }
        visit(child);
      }
    };

    visit(tree);
  };
}

function renderRelativeLink(href: string | undefined, children: ReactNode) {
  return (
    <a
      href={href}
      className={sx(styles.link)}
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
  variant = "editor",
  className,
  ...props
}: EditorMarkdownPreviewProps) {
  const codeFontSize = Math.max(fontSize - 1, 12);
  const isEmbedded = variant === "embedded";
  const frontmatter = useMemo(
    () => parseMarkdownFrontmatter(content),
    [content],
  );

  return (
    <div className={cx(sx(styles.root), className)} {...props}>
      <div
        className={sx(
          styles.page,
          isEmbedded ? styles.pageEmbedded : styles.pageEditor,
        )}
        style={{ fontSize: `${fontSize}px`, lineHeight: 1.7 }}
      >
        <MarkdownFrontmatterCard
          entries={frontmatter.entries}
          fontSize={fontSize}
        />
        {/* Wrapper keeps `first:` heading margins scoped to the body even when
            the frontmatter card renders above it. */}
        <div className={sx(styles.body)}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkHtmlBreaks]}
            components={{
              h1: ({ children }) => (
                <h1 className={sx(styles.h1)}>
                  {children}
                </h1>
              ),
              h2: ({ children }) => (
                <h2 className={sx(styles.h2)}>
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className={sx(styles.h3)}>
                  {children}
                </h3>
              ),
              h4: ({ children }) => (
                <h4 className={sx(styles.h4)}>
                  {children}
                </h4>
              ),
              p: ({ children }) => (
                <p className={sx(styles.paragraph)}>
                  {children}
                </p>
              ),
              ul: ({ children }) => (
                <ul className={sx(styles.list, styles.listUnordered)}>
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className={sx(styles.list, styles.listOrdered)}>
                  {children}
                </ol>
              ),
              li: ({ children }) => <li className={sx(styles.listItem)}>{children}</li>,
              blockquote: ({ children }) => (
                <blockquote className={sx(styles.blockquote)}>
                  {children}
                </blockquote>
              ),
              hr: () => <hr className={sx(styles.rule)} />,
              code: ({ className: codeClassName, children }) => {
                const language = /language-([^\s]+)/.exec(
                  codeClassName ?? "",
                )?.[1];
                const text = String(children ?? "");
                const code = text.replace(/\n$/, "");
                const isBlock = Boolean(language) || text.includes("\n");

                if (isBlock) {
                  return (
                    <div className={sx(styles.codeBlock)}>
                      <div className={sx(styles.codeBlockLanguage)}>
                        {language ?? "text"}
                      </div>
                      <pre
                        className={sx(styles.codeBlockPre)}
                        style={{ fontSize: `${codeFontSize}px`, lineHeight: 1.6 }}
                      >
                        <code>{code}</code>
                      </pre>
                    </div>
                  );
                }

                return (
                  <code
                    className={sx(styles.inlineCode)}
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
                  <ExternalAnchor href={href} xstyle={styles.link}>
                    {children}
                  </ExternalAnchor>
                );
              },
              table: ({ children }) => (
                <Table className={sx(styles.table)}>
                  {children}
                </Table>
              ),
              thead: ({ children }) => (
                <TableHeader className={sx(styles.tableHeader)}>{children}</TableHeader>
              ),
              tbody: ({ children }) => <TableBody>{children}</TableBody>,
              tr: ({ children }) => (
                <TableRow className={sx(styles.tableRow)}>{children}</TableRow>
              ),
              th: ({ children }) => (
                <TableHead className={sx(styles.tableCell)}>
                  {children}
                </TableHead>
              ),
              td: ({ children }) => (
                <TableCell className={sx(styles.tableCell)}>
                  {children}
                </TableCell>
              ),
            }}
          >
            {frontmatter.body}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
