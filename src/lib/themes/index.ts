// ---------------------------------------------------------------------------
// @/lib/themes  --  public API for the Stave custom theme system
// ---------------------------------------------------------------------------

// Types
export {
  THEME_TOKEN_NAMES,
  EXTENDED_THEME_TOKEN_NAMES,
  BUILTIN_THEME_TOKEN_NAMES,
  type ThemeTokenName,
  type ExtendedThemeTokenName,
  type BuiltinThemeTokenName,
  type ThemeModeName,
  type ThemeTokenValues,
  type ThemeOverrideValues,
  type BuiltinThemeTokenValues,
  type CustomThemeDefinition,
} from "./types";

// Base light / dark preset values
export { PRESET_THEME_TOKENS } from "./presets";

// Built-in custom theme definitions
export { BUILTIN_CUSTOM_THEMES, withStateColors } from "./builtin-themes";

// Agent state colors: derivation from a theme's own colors, and the checks
export {
  STATE_COLOR_TOKEN_NAMES,
  STATE_COLOR_MIN_DISTANCE,
  STATE_GLYPH_CONTRAST_FLOOR,
  DISTINCT_STATE_COLOR_PAIRS,
  type StateColorTokenName,
  type StateColorProblem,
  deriveStateColors,
  checkStateColors,
} from "./state-colors";

// DOM application functions
export {
  THEME_CHANGING_CLASS,
  applyThemeClass,
  applyThemeOverrides,
  applyCustomTheme,
  applyThemeContrast,
  applyUiDensity,
  applyFontOverrides,
  buildFontStacks,
  buildThemeOverrideCss,
  buildCustomThemeCss,
  resolveDarkModeForTheme,
  findCustomThemeById,
  listAllCustomThemes,
} from "./apply";

// Validation & serialisation for user-installable themes
export {
  MAX_USER_THEMES,
  MAX_THEME_FILE_SIZE,
  CustomThemeJsonSchema,
  type CustomThemeJson,
  type ThemeValidationResult,
  validateCustomThemeJson,
  parseCustomThemeFile,
  exportCustomThemeJson,
} from "./validate";
