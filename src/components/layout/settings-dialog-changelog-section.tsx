import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import changelogSource from "../../../CHANGELOG.md?raw";
import { Badge } from "@/components/ui";
import { ExternalAnchor } from "@/components/ui/external-anchor";
import { cn } from "@/lib/utils";
import { SectionHeading, SectionStack, SettingsCard } from "./settings-dialog.shared";

function extractLatestVersion(source: string): string | null {
  const match = source.match(/^##\s*\[([^\]]+)\]/m);
  return match?.[1]?.trim() ?? null;
}

export function ChangelogSection() {
  const content = useMemo(() => changelogSource.trim(), []);
  const latestVersion = useMemo(() => extractLatestVersion(content), [content]);

  return (
    <SectionStack>
      <SectionHeading
        title="Changelog"
        description="Browse release notes for every Stave version shipped to this build."
      />
      <SettingsCard
        title="Release notes"
        description="Sourced from the repository CHANGELOG.md bundled with this build."
        titleAccessory={latestVersion ? <Badge variant="outline">v{latestVersion}</Badge> : undefined}
      >
        <article className={cn("max-w-none text-sm leading-6 text-foreground")}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h2: ({ children }) => (
                <h2 className="mt-6 mb-2 border-b border-border/60 pb-2 text-lg font-semibold tracking-tight first:mt-0">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="mt-4 mb-1.5 text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {children}
                </h3>
              ),
              ul: ({ children }) => (
                <ul className="my-2 list-disc space-y-1 pl-5 marker:text-muted-foreground/70">
                  {children}
                </ul>
              ),
              li: ({ children }) => <li className="leading-6">{children}</li>,
              p: ({ children }) => <p className="my-2 leading-6">{children}</p>,
              code: ({ children }) => (
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  {children}
                </code>
              ),
              a: ({ href, children }) => (
                <ExternalAnchor
                  href={href ?? "#"}
                  className="text-primary underline-offset-2 hover:underline"
                >
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
