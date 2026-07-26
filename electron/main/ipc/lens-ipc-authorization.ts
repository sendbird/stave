interface LensFrameIdentity {
  processId: number;
  routingId: number;
}

interface LensRendererIdentity {
  id: number;
  isDestroyed(): boolean;
  mainFrame: LensFrameIdentity;
}

interface LensInvokeEventIdentity {
  sender: { id: number };
  senderFrame: LensFrameIdentity | null;
}

/**
 * Lens mutation IPC is owned by the current app renderer's main frame.
 * Matching the frame ids explicitly rejects iframes in that renderer.
 */
export function isTrustedLensRenderer(
  event: LensInvokeEventIdentity,
  renderer: LensRendererIdentity | null | undefined,
): boolean {
  const senderFrame = event.senderFrame;
  const mainFrame = renderer?.mainFrame;
  return Boolean(
    renderer &&
      !renderer.isDestroyed() &&
      renderer.id === event.sender.id &&
      senderFrame &&
      mainFrame &&
      senderFrame.processId === mainFrame.processId &&
      senderFrame.routingId === mainFrame.routingId,
  );
}
