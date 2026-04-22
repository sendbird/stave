import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function normalizeWorkspaceFilePath(filePath: string) {
  return filePath.replaceAll("\\", "/").replace(/^\/+/, "");
}

export function toLspWorkspaceRootUri(rootPath: string) {
  return pathToFileURL(path.resolve(rootPath)).toString();
}

export function toLspDocumentUri(args: { rootPath: string; filePath: string }) {
  return pathToFileURL(path.resolve(args.rootPath, normalizeWorkspaceFilePath(args.filePath))).toString();
}

export function toWorkspaceFilePathFromUri(args: { rootPath: string; uri: string }) {
  try {
    const absolutePath = fileURLToPath(args.uri);
    const relativePath = path.relative(path.resolve(args.rootPath), absolutePath);
    if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      return null;
    }
    return relativePath.replaceAll("\\", "/");
  } catch {
    return null;
  }
}
