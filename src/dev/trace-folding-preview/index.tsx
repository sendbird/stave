import { useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Moon } from "lucide-react";
import { Button } from "@/components/aui/components/Button";
import { controlIconSizes } from "@/components/aui/recipes/control-metrics";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { AssistantMessageBody } from "@/components/session/message/assistant-trace";
import { APP_LOCALE_INTL_TAGS, I18N_NAMESPACES, applyRuntimeLocale, useTranslation } from "@/i18n";
import { applyThemeClass, applyUiDensity } from "@/lib/themes/apply";
import { traceScenarios } from "./fixtures";

export function TraceFoldingPreview() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const [dark, setDark] = useState(() => params.get("theme") === "dark");

  useEffect(() => {
    const locale = applyRuntimeLocale(params.get("locale"));
    document.documentElement.lang = APP_LOCALE_INTL_TAGS[locale];
    applyUiDensity({ density: params.get("density") === "compact" ? "compact" : "regular" });
  }, [params]);

  useEffect(() => {
    applyThemeClass({ enabled: dark });
  }, [dark]);

  return (
    <main className={sx(styles.page)}>
      <header className={sx(styles.pageHeader)}>
        <div className={sx(styles.intro)}>
          <h1 className={sx(styles.title)}>{t("session:traceFoldingPreview.title")}</h1>
          <p className={sx(styles.description)}>{t("session:traceFoldingPreview.description")}</p>
        </div>
        <Button variant="quiet" aria-pressed={dark} onClick={() => setDark((value) => !value)}>
          <Moon aria-hidden size={controlIconSizes.md} />
          {t("session:traceFoldingPreview.darkMode")}
        </Button>
      </header>

      {traceScenarios.map(({ id, title, message }) => (
        <section key={id} className={sx(styles.scenario)} aria-labelledby={id}>
          <h2 id={id} className={sx(styles.scenarioTitle)}>{t(title)}</h2>
          <div className={sx(styles.panel)}>
            <AssistantMessageBody
              taskId="trace-folding-preview"
              messageId={id}
              message={message}
              streamingEnabled
              readOnly
            />
          </div>
        </section>
      ))}
    </main>
  );
}

const styles = stylex.create({
  page: {
    color: vars["--aui-color-text"],
    backgroundColor: vars["--aui-color-canvas"],
    fontFamily: vars["--aui-font-sans"],
    paddingBlock: vars["--aui-space-32"],
    paddingInline: {
      default: vars["--aui-space-24"],
      "@media (max-width: 40rem)": vars["--aui-space-12"],
    },
    display: "grid",
    gap: vars["--aui-space-32"],
    minHeight: "100vh",
  },
  pageHeader: {
    inlineSize: "100%",
    maxInlineSize: "80rem",
    marginInline: "auto",
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: vars["--aui-space-16"],
  },
  intro: {
    display: "grid",
    gap: vars["--aui-space-8"],
    minWidth: 0,
    maxInlineSize: "64ch",
  },
  title: {
    fontSize: vars["--aui-font-size-title"],
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  description: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
  },
  scenario: {
    minWidth: 0,
    inlineSize: "100%",
    maxInlineSize: "80rem",
    marginInline: "auto",
    display: "grid",
    gap: vars["--aui-space-12"],
  },
  scenarioTitle: {
    fontSize: vars["--aui-font-size-lead"],
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  panel: {
    minWidth: 0,
    padding: vars["--aui-space-16"],
    border: `${vars["--aui-border-width-hairline"]} solid ${vars["--aui-color-border-subtle"]}`,
    borderRadius: vars["--aui-radius-panel"],
    fontSize: vars["--aui-font-size-body"],
  },
});
