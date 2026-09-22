import { useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";

import { Badge as AdsBadge } from "@/components/ads/components/Badge";
import { Button } from "@/components/ads/components/Button";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GitHubPrRow, InlineLinkRow, StorybookAccessBadges } from "@/components/layout/WorkspaceInformationPanel";
import { WorkspacePlansSection } from "@/components/layout/WorkspacePlansSection";
import { WorkspaceMemorySection } from "@/components/layout/WorkspaceMemorySection";
import { informationRow } from "@/components/layout/information-row.styles";
import { applyCustomTheme, applyThemeClass } from "@/lib/themes/apply";
import { installInformationRowPreviewApi } from "./fixtures";

/**
 * The Information panel's three list kinds, side by side.
 *
 * They are the reason this entrypoint exists: a linked pull request, a saved
 * plan and a remembered decision are the same shape of thing, and each had
 * grown its own container. Verifying that they now share one row needs all
 * three visible at one width — and the browser dev bridge exposes no
 * `window.api.fs` or `window.api.projectMemory`, so the plan and memory lists
 * render empty in the real panel here no matter what is on disk. The fixture
 * installs just enough of that surface for the two sections to load.
 *
 * The rail width is the real one: these rows live in a ~340px panel, and a row
 * that only reads well at page width is not the row this panel needs.
 */
export function InformationRowsPreview() {
  const [dark, setDark] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    installInformationRowPreviewApi();
    setReady(true);
  }, []);

  useEffect(() => {
    applyCustomTheme({ theme: null });
    applyThemeClass({ enabled: dark });
  }, [dark]);

  return (
    <div className={sx(styles.page)}>
      <header className={sx(styles.header)}>
        <h1 className={sx(styles.title)}>Information panel · list rows</h1>
        <Button variant="quiet" onClick={() => setDark((value) => !value)}>
          {dark ? "Dark" : "Light"}
        </Button>
        <p className={sx(styles.note)}>
          Pull request, plan and memory rows at the real rail width. Hover a row
          to reveal its actions.
        </p>
      </header>

      <div className={sx(styles.rail)} data-review-information-rail="">
        <section className={sx(styles.section)} data-review-storybook="">
          <h2 className={sx(styles.label)}>Storybook</h2>
          {(["requires_github_auth", "public"] as const).map((kind) => (
            <InlineLinkRow
              key={kind}
              icon={<Globe size={16} />}
              label="Companion Rich UI — long component title"
              sublabel="preview.example.com · /story/companion-rich-ui"
              badge={<StorybookAccessBadges access={{ kind, provider: "github-pages", readableVia: "github_cli", sourceHint: "Preview fixture", externalRepo: "example/very-long-component-repository" }} />}
              url="https://preview.example.com"
              onRemove={() => {}}
            />
          ))}
        </section>
        <section className={sx(styles.section)} data-review-badges="">
          <h2 className={sx(styles.label)}>Badge compatibility</h2>
          <Badge variant="warning">Long status text that must stay inside its badge even in a narrow sidebar</Badge>
          <Badge variant="solid" tone="danger" data-review-shim-solid="">Blocked</Badge>
          <AdsBadge variant="solid" tone="danger" data-review-ads-solid="">Blocked</AdsBadge>
        </section>

        <section className={sx(styles.section)}>
          <h2 className={sx(styles.label)}>Pull requests</h2>
          <div className={sx(informationRow.list)}>
            <GitHubPrRow
              number={495}
              title="fix(ui): correct ads geometry and trace composition"
              status="ready_to_merge"
              repo="sendbird/stave"
              branch="fix/ads-style → main"
              url="https://example.com/pull/495"
              isCurrent
            />
            <GitHubPrRow
              number={494}
              title="fix(ui): restore ads adoption regressions across the product surface"
              status="merged"
              repo="sendbird/stave"
              branch="fix/ads-regressions → main"
              url="https://example.com/pull/494"
              onRefresh={() => {}}
              onRemove={() => {}}
            />
            <GitHubPrRow
              number={433}
              title="fix(ads): widen the toolrun narrow arm to where the row stops fitting"
              status="checks_failed"
              repo="sendbird/atelier"
              url="https://example.com/pull/433"
              onRefresh={() => {}}
              onRemove={() => {}}
            />
          </div>
        </section>

        <section className={sx(styles.section)}>
          <h2 className={sx(styles.label)}>Plans</h2>
          {ready ? (
            <WorkspacePlansSection
              embedded
              workspacePath="/tmp/stave-project"
              taskId="10d53a9c"
              refreshNonce={0}
              onOpenFile={async () => {}}
              onImportTodos={async () => {}}
            />
          ) : null}
        </section>

        <section className={sx(styles.section)}>
          <h2 className={sx(styles.label)}>Memory</h2>
          {ready ? (
            <WorkspaceMemorySection
              projectPath="/tmp/stave-project"
              refreshKey="preview"
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}

const styles = stylex.create({
  page: {
    backgroundColor: vars["--ads-color-canvas"],
    boxSizing: "border-box",
    color: vars["--ads-color-text"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-24"],
    minBlockSize: "100vh",
    padding: vars["--ads-space-24"],
  },
  header: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-12"],
  },
  title: {
    fontSize: vars["--ads-font-size-heading"],
    fontWeight: vars["--ads-font-weight-semibold"],
    margin: 0,
  },
  note: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    inlineSize: "100%",
    margin: 0,
  },
  /* The real Information panel width. */
  rail: {
    borderColor: vars["--ads-color-border-subtle"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-24"],
    inlineSize: "21.25rem",
    padding: vars["--ads-space-16"],
  },
  section: { display: "flex", flexDirection: "column", gap: vars["--ads-space-8"] },
  label: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    margin: 0,
    textTransform: "uppercase",
  },
});
