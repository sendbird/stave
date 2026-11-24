import { Component, lazy, Suspense, useMemo, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { i18n, useTranslation } from "@/i18n";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx, type StyleXValue } from "@/components/aui/utils/stylex";
import {
  parseStructuredViewFence,
  type StructuredViewSpec,
} from "@/lib/structured-view/view-spec";

/*
 * The renderer carries the chart library and the data table, so it loads the
 * first time a reply shows a view; a session without views never pays for it.
 */
const StructuredViewRenderer = lazy(() => import("./structured-view-renderer"));

/** Holds the view's place while the renderer loads or a fence is still being written. */
export function StructuredViewPlaceholder() {
  useTranslation();
  return (
    <div className={sx(styles.placeholder)} data-structured-view-placeholder="">
      {i18n.t("composer:structuredView.drawing")}
    </div>
  );
}

type BoundaryProps = { children: ReactNode; fallback: ReactNode };

/** A view that throws while drawing shows a note instead of breaking the reply. */
class StructuredViewBoundary extends Component<BoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * One structured view in the conversation: a table, chart, stat tiles, a
 * timeline or a heatmap the agent described as inline data. Native
 * components draw it, so it follows the theme and needs no frame.
 */
export function StructuredViewBlock(props: { spec: StructuredViewSpec; xstyle?: StyleXValue }) {
  useTranslation();
  return (
    <div className={sx(styles.block, props.xstyle)} data-structured-view={props.spec.type}>
      <StructuredViewBoundary
        fallback={<p className={sx(styles.note)}>{i18n.t("composer:structuredView.failed")}</p>}
      >
        <Suspense fallback={<StructuredViewPlaceholder />}>
          <StructuredViewRenderer spec={props.spec} />
        </Suspense>
      </StructuredViewBoundary>
    </div>
  );
}

export function StructuredViewList(props: {
  views: ReadonlyArray<{ key: string; spec: StructuredViewSpec }>;
  xstyle?: StyleXValue;
}) {
  return (
    <div className={sx(styles.list, props.xstyle)}>
      {props.views.map((view) => (
        <StructuredViewBlock key={view.key} spec={view.spec} />
      ))}
    </div>
  );
}

/**
 * A `stave-view` fence in a reply. While the reply streams the JSON is
 * incomplete, so the placeholder holds its place; a fence that is not a valid
 * view shows its source with the reason.
 */
export function StructuredViewFence(props: { code: string; isStreaming: boolean; source: ReactNode }) {
  useTranslation();
  const parsed = useMemo(
    () => (props.isStreaming ? null : parseStructuredViewFence(props.code)),
    [props.code, props.isStreaming],
  );
  if (!parsed) return <StructuredViewPlaceholder />;
  if (!parsed.ok) {
    return (
      <div className={sx(styles.list)}>
        {props.source}
        <p className={sx(styles.note)} data-structured-view-error="">
          {i18n.t("composer:structuredView.invalid", { detail: parsed.error })}
        </p>
      </div>
    );
  }
  return <StructuredViewBlock spec={parsed.spec} />;
}

const styles = stylex.create({
  block: {
    minInlineSize: 0,
  },
  list: {
    display: "grid",
    gap: vars["--aui-space-12"],
    minInlineSize: 0,
  },
  placeholder: {
    borderColor: vars["--aui-color-border-subtle"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "dashed",
    borderWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-16"],
  },
  note: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    margin: 0,
  },
});
