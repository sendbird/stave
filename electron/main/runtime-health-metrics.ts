export interface RendererHealthMetrics {
  currentlyUnresponsive: boolean;
  unresponsiveEvents: number;
  renderProcessGoneEvents: number;
  lastRenderProcessGoneReason?: string;
}

const rendererHealthMetrics: RendererHealthMetrics = {
  currentlyUnresponsive: false,
  unresponsiveEvents: 0,
  renderProcessGoneEvents: 0,
};

export function recordRendererUnresponsive(): void {
  rendererHealthMetrics.currentlyUnresponsive = true;
  rendererHealthMetrics.unresponsiveEvents += 1;
}

export function recordRendererResponsive(): void {
  rendererHealthMetrics.currentlyUnresponsive = false;
}

export function recordRendererProcessGone(reason?: string): void {
  rendererHealthMetrics.currentlyUnresponsive = false;
  rendererHealthMetrics.renderProcessGoneEvents += 1;
  rendererHealthMetrics.lastRenderProcessGoneReason = reason;
}

export function getRendererHealthMetrics(): RendererHealthMetrics {
  return { ...rendererHealthMetrics };
}
