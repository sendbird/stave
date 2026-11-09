import type { ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { vars } from "../aui/tokens/tokens.stylex";
import type { Tone } from "@/components/aui/utils/tone";

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
  tone?: Extract<Tone, "neutral" | "accent" | "warning" | "success" | "danger">;
}) {
  return <span {...stylex.props(styles.badge, styles[tone])}>{children}</span>;
}
const styles = stylex.create({
  surface: {
    minWidth: 0,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-panel"],
    backgroundColor: vars["--aui-color-surface"],
    color: vars["--aui-color-text"],
    overflow: "clip",
  },
  header: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars["--aui-space-12"],
    padding: vars["--aui-space-16"],
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: vars["--aui-color-border"],
  },
  heading: { minWidth: 0, flex: 1 },
  title: { fontSize: vars["--aui-font-size-body"], fontWeight: 650, margin: 0 },
  description: {
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
    marginTop: 4,
    lineHeight: 1.5,
  },
  body: { padding: vars["--aui-space-16"], minWidth: 0 },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    paddingBlock: 2,
    paddingInline: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: vars["--aui-color-border"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: 1.5,
    whiteSpace: "nowrap",
  },
  neutral: { color: vars["--aui-color-text-muted"] },
  accent: { color: vars["--aui-color-accent"] },
  warning: { color: vars["--aui-color-warning"] },
  success: { color: vars["--aui-color-success"] },
  danger: { color: vars["--aui-color-danger"] },
});
