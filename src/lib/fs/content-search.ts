export interface FilesystemSearchScope {
  workspaceId: string;
  surface: "explorer";
}

export interface FilesystemSearchRequest extends FilesystemSearchScope {
  rootPath: string;
  query: string;
}

export interface FilesystemSearchFileResult {
  file: string;
  matches: Array<{ line: number; text: string }>;
}

export type FilesystemSearchResponse =
  | { ok: true; results: FilesystemSearchFileResult[]; limitHit: boolean }
  | { ok: false; stderr: string }
  | { ok: false; cancelled: true };

export function normalizeFilesystemSearchQuery(rawQuery: string) {
  const normalizedLineEndings = rawQuery.replace(/\r\n?/g, "\n");
  if (normalizedLineEndings.includes("\n")) {
    return normalizedLineEndings.replace(/^\n+|\n+$/g, "");
  }
  return normalizedLineEndings.trim();
}
