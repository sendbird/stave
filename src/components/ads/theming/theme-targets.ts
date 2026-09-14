import { actionsThemeTargets } from "./theme-targets.actions";
import { agenticThemeTargets } from "./theme-targets.agentic";
import { chartsThemeTargets } from "./theme-targets.charts";
import { collabThemeTargets } from "./theme-targets.collab";
import { contentThemeTargets } from "./theme-targets.content";
import { dataThemeTargets } from "./theme-targets.data";
import { feedbackThemeTargets } from "./theme-targets.feedback";
import { filtersThemeTargets } from "./theme-targets.filters";
import { formsThemeTargets } from "./theme-targets.forms";
import { identityThemeTargets } from "./theme-targets.identity";
import { inputsThemeTargets } from "./theme-targets.inputs";
import { insightThemeTargets } from "./theme-targets.insight";
import { menubarThemeTargets } from "./theme-targets.menubar";
import { menusThemeTargets } from "./theme-targets.menus";
import { overlaysThemeTargets } from "./theme-targets.overlays";
import { pickerThemeTargets } from "./theme-targets.picker";
import { pilotThemeTargets } from "./theme-targets.pilot";
import { shellThemeTargets } from "./theme-targets.shell";
import { signalThemeTargets } from "./theme-targets.signal";
import { stepperThemeTargets } from "./theme-targets.stepper";
import { tabsThemeTargets } from "./theme-targets.tabs";

/**
 * Every stable theme target ADS publishes.
 *
 * Assembled from per-family modules rather than written as one object: the
 * registry ends up describing several hundred exports, and a single file would
 * be both unreviewable and over the source-size limit. The merge is a plain
 * spread so each family keeps its literal types, which is what makes
 * `themeProps("button", { variant })` reject a variant `Button` does not have.
 *
 * A family module owns a disjoint set of source files. That is deliberate: the
 * migration proceeds a family at a time, and two families never contend for
 * the same component.
 */
export const themeTargets = {
  ...pilotThemeTargets,
  ...actionsThemeTargets,
  ...agenticThemeTargets,
  ...chartsThemeTargets,
  ...collabThemeTargets,
  ...contentThemeTargets,
  ...dataThemeTargets,
  ...feedbackThemeTargets,
  ...filtersThemeTargets,
  ...formsThemeTargets,
  ...identityThemeTargets,
  ...inputsThemeTargets,
  ...insightThemeTargets,
  ...menubarThemeTargets,
  ...menusThemeTargets,
  ...overlaysThemeTargets,
  ...pickerThemeTargets,
  ...shellThemeTargets,
  ...signalThemeTargets,
  ...stepperThemeTargets,
  ...tabsThemeTargets,
} as const;

export type ThemeTargetName = keyof typeof themeTargets;

/** Stable names, sorted, for the guard and the docs ledger. */
export const themeTargetNames = Object.keys(
  themeTargets,
).sort() as ThemeTargetName[];
