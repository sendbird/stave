import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import { useMemo } from "react";
import { Accordion, type AccordionEntry } from "@/components/aui/components/Accordion";
import { Badge } from "@/components/ui";
import { sx } from "@/components/aui/utils/stylex";
import { EditorMarkdownPreview } from "./editor-markdown-preview";
import { SectionStack, SettingsCard } from "./settings-dialog.shared";
import { changelogSectionStyles as styles } from "./settings-dialog-changelog-section.styles";

export type ChangelogRelease = {
  /** Version from the `## [x.y.z](…)` heading, or the raw heading text. */
  version: string;
  /** Release date from the heading's trailing `(YYYY-MM-DD)`, when present. */
  date: string | null;
  /** The release body below its heading. */
  body: string;
};

const RELEASE_HEADING = /^##\s+(.+)$/;

function parseReleaseHeading(heading: string): Pick<ChangelogRelease, "version" | "date"> {
  const version = heading.match(/^\[([^\]]+)\]/)?.[1] ?? heading.replace(/\s*\([^)]*\)\s*$/, "");
  const date = heading.match(/\((\d{4}-\d{2}-\d{2})\)\s*$/)?.[1] ?? null;
  return { version: version.trim(), date };
}

/**
 * Split CHANGELOG.md into one entry per `## ` release heading. Text before the
 * first release is returned as `preamble`. Release bodies demote `###` to
 * `####`: the accordion trigger is the release's heading, so its sections sit
 * one level below it.
 */
export function splitChangelog(source: string): {
  preamble: string;
  releases: ChangelogRelease[];
} {
  const preamble: string[] = [];
  const releases: Array<ChangelogRelease & { lines: string[] }> = [];
  let inFence = false;

  for (const line of source.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const heading = inFence ? undefined : line.match(RELEASE_HEADING)?.[1];
    if (heading) {
      releases.push({ ...parseReleaseHeading(heading.trim()), body: "", lines: [] });
      continue;
    }
    const current = releases.at(-1);
    if (!current) {
      preamble.push(line);
      continue;
    }
    current.lines.push(!inFence && line.startsWith("### ") ? `#${line}` : line);
  }

  return {
    preamble: preamble.join("\n").trim(),
    releases: releases.map(({ lines, ...release }) => ({
      ...release,
      body: lines.join("\n").trim(),
    })),
  };
}

// Index-keyed: a repeated heading must not collapse two releases into one item.
const releaseValue = (index: number) => `release-${index}`;

// The settings body step; the other embedded previews read at the same size.
const PREVIEW_FONT_SIZE = 14;

function ReleaseNotes(args: { content: string }) {
  return (
    <EditorMarkdownPreview
      content={args.content}
      fontSize={PREVIEW_FONT_SIZE}
      variant="embedded"
      xstyle={styles.preview}
    />
  );
}

export function ChangelogView(args: { source: string }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const changelog = useMemo(() => splitChangelog(args.source.trim()), [args.source]);
  const latest = changelog.releases[0];
  const items = useMemo<AccordionEntry[]>(
    () =>
      changelog.releases.map((release, index) => ({
        value: releaseValue(index),
        title: (
          <span className={sx(styles.releaseTitle)}>
            <span className={sx(styles.releaseVersion)}>{release.version}</span>
            {release.date ? (
              <span className={sx(styles.releaseDate)}>{release.date}</span>
            ) : null}
          </span>
        ),
        content: <ReleaseNotes content={release.body} />,
      })),
    [changelog],
  );

  return (
    <SectionStack>
      <SettingsCard
        title={t("settings:settingsDialogChangelogSection.releaseNotes")}
        description={t("settings:settingsDialogChangelogSection.sourcedFromTheRepositoryCHANGELOGMd")}
        titleAccessory={
          latest ? <Badge variant="outline">v{latest.version}</Badge> : undefined
        }
      >
        {changelog.preamble ? <ReleaseNotes content={changelog.preamble} /> : null}
        {/* The latest release opens; older ones mount on first open, so the
            page does not render every release's markdown up front. */}
        <Accordion
          multiple
          mount="lazy"
          defaultValue={latest ? [releaseValue(0)] : []}
          items={items}
        />
      </SettingsCard>
    </SectionStack>
  );
}
