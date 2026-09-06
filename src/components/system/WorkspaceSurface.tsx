import type { ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export function WorkspaceSurface({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section {...stylex.props(styles.surface)}>
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.heading)}>
          <h2 {...stylex.props(styles.title)}>{title}</h2>
          {description ? (
            <p {...stylex.props(styles.description)}>{description}</p>
          ) : null}
        </div>
        {actions}
      </header>
      <div {...stylex.props(styles.body)}>{children}</div>
    </section>
  );
}
export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "active" | "warning" | "success" | "danger";
}) {
  return <span {...stylex.props(styles.badge, styles[tone])}>{children}</span>;
}
const styles = stylex.create({
  surface: {
    minWidth: 0,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    backgroundColor: vars.colorSurface,
    color: vars.colorText,
    overflow: "clip",
  },
  header: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars.space12,
    padding: vars.space16,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: vars.colorBorder,
  },
  heading: { minWidth: 0, flex: 1 },
  title: { fontSize: vars.fontSizeBody, fontWeight: 650, margin: 0 },
  description: {
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
    marginTop: 4,
    lineHeight: 1.5,
  },
  body: { padding: vars.space16, minWidth: 0 },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    paddingBlock: 2,
    paddingInline: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: vars.colorBorder,
    fontSize: vars.fontSizeCaption,
    lineHeight: 1.5,
    whiteSpace: "nowrap",
  },
  neutral: { color: vars.colorTextMuted },
  active: { color: vars.colorAccent },
  warning: { color: vars.colorWarning },
  success: { color: vars.colorSuccess },
  danger: { color: vars.colorDanger },
});
