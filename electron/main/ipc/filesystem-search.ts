import { z } from "zod";

export interface FilesystemSearchMatch {
  line: number;
  text: string;
}

export interface FilesystemSearchFileResult {
  file: string;
  matches: FilesystemSearchMatch[];
}

const RipgrepJsonMatchSchema = z.object({
  type: z.literal("match"),
  data: z.object({ line_number: z.number().int().positive(), lines: z.object({ text: z.string() }), path: z.object({ text: z.string() }) }),
});

export function normalizeFilesystemSearchQuery(rawQuery: string) {
  const normalizedLineEndings = rawQuery.replace(/\r\n?/g, "\n");
  if (normalizedLineEndings.includes("\n")) {
    return normalizedLineEndings.replace(/^\n+|\n+$/g, "");
  }
  return normalizedLineEndings.trim();
}

export function buildFilesystemSearchRgArgs(query: string) {
  const args = [
    "--json",
    "--line-number",
    "--no-heading",
    "--fixed-strings",
    "--color=never",
  ];

  if (query.includes("\n")) {
    args.push("--multiline");
  }

  args.push("--", query, ".");
  return args;
}

export function parseFilesystemSearchMatchLine(
  rawLine: string,
): { file: string; match: FilesystemSearchMatch } | null {
  let event: z.infer<typeof RipgrepJsonMatchSchema>;

  try {
    const parsed = RipgrepJsonMatchSchema.safeParse(JSON.parse(rawLine));
    if (!parsed.success) return null;
    event = parsed.data;
  } catch {
    return null;
  }

  const filePath = event.data?.path?.text?.replace(/^\.[\\/]/, "");
  const lineNumber = event.data?.line_number;
  const matchText = event.data?.lines?.text
    ?.replace(/\r\n?/g, "\n")
    .replace(/\n$/, "");

  if (!filePath || !lineNumber || matchText == null) {
    return null;
  }

  return {
    file: filePath,
    match: {
      line: lineNumber,
      text: matchText,
    },
  };
}
