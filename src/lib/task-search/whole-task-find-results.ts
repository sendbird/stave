import type { ChatMessage } from "@/types/chat";
import type { ContentSearchResult } from "./content-search";
import { findMatchingMessageIndexes } from "@/components/session/conversation-find-matching";

/** Resident rows win over stale derived rows, including unsaved streaming text. */
export function mergeWholeTaskFindResults(indexed:ContentSearchResult[], messages:ChatMessage[], query:string, taskId:string, workspaceId:string):ContentSearchResult[] {
  const resident=new Set(messages.map(message=>message.id));
  const local=findMatchingMessageIndexes(messages,query).map(index=>{
    const message=messages[index]!;
    return {repositoryPath:"",repositoryName:"",workspaceId,workspaceName:"",workspaceBranch:null,workspacePath:"",isDefaultWorkspace:false,taskId,title:"",provider:"",updatedAt:"",state:"new",messageId:message.id,snippet:message.content,matchCount:1,parentTaskId:null} satisfies ContentSearchResult;
  });
  return [...indexed.filter(hit=>!resident.has(hit.messageId)),...local];
}
export function retainFindSelection(previous:{results:ContentSearchResult[];selected:number}, results:ContentSearchResult[]) {
  const id=previous.results[previous.selected]?.messageId;
  return id ? results.findIndex(hit=>hit.messageId===id) : -1;
}
