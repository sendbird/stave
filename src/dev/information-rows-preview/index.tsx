import { useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";

import { Button } from "@/components/ads/components/Button";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { GitHubPrRow } from "@/components/layout/WorkspaceInformationPanel";
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

      <div className={sx(styles.rail)}>
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
    backgroundColor: vars.colorCanvas,
    boxSizing: "border-box",
    color: vars.colorText,
    display: "flex",
    flexDirection: "column",
    gap: vars.space24,
    minBlockSize: "100vh",
    padding: vars.space24,
  },
  header: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space12,
  },
  title: {
    fontSize: vars.fontSizeHeading,
    fontWeight: vars.fontWeightSemibold,
    margin: 0,
  },
  note: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    inlineSize: "100%",
    margin: 0,
  },
  /* The real Information panel width. */
  rail: {
    borderColor: vars.colorBorderSubtle,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: vars.space24,
    inlineSize: "21.25rem",
    padding: vars.space16,
  },
  section: { display: "flex", flexDirection: "column", gap: vars.space8 },
  label: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    margin: 0,
    textTransform: "uppercase",
  },
});
