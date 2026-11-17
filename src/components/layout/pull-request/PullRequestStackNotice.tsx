import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@/components/aui/components/Button";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { useTranslation } from "@/i18n";
import type { PullRequestStack } from "@/lib/pull-request-stack";

export function PullRequestStackNotice({ stack, cwd, onUpdated }: {
  stack: PullRequestStack | null;
  cwd: string;
  onUpdated?: () => void;
}) {
  const { t } = useTranslation("sourceControl");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!stack || stack.total < 2) return null;
  const parent = stack.parent?.state === "MERGED" ? stack.parent
    : stack.members.find((pr) => pr.number === stack.current && pr.state === "MERGED");
  const children = parent ? stack.members.filter((pr) => pr.state === "OPEN" && pr.baseRefName === parent.headRefName) : [];
  const update = async () => {
    if (!parent || !children.length || !window.api?.sourceControl?.retargetPrStack) return;
    setBusy(true);
    setError("");
    try {
      const result = await window.api.sourceControl.retargetPrStack({ cwd, parentNumber: parent.number, childNumbers: children.map((pr) => pr.number) });
      if (!result.ok) setError(result.stderr);
      else onUpdated?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setBusy(false); }
  };
  return <div className={sx(styles.root)} data-pr-stack>
    <span className={sx(styles.label)}>{t("prStack.position", { position: stack.position, total: stack.total })}</span>
    <div className={sx(styles.links)}>
      {[...(stack.parent ? [stack.parent] : []), ...stack.children].map((pr) => <Button
        key={pr.number} size="sm" variant="quiet"
        onClick={() => { void window.api?.shell?.openExternal?.({ url: pr.url }); }}
      >{t(pr.number === stack.parent?.number ? "prStack.parent" : "prStack.child", { number: pr.number })}</Button>)}
    </div>
    {children.length > 0 ? <Button size="sm" variant="secondary" disabled={busy} onClick={() => { void update(); }}>
      {t("prStack.retarget")}
    </Button> : null}
    {error ? <p className={sx(styles.error)} role="alert">{t("prStack.updateFailed", { detail: error })}</p> : null}
  </div>;
}

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: vars["--aui-space-4"], padding: vars["--aui-space-8"], minWidth: 0 },
  label: { color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"] },
  links: { display: "flex", flexWrap: "wrap", gap: vars["--aui-space-4"], minWidth: 0 },
  error: { margin: 0, color: vars["--aui-color-danger-text"], fontSize: vars["--aui-font-size-caption"], overflowWrap: "anywhere" },
});
