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
