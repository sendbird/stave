import { useEffect, useRef } from "react";

/**
 * One window-level composer chord (Advisor, Worker). `resolve` maps a key
 * event to an action; a resolved chord is claimed before the composer can
 * insert the Option-composed character macOS produces for it. Both callbacks
 * are read through refs, so the listener never goes stale and only `enabled`
 * re-binds it.
 */
export function useComposerChord<TAction extends string>(args: {
  enabled: boolean;
  resolve: (event: KeyboardEvent) => TAction | null;
  handle: (action: TAction) => void;
}) {
  const resolveRef = useRef(args.resolve);
  resolveRef.current = args.resolve;
  const handleRef = useRef(args.handle);
  handleRef.current = args.handle;
  useEffect(() => {
    if (!args.enabled) return;
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const action = resolveRef.current(event);
      if (!action) return;
      event.preventDefault();
      handleRef.current(action);
    };
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [args.enabled]);
}
