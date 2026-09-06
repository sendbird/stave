import type { MarkdownFrontmatterEntry } from "@/lib/markdown-frontmatter";
import { cx, sx } from "@/components/ads/utils/stylex";
import { frontmatterStyles } from "./markdown-frontmatter-card.styles";

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
    return <span className={sx(frontmatterStyles.placeholder)}>&mdash;</span>;
  }

  if (values.length === 1) {
    return (
      <span className={sx(frontmatterStyles.singleValue)}>{values[0]}</span>
    );
  }

  return (
    <span className={sx(frontmatterStyles.valueList)}>
      {values.map((value, index) => (
        <span
          key={`${value}-${index}`}
          className={sx(frontmatterStyles.chip)}
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
    <div className={cx(sx(frontmatterStyles.card), className)}>
      <div className={sx(frontmatterStyles.header)}>Frontmatter</div>
      <dl>
        {entries.map((entry) => (
          <div
            key={entry.key}
            className={sx(frontmatterStyles.row)}
            style={{ fontSize: `${detailFontSize}px`, lineHeight: 1.6 }}
          >
            <dt className={sx(frontmatterStyles.key)}>{entry.key}</dt>
            <dd className={sx(frontmatterStyles.value)}>
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
