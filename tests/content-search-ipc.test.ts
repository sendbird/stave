import { describe, expect, test } from "bun:test";
import { contentSearchPreload } from "../electron/persistence/content-search-preload";
import { SearchTaskContentArgsSchema, SearchTaskContentResponseSchema } from "../src/lib/task-search/content-search";

describe("local content search bridge", () => {
  test("rejects extra fields and unbounded pages before invoking IPC", async () => {
    let calls = 0;
    const bridge = contentSearchPreload(async () => { calls++; return {}; });
    expect(SearchTaskContentArgsSchema.safeParse({ query: "retry", limit: 1000 }).success).toBe(false);
    expect(SearchTaskContentArgsSchema.safeParse({ query: "retry", raw: true }).success).toBe(false);
    await expect(bridge.searchTaskContent({ query: "retry", limit: 1000 })).rejects.toThrow();
    expect(calls).toBe(0);
  });
  test("validates response at the preload boundary", async () => {
    const bridge = contentSearchPreload(async () => ({ ok: true, results: [{ rawPayload: "hidden" }] }));
    await expect(bridge.searchTaskContent({ query: "retry" })).rejects.toThrow();
    expect(SearchTaskContentResponseSchema.safeParse({ ok: false, message: "unavailable", extra: true }).success).toBe(false);
  });
});

test("status-only polling passes strict IPC validation without searching metadata",async()=>{
 let received:unknown;
 const bridge=contentSearchPreload(async(_channel,args)=>{
   received=args;return {ok:true,results:[],nextOffset:null,indexing:{indexed:1,total:2,complete:false}};
 });
 const response=await bridge.searchTaskContent({query:"retry",statusOnly:true});
 expect(received).toEqual({query:"retry",statusOnly:true});
 expect(response.ok && response.indexing.complete).toBe(false);
});
