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
  return (
    new URLSearchParams(window.location.search).get("stavePreview") ??
    (import.meta.env.VITE_STAVE_PREVIEW as string | undefined) ??
    null
  );
}

const root = createRoot(document.getElementById("root")!);
const preview = import.meta.env.DEV ? resolveDevPreview() : null;

if (preview === "agent-messages") {
  void import("@/dev/agent-preview").then(({ AgentPreviewApp }) => {
    root.render(
      <StrictMode>
        <AgentPreviewApp />
      </StrictMode>,
    );
  });
} else if (preview === "composer-frame") {
  void import("@/dev/composer-frame-preview").then(
    ({ ComposerFramePreviewApp }) => {
      root.render(
        <StrictMode>
          <ComposerFramePreviewApp />
        </StrictMode>,
      );
    },
  );
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
