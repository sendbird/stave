import { useEffect, useMemo, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { AgentProgressView } from "@/components/agent-progress/AgentProgressView";
import { APP_LOCALE_INTL_TAGS, I18N_NAMESPACES, applyRuntimeLocale, useTranslation } from "@/i18n";
import { applyThemeClass } from "@/lib/themes/apply";
import { buildScenarios, extraStep, type AgentProgressScenario } from "./fixtures";

declare global {
  interface Window {
    agentProgressPreview?: { addSteps: (count: number) => void };
  }
}

/**
 * `?stavePreview=agent-progress` — the Agent panel at the right rail's
 * default width, for a running, a finished, a failed and a nested agent.
 * `&lang=ko` renders Korean, `&theme=dark` the dark theme, and
 * `&scenario=<id>` one panel only. `window.agentProgressPreview.addSteps(n)`
 * appends steps to the running agent.
 */
export function AgentProgressPreview() {
  useTranslation(I18N_NAMESPACES);
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const [ready, setReady] = useState(false);
  const [extra, setExtra] = useState(0);

  useEffect(() => {
    const locale = applyRuntimeLocale(params.get("lang") ?? params.get("locale"));
    document.documentElement.lang = APP_LOCALE_INTL_TAGS[locale];
    applyThemeClass({ enabled: params.get("theme") === "dark" });
    setReady(true);
  }, [params]);

  useEffect(() => {
    window.agentProgressPreview = { addSteps: (count) => setExtra((value) => value + count) };
    return () => {
      delete window.agentProgressPreview;
    };
  }, []);

  const only = params.get("scenario");
  const scenarios = useMemo<AgentProgressScenario[]>(() => {
    if (!ready) return [];
    return buildScenarios()
      .filter((scenario) => !only || scenario.id === only)
      .map((scenario) => scenario.id !== "running" || extra === 0 ? scenario : {
        ...scenario,
        progress: {
          ...scenario.progress,
          steps: [...scenario.progress.steps, ...Array.from({ length: extra }, (_, index) => extraStep(index))],
        },
      });
  }, [ready, only, extra]);

  return (
    <main className={sx(styles.page)}>
      {scenarios.map((scenario) => (
        <section key={scenario.id} className={sx(styles.scenario)} aria-label={scenario.title} data-scenario={scenario.id}>
          <h2 className={sx(styles.caption)}>{scenario.title}</h2>
          <div className={sx(styles.rail)}>
            <AgentProgressView
              progress={scenario.progress}
              onClose={() => {}}
              onOpenParent={() => {}}
              onOpenChild={() => {}}
              {...(scenario.progress.state === "working" && scenario.progress.source !== "subagent" ? { onStop: () => {} } : {})}
              {...(scenario.progress.source === "delegated-task" ? { onOpenTask: () => {} } : {})}
              {...(scenario.back ? { back: { label: scenario.back, onBack: () => {} } } : {})}
            />
          </div>
        </section>
      ))}
    </main>
  );
}

const styles = stylex.create({
  page: {
    backgroundColor: vars["--aui-color-canvas"],
    color: vars["--aui-color-text"],
    display: "flex",
    flexWrap: "wrap",
    fontFamily: vars["--aui-font-sans"],
    gap: vars["--aui-space-24"],
    minHeight: "100vh",
    padding: vars["--aui-space-24"],
  },
  scenario: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
  },
  caption: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    margin: 0,
  },
  // The right rail's default width and a laptop-height column.
  rail: {
    backgroundColor: vars["--aui-color-surface"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    height: "40rem",
    overflow: "hidden",
    width: "22.5rem",
  },
});
