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
import { FileIcon, type FileIconProps } from "react-file-icon";
import type { WorkspaceDirectoryEntry } from "@/lib/fs/fs.types";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { cx, sx, type StyleXValue } from "@/components/ads/utils/stylex";
import {
  explorerIconStyles,
  folderToneStyles,
  type FolderTone,
} from "./explorer-entry-icon.styles";

type FolderVisual = {
  icon: LucideIcon;
  openIcon?: LucideIcon;
  tone: FolderTone;
};

const folderVisualGroups: Array<{ names: string[]; visual: FolderVisual }> = [
  {
    names: ["src", "app", "pages", "routes", "components", "hooks", "lib", "utils"],
    visual: { icon: Braces, tone: "code" },
  },
  {
    names: ["electron", "server", "db", "database", "migrations"],
    visual: { icon: Database, tone: "data" },
  },
  {
    names: ["docs", "doc"],
    visual: { icon: BookOpenText, tone: "docs" },
  },
  {
    names: ["public", "assets", "images", "img", "media", "static"],
    visual: { icon: Image, tone: "media" },
  },
  {
    names: ["tests", "__tests__", "__mocks__", "fixtures"],
    visual: { icon: FlaskConical, tone: "tests" },
  },
  {
    names: ["scripts", "bin"],
    visual: { icon: TerminalSquare, tone: "scripts" },
  },
  {
    names: [".github", ".gitlab", "security"],
    visual: { icon: Shield, tone: "security" },
  },
  {
    names: [".vscode", ".idea", ".stave", "config", "configs"],
    visual: { icon: Settings2, tone: "config" },
  },
  {
    names: ["node_modules", "packages", "vendor"],
    visual: { icon: Package, tone: "packages" },
  },
  {
    names: ["styles", "style", "theme"],
    visual: { icon: Palette, tone: "styles" },
  },
  {
    names: [".git"],
    visual: { icon: FolderGit2, tone: "git" },
  },
];

const defaultFolderVisual: FolderVisual = {
  icon: Folder,
  openIcon: FolderOpen,
  tone: "folder",
};

/**
 * File colour is a family, not a brand. Files group by language family so the
 * tree reads at a glance, and every family is one theme token: the nominal
 * chart slots for the coloured families (the same set the folder badges draw
 * from) and the text inks for the neutral ones. Everything else on the icon —
 * fold, label, glyph — is that one token stepped, so a theme that moves the
 * token moves the whole icon with it.
 */
type FileFamily =
  | "typescript"
  | "javascript"
  | "styles"
  | "markup"
  | "data"
  | "language"
  | "media"
  | "shell"
  | "settings"
  | "plain";

type FileGlyph = NonNullable<FileIconProps["type"]>;

type FileVisual = {
  family: FileFamily;
  type: FileGlyph;
  /** Replaces the extension on the label, e.g. `pkg` for package.json. */
  label?: string;
};

const familyInk: Record<FileFamily, string> = {
  typescript: vars["--ads-chart-1"],
  javascript: vars["--ads-chart-5"],
  styles: vars["--ads-chart-4"],
  markup: vars["--ads-chart-2"],
  data: vars["--ads-chart-7"],
  language: vars["--ads-chart-3"],
  media: vars["--ads-chart-6"],
  shell: vars["--ads-color-text"],
  settings: vars["--ads-color-text-muted"],
  plain: vars["--ads-color-text-muted"],
};

const neutralFamilies = new Set<FileFamily>(["shell", "settings", "plain"]);

/**
 * `react-file-icon` derives its fold, label and glyph by darkening `color`
 * with a colour parser, which cannot read a `var()`. Every derived paint is
 * therefore handed over explicitly, mixed from the family token in CSS.
 */
function familyPaint(family: FileFamily): Pick<
  FileIconProps,
  "color" | "foldColor" | "labelColor" | "labelTextColor" | "glyphColor"
> {
  const ink = familyInk[family];
  if (neutralFamilies.has(family)) {
    // A neutral page is the text ink itself, which flips with the theme; its
    // label stays the ink and the label text inverts to the surface, so the
    // pair keeps its contrast in both modes.
    return {
      color: ink,
      foldColor: `color-mix(in oklch, ${ink} 80%, ${vars["--ads-color-surface"]})`,
      labelColor: ink,
      labelTextColor: vars["--ads-color-surface"],
      glyphColor: `color-mix(in oklch, ${ink} 55%, ${vars["--ads-color-surface"]})`,
    };
  }
  // Chart hues sit at mid lightness in both modes, so the darker steps keep
  // their white label text legible on light and dark grounds alike.
  return {
    color: ink,
    foldColor: `color-mix(in oklch, ${ink} 88%, black)`,
    labelColor: `color-mix(in oklch, ${ink} 70%, black)`,
    glyphColor: `color-mix(in oklch, ${ink} 80%, black)`,
  };
}

const fileNameVisuals: Record<string, FileVisual> = {
  "package.json": { family: "data", type: "settings", label: "pkg" },
  "bun.lock": { family: "settings", type: "settings", label: "bun" },
  "tsconfig.json": { family: "typescript", type: "settings", label: "tsc" },
  "vite.config.ts": { family: "typescript", type: "code", label: "vite" },
  "readme.md": { family: "markup", type: "document", label: "read" },
  dockerfile: { family: "shell", type: "code", label: "ctr" },
  makefile: { family: "shell", type: "code", label: "make" },
  ".env": { family: "settings", type: "settings", label: "env" },
  ".env.local": { family: "settings", type: "settings", label: "env" },
  ".gitignore": { family: "settings", type: "settings", label: "git" },
};

