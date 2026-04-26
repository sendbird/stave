import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

export type HeadingEntry = {
  id: string;
  text: string;
  depth: 2 | 3;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function stripLeadingTitle(markdown: string) {
  return markdown.replace(/^#\s+.+?(?:\r?\n){1,2}/, "");
}

export function extractHeadings(markdown: string): HeadingEntry[] {
  const slugCounts = new Map<string, number>();
  const stripped = markdown.replace(/```[\s\S]*?```/g, "");

  return stripped
    .split(/\r?\n/)
    .map((line) => line.match(/^(#{2,3})\s+(.+)$/))
    .filter(Boolean)
    .map((match) => {
      const depth = (match?.[1].length ?? 2) as 2 | 3;
      const rawText = match?.[2].trim() ?? "";
      const base = slugify(rawText) || "section";
      const nextCount = (slugCounts.get(base) ?? 0) + 1;
      slugCounts.set(base, nextCount);
      return {
        depth,
        text: rawText,
        id: nextCount === 1 ? base : `${base}-${nextCount}`,
      };
    });
}

/**
 * The build pipeline bakes asset hrefs in as `../screenshots/foo.png`,
 * which is correct when a doc is rendered at `/docs/<slug>/` but wrong
 * when the same markdown is rendered at the `/docs/` home shell (which
 * reuses the first doc's content). Rewrite the relative prefix at
 * render time based on the route depth.
 */
function remapAssetHref(href: string | undefined, currentRoute: string) {
  if (!href) return href;
  if (currentRoute !== "home") return href;
  if (/^(?:https?:|mailto:|#|\/)/.test(href)) return href;
  if (href.startsWith("../")) return `./${href.slice(3)}`;
  return href;
}

export function MarkdownContent({
  markdown,
  currentRoute = "",
}: {
  markdown: string;
  currentRoute?: string;
}) {
  const headings = React.useMemo(() => extractHeadings(markdown), [markdown]);
  const indexRef = React.useRef(0);
  indexRef.current = 0;

  return (
    <div className="prose-docs">
      <ReactMarkdown
        components={{
          h1: () => null,
          h2: ({ children }) => {
            const heading = headings[indexRef.current];
            indexRef.current += 1;
            return <h2 id={heading?.id}>{children}</h2>;
          },
          h3: ({ children }) => {
            const heading = headings[indexRef.current];
            indexRef.current += 1;
            return <h3 id={heading?.id}>{children}</h3>;
          },
          a: ({ children, href, ...props }) => {
            const isExternal =
              typeof href === "string" && /^https?:\/\//.test(href);
            const remapped = remapAssetHref(href, currentRoute);
            return (
              <a
                href={remapped}
                rel={isExternal ? "noreferrer" : undefined}
                target={isExternal ? "_blank" : undefined}
                {...props}
              >
                {children}
              </a>
            );
          },
          code: ({ className, children }) => {
            const isInline = !className;
            if (isInline) {
              return <code>{children}</code>;
            }
            return <code className={cn(className, "block")}>{children}</code>;
          },
          img: ({ alt, src }) => (
            <img
              alt={alt ?? ""}
              loading="lazy"
              src={remapAssetHref(
                typeof src === "string" ? src : undefined,
                currentRoute,
              )}
            />
          ),
        }}
        remarkPlugins={[remarkGfm]}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
