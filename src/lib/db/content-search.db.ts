import {
  SearchTaskContentArgsSchema,
  SearchTaskContentResponseSchema,
  type SearchTaskContentArgs,
  type SearchTaskContentResponse,
} from "@/lib/task-search/content-search";

/** Local persistence only; this path never invokes a provider. */
export async function searchTaskContent(args: SearchTaskContentArgs): Promise<SearchTaskContentResponse> {
  const search = window.api?.persistence?.searchTaskContent;
  if (!search) return { ok: true, results: [], nextOffset: null, indexing: { indexed: 0, total: 0, complete: true } };
  return SearchTaskContentResponseSchema.parse(await search(SearchTaskContentArgsSchema.parse(args)));
}
