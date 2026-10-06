import {
  CODE_BLOCK_PRE_TRANSFORMER,
  CODE_BLOCK_THEME,
  type CodeBlockHighlightRequest,
  type CodeBlockHighlightResponse,
} from "./syntax-highlight-shared";

export interface HighlightWorkerLike {
  postMessage: (message: CodeBlockHighlightRequest) => void;
  terminate: () => void;
  onmessage: ((event: MessageEvent<CodeBlockHighlightResponse>) => void) | null;
  onerror: ((event: Event) => void) | null;
}

type Highlight = (code: string, lang: string) => Promise<string>;

/**
 * Route code-block highlighting to a worker, falling back to the main thread
 * when workers are unavailable or the worker cannot start. A worker that fails
 * once is not retried for the rest of the session: requests it still owed are
 * answered by the fallback so no code block stays unhighlighted.
 */
export function createCodeBlockHighlighter(args: {
  createWorker: (() => HighlightWorkerLike) | null;
  fallback: Highlight;
}): Highlight {
  let worker: HighlightWorkerLike | null = null;
  let workerFailed = args.createWorker === null;
  let nextId = 0;
  const pending = new Map<
    number,
    {
      code: string;
      lang: string;
      resolve: (html: string) => void;
      reject: (error: Error) => void;
    }
  >();

  function failWorker() {
    workerFailed = true;
    worker?.terminate();
    worker = null;
    const owed = [...pending.values()];
    pending.clear();
    for (const request of owed) {
      args.fallback(request.code, request.lang).then(request.resolve, request.reject);
    }
  }

  function ensureWorker(): HighlightWorkerLike | null {
    if (workerFailed || !args.createWorker) return null;
    if (worker) return worker;
    try {
      const created = args.createWorker();
      created.onmessage = (event) => {
        const response = event.data;
        const request = pending.get(response.id);
        if (!request) return;
        if ("error" in response && response.fatal) {
          // Still pending, so the fallback answers it with the rest.
          failWorker();
          return;
        }
        pending.delete(response.id);
        if ("html" in response) request.resolve(response.html);
        else request.reject(new Error(response.error));
      };
      created.onerror = () => failWorker();
      worker = created;
      return worker;
    } catch {
      workerFailed = true;
      return null;
    }
  }

  return (code, lang) => {
    const target = ensureWorker();
    if (!target) return args.fallback(code, lang);
    const id = nextId;
    nextId += 1;
    return new Promise<string>((resolve, reject) => {
      pending.set(id, { code, lang, resolve, reject });
      target.postMessage({ id, code, lang });
    });
  };
}

async function highlightOnMainThread(code: string, lang: string) {
  const { getSyntaxHighlighter } = await import("./syntax-highlight");
  const highlighter = await getSyntaxHighlighter();
  return highlighter.codeToHtml(code, {
    lang: lang as Parameters<typeof highlighter.codeToHtml>[1]["lang"],
    theme: CODE_BLOCK_THEME,
    transformers: [CODE_BLOCK_PRE_TRANSFORMER],
  });
}

export const highlightCodeBlockHtml = createCodeBlockHighlighter({
  createWorker:
    typeof Worker === "undefined"
      ? null
      : () =>
          new Worker(new URL("./syntax-highlight.worker.ts", import.meta.url), {
            type: "module",
          }) as unknown as HighlightWorkerLike,
  fallback: highlightOnMainThread,
});
