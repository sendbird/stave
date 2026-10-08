import {
  buildInlineRenderCsp,
  parseInlineRenderUrl,
  prepareInlineRenderDocument,
} from "../../../src/lib/inline-render/inline-render";
import type { InlineRenderStore } from "./inline-render-store";

/**
 * Headers every inline render response carries, including refusals: a page
 * must never be sniffed into another type, cached, or sent with a referrer.
 */
const BASE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
} as const;

function refuse(status: number): Response {
  return new Response(null, {
    status,
    headers: {
      ...BASE_HEADERS,
      "Content-Security-Policy": buildInlineRenderCsp("blocked"),
    },
  });
}

/**
 * Answers one request on the inline render scheme. The network policy comes
 * from the URL the app built; the main window refuses any navigation a render
 * starts on its own, so a page cannot reload itself under a wider policy.
 */
export async function respondToInlineRenderRequest(args: {
  url: string;
  method: string;
  store: Pick<InlineRenderStore, "read">;
}): Promise<Response> {
  if (args.method !== "GET") return refuse(405);
  const target = parseInlineRenderUrl(args.url);
  if (!target) return refuse(404);
  const page = await args.store.read(target.renderId);
  if (!page) return refuse(404);
  return new Response(prepareInlineRenderDocument(page.html), {
    status: 200,
    headers: {
      ...BASE_HEADERS,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": buildInlineRenderCsp(target.networkPolicy),
    },
  });
}
