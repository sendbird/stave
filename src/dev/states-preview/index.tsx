import { applyAppLocale, useTranslation } from "@/i18n";
import { useLayoutEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { EmptyState } from "@/components/aui/components/EmptyState";
import { StateMark } from "@/components/aui/components/StateMark";
import { WORK_STATES } from "@/components/aui/components/state-vocabulary";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { AsyncBoundary, type AsyncState } from "@/components/system/AsyncBoundary";
import { applyCustomTheme, applyThemeClass } from "@/lib/themes/apply";
import { BUILTIN_CUSTOM_THEMES } from "@/lib/themes/builtin-themes";

const params = new URLSearchParams(window.location.search);
const ROWS = ["alpha.ts", "beta.ts", "gamma.ts"];
const BOUNDARY_STATES: ReadonlyArray<readonly [string, AsyncState<string[]>]> = [
  ["Pending", { status: "pending" }],
  ["Error", { status: "error", error: "The listing could not be read: EACCES." }],
  ["Empty", { status: "ready", data: [] }],
  ["Ready", { status: "ready", data: ROWS }],
  ["Stale", { status: "ready", data: ROWS, stale: true, refreshError: "The refresh timed out." }],
];

/**
 * Every work state drawn with StateMark and every AsyncBoundary state, on the
 * card surface the panels use. `theme=<built-in id>` applies a built-in theme,
 * `theme=dark` the default dark one, and `lang=ko` the Korean words.
 */
export function StatesPreview() {
  // Re-render when `lang` switches the locale, so the state words follow it.
  useTranslation();
  const builtinTheme = BUILTIN_CUSTOM_THEMES.find((candidate) => candidate.id === params.get("theme")) ?? null;
  const [dark] = useState(() => params.get("theme") === "dark" || builtinTheme?.baseMode === "dark");
  useLayoutEffect(() => {
    applyAppLocale(params.get("lang") ?? "en");
  }, []);
  useLayoutEffect(() => {
    applyThemeClass({ enabled: dark });
    applyCustomTheme({ theme: builtinTheme });
  }, [dark, builtinTheme]);
  return (
    <main className={sx(styles.page)}>
      <h1 className={sx(styles.heading)}>States · {builtinTheme?.name ?? (dark ? "Dark" : "Light")}</h1>
      <section className={sx(styles.card, styles.marks)} aria-label="Work states">
        {WORK_STATES.map((state) => (
          <div key={state} className={sx(styles.markRow)}>
            <StateMark state={state} size="xs" />
            <StateMark state={state} size="sm" />
            <StateMark state={state} size="md" showLabel />
          </div>
        ))}
      </section>
      <div className={sx(styles.grid)}>
        {BOUNDARY_STATES.map(([title, state]) => (
          <section key={title} className={sx(styles.card)} aria-label={title}>
            <h2 className={sx(styles.subheading)}>{title}</h2>
            <AsyncBoundary
              state={state}
              onRetry={() => {}}
              isEmpty={(rows) => rows.length === 0}
              empty={<EmptyState title="No files yet" description="Files you add appear here." />}
            >
              {(rows) => (
                <ul className={sx(styles.list)}>
                  {rows.map((row) => (
                    <li key={row}>{row}</li>
                  ))}
                </ul>
              )}
            </AsyncBoundary>
          </section>
        ))}
      </div>
    </main>
  );
}

const styles = stylex.create({
  page: {
    backgroundColor: vars["--aui-color-canvas"],
    color: vars["--aui-color-text"],
    display: "grid",
    gap: vars["--aui-space-16"],
    minBlockSize: "100vh",
    padding: vars["--aui-space-24"],
    alignContent: "start",
  },
  heading: { fontSize: vars["--aui-font-size-title"], margin: 0 },
  subheading: { fontSize: vars["--aui-font-size-caption"], margin: 0, color: vars["--aui-color-text-muted"] },
  card: {
    backgroundColor: vars["--aui-color-surface"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: 1,
    display: "grid",
    gap: vars["--aui-space-12"],
    padding: vars["--aui-space-16"],
    alignContent: "start",
  },
  marks: { gridTemplateColumns: "repeat(auto-fill, minmax(12rem, 1fr))" },
  markRow: { alignItems: "center", display: "flex", gap: vars["--aui-space-8"] },
  grid: { display: "grid", gap: vars["--aui-space-16"], gridTemplateColumns: "repeat(auto-fill, minmax(18rem, 1fr))" },
  list: { margin: 0, paddingInlineStart: vars["--aui-space-16"] },
});
