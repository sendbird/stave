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
import { TasksBoard } from "@/components/layout/tasks/TasksBoard";
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
    padding: vars.space24,
    display: "grid",
    alignContent: "start",
    gap: vars.space24,
    color: vars.colorText,
    backgroundColor: vars.colorCanvas,
    minBlockSize: "100vh",
  },
  controls: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars.space12,
  },
  heading: { fontSize: vars.fontSizeBody, fontWeight: vars.fontWeightSemibold },
  section: { minInlineSize: 0, display: "grid", gap: vars.space12 },
  keys: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
    inlineSize: "18rem",
    padding: vars.space12,
    backgroundColor: vars.colorSurface,
    borderRadius: vars.radiusControl,
  },
  board: { blockSize: "28rem", minInlineSize: 0, overflow: "hidden" },
});

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
            <h2 className={sx(styles.heading)}>Tasks board</h2>
            <Button variant="secondary" onClick={() => setEmpty(!empty)}>
              {empty ? "Show tickets" : "Empty board"}
            </Button>
            <Button variant="secondary" onClick={() => setLoading(!loading)}>
              {loading ? "Finish loading" : "Loading board"}
            </Button>
            <span role="status">{action}</span>
          </div>
          <div className={sx(styles.board)}>
            <TasksBoard
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
