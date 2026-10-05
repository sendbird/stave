import { i18n } from "@/i18n/runtime";
import { z } from "zod";
import {
  ApiConnectionModelIdSchema,
  ApiConnectionModelSchema,
  type ApiConnectionCatalogModel,
} from "./api-connections";

/**
 * One entry of `GET https://ai-gateway.vercel.sh/v1/models`, read leniently:
 * the catalog adds fields over time, and one malformed entry must not hide the
 * rest. Fields Stave does not show are ignored.
 */
const CatalogEntrySchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  type: z.string().optional(),
  tags: z.array(z.string()).optional(),
  context_window: z.number().optional(),
  deprecated_at: z.number().optional(),
  pricing: z.object({ input: z.string().optional(), output: z.string().optional() }).passthrough().optional(),
}).passthrough();
const CatalogSchema = z.object({ data: z.array(z.unknown()).max(10_000) });

/**
 * Coding-capable models only: language models that use tools. A language
 * model without any tags is kept, since the filter can only read tags that
 * exist. Deprecated models are dropped once their date has passed.
 */
export function filterApiConnectionCatalog(payload: unknown, now = Date.now()): ApiConnectionCatalogModel[] {
  const catalog = CatalogSchema.safeParse(payload);
  if (!catalog.success) throw new Error(i18n.t("providers:apiConnectionCatalog.theGatewayDidNotReturnA"));
  const models: ApiConnectionCatalogModel[] = [];
  for (const raw of catalog.data.data) {
    const entry = CatalogEntrySchema.safeParse(raw);
    if (!entry.success || entry.data.type !== "language") continue;
    const tags = entry.data.tags ?? [];
    if (tags.length > 0 && !tags.includes("tool-use")) continue;
    if (entry.data.deprecated_at !== undefined && entry.data.deprecated_at <= now) continue;
    if (!ApiConnectionModelIdSchema.safeParse(entry.data.id).success) continue;
    const model = ApiConnectionModelSchema.safeParse({
      id: entry.data.id,
      name: entry.data.name?.trim() || undefined,
      contextWindow: entry.data.context_window && entry.data.context_window > 0 ? Math.round(entry.data.context_window) : undefined,
      inputPrice: entry.data.pricing?.input,
      outputPrice: entry.data.pricing?.output,
    });
    // A price or name the schema refuses drops only that field, not the model.
    const parsed = model.success ? model.data : { id: entry.data.id };
    models.push({ ...parsed, name: parsed.name ?? entry.data.id, tags: tags.slice(0, 20) });
  }
  return models.sort((left, right) => left.id.localeCompare(right.id));
}

/** Matches a catalog row against a search: ID, name, or creator. */
export function apiConnectionCatalogMatches(model: Pick<ApiConnectionCatalogModel, "id" | "name">, query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = `${model.id} ${model.name}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}
