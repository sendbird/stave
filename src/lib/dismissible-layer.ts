import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";

type DismissibleLayerContainer = {
  contains?: (other: Node | null) => boolean;
  focus?: () => void;
  ownerDocument?: {
    activeElement?: Element | null;
  };
};

export function shouldDismissLayerFromEscape(args: {
  key: string;
  defaultPrevented?: boolean;
}) {
  return args.key === "Escape" && !args.defaultPrevented;
}

function isDismissibleLayerTargetWithinContainer(args: {
  container: DismissibleLayerContainer | null | undefined;
  target: EventTarget | null;
}) {
  const container = args.container;
  if (!container || typeof container.contains !== "function" || !args.target) {
    return false;
  }

  try {
    return container.contains(args.target as Node | null);
  } catch {
    return false;
  }
}

export function shouldDismissLayerFromDocumentKeydown(args: {
  key: string;
  defaultPrevented?: boolean;
  target: EventTarget | null;
  container: DismissibleLayerContainer | null | undefined;
}) {
  if (!shouldDismissLayerFromEscape({
    key: args.key,
    defaultPrevented: args.defaultPrevented,
  })) {
    return false;
  }

  return !isDismissibleLayerTargetWithinContainer({
    container: args.container,
    target: args.target,
  });
}

export function focusDismissibleLayer(args: {
  container: DismissibleLayerContainer | null | undefined;
}) {
  const container = args.container;
  if (!container || typeof container.focus !== "function") {
    return false;
  }

  const activeElement = container.ownerDocument?.activeElement;
  if (activeElement && typeof container.contains === "function" && container.contains(activeElement)) {
    return false;
  }

  container.focus();
  return true;
}

export function useDismissibleLayer<T extends HTMLElement = HTMLElement>(args: {
  enabled: boolean;
  onDismiss: () => void;
}) {
  const containerRef = useRef<T | null>(null);

  useEffect(() => {
    if (!args.enabled) {
      return;
    }
    focusDismissibleLayer({ container: containerRef.current });
  }, [args.enabled]);

  useEffect(() => {
    if (!args.enabled) {
      return;
    }

    const ownerDocument = containerRef.current?.ownerDocument ?? globalThis?.document;
    if (!ownerDocument) {
      return;
    }

    // Keep Escape dismissal working even when another overlay closes and focus
    // returns outside the layer before the user presses the key.
    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (!shouldDismissLayerFromDocumentKeydown({
        key: event.key,
        defaultPrevented: event.defaultPrevented,
        target: event.target,
        container: containerRef.current,
      })) {
        return;
      }

      event.preventDefault();
      args.onDismiss();
    };

    ownerDocument.addEventListener("keydown", handleDocumentKeyDown);
    return () => ownerDocument.removeEventListener("keydown", handleDocumentKeyDown);
  }, [args.enabled, args.onDismiss]);

  function handleKeyDown(event: ReactKeyboardEvent<T>) {
    if (!shouldDismissLayerFromEscape({
      key: event.key,
      defaultPrevented: event.isDefaultPrevented(),
    })) {
      return;
    }

    event.preventDefault();
    args.onDismiss();
  }

  return {
    containerRef,
    handleKeyDown,
  };
}
