import type { ProviderId } from "@/lib/providers/provider.types";

export type SkillCatalogScope = "global" | "user" | "local";
export type SkillCatalogProvider = ProviderId | "shared";
export type SkillCatalogRootSource =
  | "provider_home"
  | "provider_system"
  | "shared_root"
  | "workspace";

export interface SkillCatalogRoot {
  id: string;
  scope: SkillCatalogScope;
  provider: SkillCatalogProvider;
  source: SkillCatalogRootSource;
  path: string;
  realPath: string | null;
  exists: boolean;
  detail?: string;
}

export interface SkillCatalogEntry {
  id: string;
  slug: string;
  name: string;
  description: string;
  scope: SkillCatalogScope;
  provider: SkillCatalogProvider;
  path: string;
  realPath: string;
  sourceRootPath: string;
  sourceRootRealPath: string | null;
  invocationToken: string;
  instructions: string;
}

export interface SkillCatalogSnapshot {
  workspacePath: string | null;
  sharedSkillsHome: string | null;
  fetchedAt: string;
  roots: SkillCatalogRoot[];
  skills: SkillCatalogEntry[];
  detail: string;
}

export interface SkillCatalogResponse {
  ok: boolean;
  catalog: SkillCatalogSnapshot;
  message?: string;
}

export interface SkillPromptContext {
  id: string;
  slug: string;
  name: string;
  description: string;
  scope: SkillCatalogScope;
  provider: SkillCatalogProvider;
  path: string;
  invocationToken: string;
  instructions: string;
}

export interface SkillTokenMatch {
  start: number;
  end: number;
  query: string;
  token: string;
}

export interface ResolvedSkillSelection {
  selectedSkills: SkillPromptContext[];
  normalizedText: string;
}
