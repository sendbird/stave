// ---------------------------------------------------------------------------
// Custom theme JSON validation
// ---------------------------------------------------------------------------

import { z } from "zod";
import type { CustomThemeDefinition } from "./types";
import { BUILTIN_CUSTOM_THEMES } from "./builtin-themes";

/** Maximum number of user-installed themes. */
export const MAX_USER_THEMES = 50;

/** Maximum JSON file size in bytes (256 KB). */
export const MAX_THEME_FILE_SIZE = 256 * 1024;

const CSS_VALUE_PATTERN = /^[^{};<>]+$/;

/**
 * Zod schema for the JSON file a user drops / pastes to install a theme.
 *
 * Intentionally lenient on `tokens` values -- any CSS value string is fine.
 * The strict part is the structure: id, name, baseMode are mandatory.
 */
export const CustomThemeJsonSchema = z.object({
  id: z
    .string()
    .min(1, "id is required")
    .max(64, "id must be at most 64 characters")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "id must be lowercase alphanumeric with dashes (e.g. 'my-cool-theme')",
    ),
  name: z
    .string()
    .min(1, "name is required")
    .max(100, "name must be at most 100 characters"),
  description: z
    .string()
    .max(500, "description must be at most 500 characters")
    .default(""),
  baseMode: z.enum(["light", "dark"]),
  version: z.string().max(20).optional(),
  author: z.string().max(100).optional(),
  tokens: z.record(
    z
      .string()
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "token name must be lowercase alphanumeric with dashes",
      ),
    z
      .string()
      .min(1)
      .max(200)
      .refine((v) => CSS_VALUE_PATTERN.test(v), "token value contains invalid CSS characters"),
  ),
});

export type CustomThemeJson = z.infer<typeof CustomThemeJsonSchema>;

export interface ThemeValidationResult {
  ok: boolean;
  theme?: CustomThemeDefinition;
  errors?: string[];
}

/**
 * Validate raw JSON (parsed `unknown`) against the custom theme schema.
 *
 * Returns either a validated `CustomThemeDefinition` or a list of
 * human-readable error messages.
 */
export function validateCustomThemeJson(args: {
  data: unknown;
  existingIds?: string[];
}): ThemeValidationResult {
  const parsed = CustomThemeJsonSchema.safeParse(args.data);

  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    });
    return { ok: false, errors };
  }

  const data = parsed.data;
  const errors: string[] = [];

  // Prevent ID collisions with built-in themes.
  const builtinIds = new Set(BUILTIN_CUSTOM_THEMES.map((t) => t.id));
  if (builtinIds.has(data.id)) {
    errors.push(
      `id "${data.id}" conflicts with a built-in theme. Choose a different id.`,
    );
  }

  // Prevent ID collisions with already-installed user themes.
  if (args.existingIds?.includes(data.id)) {
    errors.push(
      `id "${data.id}" is already installed. Remove it first or use a different id.`,
    );
  }

  // Require at least one token.
  if (Object.keys(data.tokens).length === 0) {
    errors.push("tokens must contain at least one colour definition.");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, theme: data as CustomThemeDefinition };
}

/**
 * Parse raw text (from a file or paste) into a validated custom theme.
 */
export function parseCustomThemeFile(args: {
  text: string;
  existingIds?: string[];
}): ThemeValidationResult {
  let data: unknown;
  try {
    data = JSON.parse(args.text);
  } catch {
    return { ok: false, errors: ["Invalid JSON. Could not parse the file."] };
  }

  return validateCustomThemeJson({ data, existingIds: args.existingIds });
}

/**
 * Serialize a theme definition to pretty-printed JSON for export / sharing.
 */
export function exportCustomThemeJson(args: {
  theme: CustomThemeDefinition;
}): string {
  const { id, name, description, baseMode, version, author, tokens } =
    args.theme;
  const obj: Record<string, unknown> = {
    id,
    name,
    description,
    baseMode,
    ...(version ? { version } : {}),
    ...(author ? { author } : {}),
    tokens,
  };
  return JSON.stringify(obj, null, 2);
}
