import {
  buildInlineRenderCsp,
  parseInlineRenderUrl,
  prepareInlineRenderDocument,
} from "../../../src/lib/inline-render/inline-render";
import type { InlineRenderStore } from "./inline-render-store";

type InlineRenderPage = NonNullable<Awaited<ReturnType<InlineRenderStore["read"]>>>;

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
 * Previews answer from memory instead of the store, so any source of page
 * HTML will do, and paint the conversation's backdrop a hidden window lacks.
 */
export async function respondToInlineRenderRequest(args: {
  url: string;
  method: string;
  store: { read: (renderId: string) => Promise<Pick<InlineRenderPage, "html"> | null> };
  backdrop?: boolean;
}): Promise<Response> {
  if (args.method !== "GET") return refuse(405);
  const target = parseInlineRenderUrl(args.url);
  if (!target) return refuse(404);
  const page = await args.store.read(target.renderId);
  if (!page) return refuse(404);
  const document = prepareInlineRenderDocument(page.html, args.backdrop ? { backdrop: true } : undefined);
  return new Response(document, {
    status: 200,
    headers: {
      ...BASE_HEADERS,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": buildInlineRenderCsp(target.networkPolicy),
    },
  });
}
