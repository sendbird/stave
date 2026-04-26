import type { CSSProperties } from "react";
import { TopBarWindowControls } from "@/components/layout/TopBarWindowControls";
import { ZenProjectSidebar } from "@/components/layout/ZenProjectSidebar";
import { ZenChatArea } from "@/components/session/ZenChatArea";

const IS_MAC = typeof window !== "undefined" && window.api?.platform === "darwin";
const ZEN_DRAG_STYLE = { WebkitAppRegion: "drag" } as CSSProperties;
const ZEN_NO_DRAG_STYLE = { WebkitAppRegion: "no-drag" } as CSSProperties;

export function ZenAppShellLayout() {
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-10" style={ZEN_DRAG_STYLE}>
        {!IS_MAC ? (
          <div className="pointer-events-auto absolute right-3 top-1.5">
            <TopBarWindowControls noDragStyle={ZEN_NO_DRAG_STYLE} />
          </div>
        ) : null}
      </div>
      <ZenProjectSidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pt-8 sm:pt-10">
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                  <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
                    <div className="min-h-0 min-w-0 flex-1 sm:min-w-[420px]">
                      <ZenChatArea />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
