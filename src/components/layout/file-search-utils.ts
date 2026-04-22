const FILE_SEARCH_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export interface RankedFileSearchResult {
  filePath: string;
  fileName: string;
  directoryPath: string;
  score: number;
}

export function splitFileSearchPath(args: { filePath: string }) {
  const normalizedPath = args.filePath.replace(/\\/g, "/");
  const lastSeparatorIndex = normalizedPath.lastIndexOf("/");

  if (lastSeparatorIndex < 0) {
    return {
      fileName: normalizedPath,
      directoryPath: "",
    };
  }

  return {
    fileName: normalizedPath.slice(lastSeparatorIndex + 1),
    directoryPath: normalizedPath.slice(0, lastSeparatorIndex),
  };
}

function getSubsequenceScore(args: { text: string; query: string }) {
  if (!args.query) {
    return null;
  }

  const boundaryCharacters = "/._- ";
  let score = 0;
  let fromIndex = 0;
  let previousIndex = -1;

  for (const character of args.query) {
    const matchIndex = args.text.indexOf(character, fromIndex);
    if (matchIndex < 0) {
      return null;
    }

    const isContiguous = previousIndex >= 0 && matchIndex === previousIndex + 1;
    score += isContiguous ? 18 : 8;

    if (matchIndex === 0 || boundaryCharacters.includes(args.text[matchIndex - 1] ?? "")) {
      score += 10;
    }

    previousIndex = matchIndex;
    fromIndex = matchIndex + 1;
  }

  score -= Math.max(0, args.text.length - args.query.length);
  return score;
}

export function getFileSearchScore(args: { filePath: string; query: string }) {
  const normalizedQuery = args.query.trim().toLowerCase();
  if (!normalizedQuery) {
    return 0;
  }

  const normalizedPath = args.filePath.toLowerCase();
  const { fileName } = splitFileSearchPath({ filePath: normalizedPath });
  const extensionIndex = fileName.lastIndexOf(".");
  const fileStem = extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
  const compactQuery = normalizedQuery.replace(/\s+/g, "");
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  let score = 0;

  if (fileStem === normalizedQuery) {
    score += 900;
  } else if (fileStem.startsWith(normalizedQuery)) {
    score += 520;
  }

  if (fileName === normalizedQuery) {
    score += 700;
  } else if (normalizedPath === normalizedQuery) {
    score += 640;
  }

  if (fileName.startsWith(normalizedQuery)) {
    score += 460;
  } else if (normalizedPath.startsWith(normalizedQuery)) {
    score += 320;
  }

  const wholeNameIndex = fileName.indexOf(normalizedQuery);
  const wholePathIndex = normalizedPath.indexOf(normalizedQuery);
  if (wholeNameIndex >= 0) {
    score += 320 - Math.min(wholeNameIndex, 40) * 4;
  } else if (wholePathIndex >= 0) {
    score += 220 - Math.min(wholePathIndex, 80) * 2;
  }

  let hasDirectTokenMatch = true;
  for (const token of tokens) {
    const tokenNameIndex = fileName.indexOf(token);
    const tokenPathIndex = normalizedPath.indexOf(token);

    if (tokenNameIndex < 0 && tokenPathIndex < 0) {
      hasDirectTokenMatch = false;
      break;
    }

    if (tokenNameIndex >= 0) {
      score += 160 - Math.min(tokenNameIndex, 36) * 3;
    } else {
      score += 90 - Math.min(tokenPathIndex, 60);
    }
  }

  const nameSubsequenceScore = getSubsequenceScore({
    text: fileName,
    query: compactQuery,
  });
  const pathSubsequenceScore = getSubsequenceScore({
    text: normalizedPath,
    query: compactQuery,
  });

  if (!hasDirectTokenMatch && nameSubsequenceScore === null && pathSubsequenceScore === null) {
    return null;
  }

  score += Math.max(nameSubsequenceScore ?? 0, (pathSubsequenceScore ?? 0) - 14);
  score -= Math.max(0, normalizedPath.length - compactQuery.length);

  return score;
}

export function rankFileSearchResults(args: { files: string[]; query: string; limit?: number }) {
  const normalizedQuery = args.query.trim().toLowerCase();
  const results: RankedFileSearchResult[] = [];

  for (const filePath of args.files) {
    const score = getFileSearchScore({ filePath, query: normalizedQuery });
    if (score === null) {
      continue;
    }

    const { fileName, directoryPath } = splitFileSearchPath({ filePath });
    results.push({
      filePath,
      fileName,
      directoryPath,
      score,
    });
  }

  results.sort((left, right) => {
    if (normalizedQuery) {
      const scoreDelta = right.score - left.score;
      if (scoreDelta !== 0) {
        return scoreDelta;
      }
    }

    const fileNameCompare = FILE_SEARCH_COLLATOR.compare(left.fileName, right.fileName);
    if (fileNameCompare !== 0) {
      return fileNameCompare;
    }

    return FILE_SEARCH_COLLATOR.compare(left.filePath, right.filePath);
  });

  return args.limit ? results.slice(0, args.limit) : results;
}
