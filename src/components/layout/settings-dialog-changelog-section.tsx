import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import changelogSource from "../../../CHANGELOG.md?raw";
import { Badge } from "@/components/ui";
import { ExternalAnchor } from "@/components/ui/external-anchor";
import { sx } from "@/components/ads/utils/stylex";
import { SectionStack, SettingsCard } from "./settings-dialog.shared";
import { changelogSectionStyles as styles } from "./settings-dialog-changelog-section.styles";

function extractLatestVersion(source: string): string | null {
  const match = source.match(/^##\s*\[([^\]]+)\]/m);
  return match?.[1]?.trim() ?? null;
}

export function ChangelogSection() {
  const content = useMemo(() => changelogSource.trim(), []);
  const latestVersion = useMemo(() => extractLatestVersion(content), [content]);

  return (
    <SectionStack>
      <SettingsCard
        title="Release notes"
        description="Sourced from the repository CHANGELOG.md bundled with this build."
        titleAccessory={
          latestVersion ? (
            <Badge variant="outline">v{latestVersion}</Badge>
          ) : undefined
        }
      >
        <article className={sx(styles.article)}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h2: ({ children }) => (
                <h2 className={sx(styles.h2)}>{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 className={sx(styles.h3)}>{children}</h3>
              ),
              ul: ({ children }) => (
                <ul className={sx(styles.ul)}>{children}</ul>
              ),
              li: ({ children }) => (
                <li className={sx(styles.li)}>{children}</li>
              ),
              p: ({ children }) => <p className={sx(styles.p)}>{children}</p>,
              code: ({ children }) => (
                <code className={sx(styles.code)}>{children}</code>
              ),
              a: ({ href, children }) => (
                <ExternalAnchor href={href ?? "#"} className={sx(styles.link)}>
                  {children}
                </ExternalAnchor>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        </article>
      </SettingsCard>
    </SectionStack>
  );
}
