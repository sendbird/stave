import * as stylex from "@stylexjs/stylex";

export const turnActivityPanelStyles = stylex.create({
  column: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
  },
  body: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    minHeight: 0,
  },
});
