import * as stylex from "@stylexjs/stylex";
import { Button } from "@/components/aui/components/Button";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { useTranslation } from "@/i18n";
import type { PullRequestStack } from "@/lib/pull-request-stack";

/**
 * Position, parent and child links, and the entry to retargeting. The
 * retarget dialog lives outside this notice (and outside any menu that hosts
 * it), so closing the menu never loses a confirmation or its results.
 */
export function PullRequestStackNotice({ stack, showPosition = true, onRetarget }: {
  stack: PullRequestStack | null;
  /** The top bar shows the position next to its trigger already. */
  showPosition?: boolean;
  onRetarget?: () => void;
}) {
  const { t } = useTranslation("sourceControl");
  if (!stack || (stack.total < 2 && !stack.retarget)) return null;
  const links = [...(stack.parent ? [stack.parent] : []), ...stack.children];
  return <div className={sx(styles.root)} data-pr-stack>
    {showPosition && stack.total > 1 ? <span className={sx(styles.label)}>{t("prStack.position", { position: stack.position, total: stack.total })}</span> : null}
    {links.length ? <div className={sx(styles.links)}>
      {links.map((pr) => <Button
        key={pr.number} size="sm" variant="quiet"
        onClick={() => { void window.api?.shell?.openExternal?.({ url: pr.url }); }}
      >{t(pr.number === stack.parent?.number ? "prStack.parent" : "prStack.child", { number: pr.number })}</Button>)}
    </div> : null}
    {stack.retarget && onRetarget ? <Button size="sm" variant="secondary" onClick={onRetarget}>
      {t("prStack.retarget")}
    </Button> : null}
  </div>;
}

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: vars["--aui-space-4"], padding: vars["--aui-space-8"], minWidth: 0 },
  label: { color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"] },
  links: { display: "flex", flexWrap: "wrap", gap: vars["--aui-space-4"], minWidth: 0 },
});
