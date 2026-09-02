import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { ProviderId } from "../../providers/types";
import type {
  SkillCatalogEntry,
  SkillCatalogProvider,
  SkillCatalogResponse,
  SkillCatalogRoot,
  SkillCatalogRootSource,
  SkillCatalogScope,
} from "../../../src/lib/skills/types";

interface ProviderHomeResolution {
  providerId: ProviderId;
  configuredPath: string;
  resolvedHomePath: string | null;
  sourceDetail: string;
}

interface CandidateRootSpec {
  scope: SkillCatalogScope;
  provider: SkillCatalogProvider;
  source: SkillCatalogRootSource;
  path: string;
  detail?: string;
}

const SKILL_SCOPE_PRIORITY = {
  local: 3,
  user: 2,
  global: 1,
} as const;

const SKILL_PROVIDER_PRIORITY = {
  "claude-code": 2,
  codex: 2,
  cursor: 2,
  kiro: 2,
  shared: 1,
} as const;

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const SKILL_FILE_NAME = "SKILL.md";
const SKILL_ROOT_IGNORES = new Set([".git", "node_modules", "dist", "out"]);

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveRealPathIfExists(targetPath: string) {
  if (!(await pathExists(targetPath))) {
    return null;
  }
  try {
    return await fs.realpath(targetPath);
  } catch {
    return path.resolve(targetPath);
  }
}

function normalizeOptionalPath(value: string | undefined | null) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed === "~") {
    return homedir();
  }
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return path.resolve(homedir(), trimmed.slice(2));
  }
  return path.resolve(trimmed);
}

function getProviderHomeSpec(providerId: ProviderId) {
  switch (providerId) {
    case "codex":
      return {
        envName: "CODEX_HOME",
        envPath: process.env.CODEX_HOME,
        defaultDir: ".codex",
        label: "Codex",
      };
    case "cursor":
      return {
        envName: null,
        envPath: undefined,
        defaultDir: ".cursor",
        label: "Cursor",
      };
    case "kiro":
      return {
        envName: null,
        envPath: undefined,
        defaultDir: ".kiro",
        label: "Kiro",
      };
    default:
      return {
        envName: "CLAUDE_HOME",
        envPath: process.env.CLAUDE_HOME,
        defaultDir: ".claude",
        label: "Claude",
      };
  }
}

async function resolveProviderHome(
  providerId: ProviderId,
): Promise<ProviderHomeResolution> {
  const spec = getProviderHomeSpec(providerId);
  const envPath = spec.envName ? normalizeOptionalPath(spec.envPath) : null;
  if (envPath) {
    return {
      providerId,
      configuredPath: envPath,
      resolvedHomePath: await resolveRealPathIfExists(envPath),
      sourceDetail: `Resolved from ${spec.envName}.`,
    };
  }

  const defaultHome = path.join(homedir(), spec.defaultDir);
  return {
    providerId,
    configuredPath: defaultHome,
    resolvedHomePath: await resolveRealPathIfExists(defaultHome),
    sourceDetail: `Resolved from the default ${spec.label} home.`,
  };
}

async function toCatalogRoot(
  spec: CandidateRootSpec,
): Promise<SkillCatalogRoot | null> {
  const resolvedPath = path.resolve(spec.path);
  const exists = await pathExists(resolvedPath);
  if (!exists) {
    return null;
  }
  const realPath = await resolveRealPathIfExists(resolvedPath);
  return {
    id: `${spec.scope}:${spec.provider}:${realPath ?? resolvedPath}`,
    scope: spec.scope,
    provider: spec.provider,
    source: spec.source,
    path: resolvedPath,
    realPath,
    exists: true,
    detail: spec.detail,
  };
}

function dedupeCatalogRoots(roots: SkillCatalogRoot[]) {
  const seen = new Set<string>();
  const deduped: SkillCatalogRoot[] = [];

  for (const root of roots) {
    const key = root.realPath ?? root.path;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(root);
  }

  return deduped;
}

