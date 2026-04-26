export interface FilesystemSearchMatch {
  line: number;
  text: string;
}

export interface FilesystemSearchFileResult {
  file: string;
  matches: FilesystemSearchMatch[];
}

interface RipgrepJsonMatchEvent {
  type: "match";
  data?: {
    line_number?: number;
    lines?: { text?: string };
    path?: { text?: string };
  };
}

interface RipgrepJsonNonMatchEvent {
  type: string;
}

type RipgrepJsonEvent = RipgrepJsonMatchEvent | RipgrepJsonNonMatchEvent;

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
  let event: RipgrepJsonEvent;

  try {
    event = JSON.parse(rawLine) as RipgrepJsonEvent;
  } catch {
    return null;
  }

  if (event.type !== "match") {
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
