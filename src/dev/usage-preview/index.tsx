import { useLayoutEffect, useMemo, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@/components/ads/components/Button";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { UsageView } from "@/components/usage/UsageView";
import { applyCustomTheme, applyThemeClass } from "@/lib/themes/apply";
import { BUILTIN_CUSTOM_THEMES } from "@/lib/themes/builtin-themes";
import { USAGE_PREVIEW_NOW, USAGE_PREVIEW_PROFILES, usagePreviewReport } from "./fixtures";

/** Dev-only: ?stavePreview=usage&theme=dark&width=384&state=empty|failed|loading|unavailable. */
export function UsagePreview() {
  const params = new URLSearchParams(window.location.search);
  const builtin = BUILTIN_CUSTOM_THEMES.find((theme) => theme.id === params.get("theme")) ?? null;
  const [dark, setDark] = useState(params.get("theme") === "dark" || builtin?.baseMode === "dark");
  const [failed, setFailed] = useState(params.get("state") === "failed");
  const [quotaFailed, setQuotaFailed] = useState(false);
  const state = params.get("state");
  const width = Number(params.get("width"));
  const delay = Number(params.get("delay")) || 0;
  useLayoutEffect(() => { applyThemeClass({ enabled: dark }); applyCustomTheme({ theme: builtin }); }, [dark, builtin]);
  const load = useMemo(() => async (args: import("@/lib/providers/usage-statistics").UsageStatisticsArgs) => {
    if (state === "loading") return new Promise<never>(() => {});
    if (state === "unavailable") return null;
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    if (failed) throw new Error("The usage database is temporarily locked.");
    return usagePreviewReport(args, state === "empty");
  }, [state, failed, delay]);
  return <div className={sx(styles.page)}>
    <div className={sx(styles.toolbar)}><strong>Usage preview · fixture data</strong>
      <Button variant="quiet" size="sm" onClick={() => setDark((value) => !value)}>{dark ? "Light theme" : "Dark theme"}</Button>
      <Button variant="quiet" size="sm" onClick={() => setFailed((value) => !value)}>{failed ? "Recover data" : "Fail data"}</Button>
      <Button variant="quiet" size="sm" onClick={() => setQuotaFailed((value) => !value)}>{quotaFailed ? "Recover quota" : "Fail quota"}</Button>
    </div>
    <div className={sx(styles.frame)} style={width ? { maxInlineSize: width } : undefined}>
      <UsageView load={load} profiles={USAGE_PREVIEW_PROFILES} now={USAGE_PREVIEW_NOW} onClose={() => {}}
        readQuota={async () => ({ error: quotaFailed ? "Quota endpoint temporarily unavailable." : null,
          feedback: { status: quotaFailed ? "unavailable" : params.get("quota") === "cached" ? "cached" : "fresh",
            reason: params.get("quota") === "cached" ? "manual-floor" : "request",
            nextRefreshAt: new Date(USAGE_PREVIEW_NOW + 60_000).toISOString(),
            nextAutomaticReadAt: new Date(USAGE_PREVIEW_NOW + (quotaFailed ? 300_000 : 120_000)).toISOString(),
            lastReadFailed: quotaFailed } })} />
    </div>
  </div>;
}
const styles = stylex.create({
  page: { blockSize: "100vh", display: "flex", flexDirection: "column", color: vars["--ads-color-text"], backgroundColor: vars["--ads-color-canvas"] },
  toolbar: { display: "flex", gap: vars["--ads-space-8"], flexWrap: "wrap", alignItems: "center", padding: vars["--ads-space-8"], fontSize: vars["--ads-font-size-caption"] },
  frame: { flex: "1 1 auto", minBlockSize: 0, inlineSize: "100%", display: "flex", flexDirection: "column" },
});
