import { useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { applyAppLocale } from "@/i18n";
import { BUILTIN_CUSTOM_THEMES } from "@/lib/themes/builtin-themes";

import { Badge as AuiBadge } from "@/components/aui/components/Badge";
import { Button } from "@/components/aui/components/Button";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui";
import { GitHubPrRow, InlineLinkRow, StorybookAccessBadges } from "@/components/layout/workspace-information/workspace-information-link-rows";
import { WorkspacePlansSection } from "@/components/layout/WorkspacePlansSection";
import { WorkspaceMemorySection } from "@/components/layout/WorkspaceMemorySection";
import { informationRow } from "@/components/layout/information-row.styles";
import { applyCustomTheme, applyThemeClass } from "@/lib/themes/apply";
import { TurnDocumentRevisionList } from "@/components/session/TurnDocumentRevisions";
import { useAppStore } from "@/store/app.store";
import { useWorkspaceDocumentsStore } from "@/store/workspace-documents-store";
import {
  installInformationRowPreviewApi,
  PREVIEW_DOCUMENT_ACTIVITY,
} from "./fixtures";

/**
 * The Information panel's three list kinds, side by side.
 *
 * They are the reason this entrypoint exists: a linked pull request, a saved
 * plan and a remembered decision are the same shape of thing, and each had
 * grown its own container. Verifying that they now share one row needs all
 * three visible at one width — and the browser dev bridge exposes no
 * `window.api.fs` or `window.api.repositoryMemory`, so the plan and memory lists
 * render empty in the real panel here no matter what is on disk. The fixture
 * installs just enough of that surface for the two sections to load.
 *
 * The rail width is the real one: these rows live in a ~340px panel, and a row
 * that only reads well at page width is not the row this panel needs.
 */
export function InformationRowsPreview() {
  // `&theme=<built-in id>|dark` and `&lang=ko`, as the other previews take them.
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const [builtinTheme] = useState(() => BUILTIN_CUSTOM_THEMES.find((candidate) => candidate.id === params.get("theme")) ?? null);
  const [dark, setDark] = useState(() => params.get("theme") === "dark" || builtinTheme?.baseMode === "dark");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    applyAppLocale(params.get("lang") ?? "en");
    installInformationRowPreviewApi();
    useWorkspaceDocumentsStore.setState({
      activityByWorkspace: {
        [useAppStore.getState().activeWorkspaceId]: PREVIEW_DOCUMENT_ACTIVITY,
      },
    });
    setReady(true);
  }, [params]);

  useEffect(() => {
    applyCustomTheme({ theme: builtinTheme });
    applyThemeClass({ enabled: dark });
  }, [builtinTheme, dark]);

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
          <AuiBadge variant="solid" tone="danger" data-review-aui-solid="">Blocked</AuiBadge>
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

        <section className={sx(styles.section)} data-review-turn-documents="">
          <h2 className={sx(styles.label)}>Documents under a reply</h2>
          <TurnDocumentRevisionList
            links={PREVIEW_DOCUMENT_ACTIVITY.linksByTurn["preview-turn"]}
            onOpen={() => {}}
            onCompare={() => {}}
          />
        </section>

        <section className={sx(styles.section)}>
          <h2 className={sx(styles.label)}>Documents</h2>
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
              repositoryPath="/tmp/stave-project"
              refreshKey="preview"
            />
          ) : null}
        </section>
      </div>
      {/* Forgetting a memory answers with an Undo toast. */}
      <Toaster />
    </div>
  );
}

const styles = stylex.create({
  page: {
    backgroundColor: vars["--aui-color-canvas"],
    boxSizing: "border-box",
    color: vars["--aui-color-text"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-24"],
    minBlockSize: "100vh",
    padding: vars["--aui-space-24"],
  },
  header: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-12"],
  },
  title: {
    fontSize: vars["--aui-font-size-heading"],
    fontWeight: vars["--aui-font-weight-semibold"],
    margin: 0,
  },
  note: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    inlineSize: "100%",
    margin: 0,
  },
  /* The real Information panel width. */
  rail: {
    borderColor: vars["--aui-color-border-subtle"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-24"],
    inlineSize: "21.25rem",
    padding: vars["--aui-space-16"],
  },
  section: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"] },
  label: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    margin: 0,
    textTransform: "uppercase",
  },
});
