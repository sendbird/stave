import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveRootFilePath } from "../utils/filesystem";
import { collectFocusedWorkspaceInspectContext } from "./filesystem-code-inspect";

export interface MonacoVirtualFile {
  content: string;
  filePath: string;
}

interface PackageJsonLike {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const DEFAULT_MAX_PACKAGE_COUNT = 200;
const DEFAULT_MAX_FILE_COUNT = 1200;
const DEFAULT_MAX_DIRECTORY_DEPTH = 6;
const TYPE_DECLARATION_FILE_PATTERN = /\.d\.(ts|mts|cts)$/;
const PRIORITY_ROOT_PACKAGES = ["typescript", "react", "react-dom", "vite"] as const;
const VERSIONED_TYPES_DIRECTORY_PATTERN = /^ts\d+(?:\.\d+)?$/;

function toPosixPath(value: string) {
  return value.split(path.sep).join("/");
}

function toVirtualNodeModulesPath(args: { packageName: string; relativeFilePath: string }) {
  const normalizedRelativePath = toPosixPath(args.relativeFilePath).replace(/^\.?\//, "");
  return `file:///node_modules/${args.packageName}/${normalizedRelativePath}`;
}

function toPackageDirectory(rootPath: string, packageName: string) {
  return path.join(rootPath, "node_modules", ...packageName.split("/"));
}

function toDefinitelyTypedPackageName(packageName: string) {
  if (!packageName || packageName.startsWith("@types/")) {
    return null;
  }
  if (!packageName.startsWith("@")) {
    return `@types/${packageName}`;
  }
  const [, scope, name] = packageName.match(/^@([^/]+)\/(.+)$/) ?? [];
  if (!scope || !name) {
    return null;
  }
  return `@types/${scope}__${name}`;
}

function collectRootDependencyNames(pkg: PackageJsonLike | null) {
  return Array.from(new Set([
    ...Object.keys(pkg?.dependencies ?? {}),
    ...Object.keys(pkg?.devDependencies ?? {}),
  ]));
}

function collectPriorityRootDependencyNames(pkg: PackageJsonLike | null) {
  const dependencyNames = collectRootDependencyNames(pkg);
  const dependencySet = new Set(dependencyNames);
  const priority = dependencyNames.filter((packageName) => packageName.startsWith("@types/"));

  for (const packageName of PRIORITY_ROOT_PACKAGES) {
    if (dependencySet.has(packageName)) {
      priority.push(packageName);
    }
    const definitelyTypedPackageName = toDefinitelyTypedPackageName(packageName);
    if (definitelyTypedPackageName && dependencySet.has(definitelyTypedPackageName)) {
      priority.push(definitelyTypedPackageName);
    }
  }

  return Array.from(new Set(priority));
}

function collectNestedDependencyNames(pkg: PackageJsonLike | null) {
  return Array.from(new Set([
    ...Object.keys(pkg?.dependencies ?? {}),
    ...Object.keys(pkg?.peerDependencies ?? {}),
  ]));
}

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function readWorkspaceTypeDefinitionFiles(args: {
  rootPath?: string | null;
  entryFilePath?: string | null;
  maxPackageCount?: number;
  maxFileCount?: number;
  maxDirectoryDepth?: number;
}) {
  const rootPath = resolveRootFilePath({ rootPath: args.rootPath, filePath: "." });
  if (!rootPath) {
    throw new Error("Workspace root path is required.");
  }
  const libs: MonacoVirtualFile[] = [];
  const maxPackageCount = args.maxPackageCount ?? DEFAULT_MAX_PACKAGE_COUNT;
  const maxFileCount = args.maxFileCount ?? DEFAULT_MAX_FILE_COUNT;
  const maxDirectoryDepth = args.maxDirectoryDepth ?? DEFAULT_MAX_DIRECTORY_DEPTH;
  const queuedPackages = new Set<string>();
  const visitedPackages = new Set<string>();
  const seenVirtualPaths = new Set<string>();
  const queue: string[] = [];

  async function addVirtualFile(absolutePath: string, virtualPath: string) {
    if (libs.length >= maxFileCount || seenVirtualPaths.has(virtualPath)) {
      return;
    }
    try {
      const content = await fs.readFile(absolutePath, "utf8");
      libs.push({ content, filePath: virtualPath });
      seenVirtualPaths.add(virtualPath);
    } catch {
      // Skip unreadable files.
    }
  }

  function enqueuePackage(packageName: string | null) {
    if (!packageName || queuedPackages.has(packageName) || visitedPackages.has(packageName)) {
      return;
    }
    if (visitedPackages.size + queue.length >= maxPackageCount) {
      return;
    }
    queuedPackages.add(packageName);
    queue.push(packageName);
  }

  async function collectPackageFiles(packageName: string) {
    const packageDir = toPackageDirectory(rootPath, packageName);
    if (!await pathExists(packageDir)) {
      return null;
    }

    const packageJsonPath = path.join(packageDir, "package.json");
    const packageJson = await readJsonFile<PackageJsonLike>(packageJsonPath);
    if (packageJson) {
      await addVirtualFile(
        packageJsonPath,
        toVirtualNodeModulesPath({ packageName, relativeFilePath: "package.json" }),
      );
    }

    async function walk(currentDir: string, depth: number): Promise<void> {
      if (depth > maxDirectoryDepth || libs.length >= maxFileCount) {
        return;
      }
      let entries;
      try {
        entries = await fs.readdir(currentDir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (libs.length >= maxFileCount) {
          break;
        }
        const absolutePath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || VERSIONED_TYPES_DIRECTORY_PATTERN.test(entry.name)) {
            continue;
          }
          await walk(absolutePath, depth + 1);
          continue;
        }
        if (!entry.isFile() || !TYPE_DECLARATION_FILE_PATTERN.test(entry.name)) {
          continue;
        }
        const relativePath = path.relative(packageDir, absolutePath);
        await addVirtualFile(
          absolutePath,
          toVirtualNodeModulesPath({ packageName, relativeFilePath: relativePath }),
        );
      }
    }

    await walk(packageDir, 0);
    return packageJson;
  }

  const rootPackageJson = await readJsonFile<PackageJsonLike>(path.join(rootPath, "package.json"));
  const focusedContext = args.entryFilePath
    ? await collectFocusedWorkspaceInspectContext({
      rootPath,
      entryFilePath: args.entryFilePath,
      maxSourceFileCount: 240,
      maxPackageCount,
    })
    : null;

  enqueuePackage("@types/node");
  for (const packageName of focusedContext?.packageNames ?? []) {
    enqueuePackage(packageName);
    enqueuePackage(toDefinitelyTypedPackageName(packageName));
  }
  for (const dependencyName of collectPriorityRootDependencyNames(rootPackageJson)) {
    enqueuePackage(dependencyName);
    enqueuePackage(toDefinitelyTypedPackageName(dependencyName));
  }
  for (const dependencyName of collectRootDependencyNames(rootPackageJson)) {
    enqueuePackage(dependencyName);
    enqueuePackage(toDefinitelyTypedPackageName(dependencyName));
  }

  while (queue.length > 0 && libs.length < maxFileCount && visitedPackages.size < maxPackageCount) {
    const packageName = queue.shift();
    if (!packageName) {
      continue;
    }
    queuedPackages.delete(packageName);
    if (visitedPackages.has(packageName)) {
      continue;
    }
    visitedPackages.add(packageName);
    const packageJson = await collectPackageFiles(packageName);
    for (const dependencyName of collectNestedDependencyNames(packageJson)) {
      enqueuePackage(dependencyName);
      enqueuePackage(toDefinitelyTypedPackageName(dependencyName));
    }
  }

  return libs;
}
