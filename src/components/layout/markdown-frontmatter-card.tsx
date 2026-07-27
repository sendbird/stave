import type { MarkdownFrontmatterEntry } from "@/lib/markdown-frontmatter";
import { cn } from "@/lib/utils";

interface MarkdownFrontmatterCardProps {
  entries: MarkdownFrontmatterEntry[];
  /** Base preview font size; the card renders one step smaller. */
  fontSize: number;
  className?: string;
}

function FrontmatterValues({
  values,
  fontSize,
}: {
  values: string[];
  fontSize: number;
}) {
  if (values.length === 0) {
    return <span className="text-muted-foreground/70">&mdash;</span>;
  }

  if (values.length === 1) {
    return (
      <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
        {values[0]}
      </span>
    );
  }

  return (
    <span className="flex flex-wrap gap-1">
      {values.map((value, index) => (
        <span
          key={`${value}-${index}`}
          className="inline-flex max-w-full items-center rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 font-mono break-words [overflow-wrap:anywhere]"
          style={{ fontSize: `${fontSize}px` }}
        >
          {value}
        </span>
      ))}
    </span>
  );
}

/**
 * Renders YAML frontmatter as a structured metadata card.
 *
 * The markdown renderer never sees the frontmatter source: CommonMark would
 * turn it into a thematic break plus a setext heading, which is the bug this
 * card replaces.
 */
export function MarkdownFrontmatterCard({
  entries,
  fontSize,
  className,
}: MarkdownFrontmatterCardProps) {
  if (entries.length === 0) {
    return null;
  }

  const detailFontSize = Math.max(fontSize - 1, 11);

  return (
    <div
      className={cn(
        "mb-5 overflow-hidden rounded-md border border-border/70 bg-card/40",
        className,
      )}
    >
      <div className="border-b border-border/70 bg-muted/40 px-3 py-1.5 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        Frontmatter
      </div>
      <dl className="divide-y divide-border/50">
        {entries.map((entry) => (
          <div
            key={entry.key}
            className="grid grid-cols-[minmax(5rem,10rem)_1fr] gap-3 px-3 py-2"
            style={{ fontSize: `${detailFontSize}px`, lineHeight: 1.6 }}
          >
            <dt className="font-mono break-words text-muted-foreground [overflow-wrap:anywhere]">
              {entry.key}
            </dt>
            <dd className="min-w-0 text-editor-foreground">
              <FrontmatterValues
                values={entry.values}
                fontSize={detailFontSize}
              />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