const imageExtensions = ["avif", "bmp", "gif", "heic", "ico", "jpeg", "jpg", "png", "tif", "tiff", "webp"];
const vectorExtensions = ["ai", "eps", "fig", "ps", "psd", "sketch", "svg"];
const audioExtensions = ["aac", "aiff", "flac", "m4a", "mp3", "ogg", "wav"];
const videoExtensions = ["avi", "mkv", "mov", "mp4", "mpeg", "mpg", "webm", "wmv"];
const archiveExtensions = ["7z", "7zip", "bz2", "gz", "rar", "tar", "tgz", "xz", "zip", "zipx"];

const extensionVisualGroups: Array<{ extensions: string[]; visual: FileVisual }> = [
  { extensions: ["ts", "tsx", "mts", "cts"], visual: { family: "typescript", type: "code" } },
  { extensions: ["js", "jsx", "mjs", "cjs", "vue", "svelte", "astro"], visual: { family: "javascript", type: "code" } },
  { extensions: ["css", "scss", "sass", "less", "styl"], visual: { family: "styles", type: "code" } },
  { extensions: ["html", "htm"], visual: { family: "markup", type: "code" } },
  { extensions: ["md", "mdx", "rst", "txt", "rtf", "adoc", "doc", "docx"], visual: { family: "markup", type: "document" } },
  {
    extensions: ["json", "jsonc", "json5", "yaml", "yml", "toml", "xml", "sql", "graphql", "gql", "prisma"],
    visual: { family: "data", type: "code" },
  },
  { extensions: ["csv", "tsv", "ods", "xls", "xlsx"], visual: { family: "data", type: "spreadsheet" } },
  {
    extensions: ["c", "cc", "cpp", "h", "hpp", "cs", "go", "rs", "java", "kt", "kts", "swift", "py", "rb", "php", "lua", "dart", "scala", "ex", "exs", "zig", "r", "pl"],
    visual: { family: "language", type: "code" },
  },
  { extensions: ["sh", "bash", "zsh", "fish", "ps1", "bat", "cmd"], visual: { family: "shell", type: "code" } },
  { extensions: ["env", "lock", "ini", "cfg", "conf", "plist", "properties", "editorconfig"], visual: { family: "settings", type: "settings" } },
  { extensions: imageExtensions, visual: { family: "media", type: "image" } },
  { extensions: vectorExtensions, visual: { family: "media", type: "vector" } },
  { extensions: ["pdf"], visual: { family: "media", type: "acrobat" } },
  { extensions: audioExtensions, visual: { family: "media", type: "audio" } },
  { extensions: videoExtensions, visual: { family: "media", type: "video" } },
  { extensions: archiveExtensions, visual: { family: "plain", type: "compressed" } },
  { extensions: ["ttf", "otf", "woff", "woff2", "eot"], visual: { family: "plain", type: "font" } },
];

const extensionVisuals = new Map<string, FileVisual>();
for (const group of extensionVisualGroups) {
  for (const extension of group.extensions) extensionVisuals.set(extension, group.visual);
}

const unknownFileVisual: FileVisual = { family: "plain", type: "document" };

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

function resolveFolderVisual(folderName: string) {
  const normalizedName = folderName.toLowerCase();
  return folderVisualGroups.find((group) => group.names.includes(normalizedName))?.visual ?? defaultFolderVisual;
}

function resolveFileIconProps(fileName: string): FileIconProps {
  const normalizedName = fileName.toLowerCase();
  const extension = getFileExtension(normalizedName);
  const visual = fileNameVisuals[normalizedName]
    ?? (extension ? extensionVisuals.get(extension) : undefined)
    ?? unknownFileVisual;
  const label = visual.label ?? getFileLabel(normalizedName, extension);

  return {
    radius: 4,
    fold: true,
    labelUppercase: label.length <= 4,
    type: visual.type,
    extension: label,
    ...familyPaint(visual.family),
  };
}

export function ExplorerEntryIcon(args: { entry: WorkspaceDirectoryEntry; isOpen?: boolean }) {
  if (args.entry.type === "folder") {
    const visual = resolveFolderVisual(args.entry.name);
    const Icon = args.isOpen ? (visual.openIcon ?? visual.icon) : visual.icon;

    return (
      <span
        className={sx(
          explorerIconStyles.folderBadge,
          folderToneStyles[visual.tone],
        )}
      >
        <Icon className={sx(explorerIconStyles.folderGlyph)} />
      </span>
    );
  }

  return <WorkspaceFileIcon fileName={args.entry.name} />;
}

export function WorkspaceFileIcon(args: {
  fileName: string;
  className?: string;
  xstyle?: StyleXValue;
}) {
  return (
    <span
      className={cx(
        sx(explorerIconStyles.fileIcon, args.xstyle),
        args.className,
      )}
    >
      <FileIcon {...resolveFileIconProps(args.fileName)} />
    </span>
  );
}
