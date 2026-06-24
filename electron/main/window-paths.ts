import path from "node:path";

function resolveMainOutputDirectory(runtimeDirectory: string) {
  const normalizedRuntimeDirectory = path.normalize(runtimeDirectory);
  if (path.basename(normalizedRuntimeDirectory) === "chunks") {
    return path.dirname(normalizedRuntimeDirectory);
  }
  return normalizedRuntimeDirectory;
}

export function resolvePreloadScriptPath(runtimeDirectory: string) {
  return path.join(
    resolveMainOutputDirectory(runtimeDirectory),
    "../preload/index.js",
  );
}

export function resolveRendererEntryPath(runtimeDirectory: string) {
  return path.join(
    resolveMainOutputDirectory(runtimeDirectory),
    "../renderer/index.html",
  );
}