async function resolveCatalogRoots(args: {
  workspacePath?: string | null;
  sharedSkillsHome?: string | null;
}) {
  const [claudeHome, codexHome, cursorHome, kiroHome] = await Promise.all([
    resolveProviderHome("claude-code"),
    resolveProviderHome("codex"),
    resolveProviderHome("cursor"),
    resolveProviderHome("kiro"),
  ]);
  const specs: CandidateRootSpec[] = [];
  const settingsSharedSkillsHome = normalizeOptionalPath(args.sharedSkillsHome);
  const envSharedSkillsHome = normalizeOptionalPath(
    process.env.STAVE_SHARED_SKILLS_HOME,
  );
  const sharedSkillsHome = settingsSharedSkillsHome ?? envSharedSkillsHome;

  if (sharedSkillsHome) {
    // Scan the configured directory directly — the UI calls this
    // "Shared Skills Root" so the path itself is the skills directory.
    specs.push({
      scope: "global",
      provider: "shared",
      source: "shared_root",
      path: sharedSkillsHome,
      detail: settingsSharedSkillsHome
        ? "Shared skills root configured in Settings."
        : "Shared skills root resolved from STAVE_SHARED_SKILLS_HOME.",
    });
  }

  for (const home of [claudeHome, codexHome, cursorHome, kiroHome]) {
    const basePath = home.resolvedHomePath ?? home.configuredPath;
    specs.push({
      scope: "user",
      provider: home.providerId,
      source: "provider_home",
      path: path.join(basePath, "skills"),
      detail: home.sourceDetail,
    });
    specs.push({
      scope: "global",
      provider: home.providerId,
      source: "provider_system",
      path: path.join(basePath, "skills", ".system"),
      detail: `${home.sourceDetail} System skills root.`,
    });
  }

  const workspacePath = normalizeOptionalPath(args.workspacePath);
  if (workspacePath) {
    specs.push(
      {
        scope: "local",
        provider: "shared",
        source: "workspace",
        path: path.join(workspacePath, "skills"),
        detail: "Workspace shared skills.",
      },
      {
        scope: "local",
        provider: "shared",
        source: "workspace",
        path: path.join(workspacePath, ".agents", "skills"),
        detail: "Workspace .agents shared skills.",
      },
      {
        scope: "local",
        provider: "claude-code",
        source: "workspace",
        path: path.join(workspacePath, ".claude", "skills"),
        detail: "Workspace Claude skills.",
      },
      {
        scope: "local",
        provider: "codex",
        source: "workspace",
        path: path.join(workspacePath, ".codex", "skills"),
        detail: "Workspace Codex skills.",
      },
      {
        scope: "local",
        provider: "claude-code",
        source: "workspace",
        path: path.join(workspacePath, ".agents", "claude", "skills"),
        detail: "Workspace .agents Claude skills.",
      },
      {
        scope: "local",
        provider: "codex",
        source: "workspace",
        path: path.join(workspacePath, ".agents", "codex", "skills"),
        detail: "Workspace .agents Codex skills.",
      },
      {
        scope: "local",
        provider: "cursor",
        source: "workspace",
        path: path.join(workspacePath, ".cursor", "skills"),
        detail: "Workspace Cursor skills.",
      },
      {
        scope: "local",
        provider: "kiro",
        source: "workspace",
        path: path.join(workspacePath, ".kiro", "skills"),
        detail: "Workspace Kiro skills.",
      },
      {
        scope: "local",
        provider: "cursor",
        source: "workspace",
        path: path.join(workspacePath, ".agents", "cursor", "skills"),
        detail: "Workspace .agents Cursor skills.",
      },
      {
        scope: "local",
        provider: "kiro",
        source: "workspace",
        path: path.join(workspacePath, ".agents", "kiro", "skills"),
        detail: "Workspace .agents Kiro skills.",
      },
    );
  }

  const roots = dedupeCatalogRoots(
    (await Promise.all(specs.map((spec) => toCatalogRoot(spec)))).filter(
      (root): root is SkillCatalogRoot => root !== null,
    ),
  );
  return roots.sort((left, right) => {
    const scopeDelta =
      SKILL_SCOPE_PRIORITY[right.scope] - SKILL_SCOPE_PRIORITY[left.scope];
    if (scopeDelta !== 0) {
      return scopeDelta;
    }
    const providerDelta =
      SKILL_PROVIDER_PRIORITY[right.provider] -
      SKILL_PROVIDER_PRIORITY[left.provider];
    if (providerDelta !== 0) {
      return providerDelta;
    }
    return left.path.localeCompare(right.path);
  });
}

function parseFrontmatter(content: string) {
  const match = content.match(FRONTMATTER_PATTERN);
  if (!match) {
    return { attributes: {} as Record<string, string>, body: content.trim() };
  }

  const attributes: Record<string, string> = {};
  const rawFrontmatter = match[1] ?? "";
  for (const line of rawFrontmatter.split(/\r?\n/g)) {
    if (!line.includes(":")) {
      continue;
    }
    const separatorIndex = line.indexOf(":");
    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    if (!key || !rawValue) {
      continue;
    }
    const normalizedValue = rawValue.replace(/^['"]|['"]$/g, "").trim();
    if (normalizedValue) {
      attributes[key] = normalizedValue;
    }
  }

  return {
    attributes,
    body: content.slice(match[0].length).trim(),
  };
}

function summarizeSkillBody(body: string) {
  const lines = body.split(/\r?\n/g);
  const collected: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (collected.length > 0) {
        break;
      }
      continue;
    }
    if (trimmed.startsWith("#") || trimmed.startsWith("```")) {
      continue;
    }
    collected.push(trimmed);
    if (collected.join(" ").length >= 180) {
      break;
    }
  }

  return collected.join(" ").slice(0, 220) || "No description provided.";
}

