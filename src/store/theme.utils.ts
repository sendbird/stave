// ---------------------------------------------------------------------------
// Thin re-export layer
//
// All theme logic now lives in @/lib/themes/*.  This file keeps the original
// import path (`@/store/theme.utils`) working so existing consumers don't
// need to change.
// ---------------------------------------------------------------------------

export {
  // Types
  THEME_TOKEN_NAMES,
  type ThemeTokenName,
  type ThemeModeName,
  type ThemeTokenValues,
  type ThemeOverrideValues,
  type CustomThemeDefinition,

  // Presets
  PRESET_THEME_TOKENS,

  // Built-in custom themes
  BUILTIN_CUSTOM_THEMES,

  // DOM application
  applyThemeClass,
  applyThemeOverrides,
  applyCustomTheme,
  applyFontOverrides,
  buildThemeOverrideCss,
  buildCustomThemeCss,
  resolveDarkModeForTheme,
  findCustomThemeById,
  listAllCustomThemes,

  // Validation
  MAX_USER_THEMES,
  MAX_THEME_FILE_SIZE,
  CustomThemeJsonSchema,
  type CustomThemeJson,
  type ThemeValidationResult,
  validateCustomThemeJson,
  parseCustomThemeFile,
  exportCustomThemeJson,
} from "@/lib/themes";
