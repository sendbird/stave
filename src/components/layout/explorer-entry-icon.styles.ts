import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

/**
 * Folder families are a categorical set, so they read from the nominal chart
 * slots rather than inventing per-folder hues. The badge fill is the same hue
 * mixed down to a wash, which is what the previous `/12` alpha meant.
 */
const codeWash = `color-mix(in oklch, ${vars.chart1} 12%, transparent)`;
const dataWash = `color-mix(in oklch, ${vars.chart7} 12%, transparent)`;
const docsWash = `color-mix(in oklch, ${vars.chart9} 12%, transparent)`;
const mediaWash = `color-mix(in oklch, ${vars.chart3} 12%, transparent)`;
const testsWash = `color-mix(in oklch, ${vars.chart10} 12%, transparent)`;
const scriptsWash = `color-mix(in oklch, ${vars.chart2} 12%, transparent)`;
const securityWash = `color-mix(in oklch, ${vars.chart6} 12%, transparent)`;
const configWash = `color-mix(in oklch, ${vars.colorTextMuted} 12%, transparent)`;
const packagesWash = `color-mix(in oklch, ${vars.chart4} 12%, transparent)`;
const stylesWash = `color-mix(in oklch, ${vars.chart11} 12%, transparent)`;
const gitWash = `color-mix(in oklch, ${vars.chart13} 12%, transparent)`;
const folderWash = `color-mix(in oklch, ${vars.chart5} 12%, transparent)`;

export const folderToneStyles = stylex.create({
  code: { backgroundColor: codeWash, color: vars.chart1 },
  data: { backgroundColor: dataWash, color: vars.chart7 },
  docs: { backgroundColor: docsWash, color: vars.chart9 },
  media: { backgroundColor: mediaWash, color: vars.chart3 },
  tests: { backgroundColor: testsWash, color: vars.chart10 },
  scripts: { backgroundColor: scriptsWash, color: vars.chart2 },
  security: { backgroundColor: securityWash, color: vars.chart6 },
  config: { backgroundColor: configWash, color: vars.colorTextMuted },
  packages: { backgroundColor: packagesWash, color: vars.chart4 },
  styles: { backgroundColor: stylesWash, color: vars.chart11 },
  git: { backgroundColor: gitWash, color: vars.chart13 },
  folder: { backgroundColor: folderWash, color: vars.chart5 },
});

export type FolderTone = keyof typeof folderToneStyles;

export const explorerIconStyles = stylex.create({
  folderBadge: {
    alignItems: "center",
    borderRadius: 5,
    display: "flex",
    flexShrink: 0,
    height: 16,
    justifyContent: "center",
    width: 16,
  },
  folderGlyph: { height: 13, width: 13 },
  /**
   * `react-file-icon` renders an `<svg width="100%">` with a 40x48 viewBox and
   * no height, so it would overflow a 16px row by its own aspect ratio. Cross
   * -axis `stretch` pins the child to the box height — the descendant-selector
   * equivalent of the `h-full` this used to reach in with.
   */
  fileIcon: {
    alignItems: "stretch",
    display: "flex",
    flexShrink: 0,
    height: 16,
    justifyContent: "center",
    width: 14,
  },
});
