import { listWorkspaceSummaries, loadWorkspaceSnapshot } from "./workspaces.db";
import { mergeWholeTaskFindResults } from "@/lib/task-search/whole-task-find-results";
import {
  SearchTaskContentArgsSchema,
  SearchTaskContentResponseSchema,
  type SearchTaskContentArgs,
  type SearchTaskContentResponse,
} from "@/lib/task-search/content-search";

/** Local persistence only; this path never invokes a provider. */
export async function searchTaskContent(args: SearchTaskContentArgs): Promise<SearchTaskContentResponse> {
  const search = window.api?.persistence?.searchTaskContent;
  if (!search) {
    const parsed=SearchTaskContentArgsSchema.parse(args);
    const found=[];
    if(!parsed.statusOnly) for(const workspace of await listWorkspaceSummaries()) {
      if(parsed.workspaceId && parsed.workspaceId!==workspace.id) continue;
      const snapshot=await loadWorkspaceSnapshot({workspaceId:workspace.id});
      if(!snapshot) continue;
      for(const task of snapshot.tasks) {
        if(parsed.taskId && parsed.taskId!==task.id) continue;
        const hits=mergeWholeTaskFindResults([],snapshot.messagesByTask[task.id] ?? [],parsed.query,task.id,workspace.id);
        for(const hit of parsed.taskId ? hits : hits.slice(0,1)) found.push({...hit,title:task.title,provider:task.provider,workspaceName:workspace.name,updatedAt:task.updatedAt,state:task.archivedAt ? "archived" as const : "new" as const,matchCount:parsed.taskId ? 1 : hits.length});
      }
    }
    const offset=parsed.offset ?? 0,limit=parsed.limit ?? 20;
    return {ok:true,results:found.slice(offset,offset+limit),nextOffset:found.length>offset+limit ? offset+limit : null,indexing:{indexed:0,total:0,complete:true}};
  }
  return SearchTaskContentResponseSchema.parse(await search(SearchTaskContentArgsSchema.parse(args)));
}
