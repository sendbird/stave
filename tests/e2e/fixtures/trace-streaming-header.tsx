import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { ChainOfThought } from "@/components/ai-elements/chain-of-thought";

export function mountEmptyTrace() {
  const app = document.getElementById("root");
  if (app) app.hidden = true;
  const host = document.createElement("main");
  host.dataset.emptyTrace = "";
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() => root.render(<ChainOfThought isStreaming />));
}
