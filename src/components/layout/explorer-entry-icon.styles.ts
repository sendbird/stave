import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

/**
 * Folder families are a categorical set, so they read from the nominal chart
 * slots rather than inventing per-folder hues. The badge fill is the same hue
 * mixed down to a wash, which is what the previous `/12` alpha meant.
 */
const codeWash = `color-mix(in oklch, ${vars["--ads-chart-1"]} 12%, transparent)`;
const dataWash = `color-mix(in oklch, ${vars["--ads-chart-7"]} 12%, transparent)`;
const docsWash = `color-mix(in oklch, ${vars["--ads-chart-9"]} 12%, transparent)`;
const mediaWash = `color-mix(in oklch, ${vars["--ads-chart-3"]} 12%, transparent)`;
const testsWash = `color-mix(in oklch, ${vars["--ads-chart-10"]} 12%, transparent)`;
const scriptsWash = `color-mix(in oklch, ${vars["--ads-chart-2"]} 12%, transparent)`;
const securityWash = `color-mix(in oklch, ${vars["--ads-chart-6"]} 12%, transparent)`;
const configWash = `color-mix(in oklch, ${vars["--ads-color-text-muted"]} 12%, transparent)`;
const packagesWash = `color-mix(in oklch, ${vars["--ads-chart-4"]} 12%, transparent)`;
const stylesWash = `color-mix(in oklch, ${vars["--ads-chart-11"]} 12%, transparent)`;
const gitWash = `color-mix(in oklch, ${vars["--ads-chart-13"]} 12%, transparent)`;
const folderWash = `color-mix(in oklch, ${vars["--ads-chart-5"]} 12%, transparent)`;

export const folderToneStyles = stylex.create({
  code: { backgroundColor: codeWash, color: vars["--ads-chart-1"] },
  data: { backgroundColor: dataWash, color: vars["--ads-chart-7"] },
  docs: { backgroundColor: docsWash, color: vars["--ads-chart-9"] },
  media: { backgroundColor: mediaWash, color: vars["--ads-chart-3"] },
  tests: { backgroundColor: testsWash, color: vars["--ads-chart-10"] },
  scripts: { backgroundColor: scriptsWash, color: vars["--ads-chart-2"] },
  security: { backgroundColor: securityWash, color: vars["--ads-chart-6"] },
  config: { backgroundColor: configWash, color: vars["--ads-color-text-muted"] },
  packages: { backgroundColor: packagesWash, color: vars["--ads-chart-4"] },
  styles: { backgroundColor: stylesWash, color: vars["--ads-chart-11"] },
  git: { backgroundColor: gitWash, color: vars["--ads-chart-13"] },
  folder: { backgroundColor: folderWash, color: vars["--ads-chart-5"] },
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
