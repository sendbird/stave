import {
  BookOpenText,
  Braces,
  Database,
  FlaskConical,
  Folder,
  FolderGit2,
  FolderOpen,
  Image,
  Package,
  Palette,
  Settings2,
  Shield,
  TerminalSquare,
  type LucideIcon,
} from "lucide-react";
import { FileIcon, defaultStyles, type FileIconProps } from "react-file-icon";
import type { WorkspaceDirectoryEntry } from "@/lib/fs/fs.types";
import { cn } from "@/lib/utils";

type FolderVisual = {
  icon: LucideIcon;
  openIcon?: LucideIcon;
  className: string;
};

const folderVisualGroups: Array<{ names: string[]; visual: FolderVisual }> = [
  {
    names: ["src", "app", "pages", "routes", "components", "hooks", "lib", "utils"],
    visual: { icon: Braces, className: "bg-sky-500/12 text-sky-600 dark:text-sky-300" },
  },
  {
    names: ["electron", "server", "db", "database", "migrations"],
    visual: { icon: Database, className: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-300" },
  },
  {
    names: ["docs", "doc"],
    visual: { icon: BookOpenText, className: "bg-amber-500/14 text-amber-700 dark:text-amber-300" },
  },
  {
    names: ["public", "assets", "images", "img", "media", "static"],
    visual: { icon: Image, className: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300" },
  },
  {
    names: ["tests", "__tests__", "__mocks__", "fixtures"],
    visual: { icon: FlaskConical, className: "bg-lime-500/14 text-lime-700 dark:text-lime-300" },
  },
  {
    names: ["scripts", "bin"],
    visual: { icon: TerminalSquare, className: "bg-orange-500/14 text-orange-700 dark:text-orange-300" },
  },
  {
    names: [".github", ".gitlab", "security"],
    visual: { icon: Shield, className: "bg-rose-500/12 text-rose-600 dark:text-rose-300" },
  },
  {
    names: [".vscode", ".idea", ".stave", "config", "configs"],
    visual: { icon: Settings2, className: "bg-slate-500/14 text-slate-700 dark:text-slate-300" },
  },
  {
    names: ["node_modules", "packages", "vendor"],
    visual: { icon: Package, className: "bg-fuchsia-500/12 text-fuchsia-600 dark:text-fuchsia-300" },
  },
  {
    names: ["styles", "style", "theme"],
    visual: { icon: Palette, className: "bg-pink-500/12 text-pink-600 dark:text-pink-300" },
  },
  {
    names: [".git"],
    visual: { icon: FolderGit2, className: "bg-orange-500/12 text-orange-600 dark:text-orange-300" },
  },
];

const defaultFolderVisual: FolderVisual = {
  icon: Folder,
  openIcon: FolderOpen,
  className: "bg-yellow-500/14 text-yellow-700 dark:text-yellow-300",
};

const fileIconStyles = defaultStyles as unknown as Record<string, Partial<FileIconProps>>;

const fileNameOverrides: Record<string, Partial<FileIconProps> & { extension: string }> = {
  "package.json": {
    extension: "pkg",
    color: "#f59e0b",
    labelColor: "#d97706",
    labelTextColor: "#111827",
    type: "settings",
  },
  "bun.lock": {
    extension: "bun",
    color: "#111827",
    labelColor: "#f59e0b",
    labelTextColor: "#f8fafc",
    type: "settings",
  },
  "tsconfig.json": {
    extension: "tsc",
    color: "#3178c6",
    labelColor: "#1d4ed8",
    labelTextColor: "#eff6ff",
    type: "settings",
  },
  "vite.config.ts": {
    extension: "vite",
    color: "#8b5cf6",
    labelColor: "#7c3aed",
    labelTextColor: "#f5f3ff",
    type: "code",
  },
  "readme.md": {
    extension: "read",
    color: "#2563eb",
    labelColor: "#1d4ed8",
    labelTextColor: "#eff6ff",
    type: "document",
  },
  "dockerfile": {
    extension: "ctr",
    color: "#0ea5e9",
    labelColor: "#0284c7",
    labelTextColor: "#ecfeff",
    type: "code",
  },
  ".env": {
    extension: "env",
    color: "#10b981",
    labelColor: "#059669",
    labelTextColor: "#ecfdf5",
    type: "settings",
  },
  ".env.local": {
    extension: "env",
    color: "#10b981",
    labelColor: "#059669",
    labelTextColor: "#ecfdf5",
    type: "settings",
  },
  ".gitignore": {
    extension: "git",
    color: "#f97316",
    labelColor: "#ea580c",
    labelTextColor: "#fff7ed",
    type: "settings",
  },
};

const fileExtensionOverrides: Record<string, Partial<FileIconProps> & { extension?: string }> = {
  tsx: {
    ...(fileIconStyles.ts ?? {}),
    extension: "tsx",
    color: "#0ea5e9",
    labelColor: "#0284c7",
    labelTextColor: "#ecfeff",
    type: "code",
  },
  jsx: {
    ...(fileIconStyles.jsx ?? fileIconStyles.js ?? {}),
    extension: "jsx",
    color: "#06b6d4",
    labelColor: "#0891b2",
    labelTextColor: "#ecfeff",
    type: "code",
  },
  yaml: {
    ...(fileIconStyles.yml ?? {}),
    extension: "yaml",
  },
  yml: {
    ...(fileIconStyles.yml ?? {}),
    extension: "yml",
  },
  env: {
    extension: "env",
    color: "#10b981",
    labelColor: "#059669",
    labelTextColor: "#ecfdf5",
    type: "settings",
  },
  lock: {
    extension: "lock",
    color: "#475569",
    labelColor: "#334155",
    labelTextColor: "#f8fafc",
    type: "settings",
  },
  sql: {
    extension: "sql",
    color: "#6366f1",
    labelColor: "#4f46e5",
    labelTextColor: "#eef2ff",
    type: "code",
  },
  sh: {
    extension: "sh",
    color: "#0f172a",
    labelColor: "#1e293b",
    labelTextColor: "#e2e8f0",
    type: "code",
  },
  toml: {
    extension: "toml",
    color: "#9a3412",
    labelColor: "#c2410c",
    labelTextColor: "#fff7ed",
    type: "settings",
  },
};

const imageExtensions = new Set(["avif", "bmp", "gif", "heic", "ico", "jpeg", "jpg", "png", "tif", "tiff", "webp"]);
const vectorExtensions = new Set(["ai", "eps", "fig", "pdf", "ps", "psd", "sketch", "svg"]);
const documentExtensions = new Set(["md", "mdx", "rst", "txt"]);
const codeExtensions = new Set([
  "c",
  "cc",
  "cpp",
  "cs",
  "go",
  "graphql",
  "html",
  "java",
  "js",
  "json",
  "kt",
  "lua",
  "php",
  "py",
  "rb",
  "rs",
  "scss",
  "swift",
  "ts",
  "tsx",
  "vue",
  "xml",
  "yaml",
  "yml",
]);
const archiveExtensions = new Set(["7z", "7zip", "bz2", "gz", "rar", "tar", "tgz", "xz", "zip", "zipx"]);
const spreadsheetExtensions = new Set(["csv", "ods", "tsv", "xls", "xlsx"]);
const audioExtensions = new Set(["aac", "aiff", "flac", "m4a", "mp3", "ogg", "wav"]);
const videoExtensions = new Set(["avi", "mkv", "mov", "mp4", "mpeg", "mpg", "webm", "wmv"]);

function getFileExtension(fileName: string) {
  const extensionIndex = fileName.lastIndexOf(".");
  return extensionIndex > 0 ? fileName.slice(extensionIndex + 1) : "";
}

function getFileLabel(fileName: string, extension: string) {
  if (!extension) {
    return fileName.startsWith(".") ? fileName.slice(1, 5) || "file" : fileName.slice(0, 4) || "file";
  }
  return extension.length > 5 ? extension.slice(0, 4) : extension;
}

function getFallbackFileIconProps(fileName: string, extension: string): Partial<FileIconProps> & { extension: string } {
  const label = getFileLabel(fileName, extension);

  if (imageExtensions.has(extension)) {
    return {
      extension: label,
      color: "#10b981",
      labelColor: "#059669",
      labelTextColor: "#ecfdf5",
      type: "image",
    };
  }

  if (vectorExtensions.has(extension)) {
    return {
      extension: label,
      color: "#14b8a6",
      labelColor: "#0f766e",
      labelTextColor: "#f0fdfa",
      type: "vector",
    };
  }

  if (documentExtensions.has(extension)) {
    return {
      extension: label,
      color: "#3b82f6",
      labelColor: "#2563eb",
      labelTextColor: "#eff6ff",
      type: "document",
    };
  }

  if (spreadsheetExtensions.has(extension)) {
    return {
      extension: label,
      color: "#22c55e",
      labelColor: "#16a34a",
      labelTextColor: "#f0fdf4",
      type: "spreadsheet",
    };
  }

  if (archiveExtensions.has(extension)) {
    return {
      extension: label,
      color: "#f97316",
      labelColor: "#ea580c",
      labelTextColor: "#fff7ed",
      type: "compressed",
    };
  }

  if (audioExtensions.has(extension)) {
    return {
      extension: label,
      color: "#ec4899",
      labelColor: "#db2777",
      labelTextColor: "#fdf2f8",
      type: "audio",
    };
  }

  if (videoExtensions.has(extension)) {
    return {
      extension: label,
      color: "#8b5cf6",
      labelColor: "#7c3aed",
      labelTextColor: "#f5f3ff",
      type: "video",
    };
  }

  if (codeExtensions.has(extension)) {
    return {
      extension: label,
      color: "#6366f1",
      labelColor: "#4f46e5",
      labelTextColor: "#eef2ff",
      type: "code",
    };
  }

  return {
    extension: label,
    color: "#94a3b8",
    labelColor: "#64748b",
    labelTextColor: "#f8fafc",
    type: "document",
  };
}

function resolveFolderVisual(folderName: string) {
  const normalizedName = folderName.toLowerCase();
  return folderVisualGroups.find((group) => group.names.includes(normalizedName))?.visual ?? defaultFolderVisual;
}

function resolveFileIconProps(fileName: string): FileIconProps {
  const normalizedName = fileName.toLowerCase();
  const extension = getFileExtension(normalizedName);

  const resolved = fileNameOverrides[normalizedName]
    ?? (extension ? fileExtensionOverrides[extension] : undefined)
    ?? (extension ? fileIconStyles[extension] : undefined)
    ?? getFallbackFileIconProps(normalizedName, extension);

  const label = resolved.extension ?? getFileLabel(normalizedName, extension);

  return {
    radius: 4,
    fold: true,
    labelUppercase: label.length <= 4,
    ...resolved,
    extension: label,
  };
}

export function ExplorerEntryIcon(args: { entry: WorkspaceDirectoryEntry; isOpen?: boolean }) {
  if (args.entry.type === "folder") {
    const visual = resolveFolderVisual(args.entry.name);
    const Icon = args.isOpen ? (visual.openIcon ?? visual.icon) : visual.icon;

    return (
      <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-[5px]", visual.className)}>
        <Icon className="size-[13px]" />
      </span>
    );
  }

  return <WorkspaceFileIcon fileName={args.entry.name} />;
}

export function WorkspaceFileIcon(args: { fileName: string; className?: string }) {
  return (
    <span className={cn("flex h-4 w-[14px] shrink-0 items-center justify-center [&_svg]:block [&_svg]:h-full [&_svg]:w-full", args.className)}>
      <FileIcon {...resolveFileIconProps(args.fileName)} />
    </span>
  );
}
