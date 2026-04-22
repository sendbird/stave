interface RawTypeScriptCompilerOptions {
  baseUrl?: string;
  paths?: Record<string, string[]>;
  jsx?: string;
  module?: string;
  moduleResolution?: string;
  target?: string;
  allowJs?: boolean;
  allowSyntheticDefaultImports?: boolean;
  esModuleInterop?: boolean;
  resolveJsonModule?: boolean;
  strict?: boolean;
  skipLibCheck?: boolean;
  types?: string[];
  lib?: string[];
  noEmit?: boolean;
}

export interface WorkspaceTypeScriptCompilerOptions {
  baseUrl?: string;
  paths?: Record<string, string[]>;
  jsx?: string;
  module?: string;
  moduleResolution?: string;
  target?: string;
  allowJs?: boolean;
  allowSyntheticDefaultImports?: boolean;
  esModuleInterop?: boolean;
  resolveJsonModule?: boolean;
  strict?: boolean;
  skipLibCheck?: boolean;
  types?: string[];
  lib?: string[];
  noEmit?: boolean;
}

function stripJsonComments(value: string) {
  let result = "";
  let inString = false;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < value.length; index += 1) {
    const current = value[index];
    const next = value[index + 1];
    if (!current) {
      continue;
    }

    if (inLineComment) {
      if (current === "\n") {
        inLineComment = false;
        result += current;
      }
      continue;
    }

    if (inBlockComment) {
      if (current === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (inString) {
      result += current;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (current === "\\") {
        escaped = true;
        continue;
      }
      if (current === "\"") {
        inString = false;
      }
      continue;
    }

    if (current === "/" && next === "/") {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (current === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }

    if (current === "\"") {
      inString = true;
    }

    result += current;
  }

  return result;
}

function stripTrailingCommas(value: string) {
  let result = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const current = value[index];
    if (!current) {
      continue;
    }

    if (inString) {
      result += current;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (current === "\\") {
        escaped = true;
        continue;
      }
      if (current === "\"") {
        inString = false;
      }
      continue;
    }

    if (current === "\"") {
      inString = true;
      result += current;
      continue;
    }

    if (current === ",") {
      let lookahead = index + 1;
      while (lookahead < value.length && /\s/.test(value[lookahead] ?? "")) {
        lookahead += 1;
      }
      const nextNonWhitespace = value[lookahead];
      if (nextNonWhitespace === "}" || nextNonWhitespace === "]") {
        continue;
      }
    }

    result += current;
  }

  return result;
}

function normalizeWorkspaceRelativePath(value: string) {
  const normalized = value.replaceAll("\\", "/");
  const segments = normalized.split("/");
  const output: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === ".") {
      continue;
    }
    if (segment === "..") {
      output.pop();
      continue;
    }
    output.push(segment);
  }

  return output.join("/");
}

function normalizePathTarget(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("file:///")) {
    return trimmed;
  }
  const normalized = trimmed.replaceAll("\\", "/").replace(/\/+/g, "/");
  return normalized.replace(/^\.\/+/, "");
}

export function parseWorkspaceTypeScriptCompilerOptions(value: string): WorkspaceTypeScriptCompilerOptions | null {
  try {
    const parsed = JSON.parse(stripTrailingCommas(stripJsonComments(value))) as {
      compilerOptions?: RawTypeScriptCompilerOptions;
    };
    const compilerOptions = parsed.compilerOptions;
    if (!compilerOptions) {
      return null;
    }
    return {
      ...compilerOptions,
      baseUrl: compilerOptions.baseUrl ? normalizeWorkspaceRelativePath(compilerOptions.baseUrl) : undefined,
      paths: compilerOptions.paths
        ? Object.fromEntries(
          Object.entries(compilerOptions.paths).map(([key, targets]) => [
            key,
            targets.map((target) => normalizePathTarget(target)).filter(Boolean),
          ]),
        )
        : undefined,
    };
  } catch {
    return null;
  }
}

export async function loadWorkspaceTypeScriptCompilerOptions(rootPath: string) {
  const readFile = window.api?.fs?.readFile;
  if (!readFile) {
    return null;
  }
  const result = await readFile({ rootPath, filePath: "tsconfig.json" });
  if (!result.ok) {
    return null;
  }
  return parseWorkspaceTypeScriptCompilerOptions(result.content);
}
