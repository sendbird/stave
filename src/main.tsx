import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "@/App";
import "@/globals.css";
import { installDevApiBridge } from "@/lib/dev-bridge";

installDevApiBridge();

/*
 * Dev-only preview routes. A preview is rendered *instead of* `<App />`, so none
 * of App's workspace bootstrap effects run and `bun run dev` alone is enough to
 * open one. Mirrors the `?staveProfileRenders=1` precedent in
 * src/lib/render-profiler.tsx. `import.meta.env.DEV` is statically false in
 * production builds, so the whole branch — and the preview chunk — drops out.
 */
function resolveDevPreview(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return new URLSearchParams(window.location.search).get("stavePreview");
}

const root = createRoot(document.getElementById("root")!);

if (import.meta.env.DEV && resolveDevPreview() === "agent-messages") {
  void import("@/dev/agent-preview").then(({ AgentPreviewApp }) => {
    root.render(
      <StrictMode>
        <AgentPreviewApp />
      </StrictMode>
    );
  });
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
