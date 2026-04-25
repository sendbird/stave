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

// Sidebar artwork variants for the project workspace shell
export {
  SIDEBAR_ARTWORK_OPTIONS,
  DEFAULT_SIDEBAR_ARTWORK_MODE,
  normalizeSidebarArtworkMode,
  resolveSidebarArtworkClass,
  type SidebarArtworkMode,
} from "./sidebar-artwork";

// Base light / dark preset values
export { PRESET_THEME_TOKENS } from "./presets";

// Built-in custom theme definitions
export { BUILTIN_CUSTOM_THEMES } from "./builtin-themes";

// DOM application functions
export {
  applyThemeClass,
  applyThemeOverrides,
  applyCustomTheme,
  applyFontOverrides,
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
