import { useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@/components/ads/components/Button";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import {
  ModelSelector,
  type ModelSelectorOption,
} from "@/components/ai-elements/model-selector";
import { TopBarNotifications } from "@/components/layout/TopBarNotifications";
import { Kbd, KbdGroup, TooltipProvider } from "@/components/ui";
import { useAppStore } from "@/store/app.store";
import { applyCustomTheme, applyThemeClass } from "@/lib/themes/apply";
import { IssuesBoard } from "@/components/layout/issues/IssuesBoard";
import { ExplorerEntryIcon, WorkspaceFileIcon } from "@/components/layout/explorer-entry-icon";
import { notifications, tickets } from "./fixtures";
import { AgentTreeRegressionFixture } from "./agent-tree";

const models: ModelSelectorOption[] = [
  {
    key: "opus",
    providerId: "claude-code",
    model: "claude-opus-5",
    label: "Claude Opus 5",
    isDefault: true,
    available: true,
  },
  {
    key: "sol",
    providerId: "codex",
    model: "gpt-5.6-sol",
    label: "GPT-5.6-Sol",
    description: "Reliable agentic workhorse for everyday tasks.",
    available: true,
  },
  {
    key: "astra",
    providerId: "codex",
    model: "gpt-6-astra",
    label: "GPT-6-Astra",
    description: "Our most capable model for complex, demanding work.",
    available: true,
  },
];
const styles = stylex.create({
  page: {
    padding: vars["--ads-space-24"],
    display: "grid",
    alignContent: "start",
    gap: vars["--ads-space-24"],
    color: vars["--ads-color-text"],
    backgroundColor: vars["--ads-color-canvas"],
    minBlockSize: "100vh",
  },
  controls: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--ads-space-12"],
  },
  heading: { fontSize: vars["--ads-font-size-body"], fontWeight: vars["--ads-font-weight-semibold"] },
  section: { minInlineSize: 0, display: "grid", gap: vars["--ads-space-12"] },
  keys: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    inlineSize: "18rem",
    padding: vars["--ads-space-12"],
    backgroundColor: vars["--ads-color-surface"],
    borderRadius: vars["--ads-radius-control"],
  },
  board: { blockSize: "28rem", minInlineSize: 0, overflow: "hidden" },
  // The explorer's own ground, so icon contrast is judged where the icons live.
  explorer: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(11rem, 1fr))",
    gap: vars["--ads-space-4"],
    padding: vars["--ads-space-12"],
    backgroundColor: "var(--sidebar)",
    borderRadius: vars["--ads-radius-control"],
  },
  entry: {
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    blockSize: 24,
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text"],
    whiteSpace: "nowrap",
  },
});

const explorerFolders = ["src", "electron", "docs", "public", "tests", "scripts", ".github", ".vscode", "node_modules", "styles", ".git", "misc"];
const explorerFiles = [
  "package.json", "bun.lock", "tsconfig.json", "vite.config.ts", "README.md", "Dockerfile", ".env", ".gitignore",
  "index.tsx", "main.ts", "app.jsx", "util.js", "Store.vue", "styles.css", "theme.scss", "index.html", "notes.md", "doc.txt",
  "data.json", "config.yaml", "Cargo.toml", "schema.sql", "query.graphql", "report.csv", "sheet.xlsx", "main.py", "server.go",
  "lib.rs", "App.java", "App.swift", "script.sh", "logo.svg", "photo.png", "deck.pdf", "clip.mp4", "song.mp3", "archive.zip", "LICENSE", "unknown.xyz",
];

/** Real product controls with bounded synthetic data; no provider turn is started. */
export function AdsRegressionPreview() {
  const [dark, setDark] = useState(false);
  const [model, setModel] = useState(models[0]!);
  const [selected, setSelected] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState("");
  useEffect(() => {
    const previous = useAppStore.getState().notifications;
    useAppStore.setState({ notifications });
    return () => {
      useAppStore.setState({ notifications: previous });
    };
  }, []);
  useEffect(() => {
    applyCustomTheme({ theme: null });
    applyThemeClass({ enabled: dark });
  }, [dark]);
  return (
    <TooltipProvider>
      <main className={sx(styles.page)}>
        <header className={sx(styles.controls)}>
          <h1 className={sx(styles.heading)}>ADS regression preview</h1>
          <Button variant="secondary" onClick={() => setDark(!dark)}>
            {dark ? "Dark" : "Light"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => useAppStore.setState({ notifications })}
          >
            Load read history
          </Button>
          <TopBarNotifications noDragStyle={{}} />
          <ModelSelector
            value={model}
            options={models}
            recommendedOptions={models}
            onSelect={({ selection }) => setModel(selection)}
          />
        </header>
        <AgentTreeRegressionFixture />
        <section className={sx(styles.section)}>
          <h2 className={sx(styles.heading)}>Explorer entry icons</h2>
          <div className={sx(styles.explorer)} data-review-explorer-icons="">
            {explorerFolders.map((name) => (
              <span key={name} className={sx(styles.entry)}>
                <ExplorerEntryIcon entry={{ name, type: "folder", path: name }} />
                {name}
              </span>
            ))}
            {explorerFiles.map((name) => (
              <span key={name} className={sx(styles.entry)}>
                <WorkspaceFileIcon fileName={name} />
                {name}
              </span>
            ))}
          </div>
        </section>
        <section className={sx(styles.section)}>
          <h2 className={sx(styles.heading)}>Keycaps in a stretching column</h2>
          <div className={sx(styles.keys)} data-review-keycaps="">
            <span>Switch workspace</span>
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <Kbd>1</Kbd>
            </KbdGroup>
            <Kbd>Escape</Kbd>
          </div>
        </section>
        <section className={sx(styles.section)}>
          <div className={sx(styles.controls)}>
            <h2 className={sx(styles.heading)}>Issues board</h2>
            <Button variant="secondary" onClick={() => setEmpty(!empty)}>
              {empty ? "Show tickets" : "Empty board"}
            </Button>
            <Button variant="secondary" onClick={() => setLoading(!loading)}>
              {loading ? "Finish loading" : "Loading board"}
            </Button>
            <span role="status">{action}</span>
          </div>
          <div className={sx(styles.board)}>
            <IssuesBoard
              items={empty ? [] : tickets}
              loading={loading}
              now={new Date("2026-09-07T09:00:00Z")}
              selectedKey={selected}
              onSelect={setSelected}
              onKickoff={(key) => setAction(`Kickoff requested: ${key}`)}
              onAttach={(key) => setAction(`Attach requested: ${key}`)}
              onOpenStaveTask={(key) => setAction(`Open requested: ${key}`)}
              attachTargetLabel="Preview workspace"
            />
          </div>
        </section>
      </main>
    </TooltipProvider>
  );
}