function normalizeSkillSlug(args: {
  frontmatterName?: string;
  filePath: string;
}) {
  const candidate = (args.frontmatterName ?? "").trim();
  if (candidate.length > 0 && /^[A-Za-z0-9._-]+$/.test(candidate)) {
    return candidate;
  }
  return path.basename(path.dirname(args.filePath));
}

async function collectSkillFiles(args: {
  rootPath: string;
  depth?: number;
}): Promise<string[]> {
  const depth = args.depth ?? 0;
  if (depth > 4) {
    return [];
  }

  const entries = await fs.readdir(args.rootPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const targetPath = path.join(args.rootPath, entry.name);
    if (entry.isDirectory()) {
      if (SKILL_ROOT_IGNORES.has(entry.name)) {
        continue;
      }
      files.push(
        ...(await collectSkillFiles({
          rootPath: targetPath,
          depth: depth + 1,
        })),
      );
      continue;
    }
    if (entry.isFile() && entry.name === SKILL_FILE_NAME) {
      files.push(targetPath);
    }
  }

  return files;
}

function compareSkillPriority(
  left: SkillCatalogEntry,
  right: SkillCatalogEntry,
) {
  const scopeDelta =
    SKILL_SCOPE_PRIORITY[right.scope] - SKILL_SCOPE_PRIORITY[left.scope];
  if (scopeDelta !== 0) {
    return scopeDelta;
  }
  const providerDelta =
    SKILL_PROVIDER_PRIORITY[right.provider] -
    SKILL_PROVIDER_PRIORITY[left.provider];
  if (providerDelta !== 0) {
    return providerDelta;
  }
  return left.slug.localeCompare(right.slug);
}

async function scanSkillRoot(
  root: SkillCatalogRoot,
): Promise<SkillCatalogEntry[]> {
  const skillFiles = await collectSkillFiles({ rootPath: root.path });
  const entries: SkillCatalogEntry[] = [];

  for (const filePath of skillFiles) {
    const realPath = await resolveRealPathIfExists(filePath);
    if (!realPath) {
      continue;
    }
    const content = await fs.readFile(realPath, "utf8");
    const parsed = parseFrontmatter(content);
    const slug = normalizeSkillSlug({
      frontmatterName: parsed.attributes.name,
      filePath: realPath,
    });
    const name = parsed.attributes.name?.trim() || slug;
    const description =
      parsed.attributes.description?.trim() || summarizeSkillBody(parsed.body);
    const instructions = parsed.body.trim() || content.trim();

    entries.push({
      id: `${root.scope}:${root.provider}:${realPath}`,
      slug,
      name,
      description,
      scope: root.scope,
      provider: root.provider,
      path: filePath,
      realPath,
      sourceRootPath: root.path,
      sourceRootRealPath: root.realPath,
      invocationToken: `$${slug}`,
      instructions,
    });
  }

  return entries;
}

function dedupeSkillEntries(entries: SkillCatalogEntry[]) {
  const bestByRealPath = new Map<string, SkillCatalogEntry>();

  for (const entry of entries) {
    const existing = bestByRealPath.get(entry.realPath);
    if (!existing || compareSkillPriority(existing, entry) > 0) {
      bestByRealPath.set(entry.realPath, entry);
    }
  }

  return Array.from(bestByRealPath.values()).sort((left, right) => {
    const priority = compareSkillPriority(left, right);
    if (priority !== 0) {
      return priority;
    }
    return left.name.localeCompare(right.name);
  });
}

export async function discoverSkillCatalog(
  args: {
    workspacePath?: string | null;
    sharedSkillsHome?: string | null;
  } = {},
): Promise<SkillCatalogResponse> {
  const normalizedWorkspacePath = normalizeOptionalPath(args.workspacePath);
  const normalizedSharedSkillsHome =
    normalizeOptionalPath(args.sharedSkillsHome) ??
    normalizeOptionalPath(process.env.STAVE_SHARED_SKILLS_HOME);

  try {
    const roots = await resolveCatalogRoots(args);
    const entries = dedupeSkillEntries(
      (await Promise.all(roots.map((root) => scanSkillRoot(root)))).flat(),
    );

    return {
      ok: true,
      catalog: {
        workspacePath: normalizedWorkspacePath,
        sharedSkillsHome: normalizedSharedSkillsHome,
        fetchedAt: new Date().toISOString(),
        roots,
        skills: entries,
        detail:
          entries.length > 0
            ? `Loaded ${entries.length} skill${entries.length === 1 ? "" : "s"} from ${roots.length} root${roots.length === 1 ? "" : "s"}.`
            : "No skills were discovered for the current global, user, and workspace roots.",
      },
    };
  } catch (error) {
    return {
      ok: false,
      catalog: {
        workspacePath: normalizedWorkspacePath,
        sharedSkillsHome: normalizedSharedSkillsHome,
        fetchedAt: new Date().toISOString(),
        roots: [],
        skills: [],
        detail: "Skill discovery failed.",
      },
      message: String(error),
    };
  }
}
